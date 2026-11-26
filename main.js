const { app, BrowserWindow, ipcMain, shell, safeStorage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const BetterSqlite = require('better-sqlite3');
const DBService = require('./src/main/db-service');
const DropboxManager = require('./src/main/dropbox');
const { iniciarAutorizacionPKCE, completarAutorizacionPKCE } = DropboxManager;
const { DiagnosticsLogger } = require('./src/main/diagnostics');
const { formatearFechaChileParaExport } = require('./src/main/chile-date');
const { esUrlExternaPermitida, esFileUrl } = require('./src/main/navigation-security');
const { createUniqueTimestampGenerator } = require('./src/main/backup-filename');
const {
    limpiarSidecarsSQLite,
    replaceFileAtomically,
    stageRestoreFile
} = require('./src/main/sqlite-restore-utils');
const estado = require('./src/main/estado');
const { USER_DATA_PATH, DB_PATH, CONFIG_PATH, BACKUPS_PATH, BACKUP_STATUS_PATH } = require('./src/main/rutas');
const {
    RESTORE_BUSY_MESSAGE,
    logDiag,
    medirOperacionDb,
    timestampIsoSeguro,
    escribirJsonAtomico,
    eliminarArchivoParcial,
    operacionBloqueadaPorRestore,
    respuestaBloqueoRestoreEscritura,
    payloadErrorOperacion,
    withTimeout
} = require('./src/main/utilidades');

let workerRetryTimer = null;
let workerRetryCount = 0;

const BACKUP_CLOSE_TIMEOUT_MS = 15000;
const DROPBOX_UPLOAD_TIMEOUT_MS = 12000;
const DB_WORKER_RETRY_INTERVAL_MS = 30000;
const DB_WORKER_MAX_RETRIES = 10;
const REQUIRED_BACKUP_TABLES = ['articulos', 'abonos', 'auditoria'];
const WARNING_TOKEN_NO_CIFRADO = 'Tu sistema no permite cifrado local del token de Dropbox; se guardará sin cifrar en este equipo.';
const INSECURE_STORAGE_RESPONSE_CODE = 'INSECURE_STORAGE';
const OP_DECISION_DROPBOX_TOKEN_SIN_CIFRADO = 'DROPBOX_TOKEN_SIN_CIFRADO';
const OPERATIONAL_DECISIONS_MAX = 50;
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
const rutasAprobadasPorDialogo = new Set();
const RUTAS_APROBADAS_MAX = 20;

function cargarEstadoBackups({ strict = false } = {}) {
    try {
        if (!fs.existsSync(BACKUP_STATUS_PATH)) {
            return {};
        }

        const raw = fs.readFileSync(BACKUP_STATUS_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('El estado de backups tiene un formato inválido');
        }
        return parsed;
    } catch (error) {
        if (strict) {
            throw error;
        }
        console.error('Error cargando estado de backups:', error);
    }
    return {};
}

function guardarEstadoBackups(estado) {
    try {
        escribirJsonAtomico(BACKUP_STATUS_PATH, estado);
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
    if (estado.restauracionEnCurso) {
        return { success: false, restoredPath: null, rollbackUsed: false, error: 'Ya hay una restauración en curso' };
    }

    if (estado.restauracionPromesa) {
        return await estado.restauracionPromesa;
    }

    estado.restauracionEnCurso = true;
    estado.restauracionPromesa = (async () => {
    const timestamp = timestampIsoSeguro();
    const snapshotPath = path.join(BACKUPS_PATH, `napoli_pre_restore_${timestamp}.db`);
    let rollbackUsed = false;
    let warning = null;
    let restoredPath = null;
    let snapshotCompleto = false;
    let dbCerrada = false;
    let dbReemplazada = false;

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

        if (!estado.dbService) {
            throw new Error('Base de datos no inicializada');
        }

        const snapshotResult = await medirOperacionDb('restore:snapshot_backup', () =>
            estado.dbService.crearBackup(snapshotPath)
        );
        if (!snapshotResult.success) {
            // El snapshot pudo quedar a medias: se descarta para que nunca se use como rollback.
            eliminarArchivoParcial(snapshotPath);
            throw new Error(`No se pudo crear snapshot previo: ${snapshotResult.error}`);
        }
        snapshotCompleto = true;

        // Se marca antes de esperar: si el cierre falla a medias, igual se intentará reabrir.
        dbCerrada = true;
        await estado.dbService.closeForRestore();

        limpiarSidecarsSQLite(DB_PATH);
        const stagedRestorePath = stageRestoreFile(restoredPath, DB_PATH);
        replaceFileAtomically(stagedRestorePath, DB_PATH);
        dbReemplazada = true;
        limpiarSidecarsSQLite(DB_PATH);

        await estado.dbService.reopenAfterRestore();

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
        // Solo hay que deshacer algo si la base activa llegó a reemplazarse.
        // Si el fallo ocurrió antes (p. ej. al crear el snapshot), la base sigue intacta.
        if (dbReemplazada) {
            try {
                if (estado.dbService) {
                    await estado.dbService.closeForRestore();
                }
            } catch (closeError) {
                console.error('Error cerrando DB tras fallo de restore:', closeError);
            }

            if (snapshotCompleto && fs.existsSync(snapshotPath)) {
                try {
                    limpiarSidecarsSQLite(DB_PATH);
                    const stagedSnapshotPath = stageRestoreFile(snapshotPath, DB_PATH);
                    replaceFileAtomically(stagedSnapshotPath, DB_PATH);
                    limpiarSidecarsSQLite(DB_PATH);
                    rollbackUsed = true;
                } catch (rollbackError) {
                    warning = `No se pudo restaurar snapshot automático: ${rollbackError.message}`;
                }
            } else {
                warning = 'No se encontró snapshot para rollback automático';
            }
        }

        if (dbCerrada || dbReemplazada) {
            try {
                if (estado.dbService) {
                    await estado.dbService.reopenAfterRestore();
                }
            } catch (reopenError) {
                const reopenMessage = `No se pudo reabrir la base tras el fallo: ${reopenError.message}`;
                warning = warning ? `${warning} | ${reopenMessage}` : reopenMessage;
            }
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
        estado.restauracionEnCurso = false;
        estado.restauracionPromesa = null;
    }
    })();
    return await estado.restauracionPromesa;
}

function obtenerEstadoBackups() {
    const estado = cargarEstadoBackups({ strict: true });
    return {
        success: true,
        backupDir: BACKUPS_PATH,
        lastLocalBackup: obtenerUltimoBackupLocal(),
        localBackups: listarBackupsLocalesDB().slice(0, 20),
        lastValidation: estado.lastValidation || null,
        lastRestore: estado.lastRestore || null,
        dropboxConfigured: !!(estado.dropboxManager && estado.dropboxManager.estaConfigurado())
    };
}

function normalizarDecisionOperativa(rawDecision) {
    if (!rawDecision || typeof rawDecision !== 'object') {
        return null;
    }

    const code = typeof rawDecision.code === 'string' ? rawDecision.code.trim() : '';
    if (!code) {
        return null;
    }

    const context = typeof rawDecision.context === 'string' && rawDecision.context.trim()
        ? rawDecision.context.trim()
        : 'general';
    const note = typeof rawDecision.note === 'string'
        ? rawDecision.note.trim().slice(0, 500)
        : '';
    const ts = typeof rawDecision.ts === 'string' && rawDecision.ts.trim()
        ? rawDecision.ts.trim()
        : new Date().toISOString();

    return {
        code,
        context,
        accepted: rawDecision.accepted !== false,
        note,
        ts
    };
}

function normalizarListaDecisionesOperativas(rawList) {
    if (!Array.isArray(rawList)) {
        return [];
    }

    const normalizadas = [];
    for (const decision of rawList) {
        const item = normalizarDecisionOperativa(decision);
        if (!item) continue;
        normalizadas.push(item);
    }
    return normalizadas.slice(-OPERATIONAL_DECISIONS_MAX);
}

function registrarDecisionOperativa(decision, configExistente = null) {
    try {
        const config = (configExistente && typeof configExistente === 'object')
            ? configExistente
            : cargarConfiguracion();

        const decisionNormalizada = normalizarDecisionOperativa(decision);
        if (!decisionNormalizada) {
            return null;
        }

        const decisionesActuales = normalizarListaDecisionesOperativas(config.operationalDecisions);
        const yaRegistrada = decisionesActuales.some((item) =>
            item.code === decisionNormalizada.code && item.context === decisionNormalizada.context
        );
        if (yaRegistrada) {
            if (!Array.isArray(config.operationalDecisions) || config.operationalDecisions.length !== decisionesActuales.length) {
                config.operationalDecisions = decisionesActuales;
                guardarConfiguracion(config);
            }
            return null;
        }

        const actualizada = [...decisionesActuales, decisionNormalizada].slice(-OPERATIONAL_DECISIONS_MAX);
        config.operationalDecisions = actualizada;
        guardarConfiguracion(config);
        return decisionNormalizada;
    } catch (error) {
        console.error('Error registrando decisión operativa:', error);
        return null;
    }
}

function crearConfiguracionPorDefecto() {
    return {
        printer: { ...PRINTER_CONFIG_DEFAULTS },
        operationalDecisions: []
    };
}

// Guarda una copia del config.json ilegible en vez de perderlo (contiene el token de Dropbox).
function preservarConfiguracionCorrupta() {
    const destino = path.join(USER_DATA_PATH, `config.corrupt-${timestampIsoSeguro()}.json`);
    try {
        fs.copyFileSync(CONFIG_PATH, destino);
        console.error(`config.json ilegible; se conservó una copia en ${destino}`);
        return true;
    } catch (error) {
        console.error('No se pudo conservar copia del config.json ilegible:', error);
        return false;
    }
}

function guardarConfiguracionInicial(config) {
    try {
        guardarConfiguracion(config);
    } catch (saveError) {
        console.error('Error guardando configuración inicial:', saveError);
    }
    return config;
}

// Cargar configuración (incluye token de Dropbox)
function cargarConfiguracion() {
    let raw = null;
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        }
    } catch (error) {
        // No se pudo leer (permisos, archivo bloqueado...): no sobrescribir lo que haya en disco.
        console.error('Error leyendo configuración:', error);
        return crearConfiguracionPorDefecto();
    }

    if (raw === null) {
        return guardarConfiguracionInicial(crearConfiguracionPorDefecto());
    }

    let config = null;
    try {
        config = JSON.parse(raw);
    } catch (error) {
        console.error('Error parseando configuración:', error);
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        // Solo se reemplaza el archivo si antes se pudo conservar una copia.
        if (!preservarConfiguracionCorrupta()) {
            return crearConfiguracionPorDefecto();
        }
        return guardarConfiguracionInicial(crearConfiguracionPorDefecto());
    }

    try {
        let configModificada = false;

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

        const decisionesNormalizadas = normalizarListaDecisionesOperativas(config.operationalDecisions);
        if (JSON.stringify(config.operationalDecisions || []) !== JSON.stringify(decisionesNormalizadas)) {
            config.operationalDecisions = decisionesNormalizadas;
            configModificada = true;
        }

        if (configModificada) {
            try {
                guardarConfiguracion(config);
            } catch (saveError) {
                console.error('Error persistiendo configuración migrada:', saveError);
            }
        }
        return config;
    } catch (error) {
        console.error('Error normalizando configuración:', error);
        return config;
    }
}

// Guardar configuración
function guardarConfiguracion(config) {
    escribirJsonAtomico(CONFIG_PATH, config);
}

function abrirUrlExternaPermitida(url) {
    if (!esUrlExternaPermitida(url)) {
        console.error(`Bloqueada navegación externa no permitida: ${url}`);
        return false;
    }

    shell.openExternal(url).catch((error) => {
        console.error(`Error abriendo URL externa permitida (${url}):`, error);
    });
    return true;
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
        console.error('Token sin cifrar detectado, se cifrará en el próximo guardado');
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

function esRutaPermitidaParaBackup(rutaArchivo) {
    if (!rutaArchivo || typeof rutaArchivo !== 'string') return false;
    const rutaAbsoluta = path.resolve(rutaArchivo.trim());
    if (rutaAbsoluta.startsWith(BACKUPS_PATH + path.sep) || rutaAbsoluta === BACKUPS_PATH) {
        return true;
    }
    if (rutasAprobadasPorDialogo.has(rutaAbsoluta)) {
        return true;
    }
    return false;
}

function registrarRutaAprobadaPorDialogo(ruta) {
    if (!ruta || typeof ruta !== 'string') return;
    const rutaAbsoluta = path.resolve(ruta.trim());
    rutasAprobadasPorDialogo.add(rutaAbsoluta);
    if (rutasAprobadasPorDialogo.size > RUTAS_APROBADAS_MAX) {
        const primera = rutasAprobadasPorDialogo.values().next().value;
        rutasAprobadasPorDialogo.delete(primera);
    }
}

const LIMITE_STRING_CAMPO = 2000;
const LIMITE_OBSERVACIONES = 5000;

function sanitizarArticuloInput(articulo) {
    if (!articulo || typeof articulo !== 'object') {
        return { valid: false, error: 'Datos de artículo inválidos' };
    }

    const camposString = ['rut', 'nombreCliente', 'telefono', 'tipoArticulo', 'descripcion', 'numeroBodega', 'metodoPagoInicial'];
    for (const campo of camposString) {
        if (articulo[campo] !== null && articulo[campo] !== undefined && typeof articulo[campo] !== 'string') {
            return { valid: false, error: `Campo "${campo}" debe ser texto` };
        }
        if (typeof articulo[campo] === 'string' && articulo[campo].length > LIMITE_STRING_CAMPO) {
            return { valid: false, error: `Campo "${campo}" excede el límite de ${LIMITE_STRING_CAMPO} caracteres` };
        }
    }

    if (typeof articulo.observaciones === 'string' && articulo.observaciones.length > LIMITE_OBSERVACIONES) {
        return { valid: false, error: `Observaciones exceden el límite de ${LIMITE_OBSERVACIONES} caracteres` };
    }
    if (typeof articulo.observacionesAbonoInicial === 'string' && articulo.observacionesAbonoInicial.length > LIMITE_OBSERVACIONES) {
        return { valid: false, error: `Observaciones del abono inicial exceden el límite de ${LIMITE_OBSERVACIONES} caracteres` };
    }

    return { valid: true };
}

async function subirBackupDBConTimeout(backupPath) {
    return await withTimeout(
        estado.dropboxManager.subirBackupDB(backupPath),
        DROPBOX_UPLOAD_TIMEOUT_MS,
        'Timeout subiendo backup a Dropbox'
    );
}

function obtenerRuntimeInfo() {
    return {
        success: true,
        dbMode: estado.dbService ? estado.dbService.getMode() : 'unavailable',
        dbWarning: estado.dbService ? estado.dbService.getWarning() : 'Base de datos no inicializada'
    };
}

function iniciarReintentoWorkerDb() {
    if (workerRetryTimer) {
        clearInterval(workerRetryTimer);
        workerRetryTimer = null;
    }
    workerRetryCount = 0;

    workerRetryTimer = setInterval(() => {
        if (!estado.dbService || estado.restauracionEnCurso) {
            return;
        }
        if (estado.dbService.getMode() === 'worker') {
            clearInterval(workerRetryTimer);
            workerRetryTimer = null;
            workerRetryCount = 0;
            return;
        }
        if (workerRetryCount >= DB_WORKER_MAX_RETRIES) {
            logDiag('db:worker_retry', { success: false, error: `Límite de reintentos alcanzado (${DB_WORKER_MAX_RETRIES}), permaneciendo en modo legacy` });
            clearInterval(workerRetryTimer);
            workerRetryTimer = null;
            return;
        }

        workerRetryCount += 1;
        void estado.dbService.tryPromoteToWorker()
            .then((resultado) => {
                if (resultado && resultado.success && resultado.changed) {
                    workerRetryCount = 0;
                    logDiag('db:worker_retry', { success: true, mode: estado.dbService.getMode() });
                }
            })
            .catch((error) => {
                logDiag('db:worker_retry', { success: false, error: error.message, intento: workerRetryCount });
            });
    }, DB_WORKER_RETRY_INTERVAL_MS);
}

function createWindow() {
    estado.mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        icon: path.join(__dirname, 'build/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'src/preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        },
        title: 'Napoli - Reparadora de Calzado'
    });

    // Para desarrollo: descomentar para ver DevTools
    // estado.mainWindow.webContents.openDevTools();

    estado.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        abrirUrlExternaPermitida(url);
        return { action: 'deny' };
    });

    estado.mainWindow.webContents.on('will-navigate', (event, url) => {
        if (esFileUrl(url)) {
            return;
        }

        event.preventDefault();
        abrirUrlExternaPermitida(url);
    });

    estado.mainWindow.loadFile('src/renderer/index.html');

    estado.mainWindow.on('closed', () => {
        estado.mainWindow = null;
    });
}

app.whenReady().then(async () => {
    estado.diagnostics = new DiagnosticsLogger({ userDataPath: USER_DATA_PATH, enabled: true });
    estado.diagnostics.init();
    estado.diagnostics.startEventLoopMonitor({ intervalMs: 250, thresholdMs: 120 });

    // Inicializar servicio de base de datos (worker con fallback legacy)
    try {
        estado.dbService = new DBService({ dbPath: DB_PATH, diagnostics: estado.diagnostics });
        const initResult = await estado.dbService.init();
        if (initResult.warning) {
            console.error(`DB init warning: ${initResult.warning}`);
        }
        iniciarReintentoWorkerDb();
    } catch (error) {
        console.error('❌ Error crítico inicializando servicio de base de datos:', error);
        app.quit();
        return;
    }

    // Inicializar Dropbox si está configurado
    const config = cargarConfiguracion();
    const credencialesOAuth = leerCredencialesDropboxOAuth(config);
    if (credencialesOAuth) {
        if (!safeStorage.isEncryptionAvailable()) {
            console.error(`Token Dropbox: ${WARNING_TOKEN_NO_CIFRADO}`);
            registrarDecisionOperativa({
                code: OP_DECISION_DROPBOX_TOKEN_SIN_CIFRADO,
                context: 'dropbox:auto_init',
                note: 'Refresh token de Dropbox cargado en equipo sin cifrado local disponible.'
            }, config);
        }
        estado.dropboxManager = new DropboxManager(credencialesOAuth);
    } else if (config.dropboxToken) {
        // Token antiguo (pegado desde la App Console): sigue funcionando hasta que expire.
        const token = descifrarToken(config.dropboxToken);
        if (token) {
            if (!safeStorage.isEncryptionAvailable()) {
                console.error(`Token Dropbox: ${WARNING_TOKEN_NO_CIFRADO}`);
                registrarDecisionOperativa({
                    code: OP_DECISION_DROPBOX_TOKEN_SIN_CIFRADO,
                    context: 'dropbox:auto_init',
                    note: 'Token Dropbox cargado en equipo sin cifrado local disponible.'
                }, config);
            }
            estado.dropboxManager = new DropboxManager(token);
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
                Promise.resolve()
                    .then(async () => {
                        if (workerRetryTimer) {
                            clearInterval(workerRetryTimer);
                            workerRetryTimer = null;
                        }
                        if (estado.diagnostics) {
                            estado.diagnostics.stopEventLoopMonitor();
                        }
                        if (estado.dbService) {
                            await estado.dbService.closeAll();
                            estado.dbService = null;
                        }
                    })
                    .catch((closeError) => {
                        console.error('Error cerrando servicio DB al salir:', closeError);
                    })
                    .finally(() => {
                        cierreForzadoTrasBackup = true;
                        app.quit();
                    });
            });
    }
});

// ============================================
// HANDLERS IPC - DIAGNÓSTICO / RUNTIME
// ============================================

ipcMain.handle('diag:event', async (_event, payload = {}) => {
    const safePayload = payload && typeof payload === 'object' ? payload : { value: payload };
    logDiag('renderer:event', safePayload);
    return { success: true };
});

ipcMain.handle('app:runtimeInfo', async () => {
    return obtenerRuntimeInfo();
});

// ============================================
// HANDLERS IPC - BASE DE DATOS
// ============================================

ipcMain.handle('db:insertar', async (_event, articulo) => {
    const bloqueo = respuestaBloqueoRestoreEscritura();
    if (bloqueo) return bloqueo;
    if (!estado.dbService) return { success: false, error: 'Base de datos no inicializada' };
    const validacion = sanitizarArticuloInput(articulo);
    if (!validacion.valid) return { success: false, error: validacion.error };
    try {
        return await medirOperacionDb('db:insertar', () => estado.dbService.insertar(articulo));
    } catch (error) {
        return payloadErrorOperacion(error);
    }
});

ipcMain.handle('db:obtenerTodos', async () => {
    const bloqueo = respuestaBloqueoRestoreEscritura();
    if (bloqueo) return bloqueo;
    if (!estado.dbService) return { success: false, error: 'Base de datos no inicializada' };
    try {
        return await medirOperacionDb('db:obtenerTodos', () => estado.dbService.obtenerTodos());
    } catch (error) {
        return payloadErrorOperacion(error);
    }
});

ipcMain.handle('db:obtenerPorId', async (_event, id) => {
    const bloqueo = respuestaBloqueoRestoreEscritura();
    if (bloqueo) return bloqueo;
    if (!estado.dbService) return { success: false, error: 'Base de datos no inicializada' };
    try {
        return await medirOperacionDb('db:obtenerPorId', () => estado.dbService.obtenerPorId(id));
    } catch (error) {
        return payloadErrorOperacion(error);
    }
});

ipcMain.handle('db:actualizarEstado', async (_event, id, nuevoEstado) => {
    const bloqueo = respuestaBloqueoRestoreEscritura();
    if (bloqueo) return bloqueo;
    if (!estado.dbService) return { success: false, error: 'Base de datos no inicializada' };
    try {
        return await medirOperacionDb('db:actualizarEstado', () => estado.dbService.actualizarEstado(id, nuevoEstado));
    } catch (error) {
        return payloadErrorOperacion(error);
    }
});

ipcMain.handle('db:eliminar', async (_event, id) => {
    const bloqueo = respuestaBloqueoRestoreEscritura();
    if (bloqueo) return bloqueo;
    if (!estado.dbService) return { success: false, error: 'Base de datos no inicializada' };
    try {
        return await medirOperacionDb('db:eliminar', () => estado.dbService.eliminar(id));
    } catch (error) {
        return payloadErrorOperacion(error);
    }
});

ipcMain.handle('db:buscar', async (_event, termino) => {
    const bloqueo = respuestaBloqueoRestoreEscritura();
    if (bloqueo) return bloqueo;
    if (!estado.dbService) return { success: false, error: 'Base de datos no inicializada' };
    try {
        return await medirOperacionDb('db:buscar', () => estado.dbService.buscar(termino));
    } catch (error) {
        return payloadErrorOperacion(error);
    }
});

ipcMain.handle('db:obtenerEstadisticas', async () => {
    const bloqueo = respuestaBloqueoRestoreEscritura();
    if (bloqueo) return bloqueo;
    if (!estado.dbService) return { success: false, error: 'Base de datos no inicializada' };
    try {
        return await medirOperacionDb('db:obtenerEstadisticas', () => estado.dbService.obtenerEstadisticas());
    } catch (error) {
        return payloadErrorOperacion(error);
    }
});

ipcMain.handle('db:migrarDesdeLocalStorage', async (_event, datosJSON) => {
    const bloqueo = respuestaBloqueoRestoreEscritura();
    if (bloqueo) return bloqueo;
    if (!estado.dbService) return { success: false, error: 'Base de datos no inicializada' };
    try {
        return await medirOperacionDb('db:migrarDesdeLocalStorage', () => estado.dbService.migrarDesdeLocalStorage(datosJSON));
    } catch (error) {
        return payloadErrorOperacion(error);
    }
});

// ============================================
// HANDLERS IPC - PAGOS Y ABONOS
// ============================================

ipcMain.handle('pago:registrarAbono', async (_event, articuloId, monto, metodoPago, observaciones) => {
    const bloqueo = respuestaBloqueoRestoreEscritura();
    if (bloqueo) return bloqueo;
    if (!estado.dbService) return { success: false, error: 'Base de datos no inicializada' };
    if (typeof metodoPago === 'string' && metodoPago.length > LIMITE_STRING_CAMPO) {
        return { success: false, error: `Método de pago excede el límite de ${LIMITE_STRING_CAMPO} caracteres` };
    }
    if (typeof observaciones === 'string' && observaciones.length > LIMITE_OBSERVACIONES) {
        return { success: false, error: `Observaciones exceden el límite de ${LIMITE_OBSERVACIONES} caracteres` };
    }
    try {
        return await medirOperacionDb('pago:registrarAbono', () =>
            estado.dbService.registrarAbono(articuloId, monto, metodoPago, observaciones)
        );
    } catch (error) {
        return payloadErrorOperacion(error);
    }
});

ipcMain.handle('pago:obtenerAbonos', async (_event, articuloId) => {
    const bloqueo = respuestaBloqueoRestoreEscritura();
    if (bloqueo) return bloqueo;
    if (!estado.dbService) return { success: false, error: 'Base de datos no inicializada' };
    try {
        return await medirOperacionDb('pago:obtenerAbonos', () => estado.dbService.obtenerAbonosArticulo(articuloId));
    } catch (error) {
        return payloadErrorOperacion(error);
    }
});

ipcMain.handle('pago:actualizarValor', async (_event, articuloId, nuevoValor) => {
    const bloqueo = respuestaBloqueoRestoreEscritura();
    if (bloqueo) return bloqueo;
    if (!estado.dbService) return { success: false, error: 'Base de datos no inicializada' };
    try {
        return await medirOperacionDb('pago:actualizarValor', () =>
            estado.dbService.actualizarValorTotal(articuloId, nuevoValor)
        );
    } catch (error) {
        return payloadErrorOperacion(error);
    }
});

// ============================================
// HANDLERS IPC - BACKUPS
// ============================================

ipcMain.handle('backup:crear', async () => {
    try {
        return await crearBackupManual();
    } catch (error) {
        return payloadErrorOperacion(error);
    }
});

ipcMain.handle('backup:exportarJSON', async () => {
    try {
        return await exportarJSON();
    } catch (error) {
        return payloadErrorOperacion(error);
    }
});

ipcMain.handle('backup:exportarExcel', async () => {
    try {
        return await exportarExcel();
    } catch (error) {
        return payloadErrorOperacion(error);
    }
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
        const targetWindow = estado.mainWindow && !estado.mainWindow.isDestroyed() ? estado.mainWindow : undefined;
        const result = await dialog.showOpenDialog(targetWindow, {
            title: 'Seleccionar backup de base de datos',
            defaultPath: BACKUPS_PATH,
            properties: ['openFile'],
            filters: [{ name: 'Base de datos SQLite', extensions: ['db'] }]
        });

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
            return { success: true, canceled: true };
        }

        registrarRutaAprobadaPorDialogo(result.filePaths[0]);
        return { success: true, canceled: false, path: result.filePaths[0] };
    } catch (error) {
        return { success: false, canceled: true, error: error.message };
    }
});

ipcMain.handle('backup:validarDB', async (_event, rutaArchivo) => {
    if (!esRutaPermitidaParaBackup(rutaArchivo)) {
        return { success: false, valid: false, error: 'Ruta no autorizada. Seleccione un archivo desde el selector de backups.' };
    }
    const resultado = validarBackupDBInterno(rutaArchivo);
    registrarEstadoBackups({ lastValidation: construirLogValidacion(resultado, 'manual') });
    return resultado;
});

ipcMain.handle('backup:restaurarDB', async (_event, rutaBackup) => {
    if (!esRutaPermitidaParaBackup(rutaBackup)) {
        return { success: false, restoredPath: null, rollbackUsed: false, error: 'Ruta no autorizada. Seleccione un archivo desde el selector de backups.' };
    }
    return await restaurarBackupDB(rutaBackup);
});

ipcMain.handle('backup:estado', async () => {
    try {
        return obtenerEstadoBackups();
    } catch (error) {
        return payloadErrorOperacion(error);
    }
});

async function crearBackupInterno({ prefijo = 'napoli_backup_', opLabel = 'backup:crear', estadoKey = 'lastAutomaticBackup', exigirDropbox = false, limpiar = false } = {}) {
    try {
        if (estado.restauracionEnCurso) {
            return { success: false, error: 'Restauración en curso. Intente nuevamente al terminar.' };
        }

        const timestamp = timestampIsoSeguro();
        const backupPath = path.join(BACKUPS_PATH, `${prefijo}${timestamp}.db`);

        if (!estado.dbService) {
            throw new Error('Base de datos no inicializada');
        }

        const backupDB = await medirOperacionDb(opLabel, () => estado.dbService.crearBackup(backupPath));
        if (!backupDB.success) {
            return backupDB;
        }

        // El backup local ya existe: limpiar y registrarlo pase lo que pase con Dropbox.
        if (limpiar) {
            limpiarBackupsAntiguos();
        }

        registrarEstadoBackups({
            [estadoKey]: {
                timestamp: new Date().toISOString(),
                path: backupPath
            }
        });

        // Subir a Dropbox si está configurado
        if (estado.dropboxManager && estado.dropboxManager.estaConfigurado()) {
            let subida;
            try {
                subida = await subirBackupDBConTimeout(backupPath);
            } catch (uploadError) {
                // Timeout u otro error lanzado: no debe convertir en fallo un backup local exitoso.
                subida = { success: false, error: uploadError.message };
            }

            registrarEstadoBackups({
                lastDropboxUpload: {
                    timestamp: new Date().toISOString(),
                    path: backupPath,
                    success: Boolean(subida && subida.success),
                    error: subida && !subida.success ? (subida.error || 'Error desconocido') : null
                }
            });

            if (!subida || !subida.success) {
                const mensaje = `Backup local creado, pero falló subida a Dropbox: ${(subida && subida.error) || 'Error desconocido'}`;
                if (exigirDropbox) {
                    return { success: false, path: backupPath, error: mensaje };
                }
                return { success: true, path: backupPath, warning: mensaje };
            }
        }

        return { success: true, path: backupPath };
    } catch (error) {
        console.error(`Error creando backup (${prefijo}):`, error);
        return payloadErrorOperacion(error);
    }
}

async function crearBackupAutomatico() {
    return crearBackupInterno({
        prefijo: 'napoli_backup_',
        opLabel: 'backup:crearAutomatico',
        estadoKey: 'lastAutomaticBackup',
        limpiar: true
    });
}

async function crearBackupManual(options = {}) {
    const { exigirDropbox = false } = options;
    return crearBackupInterno({
        prefijo: 'napoli_manual_',
        opLabel: 'backup:crearManual',
        estadoKey: 'lastManualBackup',
        exigirDropbox
    });
}

async function exportarJSON() {
    try {
        const bloqueo = respuestaBloqueoRestoreEscritura();
        if (bloqueo) return bloqueo;

        if (!estado.dbService) {
            throw new Error('Base de datos no inicializada');
        }

        const timestamp = timestampIsoSeguro();
        const jsonPath = path.join(BACKUPS_PATH, `napoli_export_${timestamp}.json`);

        const datos = await medirOperacionDb('backup:exportarJSON:obtenerTodos', () => estado.dbService.obtenerTodos());
        fs.writeFileSync(jsonPath, JSON.stringify(datos, null, 2));

        console.log('✅ JSON exportado:', jsonPath);

        // Subir a Dropbox si está configurado
        if (estado.dropboxManager && estado.dropboxManager.estaConfigurado()) {
            try {
                await estado.dropboxManager.subirBackupJSON(jsonPath);
            } catch (error) {
                console.error('JSON exportado localmente, pero falló subida a Dropbox:', error.message);
            }
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

        if (!estado.dbService) {
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
        const datos = await medirOperacionDb('backup:exportarExcel:obtenerTodos', () => estado.dbService.obtenerTodos());

        // Agregar filas
        datos.forEach((articulo, index) => {
            const row = index + 2;
            const fechaIngresoTexto = formatearFechaChileParaExport(articulo.fechaIngreso);
            const fechaEntregaTexto = formatearFechaChileParaExport(articulo.fechaEntrega);
            worksheet.cell(row, 1).number(toNumber(articulo.id)).style(centeredStyle);
            worksheet.cell(row, 2).string(toText(articulo.rut));
            worksheet.cell(row, 3).string(toText(articulo.nombreCliente)).style(wrappedStyle);
            worksheet.cell(row, 4).string(toText(articulo.telefono));
            worksheet.cell(row, 5).string(toText(articulo.tipoArticulo)).style(wrappedStyle);
            worksheet.cell(row, 6).string(toText(articulo.descripcion)).style(wrappedStyle);
            worksheet.cell(row, 7).string(toText(articulo.numeroBodega));
            worksheet.cell(row, 8).string(toText(fechaIngresoTexto));
            worksheet.cell(row, 9).string(toText(articulo.estado)).style(centeredStyle);
            worksheet.cell(row, 10).string(toText(fechaEntregaTexto));
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
        if (estado.dropboxManager && estado.dropboxManager.estaConfigurado()) {
            const subida = await estado.dropboxManager.subirArchivo(excelPath, `/NapoliReparadora/Exports/${path.basename(excelPath)}`);
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
        if (!estado.dropboxManager || !estado.dropboxManager.estaConfigurado()) {
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
                path.extname(archivo).toLowerCase() === '.db' &&
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

const APP_KEY_DROPBOX_REGEX = /^[a-z0-9]{8,32}$/i;
let autorizacionDropboxPendiente = null;

function leerCredencialesDropboxOAuth(config) {
    const auth = config && config.dropboxAuth;
    if (!auth || typeof auth !== 'object') return null;
    const appKey = typeof auth.appKey === 'string' ? auth.appKey.trim() : '';
    const refreshToken = descifrarToken(auth.refreshToken);
    if (!appKey || !refreshToken) return null;
    return { appKey, refreshToken };
}

// Paso 1: genera la URL de autorización (PKCE) y la abre en el navegador.
ipcMain.handle('dropbox:iniciarAutorizacion', async (_event, appKey) => {
    try {
        const appKeyLimpia = typeof appKey === 'string' ? appKey.trim() : '';
        if (!APP_KEY_DROPBOX_REGEX.test(appKeyLimpia)) {
            return { success: false, error: 'App key de Dropbox inválida (cópiela desde Settings de su app en la App Console)' };
        }

        autorizacionDropboxPendiente = await iniciarAutorizacionPKCE(appKeyLimpia);
        const abierta = abrirUrlExternaPermitida(autorizacionDropboxPendiente.url);
        return { success: true, url: autorizacionDropboxPendiente.url, abierta };
    } catch (error) {
        autorizacionDropboxPendiente = null;
        return payloadErrorOperacion(error);
    }
});

// Paso 2: canjea el código que muestra Dropbox por un refresh token y lo guarda cifrado.
ipcMain.handle('dropbox:completarAutorizacion', async (_event, codigo) => {
    try {
        const codigoLimpio = typeof codigo === 'string' ? codigo.trim() : '';
        if (!codigoLimpio || codigoLimpio.length > 512) {
            return { success: false, error: 'Código de autorización inválido' };
        }

        const credenciales = await completarAutorizacionPKCE(autorizacionDropboxPendiente, codigoLimpio);
        const candidato = new DropboxManager(credenciales);
        const verificacion = await candidato.verificarConexion();
        if (!verificacion.success) {
            return { success: false, error: verificacion.error };
        }

        autorizacionDropboxPendiente = null;
        estado.dropboxManager = candidato;

        const config = cargarConfiguracion();
        config.dropboxAuth = {
            appKey: credenciales.appKey,
            refreshToken: cifrarToken(credenciales.refreshToken)
        };
        delete config.dropboxToken;
        guardarConfiguracion(config);

        const warning = safeStorage.isEncryptionAvailable() ? null : WARNING_TOKEN_NO_CIFRADO;
        if (warning) {
            registrarDecisionOperativa({
                code: OP_DECISION_DROPBOX_TOKEN_SIN_CIFRADO,
                context: 'dropbox:completarAutorizacion',
                note: 'Refresh token de Dropbox guardado sin cifrado local por limitación del sistema.'
            }, config);
        }

        const response = {
            success: true,
            usuario: verificacion.usuario,
            warning,
            insecureStorage: Boolean(warning)
        };
        if (warning) {
            response.code = INSECURE_STORAGE_RESPONSE_CODE;
        }
        return response;
    } catch (error) {
        return payloadErrorOperacion(error);
    }
});

ipcMain.handle('dropbox:verificar', async () => {
    if (!estado.dropboxManager || !estado.dropboxManager.estaConfigurado()) {
        return { success: false, error: 'Dropbox no configurado' };
    }
    try {
        const resultado = await estado.dropboxManager.verificarConexion();
        // El token antiguo deja de funcionar al expirar: avisar que hay que reconectar con el flujo nuevo.
        return { ...resultado, tokenHeredado: Boolean(estado.dropboxManager.usaTokenHeredado) };
    } catch (error) {
        return payloadErrorOperacion(error);
    }
});

ipcMain.handle('dropbox:estaConfigurado', async () => {
    return estado.dropboxManager && estado.dropboxManager.estaConfigurado();
});

ipcMain.handle('dropbox:desconectar', async () => {
    try {
        estado.dropboxManager = null;
        autorizacionDropboxPendiente = null;
        const config = cargarConfiguracion();
        delete config.dropboxToken;
        delete config.dropboxAuth;
        guardarConfiguracion(config);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('dropbox:listarBackups', async () => {
    if (!estado.dropboxManager || !estado.dropboxManager.estaConfigurado()) {
        return { success: false, error: 'Dropbox no configurado' };
    }
    try {
        return await estado.dropboxManager.listarBackups();
    } catch (error) {
        return payloadErrorOperacion(error);
    }
});

ipcMain.handle('dropbox:subirBackupAhora', async () => {
    try {
        return await subirBackupDropboxInmediato();
    } catch (error) {
        return payloadErrorOperacion(error);
    }
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

ipcMain.handle('config:guardar', async (_event, nuevaConfig) => {
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

ipcMain.handle('imprimir', async (_event, opciones = {}) => {
    if (!estado.mainWindow) {
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
            estado.mainWindow.webContents.print(
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
