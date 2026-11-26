// Handlers IPC de configuración (config:obtener, config:guardar).
const { ipcMain } = require('electron');
const { cargarConfiguracion, guardarConfiguracion, sanitizarConfigImpresora } = require('../configuracion');

function registrar() {
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
}

module.exports = {
    registrar
};
