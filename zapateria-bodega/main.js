const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const DatabaseManager = require('./src/database');
const DropboxManager = require('./src/dropbox');

let mainWindow;
let db;
let dropbox;

// Ruta para guardar configuración
const configPath = path.join(app.getPath('userData'), 'config.json');

// Funciones para leer/guardar configuración
function loadConfig() {
    try {
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error al cargar config:', error);
    }
    return {};
}

function saveConfig(config) {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error('Error al guardar config:', error);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'src/preload.js')
        },
        autoHideMenuBar: true,
        backgroundColor: '#667eea'
    });

    mainWindow.loadFile('src/index.html');
    
    // Para desarrollo: descomentar para ver DevTools
    // mainWindow.webContents.openDevTools();

    mainWindow.maximize();
}

// Inicializar base de datos y Dropbox
app.whenReady().then(() => {
    db = new DatabaseManager();
    console.log('✅ Base de datos inicializada');
    console.log('📁 Ubicación DB:', db.getRutaDB());
    console.log('📁 Ubicación Backups:', db.getRutaBackups());

    // Cargar token de Dropbox si existe
    const config = loadConfig();
    const dropboxToken = config.dropboxToken;
    dropbox = new DropboxManager(dropboxToken);
    
    if (dropbox.estaConfigurado()) {
        console.log('✅ Dropbox configurado');
        dropbox.verificarConexion().then(result => {
            if (result.success) {
                console.log('👤 Usuario Dropbox:', result.usuario);
            }
        });
    } else {
        console.log('⚠️ Dropbox no configurado');
    }

    // Backup automático cada 24 horas
    setInterval(async () => {
        console.log('⏰ Ejecutando backup automático...');
        const backupDB = await db.crearBackup();
        const backupJSON = await db.exportarJSON();
        
        // Subir a Dropbox si está configurado
        if (dropbox.estaConfigurado()) {
            if (backupDB.success) {
                await dropbox.subirBackupDB(backupDB.path);
            }
            if (backupJSON.success) {
                await dropbox.subirBackupJSON(backupJSON.path);
            }
        }
        
        db.limpiarBackupsAntiguos();
    }, 24 * 60 * 60 * 1000);

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Handlers IPC - Base de datos
ipcMain.handle('db:insertar', async (event, articulo) => {
    return db.insertarArticulo(articulo);
});

ipcMain.handle('db:obtenerTodos', async () => {
    return db.obtenerTodos();
});

ipcMain.handle('db:obtenerPorId', async (event, id) => {
    return db.obtenerPorId(id);
});

ipcMain.handle('db:buscar', async (event, termino) => {
    return db.buscar(termino);
});

ipcMain.handle('db:actualizarEstado', async (event, id, estado) => {
    return db.actualizarEstado(id, estado);
});

ipcMain.handle('db:eliminar', async (event, id) => {
    return db.eliminar(id);
});

ipcMain.handle('db:estadisticas', async () => {
    return db.obtenerEstadisticas();
});

ipcMain.handle('db:crearBackup', async () => {
    const resultado = await db.crearBackup();
    
    // Subir a Dropbox si está configurado
    if (resultado.success && dropbox.estaConfigurado()) {
        await dropbox.subirBackupDB(resultado.path);
    }
    
    return resultado;
});

ipcMain.handle('db:exportarJSON', async () => {
    const resultado = await db.exportarJSON();
    
    // Subir a Dropbox si está configurado
    if (resultado.success && dropbox.estaConfigurado()) {
        await dropbox.subirBackupJSON(resultado.path);
    }
    
    return resultado;
});

ipcMain.handle('db:abrirCarpetaBackups', async () => {
    shell.openPath(db.getRutaBackups());
});

ipcMain.handle('db:migrar', async (event, datos) => {
    return db.migrarDesdeLocalStorage(datos);
});

ipcMain.handle('imprimir', async () => {
    if (mainWindow) {
        mainWindow.webContents.print();
    }
});

// Handlers IPC - Pagos y Abonos
ipcMain.handle('pago:registrarAbono', async (event, articuloId, monto, metodoPago, observaciones) => {
    return db.registrarAbono(articuloId, monto, metodoPago, observaciones);
});

ipcMain.handle('pago:obtenerAbonos', async (event, articuloId) => {
    return db.obtenerAbonosArticulo(articuloId);
});

ipcMain.handle('pago:actualizarValor', async (event, articuloId, nuevoValor) => {
    return db.actualizarValorTotal(articuloId, nuevoValor);
});

// Handlers IPC - Dropbox
ipcMain.handle('dropbox:configurar', async (event, token) => {
    dropbox.configurarToken(token);
    
    // Guardar token en config.json
    const config = loadConfig();
    config.dropboxToken = token;
    saveConfig(config);
    
    const resultado = await dropbox.verificarConexion();
    return resultado;
});

ipcMain.handle('dropbox:verificar', async () => {
    return await dropbox.verificarConexion();
});

ipcMain.handle('dropbox:estaConfigurado', async () => {
    return dropbox.estaConfigurado();
});

ipcMain.handle('dropbox:listarBackups', async () => {
    return await dropbox.listarBackups();
});

ipcMain.handle('dropbox:descargar', async (event, rutaDropbox, destinoLocal) => {
    return await dropbox.descargarBackup(rutaDropbox, destinoLocal);
});

ipcMain.handle('dropbox:desconectar', async () => {
    dropbox = new DropboxManager(null);
    
    // Eliminar token del config.json
    const config = loadConfig();
    delete config.dropboxToken;
    saveConfig(config);
    
    return { success: true };
});

app.on('window-all-closed', () => {
    if (db) {
        db.cerrar();
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', async () => {
    if (db) {
        console.log('📊 Creando backup final...');
        const backupDB = await db.crearBackup();
        const backupJSON = await db.exportarJSON();
        
        // Subir a Dropbox si está configurado
        if (dropbox.estaConfigurado()) {
            if (backupDB.success) {
                await dropbox.subirBackupDB(backupDB.path);
            }
            if (backupJSON.success) {
                await dropbox.subirBackupJSON(backupJSON.path);
            }
        }
        
        db.cerrar();
    }
});