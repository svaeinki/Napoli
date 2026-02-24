const { app, BrowserWindow, ipcMain, shell, safeStorage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const BetterSqlite = require('better-sqlite3');
const DatabaseManager = require('./src/database');
const DropboxManager = require('./src/dropbox');

let mainWindow;
let db;
let dropboxManager;

const USER_DATA_PATH = app.getPath('userData');
const DB_PATH = path.join(USER_DATA_PATH, 'napoli.db');
const CONFIG_PATH = path.join(USER_DATA_PATH, 'config.json');
const BACKUPS_PATH = path.join(USER_DATA_PATH, 'backups');
const BACKUP_STATUS_PATH = path.join(USER_DATA_PATH, 'backup-status.json');
const BACKUP_CLOSE_TIMEOUT_MS = 15000;
const DROPBOX_UPLOAD_TIMEOUT_MS = 12000;
const REQUIRED_BACKUP_TABLES = ['articulos', 'abonos', 'auditoria'];
const RESTORE_BUSY_MESSAGE = 'Restauración en curso. Intente nuevamente al terminar.';
const WARNING_TOKEN_NO_CIFRADO = 'Tu sistema no permite cifrado local del token de Dropbox; se guardará sin cifrar en este equipo.';
const PRINTER_CONFIG_DEFAULTS = Object.freeze({
    width: '58mm',
    fontProfile58: 'legible',
    contentWidth58mm: 48,
    verticalShift58mm: 15,
    topOffset58mm: 15,
    finalTrim58mm: 0,
    driverCompatAnchor58: true,
    header: 'NAPOLI\nReparadora de Calzado',
    footer: 'Gracias por preferir Napoli\nConserve este ticket'
});
let restauracionEnCurso = false;

// Crear carpeta de backups si no existe
if (!fs.existsSync(BACKUPS_PATH)) {
    fs.mkdirSync(BACKUPS_PATH, { recursive: true });
}

function timestampIsoSeguro() {
    return new Date().toISOString().replace(/:/g, '-').split('.')[0];
}

function cargarEstadoBackups() {
    try {
        if (fs.existsSync(BACKUP_STATUS_PATH)) {
            return JSON.parse(fs.readFileSync(BACKUP_STATUS_PATH, 'utf8'));
        }
    } catch (error) {
        console.error('Error cargando estado de backups:', error);
    }
    return {};
}

function guardarEstadoBackups(estado) {
    try {
        fs.writeFileSync(BACKUP_STATUS_PATH, JSON.stringify(estado, null, 2));
    } catch (error) {
        console.error('Error guardando estado de backups:', error);
    }
}

function registrarEstadoBackups(parcial) {
    const actual = cargarEstadoBackups();
    const actualizado = {
        ...actual,
        ...parcial,
        updatedAt: new Date().toISOString()
    };
    guardarEstadoBackups(actualizado);
    return actualizado;
}

function listarBackupsLocalesDB() {
    try {
        if (!fs.existsSync(BACKUPS_PATH)) {
            return [];
        }

        const archivos = fs.readdirSync(BACKUPS_PATH)
            .filter((archivo) => path.extname(archivo).toLowerCase() === '.db')
            .map((archivo) => {
                const ruta = path.join(BACKUPS_PATH, archivo);
                const stat = fs.statSync(ruta);
                return {
                    name: archivo,
                    path: ruta,
                    modifiedAt: stat.mtime.toISOString(),
                    size: stat.size
                };
            })
            .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));

        return archivos;
    } catch (error) {
        console.error('Error listando backups locales:', error);
        return [];
    }
}

function obtenerUltimoBackupLocal() {
    const backups = listarBackupsLocalesDB().filter((backup) =>
        backup.name.startsWith('napoli_backup_') || backup.name.startsWith('napoli_manual_')
    );
    return backups[0] || null;
}

function validarBackupDBInterno(rutaArchivo) {
    const resultado = {
        success: true,
        valid: false,
        path: null,
        integrity: null,
        tablesOk: false,
        requiredTables: {},
        error: null
    };

    try {
        const ruta = typeof rutaArchivo === 'string' ? rutaArchivo.trim() : '';
        if (!ruta) {
            resultado.error = 'Ruta de backup inválida';
            return resultado;
        }

        const rutaAbsoluta = path.resolve(ruta);
        resultado.path = rutaAbsoluta;

        if (path.extname(rutaAbsoluta).toLowerCase() !== '.db') {
            resultado.error = 'El archivo debe tener extensión .db';
            return resultado;
        }

        if (!fs.existsSync(rutaAbsoluta)) {
            resultado.error = 'El archivo de backup no existe';
            return resultado;
        }

        const stat = fs.statSync(rutaAbsoluta);
        if (!stat.isFile()) {
            resultado.error = 'La ruta seleccionada no es un archivo';
            return resultado;
        }

        let dbTemporal;
        try {
            dbTemporal = new BetterSqlite(rutaAbsoluta, { readonly: true, fileMustExist: true });

            const integrityRows = dbTemporal.prepare('PRAGMA integrity_check').all();
            const integrityMessages = integrityRows
                .map((row) => String(row.integrity_check ?? Object.values(row)[0] ?? ''))
                .filter(Boolean);
            const integrityOk = integrityMessages.length === 1 && integrityMessages[0].toLowerCase() === 'ok';
            resultado.integrity = integrityMessages.join(' | ') || 'desconocido';

            const tableRows = dbTemporal.prepare(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).all();
            const tablas = new Set(tableRows.map((row) => row.name));

            const requiredTables = {};
            for (const tableName of REQUIRED_BACKUP_TABLES) {
                requiredTables[tableName] = tablas.has(tableName);
            }

            const tablesOk = REQUIRED_BACKUP_TABLES.every((tableName) => requiredTables[tableName]);
            resultado.requiredTables = requiredTables;
            resultado.tablesOk = tablesOk;
            resultado.valid = integrityOk && tablesOk;

            const errores = [];
            if (!integrityOk) {
                errores.push(`integrity_check: ${resultado.integrity}`);
            }
            if (!tablesOk) {
                const faltantes = REQUIRED_BACKUP_TABLES.filter((tableName) => !requiredTables[tableName]);
                errores.push(`Faltan tablas requeridas: ${faltantes.join(', ')}`);
            }

            if (errores.length > 0) {
                resultado.error = errores.join(' | ');
            }
        } finally {
            if (dbTemporal) {
                dbTemporal.close();
            }
        }

        return resultado;
    } catch (error) {
        return {
            ...resultado,
            success: false,
            error: error.message
        };
    }
}

function ejecutarSmokeCheckDB(rutaDb) {
    let dbTemporal;
    try {
        dbTemporal = new BetterSqlite(rutaDb, { readonly: true, fileMustExist: true });

        const integrityRow = dbTemporal.prepare('PRAGMA integrity_check').get();
        const integrityValue = String(integrityRow?.integrity_check ?? Object.values(integrityRow || {})[0] ?? '');
        if (integrityValue.toLowerCase() !== 'ok') {
            return { success: false, error: `integrity_check post-restore: ${integrityValue}` };
        }

        const tableRows = dbTemporal.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        ).all();
        const tablas = new Set(tableRows.map((row) => row.name));
        for (const tableName of REQUIRED_BACKUP_TABLES) {
            if (!tablas.has(tableName)) {
                return { success: false, error: `Tabla requerida ausente tras restore: ${tableName}` };
            }
        }

        const articulosRow = dbTemporal.prepare('SELECT COUNT(*) AS total FROM articulos').get();
        const totalArticulos = Number(articulosRow?.total ?? 0);

        // Smoke check adicional: la tabla de abonos debe poder consultarse sin error.
        dbTemporal.prepare('SELECT COUNT(*) AS total FROM abonos').get();

        return { success: true, totalArticulos };
    } catch (error) {
        return { success: false, error: error.message };
    } finally {
        if (dbTemporal) {
            dbTemporal.close();
        }
    }
}

function construirLogValidacion(resultadoValidacion, source = 'manual') {
    return {
        timestamp: new Date().toISOString(),
        source,
        path: resultadoValidacion.path || null,
        valid: !!resultadoValidacion.valid,
        integrity: resultadoValidacion.integrity || null,
        tablesOk: !!resultadoValidacion.tablesOk,
        requiredTables: resultadoValidacion.requiredTables || {},
        error: resultadoValidacion.error || null
    };
}

async function restaurarBackupDB(rutaBackup) {
    if (restauracionEnCurso) {
        return { success: false, restoredPath: null, rollbackUsed: false, error: 'Ya hay una restauración en curso' };
    }

    restauracionEnCurso = true;
    const timestamp = timestampIsoSeguro();
    const snapshotPath = path.join(BACKUPS_PATH, `napoli_pre_restore_${timestamp}.db`);
    let rollbackUsed = false;
    let warning = null;
    let restoredPath = null;

    try {
        const validacion = validarBackupDBInterno(rutaBackup);
        registrarEstadoBackups({ lastValidation: construirLogValidacion(validacion, 'restore_precheck') });

        if (!validacion.success || !validacion.valid) {
            return {
                success: false,
                restoredPath: null,
                rollbackUsed: false,
                error: validacion.error || 'El backup seleccionado no es válido'
            };
        }

        restoredPath = validacion.path;
        const dbPathNormalizado = path.resolve(DB_PATH);
        if (restoredPath === dbPathNormalizado) {
            return {
                success: false,
                restoredPath,
                rollbackUsed: false,
                error: 'El archivo seleccionado corresponde a la base de datos activa. Seleccione un backup externo.'
            };
        }

        if (!db) {
            throw new Error('Base de datos no inicializada');
        }

        const snapshotResult = await db.crearBackup(snapshotPath);
        if (!snapshotResult.success) {
            throw new Error(`No se pudo crear snapshot previo: ${snapshotResult.error}`);
        }

        db.cerrar();
        db = null;

        fs.copyFileSync(restoredPath, DB_PATH);

        db = new DatabaseManager(DB_PATH);

        const smokeCheck = ejecutarSmokeCheckDB(DB_PATH);
        if (!smokeCheck.success) {
            throw new Error(smokeCheck.error || 'Falló validación post-restore');
        }

        registrarEstadoBackups({
            lastRestore: {
                timestamp: new Date().toISOString(),
                sourcePath: restoredPath,
                snapshotPath,
                success: true,
                rollbackUsed: false,
                warning: null,
                error: null,
                totalArticulos: smokeCheck.totalArticulos
            }
        });

        return { success: true, restoredPath, rollbackUsed: false, warning: null };
    } catch (error) {
        try {
            if (db) {
                db.cerrar();
                db = null;
            }
        } catch (closeError) {
            console.error('Error cerrando DB tras fallo de restore:', closeError);
        }

        if (fs.existsSync(snapshotPath)) {
            try {
                fs.copyFileSync(snapshotPath, DB_PATH);
                rollbackUsed = true;
            } catch (rollbackError) {
                warning = `No se pudo restaurar snapshot automático: ${rollbackError.message}`;
            }
        } else {
            warning = 'No se encontró snapshot para rollback automático';
        }

        try {
            db = new DatabaseManager(DB_PATH);
        } catch (reopenError) {
            const reopenMessage = `No se pudo reabrir la base tras el fallo: ${reopenError.message}`;
            warning = warning ? `${warning} | ${reopenMessage}` : reopenMessage;
        }

        registrarEstadoBackups({
            lastRestore: {
                timestamp: new Date().toISOString(),
                sourcePath: restoredPath,
                snapshotPath,
                success: false,
                rollbackUsed,
                warning,
                error: error.message
            }
        });

        return {
            success: false,
            restoredPath,
            rollbackUsed,
            warning,
            error: error.message
        };
    } finally {
        restauracionEnCurso = false;
    }
}

function obtenerEstadoBackups() {
    const estado = cargarEstadoBackups();
    return {
        success: true,
        backupDir: BACKUPS_PATH,
        lastLocalBackup: obtenerUltimoBackupLocal(),
        localBackups: listarBackupsLocalesDB().slice(0, 20),
        lastValidation: estado.lastValidation || null,
        lastRestore: estado.lastRestore || null,
        dropboxConfigured: !!(dropboxManager && dropboxManager.estaConfigurado())
    };
}

// Cargar configuración (incluye token de Dropbox)
function cargarConfiguracion() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            let configModificada = false;

            if (!config || typeof config !== 'object') {
                const configPorDefecto = { printer: { ...PRINTER_CONFIG_DEFAULTS } };
                guardarConfiguracion(configPorDefecto);
                return configPorDefecto;
            }

            if (!config.printer || typeof config.printer !== 'object') {
                config.printer = {};
                configModificada = true;
            }

            // Migración v1: verticalShift58mm era inefectivo (Electron margin anulado por @page CSS).
            // Ahora funciona via CSS var — bumpeamos valores bajos a un default seguro.
            if (
                config.printer &&
                !config._migrated_verticalShift_v1 &&
                typeof config.printer.verticalShift58mm === 'number' &&
                config.printer.verticalShift58mm < 8
            ) {
                config.printer.verticalShift58mm = 10;
                config._migrated_verticalShift_v1 = true;
                configModificada = true;
            }
            // Migración v2: offset ahora es inline style directo (eliminado doble mecanismo Electron margin).
            // Default bumpeado a 15 mm para cubrir impresoras con mayor distancia cabezal→sierra.
            if (
                config.printer &&
                !config._migrated_verticalShift_v2 &&
                typeof config.printer.verticalShift58mm === 'number' &&
                config.printer.verticalShift58mm < 12
            ) {
                config.printer.verticalShift58mm = 15;
                config._migrated_verticalShift_v2 = true;
                configModificada = true;
            }
            // Migración v3: endurece mínimo operativo del offset para evitar recorte superior.
            if (
                config.printer &&
                !config._migrated_verticalShift_v3 &&
                Number.isFinite(Number(config.printer.verticalShift58mm)) &&
                Number(config.printer.verticalShift58mm) < 8
            ) {
                config.printer.verticalShift58mm = 15;
                config._migrated_verticalShift_v3 = true;
                configModificada = true;
            }

            const printerNormalizado = sanitizarConfigImpresora(config.printer || {});
            const printerCompleto = { ...PRINTER_CONFIG_DEFAULTS, ...printerNormalizado };
            const printerAnterior = JSON.stringify(config.printer);
            const printerNuevo = JSON.stringify(printerCompleto);
            if (printerAnterior !== printerNuevo) {
                config.printer = printerCompleto;
                configModificada = true;
            }

            if (configModificada) {
                guardarConfiguracion(config);
            }
            return config;
        }
    } catch (error) {
        console.error('Error cargando configuración:', error);
    }
    const configInicial = { printer: { ...PRINTER_CONFIG_DEFAULTS } };
    guardarConfiguracion(configInicial);
    return configInicial;
}

// Guardar configuración
function guardarConfiguracion(config) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error('Error guardando configuración:', error);
    }
}

// Cifrar token usando safeStorage de Electron
function cifrarToken(token) {
    if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.encryptString(token).toString('base64');
    }
    return token;
}

// Descifrar token
function descifrarToken(tokenCifrado) {
    if (!tokenCifrado) return null;
    try {
        if (safeStorage.isEncryptionAvailable()) {
            const buffer = Buffer.from(tokenCifrado, 'base64');
            return safeStorage.decryptString(buffer);
        }
    } catch (error) {
        // Si falla el descifrado, asumir que es un token sin cifrar (migración)
        console.warn('Token sin cifrar detectado, se cifrará en el próximo guardado');
    }
    return tokenCifrado;
}

function sanitizarConfigImpresora(printerConfig = {}) {
    const widthsPermitidos = new Set(['58mm', '80mm']);
    const perfilesPermitidos = new Set(['compacto', 'legible', 'extra_grande']);
    const sanitizarCalibracion58mm = (valor, fallback, min = 0, max = 8) => {
        const parsed = Number(valor);
        const fallbackNumber = Number(fallback);
        const fallbackSanitizado = Number.isFinite(fallbackNumber)
            ? Math.min(max, Math.max(min, fallbackNumber))
            : min;
        if (!Number.isFinite(parsed)) return fallbackSanitizado;
        const clamped = Math.min(max, Math.max(min, parsed));
        return Math.round(clamped * 2) / 2;
    };
    const width = widthsPermitidos.has(printerConfig.width)
        ? printerConfig.width
        : PRINTER_CONFIG_DEFAULTS.width;
    const fontProfileRaw = typeof printerConfig.fontProfile58 === 'string'
        ? printerConfig.fontProfile58.trim().toLowerCase()
        : '';
    const fontProfile58 = perfilesPermitidos.has(fontProfileRaw)
        ? fontProfileRaw
        : PRINTER_CONFIG_DEFAULTS.fontProfile58;
    const contentWidthRaw = Number(printerConfig.contentWidth58mm);
    const contentWidth58mm = Number.isFinite(contentWidthRaw)
        ? Math.min(54, Math.max(44, contentWidthRaw))
        : PRINTER_CONFIG_DEFAULTS.contentWidth58mm;
    const verticalShiftRaw = Number.isFinite(Number(printerConfig.verticalShift58mm))
        ? printerConfig.verticalShift58mm
        : printerConfig.topOffset58mm;
    const verticalShift58mm = sanitizarCalibracion58mm(
        verticalShiftRaw,
        PRINTER_CONFIG_DEFAULTS.verticalShift58mm,
        8,
        35
    );
    const finalTrim58mm = sanitizarCalibracion58mm(
        printerConfig.finalTrim58mm,
        PRINTER_CONFIG_DEFAULTS.finalTrim58mm,
        0,
        8
    );
    const driverCompatAnchor58 = typeof printerConfig.driverCompatAnchor58 === 'boolean'
        ? printerConfig.driverCompatAnchor58
        : PRINTER_CONFIG_DEFAULTS.driverCompatAnchor58;
    const header = typeof printerConfig.header === 'string' && printerConfig.header.trim()
        ? printerConfig.header.slice(0, 500)
        : PRINTER_CONFIG_DEFAULTS.header;
    const footer = typeof printerConfig.footer === 'string' && printerConfig.footer.trim()
        ? printerConfig.footer.slice(0, 500)
        : PRINTER_CONFIG_DEFAULTS.footer;
    return {
        width,
        header,
        footer,
        fontProfile58,
        contentWidth58mm,
        verticalShift58mm,
        topOffset58mm: verticalShift58mm,
        finalTrim58mm,
        driverCompatAnchor58
    };
}

function operacionBloqueadaPorRestore() {
    return restauracionEnCurso;
}

function respuestaBloqueoRestoreEscritura() {
    if (!operacionBloqueadaPorRestore()) {
        return null;
    }
    return { success: false, error: RESTORE_BUSY_MESSAGE };
}

function respuestaBloqueoRestoreLectura(valorPorDefecto) {
    if (!operacionBloqueadaPorRestore()) {
        return null;
    }
    return valorPorDefecto;
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        clearTimeout(timeoutId);
    });
}

async function subirBackupDBConTimeout(backupPath) {
    return await withTimeout(
        dropboxManager.subirBackupDB(backupPath),
        DROPBOX_UPLOAD_TIMEOUT_MS,
        'Timeout subiendo backup a Dropbox'
    );
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        icon: path.join(__dirname, 'build/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'src/preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        title: 'Napoli - Reparadora de Calzado'
    });

    // Para desarrollo: descomentar para ver DevTools
    // mainWindow.webContents.openDevTools();

    mainWindow.loadFile('src/index.html');

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    // Inicializar base de datos
    try {
        db = new DatabaseManager(DB_PATH);
    } catch (error) {
        console.error('❌ Error crítico inicializando base de datos:', error);
        app.quit();
        return;
    }

    // Inicializar Dropbox si está configurado
    const config = cargarConfiguracion();
    if (config.dropboxToken) {
        const token = descifrarToken(config.dropboxToken);
        if (token) {
            if (!safeStorage.isEncryptionAvailable()) {
                console.warn(`⚠️ ${WARNING_TOKEN_NO_CIFRADO}`);
            }
            dropboxManager = new DropboxManager(token);
        }
    }

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });

    // Backup automático cada 24 horas
    setInterval(() => {
        crearBackupAutomatico().catch((error) => {
            console.error('Error en backup automático programado:', error);
        });
    }, 24 * 60 * 60 * 1000);
});

let backupAlCerrarRealizado = false;
let cierreForzadoTrasBackup = false;

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', (event) => {
    if (cierreForzadoTrasBackup) {
        return;
    }

    if (!backupAlCerrarRealizado) {
        event.preventDefault();
        backupAlCerrarRealizado = true;

        withTimeout(
            crearBackupAutomatico(),
            BACKUP_CLOSE_TIMEOUT_MS,
            'Timeout creando backup al cerrar'
        )
            .catch((error) => {
                console.error('Error creando backup al cerrar:', error);
            })
            .finally(() => {
                if (db) {
                    db.cerrar();
                    db = null;
                }
                cierreForzadoTrasBackup = true;
                app.quit();
            });
    }
});

// ============================================
// HANDLERS IPC - BASE DE DATOS
// ============================================

ipcMain.handle('db:insertar', async (event, articulo) => {
    const bloqueo = respuestaBloqueoRestoreEscritura();
    if (bloqueo) return bloqueo;
    if (!db) return { success: false, error: 'Base de datos no inicializada' };
    return db.insertar(articulo);
});

ipcMain.handle('db:obtenerTodos', async () => {
    const bloqueo = respuestaBloqueoRestoreLectura([]);
    if (bloqueo) return bloqueo;
    if (!db) return [];
    return db.obtenerTodos();
});

ipcMain.handle('db:obtenerPorId', async (event, id) => {
    if (operacionBloqueadaPorRestore()) return null;
    if (!db) return null;
    return db.obtenerPorId(id);
});

ipcMain.handle('db:actualizarEstado', async (event, id, nuevoEstado) => {
    const bloqueo = respuestaBloqueoRestoreEscritura();
    if (bloqueo) return bloqueo;
    if (!db) return { success: false, error: 'Base de datos no inicializada' };
    return db.actualizarEstado(id, nuevoEstado);
});

ipcMain.handle('db:eliminar', async (event, id) => {
    const bloqueo = respuestaBloqueoRestoreEscritura();
    if (bloqueo) return bloqueo;
    if (!db) return { success: false, error: 'Base de datos no inicializada' };
    return db.eliminar(id);
});

ipcMain.handle('db:buscar', async (event, termino) => {
    const bloqueo = respuestaBloqueoRestoreLectura([]);
    if (bloqueo) return bloqueo;
    if (!db) return [];
    return db.buscar(termino);
});

ipcMain.handle('db:obtenerEstadisticas', async () => {
    const bloqueo = respuestaBloqueoRestoreLectura({ total: 0, enBodega: 0, entregados: 0 });
    if (bloqueo) return bloqueo;
    if (!db) return { total: 0, enBodega: 0, entregados: 0 };
    return db.obtenerEstadisticas();
});

ipcMain.handle('db:migrarDesdeLocalStorage', async (event, datosJSON) => {
    const bloqueo = respuestaBloqueoRestoreEscritura();
    if (bloqueo) return bloqueo;
    if (!db) return { success: false, error: 'Base de datos no inicializada' };
    return db.migrarDesdeLocalStorage(datosJSON);
});

// ============================================
// HANDLERS IPC - PAGOS Y ABONOS
// ============================================

ipcMain.handle('pago:registrarAbono', async (event, articuloId, monto, metodoPago, observaciones) => {
    const bloqueo = respuestaBloqueoRestoreEscritura();
    if (bloqueo) return bloqueo;
    if (!db) return { success: false, error: 'Base de datos no inicializada' };
    return db.registrarAbono(articuloId, monto, metodoPago, observaciones);
});

ipcMain.handle('pago:obtenerAbonos', async (event, articuloId) => {
    const bloqueo = respuestaBloqueoRestoreLectura([]);
    if (bloqueo) return bloqueo;
    if (!db) return [];
    return db.obtenerAbonosArticulo(articuloId);
});

ipcMain.handle('pago:actualizarValor', async (event, articuloId, nuevoValor) => {
    const bloqueo = respuestaBloqueoRestoreEscritura();
    if (bloqueo) return bloqueo;
    if (!db) return { success: false, error: 'Base de datos no inicializada' };
    return db.actualizarValorTotal(articuloId, nuevoValor);
});

// ============================================
// HANDLERS IPC - BACKUPS
// ============================================

ipcMain.handle('backup:crear', async () => {
    return crearBackupManual();
});

ipcMain.handle('backup:exportarJSON', async () => {
    return exportarJSON();
});

ipcMain.handle('backup:exportarExcel', async () => {
    return exportarExcel();
});

ipcMain.handle('backup:abrirCarpeta', async () => {
    const resultado = await shell.openPath(BACKUPS_PATH);
    if (resultado) {
        return { success: false, error: resultado };
    }
    return { success: true };
});

ipcMain.handle('backup:seleccionarArchivoDB', async () => {
    try {
        const targetWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
        const result = await dialog.showOpenDialog(targetWindow, {
            title: 'Seleccionar backup de base de datos',
            defaultPath: BACKUPS_PATH,
            properties: ['openFile'],
            filters: [{ name: 'Base de datos SQLite', extensions: ['db'] }]
        });

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
            return { success: true, canceled: true };
        }

        return { success: true, canceled: false, path: result.filePaths[0] };
    } catch (error) {
        return { success: false, canceled: true, error: error.message };
    }
});

ipcMain.handle('backup:validarDB', async (event, rutaArchivo) => {
    const resultado = validarBackupDBInterno(rutaArchivo);
    registrarEstadoBackups({ lastValidation: construirLogValidacion(resultado, 'manual') });
    return resultado;
});

ipcMain.handle('backup:restaurarDB', async (event, rutaBackup) => {
    return await restaurarBackupDB(rutaBackup);
});

ipcMain.handle('backup:estado', async () => {
    return obtenerEstadoBackups();
});

async function crearBackupAutomatico() {
    try {
        if (restauracionEnCurso) {
            return { success: false, error: 'Restauración en curso. Intente nuevamente al terminar.' };
        }

        const timestamp = timestampIsoSeguro();
        const backupPath = path.join(BACKUPS_PATH, `napoli_backup_${timestamp}.db`);

        if (!db) {
            throw new Error('Base de datos no inicializada');
        }

        const backupDB = await db.crearBackup(backupPath);
        if (!backupDB.success) {
            return backupDB;
        }

        console.log('✅ Backup automático creado:', backupPath);

        // Subir a Dropbox si está configurado
        if (dropboxManager && dropboxManager.estaConfigurado()) {
            const subida = await subirBackupDBConTimeout(backupPath);
            if (!subida.success) {
                console.warn('⚠️ Backup automático local creado, pero falló subida a Dropbox:', subida.error);
            }
        }

        // Limpiar backups antiguos (mantener últimos 30 días)
        limpiarBackupsAntiguos();

        registrarEstadoBackups({
            lastAutomaticBackup: {
                timestamp: new Date().toISOString(),
                path: backupPath
            }
        });

        return { success: true, path: backupPath };
    } catch (error) {
        console.error('Error creando backup:', error);
        return { success: false, error: error.message };
    }
}

async function crearBackupManual(options = {}) {
    const { exigirDropbox = false } = options;

    try {
        if (restauracionEnCurso) {
            return { success: false, error: 'Restauración en curso. Intente nuevamente al terminar.' };
        }

        const timestamp = timestampIsoSeguro();
        const backupPath = path.join(BACKUPS_PATH, `napoli_manual_${timestamp}.db`);

        if (!db) {
            throw new Error('Base de datos no inicializada');
        }

        const backupDB = await db.crearBackup(backupPath);
        if (!backupDB.success) {
            return backupDB;
        }

        console.log('✅ Backup manual creado:', backupPath);

        // Subir a Dropbox si está configurado
        if (dropboxManager && dropboxManager.estaConfigurado()) {
            const subida = await subirBackupDBConTimeout(backupPath);
            if (!subida.success) {
                const mensaje = `Backup local creado, pero falló subida a Dropbox: ${subida.error}`;
                if (exigirDropbox) {
                    return { success: false, error: mensaje };
                }
                return { success: true, path: backupPath, warning: mensaje };
            }
        }

        registrarEstadoBackups({
            lastManualBackup: {
                timestamp: new Date().toISOString(),
                path: backupPath
            }
        });

        return { success: true, path: backupPath };
    } catch (error) {
        console.error('Error creando backup manual:', error);
        return { success: false, error: error.message };
    }
}

function exportarJSON() {
    try {
        if (restauracionEnCurso) {
            throw new Error('Restauración en curso. Intente nuevamente al terminar.');
        }

        if (!db) {
            throw new Error('Base de datos no inicializada');
        }

        const timestamp = timestampIsoSeguro();
        const jsonPath = path.join(BACKUPS_PATH, `napoli_export_${timestamp}.json`);

        const datos = db.obtenerTodos();
        fs.writeFileSync(jsonPath, JSON.stringify(datos, null, 2));

        console.log('✅ JSON exportado:', jsonPath);

        // Subir a Dropbox si está configurado
        if (dropboxManager && dropboxManager.estaConfigurado()) {
            dropboxManager.subirBackupJSON(jsonPath).catch((error) => {
                console.warn('⚠️ JSON exportado localmente, pero falló subida a Dropbox:', error.message);
            });
        }

        return { success: true, filename: path.basename(jsonPath) };
    } catch (error) {
        console.error('Error exportando JSON:', error);
        return { success: false, error: error.message };
    }
}

async function exportarExcel() {
    try {
        const bloqueo = respuestaBloqueoRestoreEscritura();
        if (bloqueo) return bloqueo;

        if (!db) {
            throw new Error('Base de datos no inicializada');
        }

        const xl = require('excel4node');
        const timestamp = timestampIsoSeguro();
        const excelPath = path.join(BACKUPS_PATH, `napoli_inventario_${timestamp}.xlsx`);

        const workbook = new xl.Workbook();
        const worksheet = workbook.addWorksheet('Inventario Napoli');
        const toText = (value) => (value === null || value === undefined ? '' : String(value));
        const toNumber = (value) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
        };

        // Configurar columnas
        const columns = [
            { header: 'ID', width: 8 },
            { header: 'RUT', width: 15 },
            { header: 'Cliente', width: 25 },
            { header: 'Teléfono', width: 15 },
            { header: 'Tipo Servicio', width: 20 },
            { header: 'Descripción', width: 40 },
            { header: 'Ubicación (opcional)', width: 20 },
            { header: 'Fecha Ingreso', width: 18 },
            { header: 'Estado', width: 12 },
            { header: 'Fecha Entrega', width: 18 },
            { header: 'Valor Total', width: 14 },
            { header: 'Total Abonado', width: 14 },
            { header: 'Saldo Pendiente', width: 16 },
            { header: 'Estado Pago', width: 12 },
            { header: 'Observaciones', width: 30 }
        ];
        columns.forEach((column, index) => {
            worksheet.column(index + 1).setWidth(column.width);
        });

        const headerStyle = workbook.createStyle({
            font: {
                bold: true,
                color: '#FFFFFF'
            },
            fill: {
                type: 'pattern',
                patternType: 'solid',
                fgColor: '#667EEA'
            },
            alignment: {
                horizontal: 'center',
                vertical: 'center',
                wrapText: true
            }
        });
        const moneyStyle = workbook.createStyle({
            numberFormat: '$#,##0'
        });
        const centeredStyle = workbook.createStyle({
            alignment: {
                horizontal: 'center',
                vertical: 'center'
            }
        });
        const wrappedStyle = workbook.createStyle({
            alignment: {
                vertical: 'center',
                wrapText: true
            }
        });

        columns.forEach((column, index) => {
            worksheet.cell(1, index + 1).string(column.header).style(headerStyle);
        });

        // Obtener datos
        const datos = db.obtenerTodos();

        // Agregar filas
        datos.forEach((articulo, index) => {
            const row = index + 2;
            worksheet.cell(row, 1).number(toNumber(articulo.id)).style(centeredStyle);
            worksheet.cell(row, 2).string(toText(articulo.rut));
            worksheet.cell(row, 3).string(toText(articulo.nombreCliente)).style(wrappedStyle);
            worksheet.cell(row, 4).string(toText(articulo.telefono));
            worksheet.cell(row, 5).string(toText(articulo.tipoArticulo)).style(wrappedStyle);
            worksheet.cell(row, 6).string(toText(articulo.descripcion)).style(wrappedStyle);
            worksheet.cell(row, 7).string(toText(articulo.numeroBodega));
            worksheet.cell(row, 8).string(toText(articulo.fechaIngreso));
            worksheet.cell(row, 9).string(toText(articulo.estado)).style(centeredStyle);
            worksheet.cell(row, 10).string(toText(articulo.fechaEntrega));
            worksheet.cell(row, 11).number(toNumber(articulo.valorTotal)).style(moneyStyle);
            worksheet.cell(row, 12).number(toNumber(articulo.totalAbonado)).style(moneyStyle);
            worksheet.cell(row, 13).number(toNumber(articulo.saldoPendiente)).style(moneyStyle);
            worksheet.cell(row, 14).string(toText(articulo.estadoPago || 'Sin pago')).style(centeredStyle);
            worksheet.cell(row, 15).string(toText(articulo.observaciones)).style(wrappedStyle);
        });

        // Guardar archivo
        await new Promise((resolve, reject) => {
            workbook.write(excelPath, (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
        console.log('✅ Excel exportado:', excelPath);

        // Subir a Dropbox si está configurado
        if (dropboxManager && dropboxManager.estaConfigurado()) {
            const subida = await dropboxManager.subirArchivo(excelPath, `/NapoliReparadora/Exports/${path.basename(excelPath)}`);
            if (!subida.success) {
                return {
                    success: true,
                    filename: path.basename(excelPath),
                    path: excelPath,
                    warning: `Excel exportado localmente, pero falló subida a Dropbox: ${subida.error}`
                };
            }
        }

        return { success: true, filename: path.basename(excelPath), path: excelPath };
    } catch (error) {
        console.error('Error exportando Excel:', error);
        return { success: false, error: error.message };
    }
}

async function subirBackupDropboxInmediato() {
    try {
        if (!dropboxManager || !dropboxManager.estaConfigurado()) {
            return { success: false, error: 'Dropbox no configurado' };
        }

        // Crear backup local primero
        const backupResult = await crearBackupManual({ exigirDropbox: true });

        if (!backupResult.success) {
            return backupResult;
        }

        console.log('✅ Backup subido a Dropbox inmediatamente');
        return { success: true, mensaje: 'Backup creado y subido a Dropbox correctamente' };
    } catch (error) {
        console.error('Error subiendo backup a Dropbox:', error);
        return { success: false, error: error.message };
    }
}

function limpiarBackupsAntiguos() {
    try {
        const archivos = fs.readdirSync(BACKUPS_PATH);
        const ahora = Date.now();
        const diasMaximos = 30 * 24 * 60 * 60 * 1000; // 30 días en milisegundos

        archivos.forEach(archivo => {
            const archivoPath = path.join(BACKUPS_PATH, archivo);
            const stats = fs.statSync(archivoPath);
            const edad = ahora - stats.mtime.getTime();

            if (
                edad > diasMaximos &&
                (
                    archivo.startsWith('napoli_backup_') ||
                    archivo.startsWith('napoli_manual_') ||
                    archivo.startsWith('napoli_pre_restore_')
                )
            ) {
                fs.unlinkSync(archivoPath);
                console.log('🗑️ Backup antiguo eliminado:', archivo);
            }
        });
    } catch (error) {
        console.error('Error limpiando backups antiguos:', error);
    }
}

// ============================================
// HANDLERS IPC - DROPBOX
// ============================================

ipcMain.handle('dropbox:configurar', async (event, token) => {
    try {
        const tokenLimpio = typeof token === 'string' ? token.trim() : '';
        if (!tokenLimpio) {
            return { success: false, error: 'Token de Dropbox inválido' };
        }

        dropboxManager = new DropboxManager(tokenLimpio);
        const verificacion = await dropboxManager.verificarConexion();

        if (verificacion.success) {
            const config = cargarConfiguracion();
            config.dropboxToken = cifrarToken(tokenLimpio);
            guardarConfiguracion(config);
            const warning = safeStorage.isEncryptionAvailable() ? null : WARNING_TOKEN_NO_CIFRADO;

            return {
                success: true,
                usuario: verificacion.usuario,
                warning
            };
        } else {
            dropboxManager = null;
            return { success: false, error: verificacion.error };
        }
    } catch (error) {
        dropboxManager = null;
        return { success: false, error: error.message };
    }
});

ipcMain.handle('dropbox:verificar', async () => {
    if (!dropboxManager || !dropboxManager.estaConfigurado()) {
        return { success: false, error: 'Dropbox no configurado' };
    }
    return await dropboxManager.verificarConexion();
});

ipcMain.handle('dropbox:estaConfigurado', async () => {
    return dropboxManager && dropboxManager.estaConfigurado();
});

ipcMain.handle('dropbox:desconectar', async () => {
    dropboxManager = null;
    const config = cargarConfiguracion();
    delete config.dropboxToken;
    guardarConfiguracion(config);
    return { success: true };
});

ipcMain.handle('dropbox:listarBackups', async () => {
    if (!dropboxManager || !dropboxManager.estaConfigurado()) {
        return { success: false, error: 'Dropbox no configurado' };
    }
    return await dropboxManager.listarBackups();
});

ipcMain.handle('dropbox:subirBackupAhora', async () => {
    return await subirBackupDropboxInmediato();
});

// ============================================
// HANDLERS IPC - CONFIGURACIÓN
// ============================================

ipcMain.handle('config:obtener', async () => {
    const config = cargarConfiguracion();
    return {
        printer: sanitizarConfigImpresora(config.printer || {})
    };
});

ipcMain.handle('config:guardar', async (event, nuevaConfig) => {
    try {
        const config = cargarConfiguracion();

        if (nuevaConfig && typeof nuevaConfig === 'object' && nuevaConfig.printer) {
            const printerActual = config.printer || {};
            const printerSanitizado = sanitizarConfigImpresora(nuevaConfig.printer);
            config.printer = { ...printerActual, ...printerSanitizado };
        }

        guardarConfiguracion(config);
        return { success: true };
    } catch (error) {
        console.error('Error guardando configuración:', error);
        return { success: false, error: error.message };
    }
});

// ============================================
// HANDLER IPC - IMPRESIÓN
// ============================================

ipcMain.handle('imprimir', async (event, opciones = {}) => {
    if (!mainWindow) {
        return { success: false, error: 'Ventana principal no disponible' };
    }

    try {
        const config = cargarConfiguracion();
        const printerConfig = sanitizarConfigImpresora(config.printer || {});
        const widthsPermitidos = new Set(['58mm', '80mm']);
        const widthSolicitado = typeof opciones.width === 'string'
            ? opciones.width.trim()
            : '';
        const widthFinal = widthsPermitidos.has(widthSolicitado)
            ? widthSolicitado
            : printerConfig.width;
        const printOptions = {
            silent: false,
            printBackground: false,
            margins: { marginType: 'none' }
        };

        await new Promise((resolve, reject) => {
            mainWindow.webContents.print(
                printOptions,
                (success, failureReason) => {
                    if (success) {
                        resolve();
                        return;
                    }
                    reject(new Error(failureReason || `No se pudo imprimir ticket ${widthFinal}`));
                }
            );
        });

        return { success: true };
    } catch (error) {
        console.error('Error imprimiendo ticket:', error);
        return { success: false, error: error.message || 'Error de impresión' };
    }
});

console.log('✅ Napoli - Reparadora de Calzado iniciada');
console.log('📂 Base de datos:', DB_PATH);
console.log('💾 Backups:', BACKUPS_PATH);
