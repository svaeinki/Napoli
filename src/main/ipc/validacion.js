// Validación de entrada de los handlers IPC (límites de largo de texto).

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

module.exports = {
    LIMITE_STRING_CAMPO,
    LIMITE_OBSERVACIONES,
    sanitizarArticuloInput
};
