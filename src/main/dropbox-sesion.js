// Sesión de Dropbox del proceso principal: conexión al arrancar con las credenciales
// guardadas (OAuth con refresh token o token antiguo) y subida de backups con timeout.
const { safeStorage } = require('electron');
const DropboxManager = require('./dropbox');
const estado = require('./estado');
const { cargarConfiguracion, descifrarToken, registrarDecisionOperativa } = require('./configuracion');
const { withTimeout } = require('./utilidades');

const DROPBOX_UPLOAD_TIMEOUT_MS = 12000;
const WARNING_TOKEN_NO_CIFRADO = 'Tu sistema no permite cifrado local del token de Dropbox; se guardará sin cifrar en este equipo.';
const INSECURE_STORAGE_RESPONSE_CODE = 'INSECURE_STORAGE';
const OP_DECISION_DROPBOX_TOKEN_SIN_CIFRADO = 'DROPBOX_TOKEN_SIN_CIFRADO';

function leerCredencialesDropboxOAuth(config) {
    const auth = config && config.dropboxAuth;
    if (!auth || typeof auth !== 'object') return null;
    const appKey = typeof auth.appKey === 'string' ? auth.appKey.trim() : '';
    const refreshToken = descifrarToken(auth.refreshToken);
    if (!appKey || !refreshToken) return null;
    return { appKey, refreshToken };
}

// Conecta Dropbox al arrancar si hay credenciales guardadas en config.json.
function inicializarDropboxDesdeConfiguracion() {
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
}

async function subirBackupDBConTimeout(backupPath) {
    return await withTimeout(
        estado.dropboxManager.subirBackupDB(backupPath),
        DROPBOX_UPLOAD_TIMEOUT_MS,
        'Timeout subiendo backup a Dropbox'
    );
}

module.exports = {
    WARNING_TOKEN_NO_CIFRADO,
    INSECURE_STORAGE_RESPONSE_CODE,
    OP_DECISION_DROPBOX_TOKEN_SIN_CIFRADO,
    leerCredencialesDropboxOAuth,
    inicializarDropboxDesdeConfiguracion,
    subirBackupDBConTimeout
};
