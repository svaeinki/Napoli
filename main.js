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
const {
    PRINTER_CONFIG_DEFAULTS,
    cargarConfiguracion,
    guardarConfiguracion,
    registrarDecisionOperativa,
    sanitizarConfigImpresora,
    cifrarToken,
    descifrarToken
} = require('./src/main/configuracion');
const {
    WARNING_TOKEN_NO_CIFRADO,
    INSECURE_STORAGE_RESPONSE_CODE,
    OP_DECISION_DROPBOX_TOKEN_SIN_CIFRADO,
    inicializarDropboxDesdeConfiguracion,
    subirBackupDBConTimeout
} = require('./src/main/dropbox-sesion');
const { abrirUrlExternaPermitida, createWindow } = require('./src/main/ventana');
const {
    registrarEstadoBackups,
    obtenerEstadoBackups,
    esRutaPermitidaParaBackup,
    registrarRutaAprobadaPorDialogo,
    crearBackupAutomatico,
    crearBackupManual,
    subirBackupDropboxInmediato
} = require('./src/main/respaldos');
const { validarBackupDBInterno, construirLogValidacion, restaurarBackupDB } = require('./src/main/restauracion');
const { exportarJSON, exportarExcel } = require('./src/main/exportaciones');
const { registrarHandlersIpc } = require('./src/main/ipc');

let workerRetryTimer = null;
let workerRetryCount = 0;

const BACKUP_CLOSE_TIMEOUT_MS = 15000;
const DB_WORKER_RETRY_INTERVAL_MS = 30000;
const DB_WORKER_MAX_RETRIES = 10;

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
    inicializarDropboxDesdeConfiguracion();

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

registrarHandlersIpc();

console.log('✅ Napoli - Reparadora de Calzado iniciada');
console.log('📂 Base de datos:', DB_PATH);
console.log('💾 Backups:', BACKUPS_PATH);
