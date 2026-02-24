const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DiagnosticsLogger } = require('../../src/diagnostics');

test('DiagnosticsLogger escribe archivo de trazas y permite iniciar/detener monitor', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'napoli-diag-'));
    const logger = new DiagnosticsLogger({ userDataPath: tmpDir, enabled: true });
    const logPath = path.join(tmpDir, 'diagnostics', 'ui-freeze.log');

    logger.init();
    logger.log('test:evento', { valor: 123 });
    logger.startEventLoopMonitor({ intervalMs: 200, thresholdMs: 1000 });
    logger.stopEventLoopMonitor();

    assert.equal(fs.existsSync(logPath), true);
    const contenido = fs.readFileSync(logPath, 'utf8');
    assert.match(contenido, /"type":"diag:init"/);
    assert.match(contenido, /"type":"test:evento"/);
});
