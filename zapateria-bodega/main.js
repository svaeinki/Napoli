const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true, // Ocultar menú por defecto
    backgroundColor: '#667eea'
  });

  // Cargar el archivo HTML
  mainWindow.loadFile('src/index.html');

  // Maximizar la ventana al inicio
  mainWindow.maximize();

  // Para desarrollo: descomentar para ver las herramientas de desarrollador
  // mainWindow.webContents.openDevTools();
}

// Cuando Electron está listo
app.whenReady().then(() => {
  createWindow();

  // En macOS, recrear ventana si se hace clic en el dock
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Cerrar app cuando se cierran todas las ventanas (excepto en macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});