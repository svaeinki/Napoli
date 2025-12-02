const { contextBridge, ipcRenderer } = require('electron');

// Exponer API segura al renderer
contextBridge.exposeInMainWorld('electronAPI', {
    // Artículos
    insertarArticulo: (articulo) => ipcRenderer.invoke('db:insertar', articulo),
    obtenerTodos: () => ipcRenderer.invoke('db:obtenerTodos'),
    obtenerPorId: (id) => ipcRenderer.invoke('db:obtenerPorId', id),
    buscar: (termino) => ipcRenderer.invoke('db:buscar', termino),
    actualizarEstado: (id, estado) => ipcRenderer.invoke('db:actualizarEstado', id, estado),
    eliminar: (id) => ipcRenderer.invoke('db:eliminar', id),
    obtenerEstadisticas: () => ipcRenderer.invoke('db:estadisticas'),
    
    // Backups
    crearBackup: () => ipcRenderer.invoke('db:crearBackup'),
    exportarJSON: () => ipcRenderer.invoke('db:exportarJSON'),
    abrirCarpetaBackups: () => ipcRenderer.invoke('db:abrirCarpetaBackups'),
    
    // Migración
    migrarDesdeLocalStorage: (datos) => ipcRenderer.invoke('db:migrar', datos),
    
    // Imprimir
    imprimir: () => ipcRenderer.invoke('imprimir'),
    
    // Dropbox
    dropboxConfigurar: (token) => ipcRenderer.invoke('dropbox:configurar', token),
    dropboxVerificar: () => ipcRenderer.invoke('dropbox:verificar'),
    dropboxEstaConfigurado: () => ipcRenderer.invoke('dropbox:estaConfigurado'),
    dropboxListarBackups: () => ipcRenderer.invoke('dropbox:listarBackups'),
    dropboxDescargar: (rutaDropbox, destinoLocal) => ipcRenderer.invoke('dropbox:descargar', rutaDropbox, destinoLocal),
    dropboxDesconectar: () => ipcRenderer.invoke('dropbox:desconectar')
});

console.log('✅ Preload script cargado');