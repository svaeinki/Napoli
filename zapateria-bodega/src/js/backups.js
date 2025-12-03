// ============================================
// BACKUPS Y DROPBOX
// ============================================

async function crearBackupManual() {
    const resultado = await window.electronAPI.crearBackup();
    if (resultado.success) {
        mostrarNotificacion('✅ Backup creado correctamente');
    } else {
        mostrarNotificacion('❌ Error al crear backup: ' + resultado.error, true);
    }
}

async function exportarJSONManual() {
    const resultado = await window.electronAPI.exportarJSON();
    if (resultado.success) {
        mostrarNotificacion('✅ JSON exportado: ' + resultado.filename);
    } else {
        mostrarNotificacion('❌ Error al exportar: ' + resultado.error, true);
    }
}

async function abrirCarpetaBackups() {
    await window.electronAPI.abrirCarpetaBackups();
}

async function verificarDropbox() {
    console.log('🔍 Iniciando verificación de Dropbox...');
    
    const statusElement = document.getElementById('dropboxStatus');
    const configSection = document.getElementById('dropboxConfig');
    const actionsElement = document.getElementById('dropboxActions');
    
    if (!statusElement) {
        console.error('❌ No se encontró el elemento dropboxStatus');
        return;
    }
    
    try {
        statusElement.innerHTML = '<span>🔄 Verificando conexión...</span>';
        
        console.log('📡 Consultando si Dropbox está configurado...');
        const configurado = await window.electronAPI.dropboxEstaConfigurado();
        console.log('📊 Resultado configurado:', configurado);
        
        if (configurado) {
            console.log('✅ Dropbox configurado, verificando conexión...');
            
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout local')), 8000)
            );
            
            const verifyPromise = window.electronAPI.dropboxVerificar();
            
            const info = await Promise.race([verifyPromise, timeoutPromise]);
            console.log('📊 Resultado verificación:', info);
            
            if (info.success) {
                console.log('✅ Conexión exitosa:', info.usuario);
                statusElement.innerHTML = `
                    <span class="status-connected">✅ Conectado</span>
                    <span>Usuario: ${info.usuario}</span>
                `;
                if (configSection) configSection.style.display = 'none';
                if (actionsElement) actionsElement.style.display = 'block';
            } else {
                console.warn('⚠️ Error de conexión:', info.error);
                statusElement.innerHTML = `<span class="status-disconnected">❌ ${info.error}</span>`;
                if (configSection) configSection.style.display = 'block';
                if (actionsElement) actionsElement.style.display = 'none';
            }
        } else {
            console.log('⚠️ Dropbox no está configurado');
            statusElement.innerHTML = `<span class="status-disconnected">❌ No conectado</span>`;
            if (configSection) configSection.style.display = 'block';
            if (actionsElement) actionsElement.style.display = 'none';
        }
    } catch (error) {
        console.error('❌ Error al verificar Dropbox:', error);
        
        if (error.message === 'Timeout local') {
            statusElement.innerHTML = `<span class="status-disconnected">❌ Timeout: Verifica tu conexión a internet</span>`;
        } else {
            statusElement.innerHTML = `<span class="status-disconnected">❌ Error: ${error.message}</span>`;
        }
        
        if (configSection) configSection.style.display = 'block';
        if (actionsElement) actionsElement.style.display = 'none';
    }
    
    console.log('✅ Verificación de Dropbox completada');
}

async function configurarDropbox() {
    const token = document.getElementById('dropboxToken').value.trim();
    
    if (!token) {
        mostrarNotificacion('❌ Por favor ingresa el token de Dropbox', true);
        return;
    }

    const resultado = await window.electronAPI.dropboxConfigurar(token);
    
    if (resultado.success) {
        mostrarNotificacion(`✅ Dropbox configurado correctamente. Usuario: ${resultado.usuario}`);
        document.getElementById('dropboxToken').value = '';
        await verificarDropbox();
    } else {
        mostrarNotificacion('❌ Error al configurar Dropbox: ' + resultado.error, true);
    }
}

async function desconectarDropbox() {
    if (confirm('¿Desea desconectar Dropbox?')) {
        await window.electronAPI.dropboxDesconectar();
        mostrarNotificacion('✅ Dropbox desconectado');
        await verificarDropbox();
    }
}

async function listarBackupsDropbox() {
    const resultado = await window.electronAPI.dropboxListarBackups();
    
    if (resultado.success) {
        const lista = document.getElementById('dropboxBackupsList');
        
        if (resultado.archivos.length === 0) {
            lista.innerHTML = '<p>No hay backups en Dropbox aún.</p>';
        } else {
            let html = '<h4>Archivos en Dropbox:</h4><ul>';
            resultado.archivos.forEach(archivo => {
                html += `<li>${archivo.name} (${new Date(archivo.client_modified).toLocaleString('es-CL')})</li>`;
            });
            html += '</ul>';
            lista.innerHTML = html;
        }
    } else {
        mostrarNotificacion('❌ Error al listar backups: ' + resultado.error, true);
    }
}