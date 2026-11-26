const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const LOG_MAX_BYTES = 1024 * 1024;
const LOG_ROTATIONS = 3;
const ROTATION_CHECK_INTERVAL = 50;

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function rotateLogFileSync(logPath) {
    try {
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
        this._logCount = 0;
        this._writeBuffer = [];
        this._flushTimer = null;
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
        this._flush();
    }

    _checkRotation() {
        try {
            if (!fs.existsSync(this.logPath)) {
                return;
            }
            const stat = fs.statSync(this.logPath);
            if (stat.size >= LOG_MAX_BYTES) {
                rotateLogFileSync(this.logPath);
            }
        } catch (error) {
            // No-op
        }
    }

    _scheduleFlush() {
        if (this._flushTimer) return;
        this._flushTimer = setTimeout(() => {
            this._flush();
        }, 100);
    }

    _flush() {
        if (this._flushTimer) {
            clearTimeout(this._flushTimer);
            this._flushTimer = null;
        }
        if (this._writeBuffer.length === 0) return;
        const data = this._writeBuffer.join('');
        this._writeBuffer.length = 0;
        try {
            fs.appendFileSync(this.logPath, data, 'utf8');
        } catch (error) {
            // No-op on error: diagnostics must not crash the app.
        }
    }

    log(type, payload = {}) {
        if (!this.enabled) {
            return;
        }

        try {
            this._logCount += 1;
            if (this._logCount % ROTATION_CHECK_INTERVAL === 0) {
                this._checkRotation();
            }
            const entry = JSON.stringify({
                ts: new Date().toISOString(),
                type,
                ...payload
            });
            this._writeBuffer.push(`${entry}\n`);
            this._scheduleFlush();
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
        this._flush();
    }
}

module.exports = {
    DiagnosticsLogger
};
