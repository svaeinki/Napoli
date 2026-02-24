const path = require('path');
const { Worker } = require('worker_threads');
const DatabaseManager = require('./database');

const DEFAULT_TIMEOUT_MS = 15000;
const DB_OP_UNCERTAIN_CODE = 'DB_OP_UNCERTAIN';
const MUTATING_OPS = new Set([
    'insertar',
    'actualizarEstado',
    'eliminar',
    'migrarDesdeLocalStorage',
    'registrarAbono',
    'actualizarValorTotal',
    'crearBackup'
]);

class DBService {
    constructor({ dbPath, diagnostics } = {}) {
        this.dbPath = dbPath;
        this.diagnostics = diagnostics || null;
        this.mode = 'worker';
        this.warning = null;
        this.legacyDb = null;
        this.worker = null;
        this.workerReady = false;
        this.workerStartInFlight = null;
        this.workerRequestId = 1;
        this.pending = new Map();
        this.workerPath = path.join(__dirname, 'db-worker.js');
        this.workerCrashCount = 0;
        this.expectedWorkerExit = false;
        this.modeTransitionQueue = Promise.resolve();
    }

    getMode() {
        return this.mode;
    }

    getWarning() {
        return this.warning;
    }

    async init() {
        try {
            await this.startWorker();
            this.mode = 'worker';
            this.warning = null;
            this.log('db:mode', { mode: 'worker', reason: 'startup' });
            return { success: true, mode: this.mode, warning: null };
        } catch (error) {
            await this.activateLegacy(`No se pudo iniciar worker DB: ${error.message}`);
            return { success: true, mode: this.mode, warning: this.warning };
        }
    }

    log(type, payload = {}) {
        if (this.diagnostics && typeof this.diagnostics.log === 'function') {
            this.diagnostics.log(type, payload);
        }
    }

    isMutatingOperation(op) {
        return MUTATING_OPS.has(op);
    }

    runModeTransition(task) {
        const run = this.modeTransitionQueue.then(task, task);
        this.modeTransitionQueue = run.then(() => undefined, () => undefined);
        return run;
    }

    settlePendingWithError(errorMessage) {
        for (const [, pending] of this.pending) {
            clearTimeout(pending.timeoutId);
            pending.reject(new Error(errorMessage));
        }
        this.pending.clear();
    }

    async terminateWorker(reason = 'unknown') {
        if (!this.worker) {
            this.expectedWorkerExit = false;
            return;
        }

        this.expectedWorkerExit = true;
        this.log('db:worker_expected_exit', { reason });
        this.settlePendingWithError(`Worker DB cerrado (${reason})`);

        try {
            await this.worker.terminate();
        } catch (error) {
            this.log('db:worker_terminate_error', { reason, error: error.message });
        } finally {
            this.worker = null;
            this.workerReady = false;
        }
    }

    attachWorkerListeners(worker) {
        worker.on('message', (message) => {
            if (!message || typeof message !== 'object') {
                return;
            }

            if (message.type === 'response') {
                const pending = this.pending.get(message.id);
                if (!pending) return;
                this.pending.delete(message.id);
                clearTimeout(pending.timeoutId);
                if (message.ok) {
                    pending.resolve(message.result);
                } else {
                    pending.reject(new Error(message.error || 'Error desconocido en worker DB'));
                }
                return;
            }

            if (message.type === 'fatal') {
                this.log('db:worker_fatal', { error: message.error || 'error fatal' });
            }
        });

        worker.on('error', (error) => {
            this.log('db:worker_error', { error: error.message });
        });

        worker.on('exit', (code) => {
            const wasReady = this.workerReady;
            const hadWorker = this.worker === worker;
            const expectedExit = this.expectedWorkerExit;

            if (hadWorker) {
                this.worker = null;
                this.workerReady = false;
            }

            if (expectedExit) {
                this.expectedWorkerExit = false;
                this.log('db:worker_expected_exit_done', { code });
                return;
            }

            if (wasReady && code !== 0) {
                this.workerCrashCount += 1;
                this.settlePendingWithError(`Worker DB terminó con código ${code}`);
                void this.activateLegacy(`Worker DB finalizó inesperadamente (code ${code})`);
            }
        });
    }

    async startWorker() {
        if (this.workerReady && this.worker) {
            return;
        }
        if (this.workerStartInFlight) {
            return this.workerStartInFlight;
        }

        this.workerStartInFlight = new Promise((resolve, reject) => {
            this.expectedWorkerExit = false;
            const worker = new Worker(this.workerPath, {
                workerData: { dbPath: this.dbPath }
            });
            this.attachWorkerListeners(worker);

            const startupTimeout = setTimeout(() => {
                reject(new Error('Timeout inicializando worker DB'));
                try {
                    this.expectedWorkerExit = true;
                    worker.terminate();
                } catch (error) {
                    // noop
                }
            }, 10000);

            let settled = false;
            const cleanupStartupListeners = () => {
                worker.off('message', onMessage);
                worker.off('error', onError);
                worker.off('exit', onExit);
            };
            const settle = (handler) => {
                if (settled) return;
                settled = true;
                clearTimeout(startupTimeout);
                cleanupStartupListeners();
                handler();
            };

            const onMessage = (message) => {
                if (!message || typeof message !== 'object') return;
                if (message.type === 'ready') {
                    settle(() => {
                        this.worker = worker;
                        this.workerReady = true;
                        resolve();
                    });
                }
                if (message.type === 'fatal') {
                    settle(() => {
                        reject(new Error(message.error || 'Fallo fatal iniciando worker DB'));
                    });
                }
            };
            const onError = (error) => {
                settle(() => reject(error));
            };
            const onExit = (code) => {
                if (!this.workerReady) {
                    settle(() => reject(new Error(`Worker DB finalizó antes de iniciar (code ${code})`)));
                }
            };

            worker.on('message', onMessage);
            worker.on('error', onError);
            worker.on('exit', onExit);
        }).finally(() => {
            this.workerStartInFlight = null;
        });

        return this.workerStartInFlight;
    }

    async activateLegacy(reason) {
        return this.runModeTransition(async () => this.activateLegacyUnsafe(reason));
    }

    async activateLegacyUnsafe(reason) {
        const warningReason = reason || 'Modo compatibilidad activo (rendimiento reducido).';
        this.log('db:mode_transition_start', {
            from: this.mode,
            to: 'legacy',
            reason: warningReason
        });

        if (this.workerStartInFlight) {
            try {
                await this.workerStartInFlight;
            } catch (error) {
                // noop
            }
        }

        await this.terminateWorker('activate_legacy');

        if (!this.legacyDb) {
            this.legacyDb = new DatabaseManager(this.dbPath);
        }

        this.mode = 'legacy';
        this.warning = warningReason;
        this.log('db:mode', { mode: 'legacy', reason: this.warning });
        this.log('db:mode_transition_end', {
            from: 'worker',
            to: 'legacy',
            reason: warningReason
        });
    }

    async tryPromoteToWorker() {
        return this.runModeTransition(async () => {
            if (this.mode === 'worker' && this.workerReady) {
                return { success: true, changed: false, mode: this.mode };
            }

            this.log('db:mode_transition_start', {
                from: this.mode,
                to: 'worker',
                reason: 'retry'
            });

            try {
                await this.startWorker();
                if (this.legacyDb) {
                    this.legacyDb.cerrar();
                    this.legacyDb = null;
                }
                this.mode = 'worker';
                this.warning = null;
                this.log('db:mode', { mode: 'worker', reason: 'retry_success' });
                this.log('db:mode_transition_end', {
                    from: 'legacy',
                    to: 'worker',
                    reason: 'retry_success'
                });
                return { success: true, changed: true, mode: this.mode };
            } catch (error) {
                await this.activateLegacyUnsafe(`No se pudo promover a worker DB: ${error.message}`);
                return { success: false, changed: false, mode: this.mode, error: error.message };
            }
        });
    }

    callWorker(op, args = [], timeoutMs = DEFAULT_TIMEOUT_MS) {
        return new Promise((resolve, reject) => {
            if (!this.worker || !this.workerReady) {
                const error = new Error('Worker DB no disponible');
                error.code = 'DB_WORKER_UNAVAILABLE';
                reject(error);
                return;
            }

            const id = this.workerRequestId++;
            const timeoutId = setTimeout(() => {
                this.pending.delete(id);
                const timeoutError = new Error(`Timeout ejecutando operación DB: ${op}`);
                timeoutError.code = 'DB_WORKER_TIMEOUT';
                timeoutError.op = op;
                reject(timeoutError);
            }, Math.max(1000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));

            this.pending.set(id, { resolve, reject, timeoutId });
            this.worker.postMessage({ type: 'request', id, op, args });
        });
    }

    callLegacy(op, args = []) {
        if (!this.legacyDb) {
            throw new Error('Base de datos legacy no inicializada');
        }
        switch (op) {
        case 'insertar':
            return this.legacyDb.insertar(args[0]);
        case 'obtenerTodos':
            return this.legacyDb.obtenerTodos();
        case 'obtenerPorId':
            return this.legacyDb.obtenerPorId(args[0]);
        case 'actualizarEstado':
            return this.legacyDb.actualizarEstado(args[0], args[1]);
        case 'eliminar':
            return this.legacyDb.eliminar(args[0]);
        case 'buscar':
            return this.legacyDb.buscar(args[0]);
        case 'obtenerEstadisticas':
            return this.legacyDb.obtenerEstadisticas();
        case 'migrarDesdeLocalStorage':
            return this.legacyDb.migrarDesdeLocalStorage(args[0]);
        case 'registrarAbono':
            return this.legacyDb.registrarAbono(args[0], args[1], args[2], args[3]);
        case 'obtenerAbonosArticulo':
            return this.legacyDb.obtenerAbonosArticulo(args[0]);
        case 'actualizarValorTotal':
            return this.legacyDb.actualizarValorTotal(args[0], args[1]);
        case 'crearBackup':
            return this.legacyDb.crearBackup(args[0]);
        case 'cerrar':
            if (this.legacyDb) {
                this.legacyDb.cerrar();
                this.legacyDb = null;
            }
            return { success: true };
        case 'reabrir':
            if (this.legacyDb) {
                this.legacyDb.cerrar();
            }
            this.legacyDb = new DatabaseManager(this.dbPath);
            return { success: true };
        default:
            throw new Error(`Operación DB no soportada en legacy: ${op}`);
        }
    }

    async call(op, args = [], options = {}) {
        const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
        if (this.mode === 'worker') {
            try {
                return await this.callWorker(op, args, timeoutMs);
            } catch (error) {
                await this.activateLegacy(`Fallo worker DB en ${op}: ${error.message}`);

                if (this.isMutatingOperation(op)) {
                    const uncertainError = new Error(`Operación DB incierta: ${op}`);
                    uncertainError.code = DB_OP_UNCERTAIN_CODE;
                    uncertainError.op = op;
                    uncertainError.cause = error;
                    this.log('db:op_uncertain', {
                        op,
                        error: error.message,
                        fallbackMode: this.mode
                    });
                    throw uncertainError;
                }

                return this.callLegacy(op, args);
            }
        }

        return this.callLegacy(op, args);
    }

    async closeForRestore() {
        return this.runModeTransition(async () => {
            if (this.mode === 'worker') {
                try {
                    await this.callWorker('cerrar', [], 5000);
                } catch (error) {
                    // Ignore, terminate igualmente.
                }
                await this.terminateWorker('restore_close');
                return;
            }

            if (this.legacyDb) {
                this.legacyDb.cerrar();
                this.legacyDb = null;
            }
        });
    }

    async reopenAfterRestore() {
        return this.runModeTransition(async () => {
            if (this.mode === 'worker') {
                try {
                    await this.startWorker();
                } catch (error) {
                    await this.activateLegacyUnsafe(`No se pudo reabrir worker DB tras restore: ${error.message}`);
                }
                return;
            }

            this.legacyDb = new DatabaseManager(this.dbPath);
        });
    }

    async closeAll() {
        return this.runModeTransition(async () => {
            this.settlePendingWithError('DB service cerrándose');
            if (this.worker) {
                try {
                    await this.callWorker('cerrar', [], 2000);
                } catch (error) {
                    // noop
                }
                await this.terminateWorker('close_all');
            }

            if (this.legacyDb) {
                this.legacyDb.cerrar();
                this.legacyDb = null;
            }
        });
    }

    // Wrappers públicos
    insertar(articulo) { return this.call('insertar', [articulo]); }
    obtenerTodos() { return this.call('obtenerTodos'); }
    obtenerPorId(id) { return this.call('obtenerPorId', [id]); }
    actualizarEstado(id, nuevoEstado) { return this.call('actualizarEstado', [id, nuevoEstado]); }
    eliminar(id) { return this.call('eliminar', [id]); }
    buscar(termino) { return this.call('buscar', [termino]); }
    obtenerEstadisticas() { return this.call('obtenerEstadisticas'); }
    migrarDesdeLocalStorage(datosJson) { return this.call('migrarDesdeLocalStorage', [datosJson]); }
    registrarAbono(articuloId, monto, metodoPago, observaciones) {
        return this.call('registrarAbono', [articuloId, monto, metodoPago, observaciones]);
    }
    obtenerAbonosArticulo(articuloId) { return this.call('obtenerAbonosArticulo', [articuloId]); }
    actualizarValorTotal(articuloId, nuevoValor) {
        return this.call('actualizarValorTotal', [articuloId, nuevoValor]);
    }
    crearBackup(rutaDestino) { return this.call('crearBackup', [rutaDestino], { timeoutMs: 30000 }); }
}

DBService.DB_OP_UNCERTAIN_CODE = DB_OP_UNCERTAIN_CODE;

module.exports = DBService;
