// Handlers IPC de diagnóstico y runtime: diag:event, app:runtimeInfo.
const { ipcMain } = require('electron');
const estado = require('../estado');
const { logDiag } = require('../utilidades');

function obtenerRuntimeInfo() {
    return {
        success: true,
        dbMode: estado.dbService ? estado.dbService.getMode() : 'unavailable',
        dbWarning: estado.dbService ? estado.dbService.getWarning() : 'Base de datos no inicializada'
    };
}

function registrar() {
    ipcMain.handle('diag:event', async (_event, payload = {}) => {
        const safePayload = payload && typeof payload === 'object' ? payload : { value: payload };
        logDiag('renderer:event', safePayload);
        return { success: true };
    });

    ipcMain.handle('app:runtimeInfo', async () => {
        return obtenerRuntimeInfo();
    });
}

module.exports = {
    registrar
};
