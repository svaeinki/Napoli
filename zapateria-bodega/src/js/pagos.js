// ============================================
// SISTEMA DE PAGOS Y ABONOS
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
    
    const monto = obtenerValorNumerico(document.getElementById('montoAbono'));
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
    
    const nuevoValor = obtenerValorNumerico(document.getElementById('nuevoValorTotal'));

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