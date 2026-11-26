const { Dropbox, DropboxAuth } = require('dropbox');
const fetch = require('isomorphic-fetch');
const fs = require('fs');
const path = require('path');

const DROPBOX_MAX_UPLOAD_BYTES = 150 * 1024 * 1024; // 150 MB — límite razonable para backups de zapatería

function leerArchivoConGuardia(rutaArchivo) {
    const stat = fs.statSync(rutaArchivo);
    if (stat.size > DROPBOX_MAX_UPLOAD_BYTES) {
        throw new Error(
            `El archivo es demasiado grande para subir a Dropbox (${Math.round(stat.size / 1024 / 1024)} MB, máximo ${Math.round(DROPBOX_MAX_UPLOAD_BYTES / 1024 / 1024)} MB)`
        );
    }
    return fs.readFileSync(rutaArchivo);
}

function describirErrorDropbox(error) {
    const status = error && (error.status || (error.response && error.response.status));
    const resumen = error && error.error && typeof error.error.error_summary === 'string'
        ? error.error.error_summary
        : '';
    if (status === 401 || /expired_access_token|invalid_access_token/.test(resumen)) {
        return 'El acceso a Dropbox expiró o fue revocado. Vuelva a conectar Dropbox en la pestaña Backups.';
    }
    if (resumen) {
        return `${(error && error.message) || 'Error de Dropbox'} (${resumen})`;
    }
    return (error && error.message) || 'Error de conexión con Dropbox';
}

const AUTORIZACION_PENDIENTE_TTL_MS = 15 * 60 * 1000;

/**
 * Flujo OAuth 2 con PKCE (sin client secret ni redirect URI): el usuario autoriza en el navegador,
 * Dropbox le muestra un código y la app lo canjea por un refresh token de larga duración.
 * Los tokens de acceso de Dropbox duran ~4 horas; con el refresh token el SDK los renueva solo.
 */
async function iniciarAutorizacionPKCE(appKey, { fetchImpl = fetch } = {}) {
    const auth = new DropboxAuth({ clientId: appKey, fetch: fetchImpl });
    const url = await auth.getAuthenticationUrl(undefined, undefined, 'code', 'offline', null, 'none', true);
    return { auth, appKey, url, creadoEn: Date.now() };
}

async function completarAutorizacionPKCE(pendiente, codigo) {
    if (!pendiente || !pendiente.auth) {
        throw new Error('No hay una autorización de Dropbox en curso. Pulse "Abrir autorización" otra vez.');
    }
    if (Date.now() - pendiente.creadoEn > AUTORIZACION_PENDIENTE_TTL_MS) {
        throw new Error('La autorización de Dropbox expiró. Pulse "Abrir autorización" otra vez.');
    }
    const respuesta = await pendiente.auth.getAccessTokenFromCode(undefined, codigo);
    const resultado = respuesta && respuesta.result ? respuesta.result : {};
    if (!resultado.refresh_token) {
        throw new Error('Dropbox no entregó un refresh token. Verifique que la app permita clientes públicos (PKCE).');
    }
    return {
        appKey: pendiente.appKey,
        refreshToken: resultado.refresh_token,
        accessToken: resultado.access_token || null,
        expiresIn: Number(resultado.expires_in) || null
    };
}

class DropboxManager {
    /**
     * @param {string|object} credenciales
     *   - string: access token antiguo (modo heredado; expira a las ~4 h si es de corta duración).
     *   - { appKey, refreshToken, accessToken?, expiresIn? }: credenciales OAuth con renovación automática.
     * @param {{ fetchImpl?: Function }} [opciones] - fetch alternativo (tests).
     */
    constructor(credenciales, { fetchImpl = fetch } = {}) {
        const esOAuth = Boolean(credenciales && typeof credenciales === 'object');
        const accessToken = esOAuth ? credenciales.accessToken || undefined : credenciales;
        const refreshToken = esOAuth ? credenciales.refreshToken : undefined;
        const appKey = esOAuth ? credenciales.appKey : undefined;

        // Non-enumerable para que los tokens no aparezcan en console.log(dropboxManager)
        Object.defineProperty(this, 'accessToken', {
            value: accessToken,
            writable: false,
            enumerable: false,
            configurable: false
        });
        Object.defineProperty(this, 'refreshToken', {
            value: refreshToken,
            writable: false,
            enumerable: false,
            configurable: false
        });

        const opciones = { fetch: fetchImpl };
        if (esOAuth) {
            opciones.clientId = appKey;
            opciones.refreshToken = refreshToken;
            if (accessToken) {
                opciones.accessToken = accessToken;
                if (credenciales.expiresIn) {
                    opciones.accessTokenExpiresAt = new Date(Date.now() + (credenciales.expiresIn * 1000));
                }
            }
        } else {
            opciones.accessToken = accessToken;
        }
        this.dbx = new Dropbox(opciones);
        this.usaTokenHeredado = !esOAuth;
        this.configurado = esOAuth ? Boolean(appKey && refreshToken) : Boolean(accessToken);
        console.log('📦 Dropbox Manager inicializado');
    }

    estaConfigurado() {
        return this.configurado;
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
                error: describirErrorDropbox(error)
            };
        }
    }

    async subirBackupDB(archivoLocal) {
        if (!this.configurado) {
            return { success: false, error: 'Dropbox no configurado' };
        }

        try {
            const contenido = leerArchivoConGuardia(archivoLocal);
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
            return { success: false, error: describirErrorDropbox(error) };
        }
    }

    async subirBackupJSON(archivoLocal) {
        if (!this.configurado) {
            return { success: false, error: 'Dropbox no configurado' };
        }

        try {
            const contenido = leerArchivoConGuardia(archivoLocal);
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
            return { success: false, error: describirErrorDropbox(error) };
        }
    }

    async subirArchivo(archivoLocal, rutaDropbox) {
        if (!this.configurado) {
            return { success: false, error: 'Dropbox no configurado' };
        }

        try {
            const contenido = leerArchivoConGuardia(archivoLocal);
            
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
            return { success: false, error: describirErrorDropbox(error) };
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
            return { success: false, error: describirErrorDropbox(error) };
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
            return { success: false, error: describirErrorDropbox(error) };
        }
    }
}

module.exports = DropboxManager;
module.exports.iniciarAutorizacionPKCE = iniciarAutorizacionPKCE;
module.exports.completarAutorizacionPKCE = completarAutorizacionPKCE;
module.exports.describirErrorDropbox = describirErrorDropbox;
module.exports.AUTORIZACION_PENDIENTE_TTL_MS = AUTORIZACION_PENDIENTE_TTL_MS;