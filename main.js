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

let workerRetryTimer = null;
let workerRetryCount = 0;

const BACKUP_CLOSE_TIMEOUT_MS = 15000;
const DB_WORKER_RETRY_INTERVAL_MS = 30000;
const DB_WORKER_MAX_RETRIES = 10;

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

// ============================================
// HANDLERS IPC - DROPBOX
// ============================================

const APP_KEY_DROPBOX_REGEX = /^[a-z0-9]{8,32}$/i;
let autorizacionDropboxPendiente = null;

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
