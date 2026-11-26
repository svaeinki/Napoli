const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const DatabaseManager = require('../../src/main/database');
const { normalizarFechaIsoChile } = require('../../src/main/chile-date');

function esErrorNativoBetterSqlite(error) {
    return Boolean(
        error &&
        (error.code === 'ERR_DLOPEN_FAILED' ||
            /better-sqlite3\.node/i.test(String(error.message || '')))
    );
}

function crearArticuloBase() {
    return {
        rut: '20.537.299-7',
        nombreCliente: 'Cliente Fecha Entrega',
        telefono: '+56911111111',
        tipoArticulo: 'Reparación Zapatos',
        descripcion: 'Migración fechaEntrega',
        numeroBodega: 'B-20',
        observaciones: '',
        estado: 'En Bodega',
        fechaIngreso: new Date().toISOString(),
        valorTotal: 10000
    };
}

test('migración normaliza fechaEntrega legada a ISO y conserva corruptas', (t) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'napoli-db-fecha-entrega-'));
    const dbPath = path.join(tmpDir, 'napoli.db');

    t.after(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    let manager = null;
    try {
        manager = new DatabaseManager(dbPath);
    } catch (error) {
        if (esErrorNativoBetterSqlite(error)) {
            t.skip('Entorno Node de tests no tiene better-sqlite3 compatible para este escenario.');
            return;
        }
        throw error;
    }

    try {
        const artOk = manager.insertar({ ...crearArticuloBase(), numeroBodega: 'B-20' });
        const artBad = manager.insertar({ ...crearArticuloBase(), numeroBodega: 'B-21' });

        assert.equal(artOk.success, true);
        assert.equal(artBad.success, true);

        const fechaLegada = '23-02-2026, 10:46:19 p. m.';
        const fechaCorrupta = 'fecha-sin-formato';

        manager.db.prepare(`
            UPDATE articulos
            SET estado = 'Entregado', fechaEntrega = ?
            WHERE id = ?
        `).run(fechaLegada, artOk.id);

        manager.db.prepare(`
            UPDATE articulos
            SET estado = 'Entregado', fechaEntrega = ?
            WHERE id = ?
        `).run(fechaCorrupta, artBad.id);
    } finally {
        manager.cerrar();
    }

    const managerReopen = new DatabaseManager(dbPath);
    t.after(() => {
        try {
            managerReopen.cerrar();
        } catch (error) {
            // noop
        }
    });

    const ok = managerReopen.db.prepare('SELECT fechaEntrega FROM articulos WHERE numeroBodega = ?').get('B-20');
    const bad = managerReopen.db.prepare('SELECT fechaEntrega FROM articulos WHERE numeroBodega = ?').get('B-21');

    const esperadoIso = normalizarFechaIsoChile('23-02-2026, 10:46:19 p. m.', { fallbackNow: false });
    assert.equal(ok.fechaEntrega, esperadoIso);
    assert.equal(bad.fechaEntrega, 'fecha-sin-formato');
});
