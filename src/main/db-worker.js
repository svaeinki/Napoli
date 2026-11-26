const { parentPort, workerData } = require('worker_threads');
const DatabaseManager = require('./database');

let db = null;

const ALLOWED_DB_OPS = new Set([
    'insertar',
    'obtenerTodos',
    'obtenerPorId',
    'actualizarEstado',
    'eliminar',
    'buscar',
    'obtenerEstadisticas',
    'migrarDesdeLocalStorage',
    'registrarAbono',
    'obtenerAbonosArticulo',
    'actualizarValorTotal',
    'crearBackup'
]);

function ensureDb() {
    if (!db) {
        throw new Error('Base de datos no inicializada en worker');
    }
}

function initDb() {
    db = new DatabaseManager(workerData.dbPath);
}

async function handleOperation(op, args = []) {
    if (op === 'cerrar') {
        if (db) {
            db.cerrar();
            db = null;
        }
        return { success: true };
    }
    if (op === 'reabrir') {
        if (db) {
            db.cerrar();
            db = null;
        }
        initDb();
        return { success: true };
    }
    if (!ALLOWED_DB_OPS.has(op)) {
        throw new Error(`Operación DB no soportada: ${op}`);
    }
    ensureDb();
    if (typeof db[op] !== 'function') {
        throw new Error(`Operación DB no implementada: ${op}`);
    }
    return await db[op](...args);
}

function postMessage(message) {
    if (parentPort) {
        parentPort.postMessage(message);
    }
}

async function onMessage(message) {
    if (!message || message.type !== 'request') {
        return;
    }

    const { id, op, args } = message;
    try {
        const result = await handleOperation(op, args);
        postMessage({ type: 'response', id, ok: true, result });
    } catch (error) {
        postMessage({
            type: 'response',
            id,
            ok: false,
            error: error && error.message ? error.message : String(error)
        });
    }
}

try {
    initDb();
    postMessage({ type: 'ready' });
} catch (error) {
    postMessage({
        type: 'fatal',
        error: error && error.message ? error.message : String(error)
    });
    process.exit(1);
}

if (parentPort) {
    parentPort.on('message', async (message) => {
        try {
            await onMessage(message);
        } catch (error) {
            parentPort.postMessage({
                type: 'fatal',
                error: error && error.message ? error.message : String(error)
            });
        }
    });
}
