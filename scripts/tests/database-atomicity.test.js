const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const DatabaseManager = require('../../src/database');

function esErrorNativoBetterSqlite(error) {
    return Boolean(
        error &&
        (error.code === 'ERR_DLOPEN_FAILED' ||
            /better-sqlite3\.node/i.test(String(error.message || '')))
    );
}

function crearArticuloBase(extra = {}) {
    return {
        rut: '12.345.678-5',
        nombreCliente: 'Cliente Atomicidad',
        telefono: '+56912345678',
        tipoArticulo: 'Reparación Zapatos',
        descripcion: 'Prueba atomicidad',
        numeroBodega: 'A-10',
        observaciones: '',
        estado: 'En Bodega',
        fechaIngreso: new Date().toISOString(),
        valorTotal: 10000,
        ...extra
    };
}

function withManager(t) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'napoli-db-atomicity-'));
    const dbPath = path.join(tmpDir, 'napoli.db');
    t.after(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    try {
        const manager = new DatabaseManager(dbPath);
        t.after(() => {
            try {
                manager.cerrar();
            } catch (error) {
                // noop
            }
        });
        return manager;
    } catch (error) {
        if (esErrorNativoBetterSqlite(error)) {
            t.skip('Entorno Node de tests no tiene better-sqlite3 compatible para este escenario.');
            return null;
        }
        throw error;
    }
}

test('insertar con abono inicial persiste artículo + abono + totales en una sola operación', (t) => {
    const manager = withManager(t);
    if (!manager) return;

    const insert = manager.insertar(crearArticuloBase({
        abonoInicial: 3000,
        metodoPagoInicial: 'Efectivo',
        observacionesAbonoInicial: 'Prueba abono inicial'
    }));

    assert.equal(insert.success, true);
    assert.ok(Number(insert.id) > 0);

    const articulo = manager.obtenerPorId(insert.id);
    assert.equal(articulo.valorTotal, 10000);
    assert.equal(articulo.totalAbonado, 3000);
    assert.equal(articulo.saldoPendiente, 7000);
    assert.equal(articulo.estadoPago, 'Abonado');

    const abonos = manager.obtenerAbonosArticulo(insert.id);
    assert.equal(abonos.length, 1);
    assert.equal(abonos[0].monto, 3000);
    assert.equal(abonos[0].metodoPago, 'Efectivo');
});

test('insertar rechaza abonoInicial negativo', (t) => {
    const manager = withManager(t);
    if (!manager) return;

    const insert = manager.insertar(crearArticuloBase({
        numeroBodega: 'A-NEG',
        abonoInicial: -1
    }));

    assert.equal(insert.success, false);
    assert.match(String(insert.error || ''), /abono inicial/i);
    const lista = manager.obtenerTodos();
    assert.equal(lista.length, 0);
});

test('si falla auditoría durante insertar, la transacción revierte (sin artículo parcial)', (t) => {
    const manager = withManager(t);
    if (!manager) return;

    const runOriginal = manager.statements.registrarAuditoria.run;
    manager.statements.registrarAuditoria.run = () => {
        throw new Error('Fallo auditoría simulado');
    };

    const insert = manager.insertar(crearArticuloBase({ numeroBodega: 'A-11' }));
    assert.equal(insert.success, false);

    const lista = manager.obtenerTodos();
    assert.equal(lista.length, 0);

    manager.statements.registrarAuditoria.run = runOriginal;
});

test('si falla auditoría al actualizar estado, no se aplica cambio de estado ni fechaEntrega', (t) => {
    const manager = withManager(t);
    if (!manager) return;

    const insert = manager.insertar(crearArticuloBase({ numeroBodega: 'A-12' }));
    assert.equal(insert.success, true);

    const runOriginal = manager.statements.registrarAuditoria.run;
    manager.statements.registrarAuditoria.run = () => {
        throw new Error('Fallo auditoría simulado');
    };

    const update = manager.actualizarEstado(insert.id, 'Entregado');
    assert.equal(update.success, false);

    const articulo = manager.obtenerPorId(insert.id);
    assert.equal(articulo.estado, 'En Bodega');
    assert.equal(articulo.fechaEntrega, null);

    manager.statements.registrarAuditoria.run = runOriginal;
});
