const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const DBService = require('../../src/main/db-service');

test('un ready tardío tras el timeout de arranque no deja un worker terminado como activo', async (t) => {
    const service = new DBService({ dbPath: 'fake.db', workerStartupTimeoutMs: 100 });
    service.workerPath = path.join(__dirname, 'fixtures', 'worker-ready-tardio.js');
    t.after(async () => {
        // Si el bug reaparece, el worker queda vivo y colgaría el proceso de tests.
        if (service.worker) await service.worker.terminate();
    });

    await assert.rejects(() => service.startWorker(), /Timeout inicializando worker DB/);

    // Esperar más que el retardo del 'ready' del worker de prueba.
    await new Promise((resolve) => setTimeout(resolve, 500));

    assert.equal(service.worker, null);
    assert.equal(service.workerReady, false);
    assert.equal(service.workerStartInFlight, null);
});
