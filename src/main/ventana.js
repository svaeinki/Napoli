// Ventana principal y seguridad de navegación: crea el BrowserWindow (con el preload),
// carga la interfaz y solo deja abrir en el navegador las URLs externas permitidas.
const { BrowserWindow, shell } = require('electron');
const path = require('path');
const estado = require('./estado');
const { APP_ROOT } = require('./rutas');
const { esUrlExternaPermitida, esFileUrl } = require('./navigation-security');

function abrirUrlExternaPermitida(url) {
    if (!esUrlExternaPermitida(url)) {
        console.error(`Bloqueada navegación externa no permitida: ${url}`);
        return false;
    }

    shell.openExternal(url).catch((error) => {
        console.error(`Error abriendo URL externa permitida (${url}):`, error);
    });
    return true;
}

function createWindow() {
    estado.mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        icon: path.join(APP_ROOT, 'build/icon.png'),
        webPreferences: {
            preload: path.join(APP_ROOT, 'src/preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        },
        title: 'Napoli - Reparadora de Calzado'
    });

    // Para desarrollo: descomentar para ver DevTools
    // estado.mainWindow.webContents.openDevTools();

    estado.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        abrirUrlExternaPermitida(url);
        return { action: 'deny' };
    });

    estado.mainWindow.webContents.on('will-navigate', (event, url) => {
        if (esFileUrl(url)) {
            return;
        }

        event.preventDefault();
        abrirUrlExternaPermitida(url);
    });

    estado.mainWindow.loadFile('src/renderer/index.html');

    estado.mainWindow.on('closed', () => {
        estado.mainWindow = null;
    });
}

module.exports = {
    abrirUrlExternaPermitida,
    createWindow
};
