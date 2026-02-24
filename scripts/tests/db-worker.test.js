const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const DBService = require('../../src/db-service');

function crearArticuloBase() {
    return {
        rut: '12.345.678-5',
        nombreCliente: 'Cliente Test',
        telefono: '+56912345678',
        tipoArticulo: 'Reparación Zapatos',
        descripcion: 'Prueba worker DB',
        numeroBodega: 'A-10',
        observaciones: '',
        estado: 'En Bodega',
        fechaIngreso: new Date().toISOString(),
        valorTotal: 10000
    };
}

function esErrorNativoBetterSqlite(error) {
    return Boolean(
        error &&
        (error.code === 'ERR_DLOPEN_FAILED' ||
            /better-sqlite3\.node/i.test(String(error.message || '')))
    );
}

test('DBService inicia en modo worker y responde operaciones CRUD básicas', async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'napoli-db-worker-'));
    const dbPath = path.join(tmpDir, 'napoli.db');
    const service = new DBService({ dbPath });

    try {
        let init;
        try {
            init = await service.init();
        } catch (error) {
            if (esErrorNativoBetterSqlite(error)) {
                t.skip('Entorno Node de tests no tiene better-sqlite3 compatible para este escenario.');
                return;
            }
            throw error;
        }
        assert.equal(init.success, true);
        assert.equal(service.getMode(), 'worker');

        const insert = await service.insertar(crearArticuloBase());
        assert.equal(insert.success, true);
        assert.ok(Number(insert.id) > 0);

        const lista = await service.obtenerTodos();
        assert.equal(Array.isArray(lista), true);
        assert.ok(lista.length >= 1);
    } finally {
        await service.closeAll();
    }
});

test('DBService cae a modo legacy automáticamente si worker no inicia', async (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'napoli-db-legacy-'));
    const dbPath = path.join(tmpDir, 'napoli.db');
    const service = new DBService({ dbPath });
    service.workerPath = path.join(tmpDir, 'worker-no-existe.js');

    try {
        let init;
        try {
            init = await service.init();
        } catch (error) {
            if (esErrorNativoBetterSqlite(error)) {
                t.skip('Entorno Node de tests no tiene better-sqlite3 compatible para este escenario.');
                return;
            }
            throw error;
        }
        assert.equal(init.success, true);
        assert.equal(service.getMode(), 'legacy');
        assert.match(service.getWarning(), /No se pudo iniciar worker DB/i);

        const insert = await service.insertar(crearArticuloBase());
        assert.equal(insert.success, true);
    } finally {
        await service.closeAll();
    }
});
