const Database = require('better-sqlite3');
const path = require('path');

/**
 * Sistema de Base de Datos para Napoli - Reparadora de Calzado
 * Gestión completa de artículos, pagos, abonos y auditoría
 */
class DatabaseManager {
    constructor(dbPath) {
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');

        console.log('📊 Base de datos Napoli conectada:', dbPath);

        this.inicializarTablas();
        this.prepararStatements();
    }

    inicializarTablas() {
        // Crear tablas base
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS articulos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rut TEXT NOT NULL,
                nombreCliente TEXT NOT NULL,
                telefono TEXT,
                tipoArticulo TEXT NOT NULL,
                descripcion TEXT NOT NULL,
                numeroBodega TEXT,
                observaciones TEXT,
                estado TEXT DEFAULT 'En Bodega' CHECK(estado IN ('En Bodega', 'Entregado')),
                fechaIngreso TEXT NOT NULL,
                fechaEntrega TEXT,
                fechaCreacion DATETIME DEFAULT CURRENT_TIMESTAMP,
                fechaModificacion DATETIME
            );

            CREATE INDEX IF NOT EXISTS idx_rut ON articulos(rut);
            CREATE INDEX IF NOT EXISTS idx_estado ON articulos(estado);
            CREATE INDEX IF NOT EXISTS idx_numeroBodega ON articulos(numeroBodega);
            CREATE INDEX IF NOT EXISTS idx_fechaIngreso ON articulos(fechaIngreso);

            CREATE TABLE IF NOT EXISTS abonos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                articuloId INTEGER NOT NULL,
                monto REAL NOT NULL,
                metodoPago TEXT DEFAULT 'Efectivo',
                fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
                observaciones TEXT,
                FOREIGN KEY (articuloId) REFERENCES articulos(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_abonos_articulo ON abonos(articuloId);

            CREATE TABLE IF NOT EXISTS auditoria (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                articuloId INTEGER,
                accion TEXT NOT NULL,
                detalles TEXT,
                fecha DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // MIGRACIÓN: Agregar columnas de pago si no existen
        try {
            // Verificar si las columnas existen
            const tableInfo = this.db.prepare("PRAGMA table_info(articulos)").all();
            const columnas = tableInfo.map(col => col.name);

            // Agregar columnas nuevas si no existen
            if (!columnas.includes('valorTotal')) {
                console.log('📊 Migrando base de datos: agregando columnas de pago...');

                this.db.exec(`
                    ALTER TABLE articulos ADD COLUMN valorTotal REAL DEFAULT 0;
                    ALTER TABLE articulos ADD COLUMN totalAbonado REAL DEFAULT 0;
                    ALTER TABLE articulos ADD COLUMN saldoPendiente REAL DEFAULT 0;
                    ALTER TABLE articulos ADD COLUMN estadoPago TEXT DEFAULT 'Sin pago' CHECK(estadoPago IN ('Sin pago', 'Abonado', 'Pagado'));
                `);

                console.log('✅ Migración completada: columnas de pago agregadas');
            }

            // Migrar numeroBodega para que sea opcional (sin NOT NULL/UNIQUE)
            this.migrarNumeroBodegaOpcional();
        } catch (error) {
            console.error('Error en migración:', error);
            throw error;
        }

        console.log('✅ Tablas inicializadas correctamente');
    }

    migrarNumeroBodegaOpcional() {
        const tableInfo = this.db.prepare("PRAGMA table_info(articulos)").all();
        const columnaBodega = tableInfo.find(col => col.name === 'numeroBodega');
        const indices = this.db.prepare("PRAGMA index_list('articulos')").all();
        const tieneIndiceUnicoBodega = indices.some((index) => {
            if (index.unique !== 1) {
                return false;
            }
            if (!index.name) {
                return false;
            }

            const indexName = String(index.name || '').replace(/"/g, '""');
            const columnasIndice = this.db.prepare(`PRAGMA index_info("${indexName}")`).all();
            return columnasIndice.some(col => col.name === 'numeroBodega');
        });

        // Si ya es nullable y sin índice único, no se requiere migración.
        if (!columnaBodega || (columnaBodega.notnull === 0 && !tieneIndiceUnicoBodega)) {
            return;
        }

        console.log('📊 Migrando base de datos: número de bodega ahora es opcional...');

        try {
            this.db.pragma('foreign_keys = OFF');
            this.db.exec('BEGIN TRANSACTION');

            this.db.exec(`
                CREATE TABLE articulos_tmp (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    rut TEXT NOT NULL,
                    nombreCliente TEXT NOT NULL,
                    telefono TEXT,
                    tipoArticulo TEXT NOT NULL,
                    descripcion TEXT NOT NULL,
                    numeroBodega TEXT,
                    observaciones TEXT,
                    estado TEXT DEFAULT 'En Bodega' CHECK(estado IN ('En Bodega', 'Entregado')),
                    fechaIngreso TEXT NOT NULL,
                    fechaEntrega TEXT,
                    fechaCreacion DATETIME DEFAULT CURRENT_TIMESTAMP,
                    fechaModificacion DATETIME,
                    valorTotal REAL DEFAULT 0,
                    totalAbonado REAL DEFAULT 0,
                    saldoPendiente REAL DEFAULT 0,
                    estadoPago TEXT DEFAULT 'Sin pago' CHECK(estadoPago IN ('Sin pago', 'Abonado', 'Pagado'))
                );

                INSERT INTO articulos_tmp (
                    id, rut, nombreCliente, telefono, tipoArticulo, descripcion, numeroBodega,
                    observaciones, estado, fechaIngreso, fechaEntrega, fechaCreacion, fechaModificacion,
                    valorTotal, totalAbonado, saldoPendiente, estadoPago
                )
                SELECT
                    id, rut, nombreCliente, telefono, tipoArticulo, descripcion, NULLIF(TRIM(numeroBodega), ''),
                    observaciones, estado, fechaIngreso, fechaEntrega, fechaCreacion, fechaModificacion,
                    COALESCE(valorTotal, 0), COALESCE(totalAbonado, 0), COALESCE(saldoPendiente, 0), COALESCE(estadoPago, 'Sin pago')
                FROM articulos;

                DROP TABLE articulos;
                ALTER TABLE articulos_tmp RENAME TO articulos;

                CREATE INDEX IF NOT EXISTS idx_rut ON articulos(rut);
                CREATE INDEX IF NOT EXISTS idx_estado ON articulos(estado);
                CREATE INDEX IF NOT EXISTS idx_numeroBodega ON articulos(numeroBodega);
                CREATE INDEX IF NOT EXISTS idx_fechaIngreso ON articulos(fechaIngreso);
            `);

            this.db.exec('COMMIT');
            console.log('✅ Migración completada: número de bodega opcional');
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        } finally {
            this.db.pragma('foreign_keys = ON');
        }
    }

    normalizarNumeroBodega(numeroBodega) {
        if (typeof numeroBodega !== 'string') {
            return null;
        }
        const valor = numeroBodega.trim().toUpperCase();
        return valor || null;
    }

    prepararStatements() {
        this.statements = {
            insertarArticulo: this.db.prepare(`
                INSERT INTO articulos (
                    rut, nombreCliente, telefono, tipoArticulo, 
                    descripcion, numeroBodega, observaciones, 
                    estado, fechaIngreso, valorTotal, saldoPendiente, estadoPago
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `),

            obtenerTodos: this.db.prepare(`
                SELECT * FROM articulos ORDER BY id DESC
            `),

            obtenerPorId: this.db.prepare(`
                SELECT * FROM articulos WHERE id = ?
            `),

            buscar: this.db.prepare(`
                SELECT * FROM articulos 
                WHERE id = ?
                   OR rut LIKE ? 
                   OR nombreCliente LIKE ? 
                   OR numeroBodega LIKE ?
                   OR tipoArticulo LIKE ?
                   OR descripcion LIKE ?
                ORDER BY id DESC
                LIMIT 50 -- Limitar resultados para mejorar rendimiento en UI
            `),

            actualizarEstado: this.db.prepare(`
                UPDATE articulos 
                SET estado = ?, 
                    fechaEntrega = ?,
                    fechaModificacion = CURRENT_TIMESTAMP
                WHERE id = ?
            `),

            eliminar: this.db.prepare(`
                DELETE FROM articulos WHERE id = ?
            `),

            estadisticas: this.db.prepare(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN estado = 'En Bodega' THEN 1 ELSE 0 END) as enBodega,
                    SUM(CASE WHEN estado = 'Entregado' THEN 1 ELSE 0 END) as entregados
            FROM articulos
            `),

            registrarAuditoria: this.db.prepare(`
                INSERT INTO auditoria (articuloId, accion, detalles)
                VALUES (?, ?, ?)
            `)
        };
    }

    // ============================================
    // MÉTODOS PÚBLICOS - ARTÍCULOS
    // ============================================

    insertar(articulo) {
        try {
            const valorTotal = articulo.valorTotal || 0;
            const estadoPago = 'Sin pago';
            const numeroBodega = this.normalizarNumeroBodega(articulo.numeroBodega);

            const result = this.statements.insertarArticulo.run(
                articulo.rut,
                articulo.nombreCliente,
                articulo.telefono || null,
                articulo.tipoArticulo,
                articulo.descripcion,
                numeroBodega,
                articulo.observaciones || null,
                articulo.estado || 'En Bodega',
                articulo.fechaIngreso,
                valorTotal,
                valorTotal, // saldoPendiente inicial = valorTotal
                estadoPago
            );

            this.statements.registrarAuditoria.run(
                result.lastInsertRowid,
                'INSERTAR',
                `Artículo creado: ${numeroBodega || 'Sin ubicación'} - Valor: $${valorTotal}`
            );

            return { success: true, id: result.lastInsertRowid };
        } catch (error) {
            console.error('Error al insertar:', error);
            return { success: false, error: error.message };
        }
    }

    obtenerTodos() {
        try {
            return this.statements.obtenerTodos.all();
        } catch (error) {
            console.error('Error al obtener artículos:', error);
            return [];
        }
    }

    obtenerPorId(id) {
        try {
            return this.statements.obtenerPorId.get(id);
        } catch (error) {
            console.error('Error al obtener artículo:', error);
            return null;
        }
    }

    buscar(termino) {
        try {
            const patron = `%${termino}%`;
            // Para el ID usamos el término exacto (si es número) o un valor imposible si no lo es
            // Pero como SQLite es flexible con tipos, pasamos el termino tal cual. 
            // Si termino es "abc", id = "abc" será falso.
            // NOTA: id en DB es INTEGER, pero compararlo con string funciona en SQLite.
            // Para mayor seguridad de tipos si termino es numerico lo casteamos?
            // SQLite maneja '1' = 1 como true.

            return this.statements.buscar.all(termino, patron, patron, patron, patron, patron);
        } catch (error) {
            console.error('Error al buscar:', error);
            return [];
        }
    }

    actualizarEstado(id, nuevoEstado) {
        try {
            const fechaEntrega = nuevoEstado === 'Entregado' ?
                new Date().toLocaleString('es-CL') : null;

            const result = this.statements.actualizarEstado.run(nuevoEstado, fechaEntrega, id);
            if (result.changes === 0) {
                return { success: false, error: 'Artículo no encontrado' };
            }

            this.statements.registrarAuditoria.run(
                id,
                'ACTUALIZAR_ESTADO',
                `Estado cambiado a: ${nuevoEstado}`
            );

            return { success: true };
        } catch (error) {
            console.error('Error al actualizar estado:', error);
            return { success: false, error: error.message };
        }
    }

    eliminar(id) {
        try {
            const articulo = this.statements.obtenerPorId.get(id);
            if (!articulo) {
                return { success: false, error: 'Artículo no encontrado' };
            }

            this.statements.registrarAuditoria.run(
                id,
                'ELIMINAR',
                `Artículo eliminado: ${articulo.numeroBodega || 'Sin ubicación'}`
            );

            this.statements.eliminar.run(id);
            return { success: true };
        } catch (error) {
            console.error('Error al eliminar:', error);
            return { success: false, error: error.message };
        }
    }

    obtenerEstadisticas() {
        try {
            return this.statements.estadisticas.get();
        } catch (error) {
            console.error('Error al obtener estadísticas:', error);
            return { total: 0, enBodega: 0, entregados: 0 };
        }
    }

    // ============================================
    // MÉTODOS DE PAGO Y ABONOS
    // ============================================

    registrarAbono(articuloId, monto, metodoPago = 'Efectivo', observaciones = '') {
        try {
            const articuloIdNum = Number(articuloId);
            const montoNum = Number(monto);

            if (!Number.isInteger(articuloIdNum) || articuloIdNum <= 0) {
                return { success: false, error: 'ID de artículo inválido' };
            }
            if (!Number.isFinite(montoNum) || montoNum <= 0) {
                return { success: false, error: 'Monto de abono inválido' };
            }

            const articulo = this.statements.obtenerPorId.get(articuloIdNum);
            if (!articulo) {
                return { success: false, error: 'Artículo no encontrado' };
            }

            const metodoPagoLimpio = (typeof metodoPago === 'string' && metodoPago.trim())
                ? metodoPago.trim().slice(0, 80)
                : 'Efectivo';
            const observacionesLimpias = (typeof observaciones === 'string')
                ? observaciones.trim().slice(0, 500)
                : '';

            const insertAbono = this.db.prepare(`
                INSERT INTO abonos (articuloId, monto, metodoPago, observaciones)
                VALUES (?, ?, ?, ?)
            `);

            const actualizarTotales = this.db.prepare(`
                UPDATE articulos
                SET totalAbonado = totalAbonado + ?,
                    saldoPendiente = MAX(0, valorTotal - (totalAbonado + ?)),
                    estadoPago = CASE
                        WHEN (valorTotal - (totalAbonado + ?)) <= 0 THEN 'Pagado'
                        WHEN (totalAbonado + ?) > 0 THEN 'Abonado'
                        ELSE 'Sin pago'
                    END,
                    fechaModificacion = CURRENT_TIMESTAMP
                WHERE id = ?
            `);

            // Ejecutar todo dentro de una transacción
            const registrar = this.db.transaction(() => {
                insertAbono.run(articuloIdNum, montoNum, metodoPagoLimpio, observacionesLimpias);
                const result = actualizarTotales.run(montoNum, montoNum, montoNum, montoNum, articuloIdNum);
                if (result.changes === 0) {
                    throw new Error('Artículo no encontrado');
                }
                this.statements.registrarAuditoria.run(
                    articuloIdNum,
                    'REGISTRAR_ABONO',
                    `Abono registrado: $${montoNum} (${metodoPagoLimpio})`
                );
            });

            registrar();

            console.log(`✅ Abono registrado: $${montoNum} para artículo ${articuloIdNum}`);
            return { success: true };
        } catch (error) {
            console.error('Error al registrar abono:', error);
            return { success: false, error: error.message };
        }
    }

    obtenerAbonosArticulo(articuloId) {
        try {
            const getAbonos = this.db.prepare(`
                SELECT * FROM abonos 
                WHERE articuloId = ? 
                ORDER BY fecha DESC
            `);

            return getAbonos.all(articuloId);
        } catch (error) {
            console.error('Error al obtener abonos:', error);
            return [];
        }
    }

    actualizarValorTotal(articuloId, nuevoValor) {
        try {
            const articuloIdNum = Number(articuloId);
            const nuevoValorNum = Number(nuevoValor);
            if (!Number.isInteger(articuloIdNum) || articuloIdNum <= 0) {
                return { success: false, error: 'ID de artículo inválido' };
            }
            if (!Number.isFinite(nuevoValorNum) || nuevoValorNum < 0) {
                return { success: false, error: 'Nuevo valor inválido' };
            }

            const actualizar = this.db.prepare(`
                UPDATE articulos 
                SET valorTotal = ?,
                    saldoPendiente = MAX(0, ? - totalAbonado),
                    estadoPago = CASE
                        WHEN (? - totalAbonado) <= 0 THEN 'Pagado'
                        WHEN totalAbonado > 0 THEN 'Abonado'
                        ELSE 'Sin pago'
                    END,
                    fechaModificacion = CURRENT_TIMESTAMP
                WHERE id = ?
            `);

            const result = actualizar.run(nuevoValorNum, nuevoValorNum, nuevoValorNum, articuloIdNum);
            if (result.changes === 0) {
                return { success: false, error: 'Artículo no encontrado' };
            }

            this.statements.registrarAuditoria.run(
                articuloIdNum,
                'ACTUALIZAR_VALOR',
                `Valor total actualizado a: $${nuevoValorNum}`
            );

            return { success: true };
        } catch (error) {
            console.error('Error al actualizar valor:', error);
            return { success: false, error: error.message };
        }
    }

    async crearBackup(rutaDestino) {
        try {
            await this.db.backup(rutaDestino);
            return { success: true, path: rutaDestino };
        } catch (error) {
            console.error('Error creando backup SQLite:', error);
            return { success: false, error: error.message };
        }
    }

    // ============================================
    // MIGRACIÓN DESDE LOCALSTORAGE
    // ============================================

    migrarDesdeLocalStorage(articulosJSON) {
        try {
            const articulos = JSON.parse(articulosJSON);
            if (!Array.isArray(articulos)) {
                return { success: false, error: 'Formato inválido: se esperaba un arreglo de artículos' };
            }

            let migrados = 0;
            let fallidos = 0;
            const errores = [];

            const migrar = this.db.transaction(() => {
                for (const articulo of articulos) {
                    try {
                        const rut = typeof articulo.rut === 'string' ? articulo.rut.trim() : '';
                        const nombreCliente = typeof articulo.nombreCliente === 'string' ? articulo.nombreCliente.trim() : '';
                        const tipoArticulo = typeof articulo.tipoArticulo === 'string' ? articulo.tipoArticulo.trim() : '';
                        const descripcion = typeof articulo.descripcion === 'string' ? articulo.descripcion.trim() : '';
                        const fechaIngreso = (typeof articulo.fechaIngreso === 'string' && articulo.fechaIngreso.trim())
                            ? articulo.fechaIngreso.trim()
                            : new Date().toISOString();
                        const estado = articulo.estado === 'Entregado' ? 'Entregado' : 'En Bodega';

                        if (!rut || !nombreCliente || !tipoArticulo || !descripcion) {
                            throw new Error('Campos obligatorios incompletos');
                        }

                        const numeroBodega = this.normalizarNumeroBodega(articulo.numeroBodega);
                        this.statements.insertarArticulo.run(
                            rut,
                            nombreCliente,
                            articulo.telefono || null,
                            tipoArticulo,
                            descripcion,
                            numeroBodega,
                            articulo.observaciones || null,
                            estado,
                            fechaIngreso,
                            0, // valorTotal
                            0, // saldoPendiente
                            'Sin pago' // estadoPago
                        );
                        migrados++;
                    } catch (e) {
                        fallidos++;
                        const mensaje = `Error migrando artículo ${articulo.numeroBodega || 'Sin ubicación'}: ${e.message}`;
                        errores.push(mensaje);
                        console.warn(mensaje);
                    }
                }
            });

            migrar();

            console.log(`✅ Migración LocalStorage finalizada. Total: ${articulos.length}, Migrados: ${migrados}, Fallidos: ${fallidos}`);
            return {
                success: fallidos === 0,
                total: articulos.length,
                migrados,
                fallidos,
                errores
            };
        } catch (error) {
            console.error('❌ Error en migración:', error);
            return { success: false, error: error.message };
        }
    }

    cerrar() {
        this.db.close();
    }
}

module.exports = DatabaseManager;
