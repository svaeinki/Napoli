// Handlers IPC de Dropbox (dropbox:*): autorización OAuth PKCE en dos pasos, verificar,
// desconectar, listar backups remotos y subir un backup ahora.
const { ipcMain, safeStorage } = require('electron');
const DropboxManager = require('../dropbox');
const { iniciarAutorizacionPKCE, completarAutorizacionPKCE } = DropboxManager;
const estado = require('../estado');
const {
    cargarConfiguracion,
    guardarConfiguracion,
    cifrarToken,
    registrarDecisionOperativa
} = require('../configuracion');
const {
    WARNING_TOKEN_NO_CIFRADO,
    INSECURE_STORAGE_RESPONSE_CODE,
    OP_DECISION_DROPBOX_TOKEN_SIN_CIFRADO
} = require('../dropbox-sesion');
const { abrirUrlExternaPermitida } = require('../ventana');
const { payloadErrorOperacion } = require('../utilidades');
const { subirBackupDropboxInmediato } = require('../respaldos');

const APP_KEY_DROPBOX_REGEX = /^[a-z0-9]{8,32}$/i;
let autorizacionDropboxPendiente = null;

function registrar() {
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
}

module.exports = {
    registrar
};
