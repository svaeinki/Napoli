// Handler IPC de impresión del ticket (imprimir).
const { ipcMain } = require('electron');
const estado = require('../estado');
const { cargarConfiguracion, sanitizarConfigImpresora } = require('../configuracion');

function registrar() {
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
}

module.exports = {
    registrar
};
