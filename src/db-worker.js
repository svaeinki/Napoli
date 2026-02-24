const { parentPort, workerData } = require('worker_threads');
const DatabaseManager = require('./database');

let db = null;

function ensureDb() {
    if (!db) {
        throw new Error('Base de datos no inicializada en worker');
    }
}

function initDb() {
    db = new DatabaseManager(workerData.dbPath);
}

async function handleOperation(op, args = []) {
    switch (op) {
    case 'insertar':
        ensureDb();
        return db.insertar(args[0]);
    case 'obtenerTodos':
        ensureDb();
        return db.obtenerTodos();
    case 'obtenerPorId':
        ensureDb();
        return db.obtenerPorId(args[0]);
    case 'actualizarEstado':
        ensureDb();
        return db.actualizarEstado(args[0], args[1]);
    case 'eliminar':
        ensureDb();
        return db.eliminar(args[0]);
    case 'buscar':
        ensureDb();
        return db.buscar(args[0]);
    case 'obtenerEstadisticas':
        ensureDb();
        return db.obtenerEstadisticas();
    case 'migrarDesdeLocalStorage':
        ensureDb();
        return db.migrarDesdeLocalStorage(args[0]);
    case 'registrarAbono':
        ensureDb();
        return db.registrarAbono(args[0], args[1], args[2], args[3]);
    case 'obtenerAbonosArticulo':
        ensureDb();
        return db.obtenerAbonosArticulo(args[0]);
    case 'actualizarValorTotal':
        ensureDb();
        return db.actualizarValorTotal(args[0], args[1]);
    case 'crearBackup':
        ensureDb();
        return await db.crearBackup(args[0]);
    case 'cerrar':
        if (db) {
            db.cerrar();
            db = null;
        }
        return { success: true };
    case 'reabrir':
        if (db) {
            db.cerrar();
            db = null;
        }
        initDb();
        return { success: true };
    default:
        throw new Error(`Operación DB no soportada: ${op}`);
    }
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
