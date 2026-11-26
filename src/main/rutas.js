// Rutas del proceso principal: carpeta de datos del usuario (userData), base de datos,
// configuración, backups y la raíz de la aplicación.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// Raíz de la aplicación (donde están main.js y build/).
const APP_ROOT = path.join(__dirname, '..', '..');
const USER_DATA_PATH = app.getPath('userData');
const DB_PATH = path.join(USER_DATA_PATH, 'napoli.db');
const CONFIG_PATH = path.join(USER_DATA_PATH, 'config.json');
const BACKUPS_PATH = path.join(USER_DATA_PATH, 'backups');
const BACKUP_STATUS_PATH = path.join(USER_DATA_PATH, 'backup-status.json');

// Crear carpeta de backups si no existe
if (!fs.existsSync(BACKUPS_PATH)) {
    fs.mkdirSync(BACKUPS_PATH, { recursive: true });
}

module.exports = {
    APP_ROOT,
    USER_DATA_PATH,
    DB_PATH,
    CONFIG_PATH,
    BACKUPS_PATH,
    BACKUP_STATUS_PATH
};
