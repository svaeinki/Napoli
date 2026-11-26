// Validación y restauración de backups .db: integrity_check y tablas requeridas,
// snapshot previo, reemplazo atómico de la base activa, smoke check y rollback automático.
const BetterSqlite = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const estado = require('./estado');
const { DB_PATH, BACKUPS_PATH } = require('./rutas');
const { timestampIsoSeguro, medirOperacionDb, eliminarArchivoParcial } = require('./utilidades');
const { registrarEstadoBackups } = require('./respaldos');
const {
    limpiarSidecarsSQLite,
    replaceFileAtomically,
    stageRestoreFile
} = require('./sqlite-restore-utils');

const REQUIRED_BACKUP_TABLES = ['articulos', 'abonos', 'auditoria'];

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

module.exports = {
    REQUIRED_BACKUP_TABLES,
    validarBackupDBInterno,
    ejecutarSmokeCheckDB,
    construirLogValidacion,
    restaurarBackupDB
};
