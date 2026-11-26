// Handlers IPC de pagos y abonos (pago:*).
const { ipcMain } = require('electron');
const estado = require('../estado');
const { respuestaBloqueoRestoreEscritura, medirOperacionDb, payloadErrorOperacion } = require('../utilidades');
const { LIMITE_STRING_CAMPO, LIMITE_OBSERVACIONES } = require('./validacion');

function registrar() {
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
}

module.exports = {
    registrar
};
