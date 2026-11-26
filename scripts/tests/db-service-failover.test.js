const test = require('node:test');
const assert = require('node:assert/strict');
const DBService = require('../../src/main/db-service');

function crearErrorTimeout() {
    const error = new Error('Timeout simulando worker DB');
    error.code = 'DB_WORKER_TIMEOUT';
    return error;
}

test('mutación fallida en worker no se reejecuta en legacy durante la misma llamada', async () => {
    const service = new DBService({ dbPath: 'fake.db' });
    service.mode = 'worker';

    let legacyCalls = 0;
    service.callWorker = async () => {
        throw crearErrorTimeout();
    };
    service.callLegacy = () => {
        legacyCalls += 1;
        return { success: true };
    };
    service.activateLegacy = async () => {
        service.mode = 'legacy';
        service.warning = 'fallback test';
    };

    await assert.rejects(
        () => service.call('insertar', [{ rut: '1-9' }]),
        (error) => error && error.code === DBService.DB_OP_UNCERTAIN_CODE
    );
    assert.equal(legacyCalls, 0);
    assert.equal(service.mode, 'legacy');
});

test('lectura fallida en worker sí hace fallback y responde desde legacy', async () => {
    const service = new DBService({ dbPath: 'fake.db' });
    service.mode = 'worker';

    let legacyCalls = 0;
    service.callWorker = async () => {
        throw new Error('Worker no disponible');
    };
    service.callLegacy = () => {
        legacyCalls += 1;
        return [{ id: 1 }];
    };
    service.activateLegacy = async () => {
        service.mode = 'legacy';
        service.warning = 'fallback lectura';
    };

    const result = await service.call('obtenerTodos');
    assert.deepEqual(result, [{ id: 1 }]);
    assert.equal(legacyCalls, 1);
    assert.equal(service.mode, 'legacy');
});
