const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const LOG_MAX_BYTES = 1024 * 1024;
const LOG_ROTATIONS = 3;

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function rotateLogFileIfNeeded(logPath) {
    try {
        if (!fs.existsSync(logPath)) {
            return;
        }

        const stat = fs.statSync(logPath);
        if (stat.size < LOG_MAX_BYTES) {
            return;
        }

        for (let i = LOG_ROTATIONS; i >= 1; i -= 1) {
            const source = i === 1 ? logPath : `${logPath}.${i - 1}`;
            const target = `${logPath}.${i}`;
            if (fs.existsSync(source)) {
                try {
                    fs.renameSync(source, target);
                } catch (error) {
                    // Si falla una rotación puntual, seguimos con el archivo actual.
                }
            }
        }
    } catch (error) {
        // La trazabilidad nunca debe botar la app.
    }
}

class DiagnosticsLogger {
    constructor({ userDataPath, enabled = true } = {}) {
        const basePath = userDataPath || process.cwd();
        this.enabled = !!enabled;
        this.diagnosticsDir = path.join(basePath, 'diagnostics');
        this.logPath = path.join(this.diagnosticsDir, 'ui-freeze.log');
        this.loopTimer = null;
        this.eventLoopThresholdMs = 120;
        this.eventLoopIntervalMs = 250;
        this.lastTickAt = performance.now();
    }

    init() {
        if (!this.enabled) {
            return;
        }
        ensureDir(this.diagnosticsDir);
        this.log('diag:init', {
            pid: process.pid,
            node: process.version,
            platform: process.platform
        });
    }

    log(type, payload = {}) {
        if (!this.enabled) {
            return;
        }

        try {
            rotateLogFileIfNeeded(this.logPath);
            const entry = JSON.stringify({
                ts: new Date().toISOString(),
                type,
                ...payload
            });
            fs.appendFileSync(this.logPath, `${entry}\n`, 'utf8');
        } catch (error) {
            // No-op: la app debe seguir funcionando aunque falle la escritura de trazas.
        }
    }

    startEventLoopMonitor({ intervalMs = 250, thresholdMs = 120 } = {}) {
        if (!this.enabled) {
            return;
        }

        this.eventLoopIntervalMs = Math.max(100, Number(intervalMs) || 250);
        this.eventLoopThresholdMs = Math.max(20, Number(thresholdMs) || 120);

        if (this.loopTimer) {
            clearInterval(this.loopTimer);
        }

        this.lastTickAt = performance.now();
        this.loopTimer = setInterval(() => {
            const now = performance.now();
            const delta = now - this.lastTickAt;
            this.lastTickAt = now;
            const lagMs = Math.round((delta - this.eventLoopIntervalMs) * 100) / 100;
            if (lagMs >= this.eventLoopThresholdMs) {
                this.log('main:event_loop_lag', {
                    lagMs,
                    intervalMs: this.eventLoopIntervalMs
                });
            }
        }, this.eventLoopIntervalMs);
    }

    stopEventLoopMonitor() {
        if (this.loopTimer) {
            clearInterval(this.loopTimer);
            this.loopTimer = null;
        }
    }
}

module.exports = {
    DiagnosticsLogger
};
