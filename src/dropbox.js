const { Dropbox } = require('dropbox');
const fetch = require('isomorphic-fetch');
const fs = require('fs');
const path = require('path');

class DropboxManager {
    constructor(accessToken) {
        this.accessToken = accessToken;
        this.dbx = new Dropbox({ accessToken, fetch });
        this.configurado = !!accessToken;
        console.log('📦 Dropbox Manager inicializado');
    }

    estaConfigurado() {
        return this.configurado && !!this.accessToken;
    }

    async verificarConexion() {
        if (!this.configurado) {
            return { success: false, error: 'No configurado' };
        }

        try {
            const response = await this.dbx.usersGetCurrentAccount();
            console.log('✅ Dropbox conectado:', response.result.name.display_name);
            return { 
                success: true, 
                usuario: response.result.name.display_name,
                email: response.result.email
            };
        } catch (error) {
            console.error('❌ Error conectando a Dropbox:', error);
            return { 
                success: false, 
                error: error.message || 'Error de conexión'
            };
        }
    }

    async subirBackupDB(archivoLocal) {
        if (!this.configurado) {
            return { success: false, error: 'Dropbox no configurado' };
        }

        try {
            const contenido = fs.readFileSync(archivoLocal);
            const nombreArchivo = path.basename(archivoLocal);
            
            const response = await this.dbx.filesUpload({
                path: `/NapoliReparadora/Backups/${nombreArchivo}`,
                contents: contenido,
                mode: 'overwrite',
                autorename: true
            });

            console.log(`✅ Backup DB subido a Dropbox: ${nombreArchivo}`);
            return { success: true, response };
        } catch (error) {
            console.error('❌ Error al subir backup DB:', error);
            return { success: false, error: error.message };
        }
    }

    async subirBackupJSON(archivoLocal) {
        if (!this.configurado) {
            return { success: false, error: 'Dropbox no configurado' };
        }

        try {
            const contenido = fs.readFileSync(archivoLocal);
            const nombreArchivo = path.basename(archivoLocal);
            
            const response = await this.dbx.filesUpload({
                path: `/NapoliReparadora/Exports/${nombreArchivo}`,
                contents: contenido,
                mode: 'overwrite',
                autorename: true
            });

            console.log(`✅ JSON subido a Dropbox: ${nombreArchivo}`);
            return { success: true, response };
        } catch (error) {
            console.error('❌ Error al subir JSON:', error);
            return { success: false, error: error.message };
        }
    }

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
            console.error('❌ Error al subir archivo:', error);
            return { success: false, error: error.message };
        }
    }

    async listarBackups() {
        if (!this.configurado) {
            return { success: false, error: 'Dropbox no configurado' };
        }

        try {
            const response = await this.dbx.filesListFolder({
                path: '/NapoliReparadora/Backups'
            });

            const archivos = response.result.entries.map(entry => ({
                name: entry.name,
                path: entry.path_display,
                size: entry.size,
                client_modified: entry.client_modified
            }));

            console.log(`✅ Encontrados ${archivos.length} backups en Dropbox`);
            return { success: true, archivos };
        } catch (error) {
            if (error.status === 409) {
                console.log('📁 Carpeta de backups no existe aún en Dropbox');
                return { success: true, archivos: [] };
            }
            console.error('❌ Error al listar backups:', error);
            return { success: false, error: error.message };
        }
    }

    async descargarBackup(rutaDropbox, rutaLocal) {
        if (!this.configurado) {
            return { success: false, error: 'Dropbox no configurado' };
        }

        try {
            const response = await this.dbx.filesDownload({ path: rutaDropbox });
            fs.writeFileSync(rutaLocal, response.result.fileBinary, 'binary');
            
            console.log(`✅ Backup descargado: ${path.basename(rutaLocal)}`);
            return { success: true, path: rutaLocal };
        } catch (error) {
            console.error('❌ Error al descargar backup:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = DropboxManager;