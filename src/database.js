const Database = require('better-sqlite3');
const { normalizarFechaIngresoIso, normalizarFechaIsoChile } = require('./chile-date');

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

        // MIGRACIÓN: Agregar columnas de pago faltantes (idempotente)
        try {
            this.asegurarColumnasPago();

            // Migrar numeroBodega para que sea opcional (sin NOT NULL/UNIQUE)
            this.migrarNumeroBodegaOpcional();
            this.migrarFechasIngresoChile();
            this.migrarFechasEntregaChile();
        } catch (error) {
            console.error('Error en migración:', error);
            throw error;
        }

        console.log('✅ Tablas inicializadas correctamente');
    }

    obtenerColumnasArticulos() {
        const tableInfo = this.db.prepare("PRAGMA table_info(articulos)").all();
        return new Set(tableInfo.map(col => col.name));
    }

    asegurarColumnasPago() {
        const columnasPago = [
            {
                nombre: 'valorTotal',
                sql: 'ALTER TABLE articulos ADD COLUMN valorTotal REAL DEFAULT 0'
            },
            {
                nombre: 'totalAbonado',
                sql: 'ALTER TABLE articulos ADD COLUMN totalAbonado REAL DEFAULT 0'
            },
            {
                nombre: 'saldoPendiente',
                sql: 'ALTER TABLE articulos ADD COLUMN saldoPendiente REAL DEFAULT 0'
            },
            {
                nombre: 'estadoPago',
                sql: "ALTER TABLE articulos ADD COLUMN estadoPago TEXT DEFAULT 'Sin pago' CHECK(estadoPago IN ('Sin pago', 'Abonado', 'Pagado'))"
            }
        ];

        const columnasActuales = this.obtenerColumnasArticulos();
        const faltantes = columnasPago.filter((columna) => !columnasActuales.has(columna.nombre));

        if (faltantes.length === 0) {
            return;
        }

        console.log(`📊 Migrando base de datos: agregando columnas de pago faltantes (${faltantes.map(c => c.nombre).join(', ')})...`);
        for (const columna of faltantes) {
            this.db.exec(columna.sql);
        }
        console.log('✅ Migración completada: columnas de pago consistentes');
    }

    migrarFechasIngresoChile() {
        const filas = this.db.prepare(`
            SELECT id, fechaIngreso
            FROM articulos
            ORDER BY id ASC
        `).all();

        if (!Array.isArray(filas) || filas.length === 0) {
            return;
        }

        const updates = [];
        let invalidas = 0;

        for (const fila of filas) {
            const fechaNormalizada = normalizarFechaIngresoIso(fila.fechaIngreso, { fallbackNow: false });
            if (!fechaNormalizada) {
                invalidas++;
                continue;
            }

            const fechaActual = typeof fila.fechaIngreso === 'string'
                ? fila.fechaIngreso.trim()
                : String(fila.fechaIngreso ?? '');

            if (fechaActual !== fechaNormalizada) {
                updates.push({ id: fila.id, fechaIngreso: fechaNormalizada });
            }
        }

        if (updates.length > 0) {
            const updateStmt = this.db.prepare(`
                UPDATE articulos
                SET fechaIngreso = ?
                WHERE id = ?
            `);
            const aplicar = this.db.transaction(() => {
                for (const fila of updates) {
                    updateStmt.run(fila.fechaIngreso, fila.id);
                }
            });
            aplicar();
        }

        if (updates.length > 0 || invalidas > 0) {
            console.log(
                `📊 Migración fechas ingreso: revisadas=${filas.length}, migradas=${updates.length}, inválidas=${invalidas}`
            );
        }
    }

    migrarFechasEntregaChile() {
        const filas = this.db.prepare(`
            SELECT id, fechaEntrega
            FROM articulos
            WHERE fechaEntrega IS NOT NULL
            ORDER BY id ASC
        `).all();

        if (!Array.isArray(filas) || filas.length === 0) {
            return;
        }

        const updates = [];
        let invalidas = 0;

        for (const fila of filas) {
            const fechaNormalizada = normalizarFechaIsoChile(fila.fechaEntrega, { fallbackNow: false });
            if (!fechaNormalizada) {
                invalidas++;
                continue;
            }

            const fechaActual = typeof fila.fechaEntrega === 'string'
                ? fila.fechaEntrega.trim()
                : String(fila.fechaEntrega ?? '');

            if (fechaActual !== fechaNormalizada) {
                updates.push({ id: fila.id, fechaEntrega: fechaNormalizada });
            }
        }

        if (updates.length > 0) {
            const updateStmt = this.db.prepare(`
                UPDATE articulos
                SET fechaEntrega = ?
                WHERE id = ?
            `);
            const aplicar = this.db.transaction(() => {
                for (const fila of updates) {
                    updateStmt.run(fila.fechaEntrega, fila.id);
                }
            });
            aplicar();
        }

        if (updates.length > 0 || invalidas > 0) {
            console.log(
                `📊 Migración fechas entrega: revisadas=${filas.length}, migradas=${updates.length}, inválidas=${invalidas}`
            );
        }
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
                    estado, fechaIngreso, valorTotal, totalAbonado, saldoPendiente, estadoPago
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                   OR rut LIKE ? ESCAPE '\\'
                   OR nombreCliente LIKE ? ESCAPE '\\'
                   OR numeroBodega LIKE ? ESCAPE '\\'
                   OR tipoArticulo LIKE ? ESCAPE '\\'
                   OR descripcion LIKE ? ESCAPE '\\'
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
            `),

            insertarAbono: this.db.prepare(`
                INSERT INTO abonos (articuloId, monto, metodoPago, observaciones)
                VALUES (?, ?, ?, ?)
            `),

            actualizarTotalesPorAbono: this.db.prepare(`
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
            `),

            obtenerAbonosArticulo: this.db.prepare(`
                SELECT * FROM abonos
                WHERE articuloId = ?
                ORDER BY fecha DESC
            `),

            actualizarValorTotal: this.db.prepare(`
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
            `)
        };
    }

    limpiarMetodoPago(metodoPago) {
        return (typeof metodoPago === 'string' && metodoPago.trim())
            ? metodoPago.trim().slice(0, 80)
            : 'Efectivo';
    }

    limpiarObservacionesAbono(observaciones) {
        return (typeof observaciones === 'string')
            ? observaciones.trim().slice(0, 500)
            : '';
    }

    // ============================================
    // MÉTODOS PÚBLICOS - ARTÍCULOS
    // ============================================

    insertar(articulo) {
        try {
            const camposObligatorios = [
                ['rut', 'RUT'],
                ['nombreCliente', 'nombre del cliente'],
                ['tipoArticulo', 'tipo de artículo'],
                ['descripcion', 'descripción']
            ];
            for (const [campo, etiqueta] of camposObligatorios) {
                const valor = articulo[campo];
                if (typeof valor !== 'string' || valor.trim() === '') {
                    return { success: false, error: `El campo "${etiqueta}" es obligatorio` };
                }
            }

            const valorTotalNum = Number(articulo.valorTotal);
            if (!Number.isFinite(valorTotalNum) || valorTotalNum < 0) {
                return { success: false, error: 'El valor total debe ser un número mayor o igual a 0' };
            }
            const abonoInicialInput = articulo.abonoInicial;
            const abonoInicialRaw = (
                abonoInicialInput === null ||
                abonoInicialInput === undefined ||
                String(abonoInicialInput).trim() === ''
            )
                ? 0
                : Number(abonoInicialInput);
            if (!Number.isFinite(abonoInicialRaw) || abonoInicialRaw < 0) {
                return { success: false, error: 'El abono inicial debe ser un número mayor o igual a 0' };
            }
            const abonoInicial = Math.round(abonoInicialRaw);
            if (abonoInicial > valorTotalNum) {
                return { success: false, error: 'El abono inicial no puede ser mayor al valor total' };
            }

            const metodoPagoInicial = this.limpiarMetodoPago(articulo.metodoPagoInicial);
            const observacionesAbonoInicial = this.limpiarObservacionesAbono(
                articulo.observacionesAbonoInicial || 'Abono inicial al ingresar'
            );
            const numeroBodega = this.normalizarNumeroBodega(articulo.numeroBodega);
            const fechaIngreso = normalizarFechaIngresoIso(articulo.fechaIngreso, { fallbackNow: true });
            const totalAbonadoInicial = abonoInicial;
            const saldoPendienteInicial = Math.max(0, valorTotalNum - totalAbonadoInicial);
            const estadoPagoInicial = saldoPendienteInicial <= 0
                ? 'Pagado'
                : (totalAbonadoInicial > 0 ? 'Abonado' : 'Sin pago');

            let nuevoId = null;
            const insertarTodo = this.db.transaction(() => {
                const result = this.statements.insertarArticulo.run(
                    articulo.rut,
                    articulo.nombreCliente,
                    articulo.telefono || null,
                    articulo.tipoArticulo,
                    articulo.descripcion,
                    numeroBodega,
                    articulo.observaciones || null,
                    articulo.estado || 'En Bodega',
                    fechaIngreso,
                    valorTotalNum,
                    totalAbonadoInicial,
                    saldoPendienteInicial,
                    estadoPagoInicial
                );

                nuevoId = Number(result.lastInsertRowid);

                if (abonoInicial > 0) {
                    this.statements.insertarAbono.run(
                        nuevoId,
                        abonoInicial,
                        metodoPagoInicial,
                        observacionesAbonoInicial
                    );
                }

                const detalleAbono = abonoInicial > 0 ? ` - Abono inicial: $${abonoInicial}` : '';
                this.statements.registrarAuditoria.run(
                    nuevoId,
                    'INSERTAR',
                    `Artículo creado: ${numeroBodega || 'Sin ubicación'} - Valor: $${valorTotalNum}${detalleAbono}`
                );
            });

            insertarTodo();
            return { success: true, id: nuevoId };
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
            throw error;
        }
    }

    obtenerPorId(id) {
        try {
            return this.statements.obtenerPorId.get(id);
        } catch (error) {
            console.error('Error al obtener artículo:', error);
            throw error;
        }
    }

    buscar(termino) {
        try {
            const terminoSafe = String(termino).slice(0, 500)
                .replace(/%/g, '\\%')
                .replace(/_/g, '\\_');
            const patron = `%${terminoSafe}%`;
            // Para el ID usamos el término exacto (si es número) o un valor imposible si no lo es
            // Pero como SQLite es flexible con tipos, pasamos el termino tal cual. 
            // Si termino es "abc", id = "abc" será falso.
            // NOTA: id en DB es INTEGER, pero compararlo con string funciona en SQLite.
            // Para mayor seguridad de tipos si termino es numerico lo casteamos?
            // SQLite maneja '1' = 1 como true.

            return this.statements.buscar.all(terminoSafe, patron, patron, patron, patron, patron);
        } catch (error) {
            console.error('Error al buscar:', error);
            throw error;
        }
    }

    actualizarEstado(id, nuevoEstado) {
        try {
            const fechaEntrega = nuevoEstado === 'Entregado'
                ? new Date().toISOString()
                : null;

            const actualizar = this.db.transaction(() => {
                const result = this.statements.actualizarEstado.run(nuevoEstado, fechaEntrega, id);
                if (result.changes === 0) {
                    throw new Error('Artículo no encontrado');
                }

                this.statements.registrarAuditoria.run(
                    id,
                    'ACTUALIZAR_ESTADO',
                    `Estado cambiado a: ${nuevoEstado}`
                );
            });

            actualizar();

            return { success: true };
        } catch (error) {
            console.error('Error al actualizar estado:', error);
            return { success: false, error: error.message };
        }
    }

    eliminar(id) {
        try {
            const eliminarArticulo = this.db.transaction(() => {
                const articulo = this.statements.obtenerPorId.get(id);
                if (!articulo) {
                    throw new Error('Artículo no encontrado');
                }

                this.statements.registrarAuditoria.run(
                    id,
                    'ELIMINAR',
                    `Artículo eliminado: ${articulo.numeroBodega || 'Sin ubicación'}`
                );

                this.statements.eliminar.run(id);
            });

            eliminarArticulo();
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
            throw error;
        }
    }

    // ============================================
    // MÉTODOS DE PAGO Y ABONOS
    // ============================================

    registrarAbono(articuloId, monto, metodoPago = 'Efectivo', observaciones = '') {
        try {
            const articuloIdNum = Number(articuloId);
            const montoNum = Math.round(Number(monto));

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

            const metodoPagoLimpio = this.limpiarMetodoPago(metodoPago);
            const observacionesLimpias = this.limpiarObservacionesAbono(observaciones);

            // Ejecutar todo dentro de una transacción
            const registrar = this.db.transaction(() => {
                this.statements.insertarAbono.run(articuloIdNum, montoNum, metodoPagoLimpio, observacionesLimpias);
                const result = this.statements.actualizarTotalesPorAbono.run(
                    montoNum,
                    montoNum,
                    montoNum,
                    montoNum,
                    articuloIdNum
                );
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
            return this.statements.obtenerAbonosArticulo.all(articuloId);
        } catch (error) {
            console.error('Error al obtener abonos:', error);
            throw error;
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

            const actualizarValor = this.db.transaction(() => {
                const result = this.statements.actualizarValorTotal.run(
                    nuevoValorNum,
                    nuevoValorNum,
                    nuevoValorNum,
                    articuloIdNum
                );
                if (result.changes === 0) {
                    throw new Error('Artículo no encontrado');
                }

                this.statements.registrarAuditoria.run(
                    articuloIdNum,
                    'ACTUALIZAR_VALOR',
                    `Valor total actualizado a: $${nuevoValorNum}`
                );
            });

            actualizarValor();

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
                        const fechaIngreso = normalizarFechaIngresoIso(articulo.fechaIngreso, { fallbackNow: true });
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
                            0, // totalAbonado
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
