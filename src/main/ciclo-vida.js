// Ciclo de vida de la app: al estar lista inicia diagnóstico, base de datos (con reintento
// periódico del worker), Dropbox, la ventana y el backup cada 24 h; al cerrar hace un
// último backup y cierra la base antes de salir.
const { app, BrowserWindow } = require('electron');
const DBService = require('./db-service');
const { DiagnosticsLogger } = require('./diagnostics');
const estado = require('./estado');
const { USER_DATA_PATH, DB_PATH } = require('./rutas');
const { logDiag, withTimeout } = require('./utilidades');
const { inicializarDropboxDesdeConfiguracion } = require('./dropbox-sesion');
const { createWindow } = require('./ventana');
const { crearBackupAutomatico } = require('./respaldos');

const BACKUP_CLOSE_TIMEOUT_MS = 15000;
const DB_WORKER_RETRY_INTERVAL_MS = 30000;
const DB_WORKER_MAX_RETRIES = 10;

let workerRetryTimer = null;
let workerRetryCount = 0;

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

let backupAlCerrarRealizado = false;
let cierreForzadoTrasBackup = false;

// Registra los eventos de la app: whenReady, window-all-closed y before-quit.
function registrarCicloDeVida() {
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
}

module.exports = {
    registrarCicloDeVida
};
