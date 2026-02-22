const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Base de datos
    insertarArticulo: (articulo) => ipcRenderer.invoke('db:insertar', articulo),
    obtenerTodos: () => ipcRenderer.invoke('db:obtenerTodos'),
    obtenerPorId: (id) => ipcRenderer.invoke('db:obtenerPorId', id),
    actualizarEstado: (id, estado) => ipcRenderer.invoke('db:actualizarEstado', id, estado),
    eliminar: (id) => ipcRenderer.invoke('db:eliminar', id),
    buscar: (termino) => ipcRenderer.invoke('db:buscar', termino),
    obtenerEstadisticas: () => ipcRenderer.invoke('db:obtenerEstadisticas'),
    migrarDesdeLocalStorage: (datos) => ipcRenderer.invoke('db:migrarDesdeLocalStorage', datos),

    // Pagos y abonos
    pagoRegistrarAbono: (articuloId, monto, metodoPago, observaciones) =>
        ipcRenderer.invoke('pago:registrarAbono', articuloId, monto, metodoPago, observaciones),
    pagoObtenerAbonos: (articuloId) => ipcRenderer.invoke('pago:obtenerAbonos', articuloId),
    pagoActualizarValor: (articuloId, nuevoValor) =>
        ipcRenderer.invoke('pago:actualizarValor', articuloId, nuevoValor),

    // Backups
    crearBackup: () => ipcRenderer.invoke('backup:crear'),
    exportarJSON: () => ipcRenderer.invoke('backup:exportarJSON'),
    exportarExcel: () => ipcRenderer.invoke('backup:exportarExcel'),
    abrirCarpetaBackups: () => ipcRenderer.invoke('backup:abrirCarpeta'),

    // Dropbox
    dropboxConfigurar: (token) => ipcRenderer.invoke('dropbox:configurar', token),
    dropboxVerificar: () => ipcRenderer.invoke('dropbox:verificar'),
    dropboxEstaConfigurado: () => ipcRenderer.invoke('dropbox:estaConfigurado'),
    dropboxDesconectar: () => ipcRenderer.invoke('dropbox:desconectar'),
    dropboxListarBackups: () => ipcRenderer.invoke('dropbox:listarBackups'),
    dropboxSubirBackupAhora: () => ipcRenderer.invoke('dropbox:subirBackupAhora'),

    // Impresión
    imprimir: () => ipcRenderer.invoke('imprimir'),

    // Configuración
    obtenerConfiguracion: () => ipcRenderer.invoke('config:obtener'),
    guardarConfiguracion: (config) => ipcRenderer.invoke('config:guardar', config),

    // Utilidades
    generarQR: (texto) => ipcRenderer.invoke('util:generarQR', texto)
});