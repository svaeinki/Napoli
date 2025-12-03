// ============================================
// VARIABLES GLOBALES
// ============================================
let articulosFiltrados = [];

// ============================================
// INICIALIZACIÓN
// ============================================
window.onload = async function() {
    console.log('🚀 Aplicación iniciada');
    await actualizarInventario();
    await verificarDropbox();
};

// ============================================
// UTILIDADES
// ============================================
function mostrarNotificacion(mensaje, esError = false) {
    const notif = document.getElementById('notification');
    notif.textContent = mensaje;
    notif.className = 'notification' + (esError ? ' error' : '');
    notif.style.display = 'block';
    
    setTimeout(() => {
        notif.style.display = 'none';
    }, 3000);
}

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    
    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');

    if (tabName === 'inventario') {
        actualizarInventario();
    } else if (tabName === 'backup') {
        verificarDropbox();
    }
}

function formatearMoneda(valor) {
    return new Intl.NumberFormat('es-CL').format(valor || 0);
}

// ============================================
// ARTÍCULOS - CRUD
// ============================================
async function ingresarArticulo(e) {
    e.preventDefault();

    const valorTotal = parseFloat(document.getElementById('valorTotal').value) || 0;

    const nuevoArticulo = {
        rut: document.getElementById('rut').value.trim(),
        nombreCliente: document.getElementById('nombreCliente').value.trim(),
        telefono: document.getElementById('telefono').value.trim(),
        tipoArticulo: document.getElementById('tipoArticulo').value,
        descripcion: document.getElementById('descripcion').value.trim(),
        numeroBodega: document.getElementById('numeroBodega').value.trim().toUpperCase(),
        observaciones: document.getElementById('observaciones').value.trim(),
        fechaIngreso: new Date().toLocaleString('es-CL'),
        valorTotal: valorTotal
    };

    const resultado = await window.electronAPI.insertarArticulo(nuevoArticulo);

    if (resultado.success) {
        document.getElementById('formIngresar').reset();
        mostrarNotificacion('✅ Artículo ingresado correctamente. Imprimiendo ticket...');
        
        const articuloCompleto = await window.electronAPI.obtenerPorId(resultado.id);
        generarTicket(articuloCompleto);
        
        setTimeout(() => {
            window.electronAPI.imprimir();
        }, 500);
        
        await actualizarInventario();
    } else {
        mostrarNotificacion('❌ ' + resultado.error, true);
    }
}

async function marcarEntregado(id) {
    const articulo = await window.electronAPI.obtenerPorId(id);
    if (articulo && confirm(`¿Entregar el artículo "${articulo.descripcion}" a ${articulo.nombreCliente}?`)) {
        const resultado = await window.electronAPI.actualizarEstado(id, 'Entregado');
        if (resultado.success) {
            await actualizarInventario();
            mostrarNotificacion('✅ Artículo marcado como entregado');
        }
    }
}

async function marcarEnBodega(id) {
    if (confirm(`¿Devolver el artículo a bodega?`)) {
        const resultado = await window.electronAPI.actualizarEstado(id, 'En Bodega');
        if (resultado.success) {
            await actualizarInventario();
            mostrarNotificacion('↩ Artículo devuelto a bodega');
        }
    }
}

async function eliminarArticulo(id) {
    const articulo = await window.electronAPI.obtenerPorId(id);
    if (articulo && confirm(`¿Está seguro de eliminar el artículo "${articulo.descripcion}"?\n\nEsta acción no se puede deshacer.`)) {
        const resultado = await window.electronAPI.eliminar(id);
        if (resultado.success) {
            await actualizarInventario();
            await buscarArticulos();
            mostrarNotificacion('🗑️ Artículo eliminado');
        }
    }
}

// ============================================
// TICKETS
// ============================================
function generarTicket(articulo) {
    const contenido = `
        <p><strong>Ticket N°:</strong> ${String(articulo.id).padStart(4, '0')}</p>
        <p><strong>Fecha:</strong> ${articulo.fechaIngreso}</p>
        <p style="margin-top: 10px;"><strong>Cliente:</strong> ${articulo.nombreCliente}</p>
        <p><strong>RUT:</strong> ${articulo.rut}</p>
        <p><strong>Teléfono:</strong> ${articulo.telefono || 'No registrado'}</p>
        <p style="margin-top: 10px;"><strong>Tipo:</strong> ${articulo.tipoArticulo}</p>
        <p><strong>Descripción:</strong> ${articulo.descripcion}</p>
        <p style="margin-top: 10px; font-size: 18px;"><strong>Bodega:</strong> <span style="background: #ffc107; padding: 5px 10px; border-radius: 5px;">${articulo.numeroBodega}</span></p>
        ${articulo.observaciones ? `<p><strong>Obs:</strong> ${articulo.observaciones}</p>` : ''}
        ${articulo.valorTotal > 0 ? `
            <p style="margin-top: 15px; padding-top: 15px; border-top: 2px dashed #000;">
                <strong>VALOR TOTAL:</strong> $${formatearMoneda(articulo.valorTotal)}<br>
                <strong>ABONADO:</strong> $${formatearMoneda(articulo.totalAbonado)}<br>
                <strong style="font-size: 16px;">SALDO:</strong> <strong style="font-size: 18px; color: #f44336;">$${formatearMoneda(articulo.saldoPendiente)}</strong>
            </p>
        ` : ''}
    `;
    
    document.getElementById('ticketContenido').innerHTML = contenido;
    document.getElementById('ticket').style.display = 'block';
}

async function reimprimirTicket(id) {
    const articulo = await window.electronAPI.obtenerPorId(id);
    if (articulo) {
        generarTicket(articulo);
        window.electronAPI.imprimir();
    }
}

// ============================================
// INVENTARIO
// ============================================
async function actualizarInventario() {
    const stats = await window.electronAPI.obtenerEstadisticas();
    
    document.getElementById('totalArticulos').textContent = stats.total;
    document.getElementById('enBodega').textContent = stats.enBodega;
    document.getElementById('entregados').textContent = stats.entregados;

    await aplicarFiltro();
}

async function aplicarFiltro() {
    const filtro = document.getElementById('filtroEstado').value;
    const todosArticulos = await window.electronAPI.obtenerTodos();

    if (filtro === 'bodega') {
        articulosFiltrados = todosArticulos.filter(a => a.estado === 'En Bodega');
    } else if (filtro === 'entregados') {
        articulosFiltrados = todosArticulos.filter(a => a.estado === 'Entregado');
    } else {
        articulosFiltrados = todosArticulos;
    }

    mostrarTabla(articulosFiltrados, 'tablaInventario');
}

function mostrarTabla(datos, elementoId) {
    const elemento = document.getElementById(elementoId);
    
    if (datos.length === 0) {
        elemento.innerHTML = '<p style="text-align: center; padding: 40px; color: #999;">No hay artículos para mostrar.</p>';
        return;
    }

    let html = `
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>RUT</th>
                    <th>Cliente</th>
                    <th>Tipo</th>
                    <th>Descripción</th>
                    <th>N° Bodega</th>
                    <th>Fecha Ingreso</th>
                    <th>Estado</th>
                    <th>Estado Pago</th>
                    <th>Saldo</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
    `;

    datos.forEach(art => {
        html += `
            <tr>
                <td><strong>${String(art.id).padStart(4, '0')}</strong></td>
                <td>${art.rut}</td>
                <td>${art.nombreCliente}</td>
                <td>${art.tipoArticulo}</td>
                <td><small>${art.descripcion}</small></td>
                <td><strong style="color: #667eea;">${art.numeroBodega}</strong></td>
                <td><small>${art.fechaIngreso}</small></td>
                <td><span class="status-badge ${art.estado === 'En Bodega' ? 'status-bodega' : 'status-entregado'}">${art.estado}</span></td>
                <td><span class="estado-pago-badge estado-pago-${art.estadoPago.toLowerCase().replace(' ', '')}">${art.estadoPago}</span></td>
                <td><strong style="color: ${art.saldoPendiente > 0 ? '#f44336' : '#4caf50'};">$${formatearMoneda(art.saldoPendiente)}</strong></td>
                <td class="action-buttons">
                    ${art.estado === 'En Bodega' ? 
                        `<button class="btn btn-success btn-small" onclick="marcarEntregado(${art.id})">✓ Entregar</button>` : 
                        `<button class="btn btn-warning btn-small" onclick="marcarEnBodega(${art.id})">↩ Devolver</button>`
                    }
                    <button class="btn btn-info btn-small" onclick="mostrarModalPago(${art.id})">💰 Pagos</button>
                    <button class="btn btn-primary btn-small" onclick="reimprimirTicket(${art.id})">🖨</button>
                    <button class="btn btn-danger btn-small" onclick="eliminarArticulo(${art.id})">🗑</button>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    elemento.innerHTML = html;
}

// ============================================
// BÚSQUEDA
// ============================================
async function buscarArticulos() {
    const termino = document.getElementById('campoBuscar').value.trim();
    
    if (termino === '') {
        document.getElementById('resultadosBusqueda').innerHTML = '<p style="text-align: center; padding: 40px; color: #999;">Ingrese un término de búsqueda...</p>';
        return;
    }

    const resultados = await window.electronAPI.buscar(termino);

    if (resultados.length === 0) {
        document.getElementById('resultadosBusqueda').innerHTML = '<p style="text-align: center; padding: 40px; color: #999;">No se encontraron resultados.</p>';
    } else {
        mostrarTabla(resultados, 'resultadosBusqueda');
    }
}

// ============================================
// EXPORTAR / IMPORTAR
// ============================================
async function exportarDatos() {
    const articulos = await window.electronAPI.obtenerTodos();
    
    if (articulos.length === 0) {
        mostrarNotificacion('No hay datos para exportar', true);
        return;
    }

    let csv = 'ID,RUT,Cliente,Teléfono,Tipo,Descripción,Bodega,Fecha Ingreso,Estado,Fecha Entrega,Observaciones,Valor Total,Total Abonado,Saldo Pendiente,Estado Pago\n';
    
    articulos.forEach(art => {
        csv += `${art.id},"${art.rut}","${art.nombreCliente}","${art.telefono || ''}","${art.tipoArticulo}","${art.descripcion}","${art.numeroBodega}","${art.fechaIngreso}","${art.estado}","${art.fechaEntrega || ''}","${art.observaciones || ''}",${art.valorTotal},${art.totalAbonado},${art.saldoPendiente},"${art.estadoPago}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `inventario_zapateria_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    mostrarNotificacion('📥 Datos exportados correctamente');
}

async function migrarDesdeLocalStorage() {
    const datosAntiguos = localStorage.getItem('articulosZapateria');
    
    if (!datosAntiguos) {
        mostrarNotificacion('❌ No se encontraron datos antiguos en LocalStorage', true);
        return;
    }

    if (confirm('⚠️ ¿Desea migrar los datos desde LocalStorage a SQLite?\n\nEsto importará todos los artículos antiguos.')) {
        const resultado = await window.electronAPI.migrarDesdeLocalStorage(datosAntiguos);
        
        if (resultado.success) {
            mostrarNotificacion(`✅ Migrados ${resultado.total} artículos correctamente`);
            localStorage.removeItem('articulosZapateria');
            await actualizarInventario();
        } else {
            mostrarNotificacion('❌ Error en migración: ' + resultado.error, true);
        }
    }
}

// ============================================
// BACKUPS
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

// ============================================
// DROPBOX
// ============================================
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
        // Mostrar estado de carga
        statusElement.innerHTML = '<span>🔄 Verificando conexión...</span>';
        
        console.log('📡 Consultando si Dropbox está configurado...');
        const configurado = await window.electronAPI.dropboxEstaConfigurado();
        console.log('📊 Resultado configurado:', configurado);
        
        if (configurado) {
            console.log('✅ Dropbox configurado, verificando conexión...');
            
            // Timeout local adicional de 8 segundos
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

// ============================================
// PAGOS Y ABONOS
// ============================================
async function mostrarModalPago(id) {
    const articulo = await window.electronAPI.obtenerPorId(id);
    if (!articulo) return;

    const modal = document.getElementById('modalPago');
    const modalTitle = document.getElementById('modalPagoTitle');
    const pagoInfo = document.getElementById('pagoInfoModal');
    
    modalTitle.textContent = `Pagos - ${articulo.numeroBodega} - ${articulo.nombreCliente}`;
    
    // Mostrar información de pago
    const claseEstado = articulo.saldoPendiente > 0 ? 'warning' : '';
    pagoInfo.innerHTML = `
        <div class="pago-info ${claseEstado}">
            <div class="pago-grid">
                <div class="pago-item">
                    <label>Valor Total</label>
                    <div class="valor">$${formatearMoneda(articulo.valorTotal)}</div>
                </div>
                <div class="pago-item">
                    <label>Total Abonado</label>
                    <div class="valor">${formatearMoneda(articulo.totalAbonado)}</div>
                </div>
                <div class="pago-item">
                    <label>Saldo Pendiente</label>
                    <div class="valor ${articulo.saldoPendiente > 0 ? 'pendiente' : 'pagado'}">$${formatearMoneda(articulo.saldoPendiente)}</div>
                </div>
            </div>
            <div style="text-align: center; margin-top: 15px;">
                <span class="estado-pago-badge estado-pago-${articulo.estadoPago.toLowerCase().replace(' ', '')}">${articulo.estadoPago}</span>
            </div>
        </div>
    `;

    // Cargar historial de abonos
    const abonos = await window.electronAPI.pagoObtenerAbonos(id);
    const abonosList = document.getElementById('abonosList');
    
    if (abonos.length === 0) {
        abonosList.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No hay abonos registrados</p>';
    } else {
        let html = '';
        abonos.forEach(abono => {
            html += `
                <div class="abono-item">
                    <div class="abono-header">
                        <span class="abono-monto">$${formatearMoneda(abono.monto)}</span>
                        <span class="abono-fecha">${new Date(abono.fecha).toLocaleString('es-CL')}</span>
                    </div>
                    <div class="abono-metodo">💳 ${abono.metodoPago}</div>
                    ${abono.observaciones ? `<div style="font-size: 12px; color: #666; margin-top: 5px;">📝 ${abono.observaciones}</div>` : ''}
                </div>
            `;
        });
        abonosList.innerHTML = html;
    }

    // Guardar ID en el modal para usarlo después
    modal.dataset.articuloId = id;
    modal.style.display = 'block';
}

async function registrarNuevoAbono() {
    const modal = document.getElementById('modalPago');
    const articuloId = parseInt(modal.dataset.articuloId);
    
    const monto = parseFloat(document.getElementById('montoAbono').value);
    const metodoPago = document.getElementById('metodoPago').value;
    const observaciones = document.getElementById('observacionesAbono').value.trim();

    if (!monto || monto <= 0) {
        mostrarNotificacion('❌ Ingrese un monto válido', true);
        return;
    }

    const resultado = await window.electronAPI.pagoRegistrarAbono(articuloId, monto, metodoPago, observaciones);

    if (resultado.success) {
        mostrarNotificacion('✅ Abono registrado correctamente');
        document.getElementById('montoAbono').value = '';
        document.getElementById('observacionesAbono').value = '';
        
        // Recargar modal
        await mostrarModalPago(articuloId);
        await actualizarInventario();
    } else {
        mostrarNotificacion('❌ Error al registrar abono: ' + resultado.error, true);
    }
}

async function actualizarValorServicio() {
    const modal = document.getElementById('modalPago');
    const articuloId = parseInt(modal.dataset.articuloId);
    
    const nuevoValor = parseFloat(document.getElementById('nuevoValorTotal').value);

    if (!nuevoValor || nuevoValor < 0) {
        mostrarNotificacion('❌ Ingrese un valor válido', true);
        return;
    }

    if (confirm(`¿Está seguro de actualizar el valor total a $${formatearMoneda(nuevoValor)}?`)) {
        const resultado = await window.electronAPI.pagoActualizarValor(articuloId, nuevoValor);

        if (resultado.success) {
            mostrarNotificacion('✅ Valor actualizado correctamente');
            document.getElementById('nuevoValorTotal').value = '';
            
            // Recargar modal
            await mostrarModalPago(articuloId);
            await actualizarInventario();
        } else {
            mostrarNotificacion('❌ Error al actualizar valor: ' + resultado.error, true);
        }
    }
}

function cerrarModalPago() {
    document.getElementById('modalPago').style.display = 'none';
}

// Cerrar modal al hacer click fuera
window.onclick = function(event) {
    const modal = document.getElementById('modalPago');
    if (event.target === modal) {
        cerrarModalPago();
    }
}