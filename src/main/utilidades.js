// Utilidades compartidas del proceso principal: diagnóstico, medición de operaciones DB,
// bloqueo durante restauración, formato de errores IPC, timeouts y escritura atómica.
const fs = require('fs');
const estado = require('./estado');
const { createUniqueTimestampGenerator } = require('./backup-filename');

const RESTORE_BUSY_MESSAGE = 'Restauración en curso. Intente nuevamente al terminar.';
const generarTimestampUnico = createUniqueTimestampGenerator();

function logDiag(type, payload = {}) {
    if (estado.diagnostics && typeof estado.diagnostics.log === 'function') {
        estado.diagnostics.log(type, payload);
    }
}

async function medirOperacionDb(op, fn) {
    const startedAt = Date.now();
    let ok = false;
    try {
        const result = await fn();
        ok = true;
        return result;
    } finally {
        const durationMs = Date.now() - startedAt;
        logDiag('db:operation', {
            op,
            ok,
            durationMs,
            mode: estado.dbService ? estado.dbService.getMode() : 'unavailable'
        });
    }
}

function timestampIsoSeguro() {
    return generarTimestampUnico();
}

function escribirJsonAtomico(ruta, datos) {
    // Escribir a un temporal y renombrar: un corte a mitad de escritura no deja el archivo corrupto.
    const temporal = `${ruta}.${process.pid}.tmp`;
    fs.writeFileSync(temporal, JSON.stringify(datos, null, 2));
    try {
        fs.renameSync(temporal, ruta);
    } catch (error) {
        try {
            fs.unlinkSync(temporal);
        } catch (_) {
            // noop: conservar error original.
        }
        throw error;
    }
}

function eliminarArchivoParcial(rutaArchivo) {
    try {
        if (fs.existsSync(rutaArchivo)) {
            fs.unlinkSync(rutaArchivo);
        }
    } catch (error) {
        console.error(`No se pudo eliminar archivo parcial ${rutaArchivo}:`, error);
    }
}

function operacionBloqueadaPorRestore() {
    return estado.restauracionEnCurso;
}

function respuestaBloqueoRestoreEscritura() {
    if (!operacionBloqueadaPorRestore()) {
        return null;
    }
    return { success: false, error: RESTORE_BUSY_MESSAGE, code: 'RESTORE_BUSY' };
}

function payloadErrorOperacion(error) {
    const mensaje = error && error.message ? error.message : 'Error desconocido';
    const payload = { success: false, error: mensaje };
    if (error && error.code) {
        payload.code = error.code;
    }
    return payload;
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        clearTimeout(timeoutId);
    });
}

module.exports = {
    logDiag,
    medirOperacionDb,
    timestampIsoSeguro,
    escribirJsonAtomico,
    eliminarArchivoParcial,
    respuestaBloqueoRestoreEscritura,
    payloadErrorOperacion,
    withTimeout
};
