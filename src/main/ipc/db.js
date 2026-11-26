// Handlers IPC de artículos (db:*): insertar, listar, buscar, cambiar estado, eliminar,
// estadísticas y migración desde localStorage.
const { ipcMain } = require('electron');
const estado = require('../estado');
const { respuestaBloqueoRestoreEscritura, medirOperacionDb, payloadErrorOperacion } = require('../utilidades');
const { sanitizarArticuloInput } = require('./validacion');

function registrar() {
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
}

module.exports = {
    registrar
};
