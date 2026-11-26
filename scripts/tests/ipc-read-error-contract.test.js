const test = require('node:test');
const assert = require('node:assert/strict');
const DBService = require('../../src/main/db-service');

test('lectura en legacy propaga error explícito (sin defaults silenciosos)', async () => {
    const service = new DBService({ dbPath: 'fake.db' });
    service.mode = 'legacy';
    service.legacyDb = {
        obtenerTodos() {
            throw new Error('fallo lectura legacy');
        }
    };

    await assert.rejects(
        () => service.obtenerTodos(),
        /fallo lectura legacy/i
    );
});

test('lectura con fallback desde worker mantiene error explícito si legacy falla', async () => {
    const service = new DBService({ dbPath: 'fake.db' });
    service.mode = 'worker';

    service.callWorker = async () => {
        throw new Error('fallo worker lectura');
    };
    service.activateLegacy = async () => {
        service.mode = 'legacy';
    };
    service.callLegacy = () => {
        throw new Error('fallo lectura legacy');
    };

    await assert.rejects(
        () => service.call('obtenerTodos'),
        /fallo lectura legacy/i
    );
});
