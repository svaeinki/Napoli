// Registra todos los handlers IPC (ipcMain.handle), agrupados por área.
// Cada canal corresponde a una función de window.electronAPI en src/preload/preload.js.
const diag = require('./diag');
const db = require('./db');
const pagos = require('./pagos');
const backups = require('./backups');
const dropbox = require('./dropbox');
const config = require('./config');
const imprimir = require('./imprimir');

function registrarHandlersIpc() {
    diag.registrar();
    db.registrar();
    pagos.registrar();
    backups.registrar();
    dropbox.registrar();
    config.registrar();
    imprimir.registrar();
}

module.exports = { registrarHandlersIpc };
