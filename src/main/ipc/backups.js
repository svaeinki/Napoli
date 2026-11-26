// Handlers IPC de backups (backup:*): crear, exportar, abrir carpeta, seleccionar,
// validar y restaurar un .db, y estado de backups.
const { ipcMain, shell, dialog } = require('electron');
const estado = require('../estado');
const { BACKUPS_PATH } = require('../rutas');
const { payloadErrorOperacion } = require('../utilidades');
const {
    registrarEstadoBackups,
    obtenerEstadoBackups,
    esRutaPermitidaParaBackup,
    registrarRutaAprobadaPorDialogo,
    crearBackupManual
} = require('../respaldos');
const { validarBackupDBInterno, construirLogValidacion, restaurarBackupDB } = require('../restauracion');
const { exportarJSON, exportarExcel } = require('../exportaciones');

function registrar() {
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
}

module.exports = {
    registrar
};
