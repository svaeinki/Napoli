// ============================================
// BACKUPS Y DROPBOX
// ============================================

let backupSeleccionadoPath = '';

function formatearFechaHora(fechaIso) {
    return formatearFechaChile(fechaIso, { fallback: 'N/A' });
}

// IMPORTANTE: trustedHtml debe contener únicamente HTML construido en el código.
// Todo dato dinámico (rutas, nombres, mensajes de error) DEBE ser escapado con escaparHtml()
// antes de interpolarlo. Nunca pasar datos del usuario o de la BD sin escapar.
function setRestoreStatus(trustedHtml, tipo = 'warning') {
    const box = document.getElementById('restoreStatusBox');
    if (!box) return;

    box.className = `restore-status ${tipo}`;
    box.style.display = 'block';
    box.innerHTML = trustedHtml;
}

function actualizarChecklistItem(id, clase, texto) {
    const item = document.getElementById(id);
    if (!item) return;

    item.className = `checklist-item ${clase}`;
    item.textContent = texto;
}

function actualizarChecklistResumen(texto) {
    const resumen = document.getElementById('checklistResumen');
    if (!resumen) return;
    resumen.textContent = texto;
}

async function refrescarChecklistActualizacion() {
    const itemBackup = document.getElementById('checkBackupLocal');
    if (!itemBackup) {
        return;
    }

    try {
        const estado = await window.electronAPI.backupObtenerEstado();
        if (!estado || !estado.success) {
            actualizarChecklistItem('checkBackupLocal', 'pending', '⏳ Backup local .db validado');
            actualizarChecklistItem('checkDropboxRecomendado', 'pending', 'ℹ️ Dropbox conectado (recomendado)');
            actualizarChecklistResumen('No se pudo cargar estado de backups.');
            return;
        }

        const lastBackup = estado.lastLocalBackup;
        const lastValidation = estado.lastValidation;
        const dropboxConfigured = !!estado.dropboxConfigured;

        const hayBackupLocal = !!lastBackup;
        const validacionOk = !!(lastValidation && lastValidation.valid);
        const coincideRuta = !!(
            hayBackupLocal &&
            validacionOk &&
            typeof lastValidation.path === 'string' &&
            lastValidation.path === lastBackup.path
        );
        const checklistBackupOk = hayBackupLocal && validacionOk && coincideRuta;

        if (checklistBackupOk) {
            actualizarChecklistItem(
                'checkBackupLocal',
                'ok',
                `✅ Backup validado (${lastBackup.name})`
            );
        } else if (!hayBackupLocal) {
            actualizarChecklistItem(
                'checkBackupLocal',
                'pending',
                '⏳ No hay backup local .db reciente'
            );
        } else if (!validacionOk) {
            actualizarChecklistItem(
                'checkBackupLocal',
                'pending',
                `⏳ Backup creado pero no validado (${lastBackup.name})`
            );
        } else {
            actualizarChecklistItem(
                'checkBackupLocal',
                'pending',
                '⏳ La validación no corresponde al último backup local'
            );
        }

        if (dropboxConfigured) {
            actualizarChecklistItem(
                'checkDropboxRecomendado',
                'ok',
                '✅ Dropbox configurado (capa extra de respaldo)'
            );
        } else {
            actualizarChecklistItem(
                'checkDropboxRecomendado',
                'warn',
                'ℹ️ Dropbox no configurado (recomendado, pero opcional)'
            );
        }

        if (checklistBackupOk) {
            const detalleDropbox = dropboxConfigured
                ? 'Checklist listo para actualización.'
                : 'Checklist mínimo listo. Recomendado: configurar Dropbox.';
            actualizarChecklistResumen(detalleDropbox);
        } else {
            const ultimaValidacion = lastValidation
                ? ` Última validación: ${formatearFechaHora(lastValidation.timestamp)}.`
                : '';
            actualizarChecklistResumen(
                `Falta completar validación de backup local antes de actualizar.${ultimaValidacion}`
            );
        }
    } catch (error) {
        console.error('Error refrescando checklist de actualización:', error);
        actualizarChecklistResumen(`Error verificando checklist de actualización: ${error.message}`);
    }
}

async function crearBackupManual() {
    const btn = document.querySelector('[onclick="crearBackupManual()"]');
    setBtnLoading(btn, true);
    try {
        const resultado = await window.electronAPI.crearBackup();
        if (resultado && resultado.success) {
            if (resultado.warning) {
                mostrarNotificacion(`⚠️ ${resultado.warning}`, true);
            } else {
                mostrarNotificacion('✅ Backup creado correctamente');
            }
            await refrescarChecklistActualizacion();
        } else {
            mostrarNotificacion('❌ Error al crear backup: ' + (resultado && resultado.error || 'Error desconocido'), true);
        }
    } catch (error) {
        console.error('Error creando backup manual:', error);
        mostrarNotificacion('❌ Error al crear backup', true);
    } finally {
        setBtnLoading(btn, false);
    }
}

async function exportarJSONManual() {
    try {
        const resultado = await window.electronAPI.exportarJSON();
        if (resultado && resultado.success) {
            mostrarNotificacion('✅ JSON exportado: ' + resultado.filename);
        } else {
            mostrarNotificacion('❌ Error al exportar: ' + (resultado && resultado.error || 'Error desconocido'), true);
        }
    } catch (error) {
        console.error('Error exportando JSON:', error);
        mostrarNotificacion('❌ Error al exportar JSON', true);
    }
}

async function exportarExcel() {
    const btn = document.querySelector('[onclick="exportarExcel()"]');
    setBtnLoading(btn, true);
    try {
        mostrarNotificacion('⏳ Exportando a Excel...', false);

        const resultado = await window.electronAPI.exportarExcel();

        if (resultado && resultado.success) {
            if (resultado.warning) {
                mostrarNotificacion(`⚠️ ${resultado.warning}`, true);
            } else {
                mostrarNotificacion(`✅ Excel exportado: ${resultado.filename}`);
            }
        } else {
            mostrarNotificacion('❌ Error al exportar Excel: ' + (resultado && resultado.error || 'Error desconocido'), true);
        }
    } catch (error) {
        console.error('Error exportando Excel:', error);
        mostrarNotificacion('❌ Error al exportar Excel', true);
    } finally {
        setBtnLoading(btn, false);
    }
}

async function abrirCarpetaBackups() {
    try {
        const resultado = await window.electronAPI.abrirCarpetaBackups();
        if (resultado && resultado.success === false) {
            mostrarNotificacion('❌ Error abriendo carpeta de backups: ' + resultado.error, true);
        }
    } catch (error) {
        console.error('Error abriendo carpeta de backups:', error);
        mostrarNotificacion('❌ Error abriendo carpeta de backups', true);
    }
}

async function seleccionarBackupParaRestore() {
    try {
        const seleccion = await window.electronAPI.backupSeleccionarArchivoDB();
        if (!seleccion || !seleccion.success) {
            mostrarNotificacion('❌ No se pudo abrir el selector de archivos', true);
            return;
        }
        if (seleccion.canceled) {
            return;
        }

        backupSeleccionadoPath = seleccion.path;
        const input = document.getElementById('restoreBackupPath');
        if (input) {
            input.value = backupSeleccionadoPath;
        }

        setRestoreStatus(
            `Archivo seleccionado: <strong>${escaparHtml(backupSeleccionadoPath)}</strong>`,
            'warning'
        );
    } catch (error) {
        console.error('Error seleccionando backup para restore:', error);
        mostrarNotificacion(`❌ Error seleccionando archivo de backup: ${error.message}`, true);
    }
}

async function validarBackupSeleccionado() {
    if (!backupSeleccionadoPath) {
        try {
            const estado = await window.electronAPI.backupObtenerEstado();
            if (estado && estado.success && estado.lastLocalBackup && estado.lastLocalBackup.path) {
                backupSeleccionadoPath = estado.lastLocalBackup.path;
                const input = document.getElementById('restoreBackupPath');
                if (input) {
                    input.value = backupSeleccionadoPath;
                }
            } else {
                mostrarNotificacion('❌ Seleccione primero un backup .db', true);
                return;
            }
        } catch (error) {
            mostrarNotificacion('❌ Seleccione primero un backup .db', true);
            return;
        }
    }

    const btnValidar = document.querySelector('[onclick="validarBackupSeleccionado()"]');
    setBtnLoading(btnValidar, true);
    try {
        const resultado = await window.electronAPI.backupValidarDB(backupSeleccionadoPath);
        await refrescarChecklistActualizacion();

        if (resultado.success && resultado.valid) {
            const ultimaValidacion = formatearFechaHora(new Date().toISOString());
            setRestoreStatus(
                [
                    '<strong>✅ Backup válido</strong>',
                    `Ruta: ${escaparHtml(resultado.path || backupSeleccionadoPath)}`,
                    `Integridad: ${escaparHtml(resultado.integrity || 'ok')}`,
                    `Tablas requeridas: ${resultado.tablesOk ? 'OK' : 'Incompleto'}`,
                    `Validado: ${escaparHtml(ultimaValidacion)}`
                ].join('<br>'),
                'success'
            );
            mostrarNotificacion('✅ Backup validado correctamente');
            return;
        }

        const mensajeError = resultado.error || 'El backup no cumple validaciones';
        setRestoreStatus(
            [
                '<strong>❌ Backup inválido</strong>',
                `Ruta: ${escaparHtml(resultado.path || backupSeleccionadoPath)}`,
                `Detalle: ${escaparHtml(mensajeError)}`
            ].join('<br>'),
            'error'
        );
        mostrarNotificacion(`❌ Backup inválido: ${mensajeError}`, true);
    } catch (error) {
        console.error('Error validando backup seleccionado:', error);
        setRestoreStatus(
            `<strong>❌ Error validando backup</strong><br>${escaparHtml(error.message)}`,
            'error'
        );
        mostrarNotificacion(`❌ Error validando backup: ${error.message}`, true);
    } finally {
        setBtnLoading(btnValidar, false);
    }
}

async function restaurarBackupSeleccionado() {
    if (!backupSeleccionadoPath) {
        mostrarNotificacion('❌ Seleccione primero un backup .db', true);
        return;
    }

    const confirmacion = await confirmarAccionAsync({
        titulo: 'Confirmar restauración de backup',
        mensaje:
            `⚠️ Restaurarás la base actual desde este backup:\n\n${backupSeleccionadoPath}\n\n` +
            'Se creará un snapshot previo y se intentará rollback automático si hay error.\n\n¿Continuar?',
        confirmarTexto: 'Restaurar',
        peligro: true
    });
    if (!confirmacion) {
        return;
    }

    const btnRestore = document.querySelector('[onclick="restaurarBackupSeleccionado()"]');
    setBtnLoading(btnRestore, true);
    try {
        setRestoreStatus('⏳ Restaurando backup, por favor espere...', 'warning');
        const resultado = await window.electronAPI.backupRestaurarDB(backupSeleccionadoPath);
        await refrescarChecklistActualizacion();

        if (resultado.success) {
            const warningHtml = resultado.warning
                ? `<br>Advertencia: ${escaparHtml(resultado.warning)}`
                : '';
            setRestoreStatus(
                [
                    '<strong>✅ Restauración completada</strong>',
                    `Backup aplicado: ${escaparHtml(resultado.restoredPath || backupSeleccionadoPath)}`,
                    `Rollback usado: ${resultado.rollbackUsed ? 'Sí' : 'No'}${warningHtml}`
                ].join('<br>'),
                'success'
            );
            mostrarNotificacion('✅ Base de datos restaurada correctamente');

            if (typeof actualizarInventario === 'function') {
                await actualizarInventario();
            }
            if (typeof buscarArticulos === 'function') {
                const campoBuscar = document.getElementById('campoBuscar');
                if (campoBuscar && campoBuscar.value.trim()) {
                    await buscarArticulos();
                }
            }
            return;
        }

        const warningHtml = resultado.warning
            ? `<br>Advertencia: ${escaparHtml(resultado.warning)}`
            : '';
        setRestoreStatus(
            [
                '<strong>❌ Restauración fallida</strong>',
                `Detalle: ${escaparHtml(resultado.error || 'Error desconocido')}`,
                `Rollback usado: ${resultado.rollbackUsed ? 'Sí' : 'No'}${warningHtml}`
            ].join('<br>'),
            'error'
        );
        mostrarNotificacion(`❌ Error restaurando backup: ${resultado.error}`, true);
    } catch (error) {
        console.error('Error restaurando backup seleccionado:', error);
        setRestoreStatus(
            `<strong>❌ Error restaurando backup</strong><br>${escaparHtml(error.message)}`,
            'error'
        );
        mostrarNotificacion(`❌ Error restaurando backup: ${error.message}`, true);
    } finally {
        setBtnLoading(btnRestore, false);
    }
}

async function verificarDropbox() {
    const statusElement = document.getElementById('dropboxStatus');
    const configSection = document.getElementById('dropboxConfig');
    const actionsElement = document.getElementById('dropboxActions');

    if (!statusElement) {
        return;
    }

    try {
        statusElement.innerHTML = '<span>🔄 Verificando conexión...</span>';

        const configurado = await window.electronAPI.dropboxEstaConfigurado();

        if (configurado) {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout local')), 8000)
            );

            const verifyPromise = window.electronAPI.dropboxVerificar();

            const info = await Promise.race([verifyPromise, timeoutPromise]);

            if (info.success) {
                statusElement.innerHTML = `
                    <span class="status-connected">✅ Conectado</span>
                    <span>Usuario: ${escaparHtml(info.usuario)}</span>
                `;
                if (configSection) configSection.style.display = 'none';
                if (actionsElement) actionsElement.style.display = 'block';
            } else {
                const avisoReconexion = info.tokenHeredado
                    ? '<br><small>La conexión antigua por token ya no es válida: vuelve a conectar con los pasos de abajo.</small>'
                    : '';
                statusElement.innerHTML = `<span class="status-disconnected">❌ ${escaparHtml(info.error)}</span>${avisoReconexion}`;
                if (configSection) configSection.style.display = 'block';
                if (actionsElement) actionsElement.style.display = 'none';
            }
        } else {
            statusElement.innerHTML = `<span class="status-disconnected">❌ No conectado</span>`;
            if (configSection) configSection.style.display = 'block';
            if (actionsElement) actionsElement.style.display = 'none';
        }
    } catch (error) {
        console.error('Error al verificar Dropbox:', error);

        if (error.message === 'Timeout local') {
            statusElement.innerHTML = '<span class="status-disconnected">❌ Timeout: Verifica tu conexión a internet</span>';
        } else {
            statusElement.innerHTML = `<span class="status-disconnected">❌ Error: ${escaparHtml(error.message)}</span>`;
        }

        if (configSection) configSection.style.display = 'block';
        if (actionsElement) actionsElement.style.display = 'none';
    }

    await refrescarChecklistActualizacion();
}

async function iniciarAutorizacionDropbox() {
    const btn = document.querySelector('[onclick="iniciarAutorizacionDropbox()"]');
    setBtnLoading(btn, true);
    try {
        const appKeyInput = document.getElementById('dropboxAppKey');
        const appKey = appKeyInput ? appKeyInput.value.trim() : '';
        if (!appKey) {
            mostrarNotificacion('❌ Pega el App key de tu app de Dropbox', true);
            return;
        }

        const resultado = await window.electronAPI.dropboxIniciarAutorizacion(appKey);
        if (!resultado || !resultado.success) {
            mostrarNotificacion('❌ No se pudo iniciar la autorización: ' + (resultado && resultado.error || 'Error desconocido'), true);
            return;
        }

        const pasoCodigo = document.getElementById('dropboxPasoCodigo');
        if (pasoCodigo) pasoCodigo.style.display = 'block';
        const codigoInput = document.getElementById('dropboxAuthCode');
        if (codigoInput) {
            codigoInput.value = '';
            codigoInput.focus();
        }
        if (resultado.abierta === false) {
            mostrarNotificacion('⚠️ No se pudo abrir el navegador automáticamente', true);
        } else {
            mostrarNotificacion('🌐 Autoriza en Dropbox y pega el código aquí');
        }
    } catch (error) {
        console.error('Error iniciando autorización de Dropbox:', error);
        mostrarNotificacion('❌ Error inesperado al iniciar la autorización de Dropbox', true);
    } finally {
        setBtnLoading(btn, false);
    }
}

async function completarAutorizacionDropbox() {
    const btn = document.querySelector('[onclick="completarAutorizacionDropbox()"]');
    setBtnLoading(btn, true);
    try {
        const codigoInput = document.getElementById('dropboxAuthCode');
        const codigo = codigoInput ? codigoInput.value.trim() : '';
        if (!codigo) {
            mostrarNotificacion('❌ Pega el código que te mostró Dropbox', true);
            return;
        }

        const resultado = await window.electronAPI.dropboxCompletarAutorizacion(codigo);
        if (!resultado || !resultado.success) {
            mostrarNotificacion('❌ Error al conectar Dropbox: ' + (resultado && resultado.error || 'Error desconocido'), true);
            return;
        }

        if (resultado.warning) {
            mostrarNotificacion(`⚠️ ${resultado.warning}`, true);
        } else {
            mostrarNotificacion(`✅ Dropbox conectado. Usuario: ${resultado.usuario}`);
        }
        if (codigoInput) codigoInput.value = '';
        const pasoCodigo = document.getElementById('dropboxPasoCodigo');
        if (pasoCodigo) pasoCodigo.style.display = 'none';
        await verificarDropbox();
    } catch (error) {
        console.error('Error completando autorización de Dropbox:', error);
        mostrarNotificacion('❌ Error inesperado al conectar Dropbox', true);
    } finally {
        setBtnLoading(btn, false);
    }
}

async function desconectarDropbox() {
    const confirmado = await confirmarAccionAsync({
        titulo: 'Confirmar desconexión',
        mensaje: '¿Desea desconectar Dropbox?',
        confirmarTexto: 'Desconectar',
        peligro: false
    });
    if (confirmado) {
        await window.electronAPI.dropboxDesconectar();
        mostrarNotificacion('✅ Dropbox desconectado');
        await verificarDropbox();
        await refrescarChecklistActualizacion();
    }
}

async function listarBackupsDropbox() {
    try {
        const resultado = await window.electronAPI.dropboxListarBackups();

        if (resultado && resultado.success) {
            const lista = document.getElementById('dropboxBackupsList');

            if (resultado.archivos.length === 0) {
                lista.innerHTML = '<p>No hay backups en Dropbox aún.</p>';
            } else {
                let html = '<h4>Archivos en Dropbox:</h4><ul>';
                resultado.archivos.forEach(archivo => {
                    const fechaArchivo = formatearFechaChile(archivo.client_modified, { fallback: 'N/A' });
                    html += `<li>${escaparHtml(archivo.name)} (${escaparHtml(fechaArchivo)})</li>`;
                });
                html += '</ul>';
                lista.innerHTML = html;
            }
        } else {
            mostrarNotificacion('❌ Error al listar backups: ' + (resultado && resultado.error || 'Error desconocido'), true);
        }
    } catch (error) {
        console.error('Error listando backups de Dropbox:', error);
        mostrarNotificacion('❌ Error al listar backups de Dropbox', true);
    }
}

async function subirBackupDropboxAhora() {
    const confirmado = await confirmarAccionAsync({
        titulo: 'Confirmar backup inmediato',
        mensaje: '¿Deseas crear un backup y subirlo a Dropbox inmediatamente?',
        confirmarTexto: 'Crear y subir',
        peligro: false
    });
    if (confirmado) {
        try {
            mostrarNotificacion('⏳ Creando y subiendo backup...', false);

            const resultado = await window.electronAPI.dropboxSubirBackupAhora();

            if (resultado && resultado.success) {
                mostrarNotificacion('✅ ' + resultado.mensaje);
                await refrescarChecklistActualizacion();
            } else {
                mostrarNotificacion('❌ Error: ' + (resultado && resultado.error || 'Error desconocido'), true);
            }
        } catch (error) {
            console.error('Error subiendo backup a Dropbox:', error);
            mostrarNotificacion('❌ Error subiendo backup a Dropbox', true);
        }
    }
}
