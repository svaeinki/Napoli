const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const DatabaseManager = require('./src/database');
const DropboxManager = require('./src/dropbox');

let mainWindow;
let db;
let dropboxManager;

const USER_DATA_PATH = app.getPath('userData');
const DB_PATH = path.join(USER_DATA_PATH, 'napoli.db');
const CONFIG_PATH = path.join(USER_DATA_PATH, 'config.json');
const BACKUPS_PATH = path.join(USER_DATA_PATH, 'backups');

// Crear carpeta de backups si no existe
if (!fs.existsSync(BACKUPS_PATH)) {
    fs.mkdirSync(BACKUPS_PATH, { recursive: true });
}

// Cargar configuración (incluye token de Dropbox)
function cargarConfiguracion() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            return config;
        }
    } catch (error) {
        console.error('Error cargando configuración:', error);
    }
    return {};
}

// Guardar configuración
function guardarConfiguracion(config) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error('Error guardando configuración:', error);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        icon: path.join(__dirname, 'build/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'src/preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        title: 'Napoli - Reparadora de Calzado'
    });

    // Para desarrollo: descomentar para ver DevTools
    // mainWindow.webContents.openDevTools();

    mainWindow.loadFile('src/index.html');

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    // Inicializar base de datos
    db = new DatabaseManager(DB_PATH);
    
    // Inicializar Dropbox si está configurado
    const config = cargarConfiguracion();
    if (config.dropboxToken) {
        dropboxManager = new DropboxManager(config.dropboxToken);
    }

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });

    // Backup automático cada 24 horas
    setInterval(() => {
        crearBackupAutomatico();
    }, 24 * 60 * 60 * 1000);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        crearBackupAutomatico();
        app.quit();
    }
});

app.on('before-quit', () => {
    crearBackupAutomatico();
});

// ============================================
// HANDLERS IPC - BASE DE DATOS
// ============================================

ipcMain.handle('db:insertar', async (event, articulo) => {
    return db.insertar(articulo);
});

ipcMain.handle('db:obtenerTodos', async () => {
    return db.obtenerTodos();
});

ipcMain.handle('db:obtenerPorId', async (event, id) => {
    return db.obtenerPorId(id);
});

ipcMain.handle('db:actualizarEstado', async (event, id, nuevoEstado) => {
    return db.actualizarEstado(id, nuevoEstado);
});

ipcMain.handle('db:eliminar', async (event, id) => {
    return db.eliminar(id);
});

ipcMain.handle('db:buscar', async (event, termino) => {
    return db.buscar(termino);
});

ipcMain.handle('db:obtenerEstadisticas', async () => {
    return db.obtenerEstadisticas();
});

ipcMain.handle('db:migrarDesdeLocalStorage', async (event, datosJSON) => {
    return db.migrarDesdeLocalStorage(datosJSON);
});

// ============================================
// HANDLERS IPC - PAGOS Y ABONOS
// ============================================

ipcMain.handle('pago:registrarAbono', async (event, articuloId, monto, metodoPago, observaciones) => {
    return db.registrarAbono(articuloId, monto, metodoPago, observaciones);
});

ipcMain.handle('pago:obtenerAbonos', async (event, articuloId) => {
    return db.obtenerAbonosArticulo(articuloId);
});

ipcMain.handle('pago:actualizarValor', async (event, articuloId, nuevoValor) => {
    return db.actualizarValorTotal(articuloId, nuevoValor);
});

// ============================================
// HANDLERS IPC - BACKUPS
// ============================================

ipcMain.handle('backup:crear', async () => {
    return crearBackupManual();
});

ipcMain.handle('backup:exportarJSON', async () => {
    return exportarJSON();
});

ipcMain.handle('backup:exportarExcel', async () => {
    return exportarExcel();
});

ipcMain.handle('backup:abrirCarpeta', async () => {
    shell.openPath(BACKUPS_PATH);
});

function crearBackupAutomatico() {
    try {
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const backupPath = path.join(BACKUPS_PATH, `napoli_backup_${timestamp}.db`);
        
        fs.copyFileSync(DB_PATH, backupPath);
        console.log('✅ Backup automático creado:', backupPath);

        // Subir a Dropbox si está configurado
        if (dropboxManager && dropboxManager.estaConfigurado()) {
            dropboxManager.subirBackupDB(backupPath);
        }

        // Limpiar backups antiguos (mantener últimos 30 días)
        limpiarBackupsAntiguos();

        return { success: true, path: backupPath };
    } catch (error) {
        console.error('Error creando backup:', error);
        return { success: false, error: error.message };
    }
}

function crearBackupManual() {
    try {
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const backupPath = path.join(BACKUPS_PATH, `napoli_manual_${timestamp}.db`);
        
        fs.copyFileSync(DB_PATH, backupPath);
        console.log('✅ Backup manual creado:', backupPath);

        // Subir a Dropbox si está configurado
        if (dropboxManager && dropboxManager.estaConfigurado()) {
            dropboxManager.subirBackupDB(backupPath);
        }

        return { success: true, path: backupPath };
    } catch (error) {
        console.error('Error creando backup manual:', error);
        return { success: false, error: error.message };
    }
}

function exportarJSON() {
    try {
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const jsonPath = path.join(BACKUPS_PATH, `napoli_export_${timestamp}.json`);
        
        const datos = db.obtenerTodos();
        fs.writeFileSync(jsonPath, JSON.stringify(datos, null, 2));
        
        console.log('✅ JSON exportado:', jsonPath);

        // Subir a Dropbox si está configurado
        if (dropboxManager && dropboxManager.estaConfigurado()) {
            dropboxManager.subirBackupJSON(jsonPath);
        }

        return { success: true, filename: path.basename(jsonPath) };
    } catch (error) {
        console.error('Error exportando JSON:', error);
        return { success: false, error: error.message };
    }
}

function exportarExcel() {
    try {
        const ExcelJS = require('exceljs');
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const excelPath = path.join(BACKUPS_PATH, `napoli_inventario_${timestamp}.xlsx`);
        
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Inventario Napoli');

        // Configurar columnas
        worksheet.columns = [
            { header: 'ID', key: 'id', width: 8 },
            { header: 'RUT', key: 'rut', width: 15 },
            { header: 'Cliente', key: 'nombreCliente', width: 25 },
            { header: 'Teléfono', key: 'telefono', width: 15 },
            { header: 'Tipo Servicio', key: 'tipoArticulo', width: 20 },
            { header: 'Descripción', key: 'descripcion', width: 40 },
            { header: 'N° Bodega', key: 'numeroBodega', width: 12 },
            { header: 'Fecha Ingreso', key: 'fechaIngreso', width: 18 },
            { header: 'Estado', key: 'estado', width: 12 },
            { header: 'Fecha Entrega', key: 'fechaEntrega', width: 18 },
            { header: 'Valor Total', key: 'valorTotal', width: 12 },
            { header: 'Total Abonado', key: 'totalAbonado', width: 12 },
            { header: 'Saldo Pendiente', key: 'saldoPendiente', width: 15 },
            { header: 'Estado Pago', key: 'estadoPago', width: 12 },
            { header: 'Observaciones', key: 'observaciones', width: 30 }
        ];

        // Estilo del encabezado
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF667eea' }
        };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
        worksheet.getRow(1).height = 25;

        // Obtener datos
        const datos = db.obtenerTodos();

        // Agregar filas
        datos.forEach(articulo => {
            const row = worksheet.addRow({
                id: articulo.id,
                rut: articulo.rut,
                nombreCliente: articulo.nombreCliente,
                telefono: articulo.telefono || '',
                tipoArticulo: articulo.tipoArticulo,
                descripcion: articulo.descripcion,
                numeroBodega: articulo.numeroBodega,
                fechaIngreso: articulo.fechaIngreso,
                estado: articulo.estado,
                fechaEntrega: articulo.fechaEntrega || '',
                valorTotal: articulo.valorTotal || 0,
                totalAbonado: articulo.totalAbonado || 0,
                saldoPendiente: articulo.saldoPendiente || 0,
                estadoPago: articulo.estadoPago || 'Sin pago',
                observaciones: articulo.observaciones || ''
            });

            // Formato de moneda para columnas de dinero
            row.getCell('valorTotal').numFmt = '$#,##0';
            row.getCell('totalAbonado').numFmt = '$#,##0';
            row.getCell('saldoPendiente').numFmt = '$#,##0';

            // Color de fondo según estado
            if (articulo.estado === 'Entregado') {
                row.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFE8F5E9' }
                };
            }
        });

        // Agregar filtros
        worksheet.autoFilter = {
            from: 'A1',
            to: 'O1'
        };

        // Guardar archivo
        workbook.xlsx.writeFile(excelPath).then(() => {
            console.log('✅ Excel exportado:', excelPath);
        });

        // Subir a Dropbox si está configurado
        if (dropboxManager && dropboxManager.estaConfigurado()) {
            setTimeout(() => {
                dropboxManager.subirArchivo(excelPath, `/NapoliReparadora/Exports/${path.basename(excelPath)}`);
            }, 1000);
        }

        return { success: true, filename: path.basename(excelPath), path: excelPath };
    } catch (error) {
        console.error('Error exportando Excel:', error);
        return { success: false, error: error.message };
    }
}

function subirBackupDropboxInmediato() {
    try {
        if (!dropboxManager || !dropboxManager.estaConfigurado()) {
            return { success: false, error: 'Dropbox no configurado' };
        }

        // Crear backup local primero
        const backupResult = crearBackupManual();
        
        if (!backupResult.success) {
            return backupResult;
        }

        console.log('✅ Backup subido a Dropbox inmediatamente');
        return { success: true, mensaje: 'Backup creado y subido a Dropbox correctamente' };
    } catch (error) {
        console.error('Error subiendo backup a Dropbox:', error);
        return { success: false, error: error.message };
    }
}

function limpiarBackupsAntiguos() {
    try {
        const archivos = fs.readdirSync(BACKUPS_PATH);
        const ahora = Date.now();
        const diasMaximos = 30 * 24 * 60 * 60 * 1000; // 30 días en milisegundos

        archivos.forEach(archivo => {
            const archivoPath = path.join(BACKUPS_PATH, archivo);
            const stats = fs.statSync(archivoPath);
            const edad = ahora - stats.mtime.getTime();

            if (edad > diasMaximos && archivo.startsWith('napoli_backup_')) {
                fs.unlinkSync(archivoPath);
                console.log('🗑️ Backup antiguo eliminado:', archivo);
            }
        });
    } catch (error) {
        console.error('Error limpiando backups antiguos:', error);
    }
}

// ============================================
// HANDLERS IPC - DROPBOX
// ============================================

ipcMain.handle('dropbox:configurar', async (event, token) => {
    try {
        dropboxManager = new DropboxManager(token);
        const verificacion = await dropboxManager.verificarConexion();
        
        if (verificacion.success) {
            const config = cargarConfiguracion();
            config.dropboxToken = token;
            guardarConfiguracion(config);
            
            return { success: true, usuario: verificacion.usuario };
        } else {
            return { success: false, error: verificacion.error };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('dropbox:verificar', async () => {
    if (!dropboxManager || !dropboxManager.estaConfigurado()) {
        return { success: false, error: 'Dropbox no configurado' };
    }
    return await dropboxManager.verificarConexion();
});

ipcMain.handle('dropbox:estaConfigurado', async () => {
    return dropboxManager && dropboxManager.estaConfigurado();
});

ipcMain.handle('dropbox:desconectar', async () => {
    dropboxManager = null;
    const config = cargarConfiguracion();
    delete config.dropboxToken;
    guardarConfiguracion(config);
    return { success: true };
});

ipcMain.handle('dropbox:listarBackups', async () => {
    if (!dropboxManager || !dropboxManager.estaConfigurado()) {
        return { success: false, error: 'Dropbox no configurado' };
    }
    return await dropboxManager.listarBackups();
});

ipcMain.handle('dropbox:subirBackupAhora', async () => {
    return subirBackupDropboxInmediato();
});

// ============================================
// HANDLER IPC - IMPRESIÓN
// ============================================

ipcMain.handle('imprimir', async () => {
    if (mainWindow) {
        mainWindow.webContents.print({ silent: false, printBackground: false });
    }
});

console.log('✅ Napoli - Reparadora de Calzado iniciada');
console.log('📂 Base de datos:', DB_PATH);
console.log('💾 Backups:', BACKUPS_PATH);