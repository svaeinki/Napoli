const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

class DatabaseManager {
    constructor() {
        // Rutas
        const userDataPath = app.getPath('userData');
        this.dbPath = path.join(userDataPath, 'zapateria.db');
        this.backupPath = path.join(userDataPath, 'backups');

        // Crear carpeta de backups
        if (!fs.existsSync(this.backupPath)) {
            fs.mkdirSync(this.backupPath, { recursive: true });
        }

        // Inicializar base de datos
        this.db = new Database(this.dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');

        // Crear tablas
        this.inicializarTablas();
        this.prepararStatements();
    }

    inicializarTablas() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS articulos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rut TEXT NOT NULL,
                nombreCliente TEXT NOT NULL,
                telefono TEXT,
                tipoArticulo TEXT NOT NULL,
                descripcion TEXT NOT NULL,
                numeroBodega TEXT NOT NULL UNIQUE,
                observaciones TEXT,
                estado TEXT DEFAULT 'En Bodega' CHECK(estado IN ('En Bodega', 'Entregado')),
                fechaIngreso TEXT NOT NULL,
                fechaEntrega TEXT,
                fechaCreacion DATETIME DEFAULT CURRENT_TIMESTAMP,
                fechaModificacion DATETIME,
                
                -- CAMPOS DE PAGO
                valorTotal REAL DEFAULT 0,
                totalAbonado REAL DEFAULT 0,
                saldoPendiente REAL DEFAULT 0,
                estadoPago TEXT DEFAULT 'Sin pago' CHECK(estadoPago IN ('Sin pago', 'Abonado', 'Pagado'))
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

        console.log('✅ Tablas inicializadas correctamente');
    }

    prepararStatements() {
        this.statements = {
            insertarArticulo: this.db.prepare(`
                INSERT INTO articulos (
                    rut, nombreCliente, telefono, tipoArticulo, 
                    descripcion, numeroBodega, observaciones, 
                    estado, fechaIngreso, valorTotal, saldoPendiente
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `),

            obtenerTodos: this.db.prepare(`
                SELECT * FROM articulos ORDER BY id DESC
            `),

            obtenerPorId: this.db.prepare(`
                SELECT * FROM articulos WHERE id = ?
            `),

            buscar: this.db.prepare(`
                SELECT * FROM articulos 
                WHERE rut LIKE ? 
                   OR nombreCliente LIKE ? 
                   OR numeroBodega LIKE ?
                   OR tipoArticulo LIKE ?
                   OR descripcion LIKE ?
                ORDER BY id DESC
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

    // MÉTODOS PÚBLICOS - ARTÍCULOS

    insertarArticulo(articulo) {
        try {
            const valorTotal = articulo.valorTotal || 0;
            const result = this.statements.insertarArticulo.run(
                articulo.rut,
                articulo.nombreCliente,
                articulo.telefono || null,
                articulo.tipoArticulo,
                articulo.descripcion,
                articulo.numeroBodega.toUpperCase(),
                articulo.observaciones || null,
                articulo.estado || 'En Bodega',
                articulo.fechaIngreso,
                valorTotal,
                valorTotal // saldoPendiente inicial = valorTotal
            );

            this.statements.registrarAuditoria.run(
                result.lastInsertRowid,
                'INSERTAR',
                `Artículo creado: ${articulo.numeroBodega} - Valor: $${valorTotal}`
            );

            return { success: true, id: result.lastInsertRowid };
        } catch (error) {
            console.error('Error al insertar:', error);
            if (error.message.includes('UNIQUE')) {
                return { success: false, error: 'Ya existe un artículo con ese número de bodega' };
            }
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
            return this.statements.buscar.all(patron, patron, patron, patron, patron);
        } catch (error) {
            console.error('Error al buscar:', error);
            return [];
        }
    }

    actualizarEstado(id, nuevoEstado) {
        try {
            const fechaEntrega = nuevoEstado === 'Entregado' ? 
                new Date().toLocaleString('es-CL') : null;

            this.statements.actualizarEstado.run(nuevoEstado, fechaEntrega, id);

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
            
            this.statements.registrarAuditoria.run(
                id,
                'ELIMINAR',
                `Artículo eliminado: ${articulo.numeroBodega}`
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

    // MÉTODOS DE PAGO Y ABONOS

    registrarAbono(articuloId, monto, metodoPago = 'Efectivo', observaciones = '') {
        try {
            // Insertar abono
            const insertAbono = this.db.prepare(`
                INSERT INTO abonos (articuloId, monto, metodoPago, observaciones)
                VALUES (?, ?, ?, ?)
            `);
            
            insertAbono.run(articuloId, monto, metodoPago, observaciones);
            
            // Actualizar totales del artículo
            const actualizarTotales = this.db.prepare(`
                UPDATE articulos 
                SET totalAbonado = totalAbonado + ?,
                    saldoPendiente = valorTotal - (totalAbonado + ?),
                    estadoPago = CASE
                        WHEN (valorTotal - (totalAbonado + ?)) <= 0 THEN 'Pagado'
                        WHEN (totalAbonado + ?) > 0 THEN 'Abonado'
                        ELSE 'Sin pago'
                    END,
                    fechaModificacion = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
            
            actualizarTotales.run(monto, monto, monto, monto, articuloId);
            
            // Registrar en auditoría
            this.statements.registrarAuditoria.run(
                articuloId,
                'REGISTRAR_ABONO',
                `Abono registrado: $${monto} (${metodoPago})`
            );
            
            console.log(`✅ Abono registrado: $${monto} para artículo ${articuloId}`);
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
            const actualizar = this.db.prepare(`
                UPDATE articulos 
                SET valorTotal = ?,
                    saldoPendiente = ? - totalAbonado,
                    estadoPago = CASE
                        WHEN (? - totalAbonado) <= 0 THEN 'Pagado'
                        WHEN totalAbonado > 0 THEN 'Abonado'
                        ELSE 'Sin pago'
                    END,
                    fechaModificacion = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
            
            actualizar.run(nuevoValor, nuevoValor, nuevoValor, articuloId);
            
            this.statements.registrarAuditoria.run(
                articuloId,
                'ACTUALIZAR_VALOR',
                `Valor total actualizado a: $${nuevoValor}`
            );
            
            return { success: true };
        } catch (error) {
            console.error('Error al actualizar valor:', error);
            return { success: false, error: error.message };
        }
    }

    // BACKUP AUTOMÁTICO
    crearBackup() {
        try {
            const fecha = new Date().toISOString().split('T')[0];
            const hora = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
            const backupFile = path.join(this.backupPath, `backup-${fecha}-${hora}.db`);
            
            this.db.backup(backupFile);
            
            console.log(`✅ Backup creado: ${backupFile}`);
            return { success: true, path: backupFile };
        } catch (error) {
            console.error('❌ Error al crear backup:', error);
            return { success: false, error: error.message };
        }
    }

    // EXPORTAR A JSON (para Dropbox)
    exportarJSON() {
        try {
            const articulos = this.statements.obtenerTodos.all();
            const fecha = new Date().toISOString().split('T')[0];
            const hora = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
            const filename = `backup-zapateria-${fecha}-${hora}.json`;
            const filepath = path.join(this.backupPath, filename);
            
            const datos = {
                version: '1.0',
                fecha: new Date().toISOString(),
                totalArticulos: articulos.length,
                articulos: articulos
            };
            
            fs.writeFileSync(filepath, JSON.stringify(datos, null, 2));
            
            console.log(`✅ JSON exportado: ${filepath}`);
            return { success: true, path: filepath, filename: filename };
        } catch (error) {
            console.error('❌ Error al exportar JSON:', error);
            return { success: false, error: error.message };
        }
    }

    // MIGRAR DESDE LOCALSTORAGE (usar solo una vez)
    migrarDesdeLocalStorage(articulosJSON) {
        try {
            const articulos = JSON.parse(articulosJSON);
            
            const migrar = this.db.transaction(() => {
                for (const articulo of articulos) {
                    try {
                        this.statements.insertarArticulo.run(
                            articulo.rut,
                            articulo.nombreCliente,
                            articulo.telefono || null,
                            articulo.tipoArticulo,
                            articulo.descripcion,
                            articulo.numeroBodega,
                            articulo.observaciones || null,
                            articulo.estado,
                            articulo.fechaIngreso,
                            0, // valorTotal
                            0  // saldoPendiente
                        );
                    } catch (e) {
                        console.warn(`Error migrando artículo ${articulo.numeroBodega}:`, e.message);
                    }
                }
            });
            
            migrar();
            
            console.log(`✅ Migrados ${articulos.length} artículos desde LocalStorage`);
            return { success: true, total: articulos.length };
        } catch (error) {
            console.error('❌ Error en migración:', error);
            return { success: false, error: error.message };
        }
    }

    // LIMPIAR BACKUPS ANTIGUOS (mantener solo 30 días)
    limpiarBackupsAntiguos() {
        try {
            const archivos = fs.readdirSync(this.backupPath);
            const ahora = Date.now();
            const treintaDias = 30 * 24 * 60 * 60 * 1000;
            
            let eliminados = 0;
            archivos.forEach(archivo => {
                const filepath = path.join(this.backupPath, archivo);
                const stats = fs.statSync(filepath);
                const edad = ahora - stats.mtimeMs;
                
                if (edad > treintaDias) {
                    fs.unlinkSync(filepath);
                    eliminados++;
                }
            });
            
            if (eliminados > 0) {
                console.log(`🗑️ Backups antiguos eliminados: ${eliminados}`);
            }
            return { success: true, eliminados };
        } catch (error) {
            console.error('Error al limpiar backups:', error);
            return { success: false, error: error.message };
        }
    }

    getRutaDB() {
        return this.dbPath;
    }

    getRutaBackups() {
        return this.backupPath;
    }

    cerrar() {
        this.db.close();
    }
}

module.exports = DatabaseManager;