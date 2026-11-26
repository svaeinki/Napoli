const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function cargarDatabaseManagerConDbFalsa(estado) {
    const codigo = fs.readFileSync(path.join(__dirname, '../../src/main/database.js'), 'utf8');

    class FakeDatabase {
        constructor(dbPath) {
            this.dbPath = dbPath;
            this.columns = estado.columns;
            this.execSql = estado.execSql;
        }

        pragma() {
            return null;
        }

        exec(sql) {
            this.execSql.push(sql);
            const addColumnRegex = /ALTER TABLE articulos ADD COLUMN\s+([A-Za-z0-9_]+)/gi;
            let match = addColumnRegex.exec(sql);
            while (match) {
                this.columns.add(match[1]);
                match = addColumnRegex.exec(sql);
            }
        }

        prepare(sql) {
            if (/PRAGMA table_info\(articulos\)/i.test(sql)) {
                return {
                    all: () => Array.from(this.columns).map((name) => ({
                        name,
                        notnull: name === 'numeroBodega' ? 0 : 0
                    }))
                };
            }

            if (/PRAGMA index_list\('articulos'\)/i.test(sql)) {
                return { all: () => [] };
            }

            if (/PRAGMA index_info/i.test(sql)) {
                return { all: () => [] };
            }

            return {
                run: () => ({ changes: 1, lastInsertRowid: 1 }),
                get: () => null,
                all: () => []
            };
        }

        transaction(fn) {
            return () => fn();
        }

        close() {
            return null;
        }
    }

    const sandbox = {
        module: { exports: {} },
        exports: {},
        console,
        require: (moduleName) => {
            if (moduleName === 'better-sqlite3') {
                return FakeDatabase;
            }
            if (moduleName === 'path') {
                return path;
            }
            if (moduleName === './chile-date') {
                return require('../../src/main/chile-date');
            }
            throw new Error(`Módulo no esperado en test: ${moduleName}`);
        }
    };

    vm.createContext(sandbox);
    vm.runInContext(codigo, sandbox, { filename: 'database.js' });
    return sandbox.module.exports;
}

test('migración parcial agrega columnas de pago faltantes en forma idempotente', () => {
    const estado = {
        columns: new Set([
            'id',
            'rut',
            'nombreCliente',
            'telefono',
            'tipoArticulo',
            'descripcion',
            'numeroBodega',
            'observaciones',
            'estado',
            'fechaIngreso',
            'fechaEntrega',
            'fechaCreacion',
            'fechaModificacion',
            'valorTotal'
        ]),
        execSql: []
    };

    const DatabaseManager = cargarDatabaseManagerConDbFalsa(estado);
    const manager = new DatabaseManager('fake.db');

    manager.cerrar();

    assert.equal(estado.columns.has('valorTotal'), true);
    assert.equal(estado.columns.has('totalAbonado'), true);
    assert.equal(estado.columns.has('saldoPendiente'), true);
    assert.equal(estado.columns.has('estadoPago'), true);

    const alterSql = estado.execSql.filter((sql) => /ALTER TABLE articulos ADD COLUMN/i.test(sql));
    assert.equal(alterSql.some((sql) => /ADD COLUMN valorTotal/i.test(sql)), false);
    assert.equal(alterSql.some((sql) => /ADD COLUMN totalAbonado/i.test(sql)), true);
    assert.equal(alterSql.some((sql) => /ADD COLUMN saldoPendiente/i.test(sql)), true);
    assert.equal(alterSql.some((sql) => /ADD COLUMN estadoPago/i.test(sql)), true);
});
