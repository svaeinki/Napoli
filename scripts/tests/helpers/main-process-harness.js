// Carga main.js (y los módulos de src/main/ que requiere) en un sandbox (vm) con electron,
// better-sqlite3, DBService y Dropbox simulados, para probar handlers IPC y lógica del proceso
// principal sin levantar Electron.
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..', '..');
const MAIN_PATH = path.join(ROOT, 'main.js');
const SRC_MAIN = path.join(ROOT, 'src', 'main');

// Módulos sin estado que se cargan con el require real de Node (como siempre se hizo).
// Todo otro módulo local del proceso principal se evalúa dentro del sandbox, con una caché
// propia por cada cargarMainProcess(), para que el estado no se comparta entre tests.
const MODULOS_REQUIRE_REAL = new Set([
    'navigation-security.js',
    'backup-filename.js',
    'sqlite-restore-utils.js',
    'chile-date.js'
].map((nombre) => path.join(SRC_MAIN, nombre)));

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

    // Paquetes simulados, por nombre.
    const mocksPorNombre = {
        electron: electronMock,
        'better-sqlite3': FakeBetterSqlite
    };

    // Módulos locales simulados, por ruta absoluta (así da igual desde qué archivo se requieran).
    const mocksPorRuta = new Map([
        [path.join(SRC_MAIN, 'db-service.js'), function DBServiceMock() { return dbService; }],
        [path.join(SRC_MAIN, 'dropbox.js'), dropboxFactory || function DropboxMock() {
            this.estaConfigurado = () => true;
        }],
        [path.join(SRC_MAIN, 'diagnostics.js'), {
            DiagnosticsLogger: class {
                init() {}
                log() {}
                startEventLoopMonitor() {}
                stopEventLoopMonitor() {}
            }
        }]
    ]);

    const modulosCargados = new Map();
    let sandbox;

    function cargarModuloEnSandbox(ruta) {
        if (modulosCargados.has(ruta)) return modulosCargados.get(ruta).exports;
        const moduloSandbox = { exports: {} };
        modulosCargados.set(ruta, moduloSandbox);
        const codigo = fs.readFileSync(ruta, 'utf8');
        const envoltura = vm.runInContext(
            `(function (exports, require, module, __filename, __dirname) {${codigo}\n})`,
            sandbox,
            { filename: ruta }
        );
        envoltura.call(
            moduloSandbox.exports,
            moduloSandbox.exports,
            crearRequire(path.dirname(ruta)),
            moduloSandbox,
            ruta,
            path.dirname(ruta)
        );
        return moduloSandbox.exports;
    }

    function crearRequire(directorio) {
        return (nombre) => {
            if (Object.prototype.hasOwnProperty.call(mocksPorNombre, nombre)) return mocksPorNombre[nombre];
            if (nombre.startsWith('./') || nombre.startsWith('../')) {
                const ruta = require.resolve(path.resolve(directorio, nombre));
                if (mocksPorRuta.has(ruta)) return mocksPorRuta.get(ruta);
                if (MODULOS_REQUIRE_REAL.has(ruta)) return require(ruta);
                return cargarModuloEnSandbox(ruta);
            }
            return require(nombre);
        };
    }

    // Globales del sandbox; require, module, __dirname y __filename los recibe cada módulo
    // en su envoltura, igual que en Node.
    sandbox = {
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
    cargarModuloEnSandbox(MAIN_PATH);

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
        // Exports de un módulo de src/main/ ya cargado en este sandbox (p. ej. modulo('respaldos')).
        modulo: (nombre) => {
            const ruta = path.join(SRC_MAIN, `${nombre}.js`);
            if (!modulosCargados.has(ruta)) throw new Error(`Módulo no cargado en el sandbox: ${nombre}`);
            return modulosCargados.get(ruta).exports;
        },
        sandbox,
        limpiar: () => fs.rmSync(userData, { recursive: true, force: true })
    };
}

module.exports = { cargarMainProcess, FakeDBService };
