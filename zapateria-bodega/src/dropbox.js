const { Dropbox } = require('dropbox');
const fetch = require('isomorphic-fetch');
const fs = require('fs');
const path = require('path');

class DropboxManager {
    constructor(accessToken) {
        if (accessToken) {
            this.dbx = new Dropbox({ 
                accessToken: accessToken,
                fetch: fetch 
            });
            this.configurado = true;
        } else {
            this.dbx = null;
            this.configurado = false;
        }
    }

    // Verificar si está configurado
    estaConfigurado() {
        return this.configurado;
    }

    // Configurar token
    configurarToken(accessToken) {
        this.dbx = new Dropbox({ 
            accessToken: accessToken,
            fetch: fetch 
        });
        this.configurado = true;
    }

    // Subir archivo
    async subirArchivo(archivoLocal, rutaDropbox) {
        if (!this.configurado) {
            return { success: false, error: 'Dropbox no configurado' };
        }

        try {
            const contenido = fs.readFileSync(archivoLocal);
            
            const response = await this.dbx.filesUpload({
                path: rutaDropbox,
                contents: contenido,
                mode: 'overwrite',
                autorename: true
            });

            console.log(`✅ Archivo subido a Dropbox: ${rutaDropbox}`);
            return { success: true, response };
        } catch (error) {
            console.error('❌ Error al subir a Dropbox:', error);
            return { success: false, error: error.message };
        }
    }

    // Subir backup JSON
    async subirBackupJSON(archivoLocal) {
        const nombreArchivo = path.basename(archivoLocal);
        const rutaDropbox = `/ZapateriaBodega/Backups/${nombreArchivo}`;
        return await this.subirArchivo(archivoLocal, rutaDropbox);
    }

    // Subir backup DB
    async subirBackupDB(archivoLocal) {
        const nombreArchivo = path.basename(archivoLocal);
        const rutaDropbox = `/ZapateriaBodega/Backups/${nombreArchivo}`;
        return await this.subirArchivo(archivoLocal, rutaDropbox);
    }

    // Listar archivos en Dropbox
    async listarBackups() {
        if (!this.configurado) {
            return { success: false, error: 'Dropbox no configurado' };
        }

        try {
            const response = await this.dbx.filesListFolder({
                path: '/ZapateriaBodega/Backups'
            });

            return { success: true, archivos: response.result.entries };
        } catch (error) {
            if (error.status === 409) {
                // La carpeta no existe, está vacía
                return { success: true, archivos: [] };
            }
            console.error('Error al listar archivos:', error);
            return { success: false, error: error.message };
        }
    }

    // Descargar backup desde Dropbox
    async descargarBackup(rutaDropbox, destinoLocal) {
        if (!this.configurado) {
            return { success: false, error: 'Dropbox no configurado' };
        }

        try {
            const response = await this.dbx.filesDownload({ path: rutaDropbox });
            fs.writeFileSync(destinoLocal, response.result.fileBinary);
            
            console.log(`✅ Backup descargado: ${destinoLocal}`);
            return { success: true };
        } catch (error) {
            console.error('Error al descargar:', error);
            return { success: false, error: error.message };
        }
    }

    // Verificar conexión
    async verificarConexion() {
        if (!this.configurado) {
            return { success: false, error: 'Dropbox no configurado' };
        }

        try {
            console.log('🔍 Verificando conexión con Dropbox...');
            
            // Timeout de 5 segundos
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout: La conexión tardó demasiado')), 5000)
            );
            
            const verifyPromise = this.dbx.usersGetCurrentAccount();
            
            const response = await Promise.race([verifyPromise, timeoutPromise]);
            
            console.log('✅ Conectado a Dropbox:', response.result.name.display_name);
            return { 
                success: true, 
                usuario: response.result.name.display_name,
                email: response.result.email
            };
        } catch (error) {
            console.error('❌ Error al verificar conexión Dropbox:', error.message);
            
            if (error.message && error.message.includes('Timeout')) {
                return { success: false, error: 'La conexión tardó demasiado. Verifica tu internet.' };
            }
            
            if (error.status === 401) {
                return { success: false, error: 'Token inválido o expirado' };
            }
            
            return { success: false, error: error.message || 'Error desconocido' };
        }
    }
}

module.exports = DropboxManager;