// ============================================
// SISTEMA DE PAGOS Y ABONOS
// ============================================

async function mostrarModalPago(id) {
    try {
    const articulo = await window.electronAPI.obtenerPorId(id);
    if (!articulo) return;

    const modal = document.getElementById('modalPago');
    const modalTitle = document.getElementById('modalPagoTitle');
    const pagoInfo = document.getElementById('pagoInfoModal');
    if (!modal || !modalTitle || !pagoInfo) {
        throw new Error('Modal de pagos no está disponible en el DOM');
    }
    
    const numeroBodega = (typeof articulo.numeroBodega === 'string' && articulo.numeroBodega.trim())
        ? articulo.numeroBodega
        : 'Sin ubicación';
    const estadoPago = (typeof articulo.estadoPago === 'string' && articulo.estadoPago.trim())
        ? articulo.estadoPago
        : 'Sin pago';
    const estadoPagoClase = estadoPago.toLowerCase().replace(/\s+/g, '');
    modalTitle.textContent = `Pagos - ${numeroBodega} - ${articulo.nombreCliente}`;
    
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
                <span class="estado-pago-badge estado-pago-${estadoPagoClase}">${escaparHtml(estadoPago)}</span>
            </div>
        </div>
    `;

    // Cargar historial de abonos
    const abonos = await window.electronAPI.pagoObtenerAbonos(id);
    const abonosList = document.getElementById('abonosList');
    if (!abonosList) {
        throw new Error('No se encontró el contenedor de historial de abonos');
    }
    
    if (abonos.length === 0) {
        abonosList.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">No hay abonos registrados</p>';
    } else {
        let html = '';
        abonos.forEach(abono => {
            html += `
                <div class="abono-item">
                    <div class="abono-header">
                        <span class="abono-monto">$${formatearMoneda(abono.monto)}</span>
                        <span class="abono-fecha">${new Date(abono.fecha).toLocaleString('es-CL')}</span>
                    </div>
                    <div class="abono-metodo">💳 ${escaparHtml(abono.metodoPago)}</div>
                    ${abono.observaciones ? `<div style="font-size: 12px; color: var(--text-muted); margin-top: 5px;">📝 ${escaparHtml(abono.observaciones)}</div>` : ''}
                </div>
            `;
        });
        abonosList.innerHTML = html;
    }

    // Guardar ID en el modal para usarlo después
    modal.dataset.articuloId = id;
    modal.style.display = 'block';
    } catch (error) {
        console.error('Error mostrando modal de pago:', error);
        mostrarNotificacion('❌ Error al cargar información de pagos', true);
    }
}

async function registrarNuevoAbono() {
    try {
        const modal = document.getElementById('modalPago');
        const articuloId = parseInt(modal.dataset.articuloId, 10);
        const monto = obtenerValorNumerico(document.getElementById('montoAbono'));
        const metodoPago = document.getElementById('metodoPago').value;
        const observaciones = document.getElementById('observacionesAbono').value.trim();

        if (!Number.isInteger(articuloId) || articuloId <= 0) {
            mostrarNotificacion('❌ No se encontró el artículo para registrar el abono', true);
            return;
        }

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
    } catch (error) {
        console.error('Error registrando abono:', error);
        mostrarNotificacion('❌ Error al registrar abono', true);
    }
}

async function actualizarValorServicio() {
    try {
        const modal = document.getElementById('modalPago');
        const articuloId = parseInt(modal.dataset.articuloId, 10);
        const nuevoValor = obtenerValorNumerico(document.getElementById('nuevoValorTotal'));

        if (!Number.isInteger(articuloId) || articuloId <= 0) {
            mostrarNotificacion('❌ No se encontró el artículo para actualizar el valor', true);
            return;
        }

        if (nuevoValor < 0) {
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
    } catch (error) {
        console.error('Error actualizando valor del servicio:', error);
        mostrarNotificacion('❌ Error al actualizar valor', true);
    }
}

function cerrarModalPago() {
    document.getElementById('modalPago').style.display = 'none';
}

// Cerrar modal al hacer click fuera
window.addEventListener('click', function(event) {
    const modal = document.getElementById('modalPago');
    if (event.target === modal) {
        cerrarModalPago();
    }
});
