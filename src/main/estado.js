// Estado compartido del proceso principal en tiempo de ejecución.
// Los módulos leen y escriben estas propiedades (antes eran variables `let` de main.js).
const estado = {
    // Ventana principal (BrowserWindow) o null tras cerrarse.
    mainWindow: undefined,
    // DBService: acceso a SQLite (worker thread con fallback legacy).
    dbService: undefined,
    // DropboxManager si Dropbox está conectado.
    dropboxManager: undefined,
    // DiagnosticsLogger.
    diagnostics: undefined,
    // true mientras se restaura un backup: los handlers IPC devuelven RESTORE_BUSY.
    restauracionEnCurso: false,
    restauracionPromesa: null
};

module.exports = estado;
