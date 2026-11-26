// Backups locales de la base de datos: crear (automático/manual) y subir a Dropbox,
// listar, limpiar los antiguos, estado de backups (backup-status.json) y las rutas
// de archivos que el usuario aprobó en el diálogo de selección.
const path = require('path');
const fs = require('fs');
const estado = require('./estado');
const { BACKUPS_PATH, BACKUP_STATUS_PATH } = require('./rutas');
const {
    timestampIsoSeguro,
    escribirJsonAtomico,
    medirOperacionDb,
    payloadErrorOperacion
} = require('./utilidades');
const { subirBackupDBConTimeout } = require('./dropbox-sesion');

const rutasAprobadasPorDialogo = new Set();
const RUTAS_APROBADAS_MAX = 20;

function cargarEstadoBackups({ strict = false } = {}) {
    try {
        if (!fs.existsSync(BACKUP_STATUS_PATH)) {
            return {};
        }

        const raw = fs.readFileSync(BACKUP_STATUS_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('El estado de backups tiene un formato inválido');
        }
        return parsed;
    } catch (error) {
        if (strict) {
            throw error;
        }
        console.error('Error cargando estado de backups:', error);
    }
    return {};
}

function guardarEstadoBackups(estado) {
    try {
        escribirJsonAtomico(BACKUP_STATUS_PATH, estado);
    } catch (error) {
        console.error('Error guardando estado de backups:', error);
    }
}

function registrarEstadoBackups(parcial) {
    const actual = cargarEstadoBackups();
    const actualizado = {
        ...actual,
        ...parcial,
        updatedAt: new Date().toISOString()
    };
    guardarEstadoBackups(actualizado);
    return actualizado;
}

function listarBackupsLocalesDB() {
    try {
        if (!fs.existsSync(BACKUPS_PATH)) {
            return [];
        }

        const archivos = fs.readdirSync(BACKUPS_PATH)
            .filter((archivo) => path.extname(archivo).toLowerCase() === '.db')
            .map((archivo) => {
                const ruta = path.join(BACKUPS_PATH, archivo);
                const stat = fs.statSync(ruta);
                return {
                    name: archivo,
                    path: ruta,
                    modifiedAt: stat.mtime.toISOString(),
                    size: stat.size
                };
            })
            .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));

        return archivos;
    } catch (error) {
        console.error('Error listando backups locales:', error);
        return [];
    }
}

function obtenerUltimoBackupLocal() {
    const backups = listarBackupsLocalesDB().filter((backup) =>
        backup.name.startsWith('napoli_backup_') || backup.name.startsWith('napoli_manual_')
    );
    return backups[0] || null;
}

function obtenerEstadoBackups() {
    const estado = cargarEstadoBackups({ strict: true });
    return {
        success: true,
        backupDir: BACKUPS_PATH,
        lastLocalBackup: obtenerUltimoBackupLocal(),
        localBackups: listarBackupsLocalesDB().slice(0, 20),
        lastValidation: estado.lastValidation || null,
        lastRestore: estado.lastRestore || null,
        dropboxConfigured: !!(estado.dropboxManager && estado.dropboxManager.estaConfigurado())
    };
}

function esRutaPermitidaParaBackup(rutaArchivo) {
    if (!rutaArchivo || typeof rutaArchivo !== 'string') return false;
    const rutaAbsoluta = path.resolve(rutaArchivo.trim());
    if (rutaAbsoluta.startsWith(BACKUPS_PATH + path.sep) || rutaAbsoluta === BACKUPS_PATH) {
        return true;
    }
    if (rutasAprobadasPorDialogo.has(rutaAbsoluta)) {
        return true;
    }
    return false;
}

function registrarRutaAprobadaPorDialogo(ruta) {
    if (!ruta || typeof ruta !== 'string') return;
    const rutaAbsoluta = path.resolve(ruta.trim());
    rutasAprobadasPorDialogo.add(rutaAbsoluta);
    if (rutasAprobadasPorDialogo.size > RUTAS_APROBADAS_MAX) {
        const primera = rutasAprobadasPorDialogo.values().next().value;
        rutasAprobadasPorDialogo.delete(primera);
    }
}

async function crearBackupInterno({ prefijo = 'napoli_backup_', opLabel = 'backup:crear', estadoKey = 'lastAutomaticBackup', exigirDropbox = false, limpiar = false } = {}) {
    try {
        if (estado.restauracionEnCurso) {
            return { success: false, error: 'Restauración en curso. Intente nuevamente al terminar.' };
        }

        const timestamp = timestampIsoSeguro();
        const backupPath = path.join(BACKUPS_PATH, `${prefijo}${timestamp}.db`);

        if (!estado.dbService) {
            throw new Error('Base de datos no inicializada');
        }

        const backupDB = await medirOperacionDb(opLabel, () => estado.dbService.crearBackup(backupPath));
        if (!backupDB.success) {
            return backupDB;
        }

        // El backup local ya existe: limpiar y registrarlo pase lo que pase con Dropbox.
        if (limpiar) {
            limpiarBackupsAntiguos();
        }

        registrarEstadoBackups({
            [estadoKey]: {
                timestamp: new Date().toISOString(),
                path: backupPath
            }
        });

        // Subir a Dropbox si está configurado
        if (estado.dropboxManager && estado.dropboxManager.estaConfigurado()) {
            let subida;
            try {
                subida = await subirBackupDBConTimeout(backupPath);
            } catch (uploadError) {
                // Timeout u otro error lanzado: no debe convertir en fallo un backup local exitoso.
                subida = { success: false, error: uploadError.message };
            }

            registrarEstadoBackups({
                lastDropboxUpload: {
                    timestamp: new Date().toISOString(),
                    path: backupPath,
                    success: Boolean(subida && subida.success),
                    error: subida && !subida.success ? (subida.error || 'Error desconocido') : null
                }
            });

            if (!subida || !subida.success) {
                const mensaje = `Backup local creado, pero falló subida a Dropbox: ${(subida && subida.error) || 'Error desconocido'}`;
                if (exigirDropbox) {
                    return { success: false, path: backupPath, error: mensaje };
                }
                return { success: true, path: backupPath, warning: mensaje };
            }
        }

        return { success: true, path: backupPath };
    } catch (error) {
        console.error(`Error creando backup (${prefijo}):`, error);
        return payloadErrorOperacion(error);
    }
}

async function crearBackupAutomatico() {
    return crearBackupInterno({
        prefijo: 'napoli_backup_',
        opLabel: 'backup:crearAutomatico',
        estadoKey: 'lastAutomaticBackup',
        limpiar: true
    });
}

async function crearBackupManual(options = {}) {
    const { exigirDropbox = false } = options;
    return crearBackupInterno({
        prefijo: 'napoli_manual_',
        opLabel: 'backup:crearManual',
        estadoKey: 'lastManualBackup',
        exigirDropbox
    });
}

async function subirBackupDropboxInmediato() {
    try {
        if (!estado.dropboxManager || !estado.dropboxManager.estaConfigurado()) {
            return { success: false, error: 'Dropbox no configurado' };
        }

        // Crear backup local primero
        const backupResult = await crearBackupManual({ exigirDropbox: true });

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

            if (
                edad > diasMaximos &&
                path.extname(archivo).toLowerCase() === '.db' &&
                (
                    archivo.startsWith('napoli_backup_') ||
                    archivo.startsWith('napoli_manual_') ||
                    archivo.startsWith('napoli_pre_restore_')
                )
            ) {
                fs.unlinkSync(archivoPath);
                console.log('🗑️ Backup antiguo eliminado:', archivo);
            }
        });
    } catch (error) {
        console.error('Error limpiando backups antiguos:', error);
    }
}

module.exports = {
    registrarEstadoBackups,
    obtenerEstadoBackups,
    esRutaPermitidaParaBackup,
    registrarRutaAprobadaPorDialogo,
    crearBackupAutomatico,
    crearBackupManual,
    subirBackupDropboxInmediato
};
