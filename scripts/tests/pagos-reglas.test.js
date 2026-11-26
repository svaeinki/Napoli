const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const DatabaseManager = require('../../src/main/database');

function esErrorNativoBetterSqlite(error) {
    return Boolean(
        error &&
        (error.code === 'ERR_DLOPEN_FAILED' ||
            /better-sqlite3\.node|NODE_MODULE_VERSION/i.test(String(error.message || '')))
    );
}

function crearDirTemporal(t) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'napoli-pagos-'));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
    return path.join(tmpDir, 'napoli.db');
}

function abrir(t, dbPath) {
    try {
        const manager = new DatabaseManager(dbPath);
        t.after(() => {
            try { manager.cerrar(); } catch (_) { /* ya cerrado */ }
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

function articulo(extra = {}) {
    return {
        rut: '12.345.678-5',
        nombreCliente: 'Cliente Pagos',
        tipoArticulo: 'Reparación Zapatos',
        descripcion: 'Prueba reglas de pago',
        fechaIngreso: new Date().toISOString(),
        valorTotal: 10000,
        ...extra
    };
}

test('artículo con valor 0 y sin abonos queda "Sin pago" (no "Pagado")', (t) => {
    const manager = abrir(t, crearDirTemporal(t));
    if (!manager) return;

    const { id } = manager.insertar(articulo({ valorTotal: 0 }));
    assert.equal(manager.obtenerPorId(id).estadoPago, 'Sin pago');
});

test('estado de pago: sin abono → Sin pago, parcial → Abonado, total → Pagado', (t) => {
    const manager = abrir(t, crearDirTemporal(t));
    if (!manager) return;

    const { id } = manager.insertar(articulo());
    assert.equal(manager.obtenerPorId(id).estadoPago, 'Sin pago');

    assert.equal(manager.registrarAbono(id, 4000).success, true);
    assert.equal(manager.obtenerPorId(id).estadoPago, 'Abonado');

    assert.equal(manager.registrarAbono(id, 6000).success, true);
    const pagado = manager.obtenerPorId(id);
    assert.equal(pagado.estadoPago, 'Pagado');
    assert.equal(pagado.saldoPendiente, 0);
});

test('no se aceptan abonos que superen el saldo ni sobre artículos ya pagados', (t) => {
    const manager = abrir(t, crearDirTemporal(t));
    if (!manager) return;

    const { id } = manager.insertar(articulo());
    const exceso = manager.registrarAbono(id, 10001);
    assert.equal(exceso.success, false);
    assert.match(exceso.error, /supera el saldo/i);

    assert.equal(manager.registrarAbono(id, 10000).success, true);
    const yaPagado = manager.registrarAbono(id, 1);
    assert.equal(yaPagado.success, false);
    assert.match(yaPagado.error, /ya está pagado/i);

    const final = manager.obtenerPorId(id);
    assert.equal(final.totalAbonado, 10000);
    assert.equal(manager.obtenerAbonosArticulo(id).length, 1);
});

test('no se aceptan abonos sobre un artículo sin valor definido', (t) => {
    const manager = abrir(t, crearDirTemporal(t));
    if (!manager) return;

    const { id } = manager.insertar(articulo({ valorTotal: 0 }));
    const resultado = manager.registrarAbono(id, 500);
    assert.equal(resultado.success, false);
    assert.match(resultado.error, /valor total/i);
});

test('el valor total no puede quedar por debajo de lo ya abonado', (t) => {
    const manager = abrir(t, crearDirTemporal(t));
    if (!manager) return;

    const { id } = manager.insertar(articulo({ abonoInicial: 6000 }));
    const resultado = manager.actualizarValorTotal(id, 5000);
    assert.equal(resultado.success, false);
    assert.match(resultado.error, /menor a lo ya abonado/i);
    assert.equal(manager.obtenerPorId(id).valorTotal, 10000);

    assert.equal(manager.actualizarValorTotal(id, 6000).success, true);
    assert.equal(manager.obtenerPorId(id).estadoPago, 'Pagado');
});

test('migración corrige artículos antiguos marcados "Pagado" sin abonos', (t) => {
    const dbPath = crearDirTemporal(t);
    const primero = abrir(t, dbPath);
    if (!primero) return;

    const { id } = primero.insertar(articulo({ valorTotal: 0 }));
    // Simular el dato que dejaban versiones anteriores.
    primero.db.prepare("UPDATE articulos SET estadoPago = 'Pagado' WHERE id = ?").run(id);
    primero.cerrar();

    const segundo = abrir(t, dbPath);
    assert.equal(segundo.obtenerPorId(id).estadoPago, 'Sin pago');
});

test('la fecha de los abonos se entrega en ISO UTC (con "Z") y corresponde al momento del registro', (t) => {
    const manager = abrir(t, crearDirTemporal(t));
    if (!manager) return;

    const { id } = manager.insertar(articulo());
    assert.equal(manager.registrarAbono(id, 1000).success, true);

    const [abono] = manager.obtenerAbonosArticulo(id);
    assert.match(abono.fecha, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    const diferenciaMs = Math.abs(new Date(abono.fecha).getTime() - Date.now());
    assert.ok(diferenciaMs < 60 * 1000, `fecha desplazada ${diferenciaMs} ms`);
});
