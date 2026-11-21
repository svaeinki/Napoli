// Carga main.js en un sandbox (vm) con electron, better-sqlite3, DBService y Dropbox simulados,
// para probar handlers IPC y lógica del proceso principal sin levantar Electron.
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..', '..');
const MAIN_PATH = path.join(ROOT, 'main.js');

class FakeDBService {
    constructor() {
        this.calls = [];
        this.mode = 'worker';
        this.crearBackupImpl = async (ruta) => {
            fs.writeFileSync(ruta, 'backup-completo');
            return { success: true, path: ruta };
        };
    }
    async init() { return { success: true, mode: this.mode, warning: null }; }
    getMode() { return this.mode; }
    getWarning() { return null; }
    async crearBackup(ruta) {
        this.calls.push(['crearBackup', ruta]);
        return this.crearBackupImpl(ruta);
    }
    async closeForRestore() { this.calls.push(['closeForRestore']); }
    async reopenAfterRestore() { this.calls.push(['reopenAfterRestore']); }
    async closeAll() { this.calls.push(['closeAll']); }
    async obtenerTodos() { return []; }
}

// better-sqlite3 falso: toda base "abre" con integridad ok y las tablas requeridas.
class FakeBetterSqlite {
    prepare(sql) {
        if (/integrity_check/i.test(sql)) {
            return { all: () => [{ integrity_check: 'ok' }], get: () => ({ integrity_check: 'ok' }) };
        }
        if (/sqlite_master/i.test(sql)) {
            return { all: () => [{ name: 'articulos' }, { name: 'abonos' }, { name: 'auditoria' }] };
        }
        return { get: () => ({ total: 0 }), all: () => [] };
    }
    close() {}
}

function cargarMainProcess({ dropboxFactory = null, configInicial = null, encryptionAvailable = true } = {}) {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'napoli-main-'));
    if (configInicial !== null) {
        fs.writeFileSync(
            path.join(userData, 'config.json'),
            typeof configInicial === 'string' ? configInicial : JSON.stringify(configInicial)
        );
    }

    const handlers = new Map();
    const dbService = new FakeDBService();
    const abiertos = [];
    let resolverListo;
    const listo = new Promise((resolve) => { resolverListo = resolve; });

    const electronMock = {
        app: {
            getPath: () => userData,
            whenReady: () => ({
                then: (fn) => {
                    Promise.resolve().then(fn).then(() => resolverListo());
                }
            }),
            on: () => {},
            quit: () => {}
        },
        BrowserWindow: class {
            constructor() {
                this.webContents = { setWindowOpenHandler() {}, on() {}, print() {} };
            }
            loadFile() {}
            on() {}
            isDestroyed() { return false; }
            static getAllWindows() { return []; }
        },
        ipcMain: { handle: (canal, fn) => handlers.set(canal, fn) },
        shell: {
            openPath: async () => '',
            openExternal: async (url) => { abiertos.push(url); }
        },
        safeStorage: {
            isEncryptionAvailable: () => encryptionAvailable,
            encryptString: (texto) => Buffer.from(`enc:${texto}`),
            decryptString: (buffer) => {
                const texto = buffer.toString();
                if (!texto.startsWith('enc:')) throw new Error('no cifrado');
                return texto.slice(4);
            }
        },
        dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) }
    };

    const mocks = {
        electron: electronMock,
        'better-sqlite3': FakeBetterSqlite,
        './src/db-service': function DBServiceMock() { return dbService; },
        './src/dropbox': dropboxFactory || function DropboxMock() {
            this.estaConfigurado = () => true;
        },
        './src/diagnostics': {
            DiagnosticsLogger: class {
                init() {}
                log() {}
                startEventLoopMonitor() {}
                stopEventLoopMonitor() {}
            }
        }
    };

    const sandboxRequire = (nombre) => {
        if (Object.prototype.hasOwnProperty.call(mocks, nombre)) return mocks[nombre];
        if (nombre.startsWith('./')) return require(path.join(ROOT, nombre));
        return require(nombre);
    };

    const sandbox = {
        require: sandboxRequire,
        __dirname: ROOT,
        __filename: MAIN_PATH,
        module: { exports: {} },
        process,
        Buffer,
        console: { log() {}, warn() {}, error() {} },
        setTimeout,
        clearTimeout,
        // Los intervalos (backup cada 24 h, reintento de worker) no deben mantener vivo el test.
        setInterval: () => 0,
        clearInterval: () => {}
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(MAIN_PATH, 'utf8'), sandbox, { filename: MAIN_PATH });

    return {
        userData,
        dbPath: path.join(userData, 'napoli.db'),
        backupsPath: path.join(userData, 'backups'),
        configPath: path.join(userData, 'config.json'),
        dbService,
        abiertos,
        listo,
        invocar: (canal, ...args) => {
            const handler = handlers.get(canal);
            if (!handler) throw new Error(`Handler IPC no registrado: ${canal}`);
            return handler({}, ...args);
        },
        tieneHandler: (canal) => handlers.has(canal),
        sandbox,
        limpiar: () => fs.rmSync(userData, { recursive: true, force: true })
    };
}

module.exports = { cargarMainProcess, FakeDBService };
