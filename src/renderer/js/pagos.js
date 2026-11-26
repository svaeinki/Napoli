// ============================================
// SISTEMA DE PAGOS Y ABONOS
// ============================================

async function mostrarModalPago(id) {
    try {
    const articulo = exigirLecturaIpc(await window.electronAPI.obtenerPorId(id));
    if (!articulo) return;

    const modal = document.getElementById('modalPago');
    const modalTitle = document.getElementById('modalPagoTitle');
    const pagoInfo = document.getElementById('pagoInfoModal');
    const modalContent = modal ? modal.querySelector('.modal-content-pagos') : null;
    if (!modal || !modalTitle || !pagoInfo) {
        throw new Error('Modal de pagos no está disponible en el DOM');
    }
    
    const numeroBodega = (typeof articulo.numeroBodega === 'string' && articulo.numeroBodega.trim())
        ? articulo.numeroBodega
        : 'Sin ubicación';
    const estadoPago = (typeof articulo.estadoPago === 'string' && articulo.estadoPago.trim())
        ? articulo.estadoPago
        : 'Sin pago';
    const estadoPagoClase = obtenerClaseEstadoPago(estadoPago);
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
                    <div class="valor">$${formatearMoneda(articulo.totalAbonado)}</div>
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
    const abonos = exigirListaIpc(await window.electronAPI.pagoObtenerAbonos(id));
    const abonosList = document.getElementById('abonosList');
    if (!abonosList) {
        throw new Error('No se encontró el contenedor de historial de abonos');
    }
    
    if (abonos.length === 0) {
        abonosList.innerHTML = '<p class="abonos-empty">No hay abonos registrados</p>';
    } else {
        let html = '';
        abonos.forEach(abono => {
            const fechaAbono = formatearFechaChile(abono.fecha);
            html += `
                <div class="abono-item">
                    <div class="abono-header">
                        <span class="abono-monto">$${formatearMoneda(abono.monto)}</span>
                        <span class="abono-fecha">${escaparHtml(fechaAbono)}</span>
                    </div>
                    <div class="abono-metodo">💳 ${escaparHtml(abono.metodoPago)}</div>
                    ${abono.observaciones ? `<div style="font-size: 12px; color: var(--text-muted); margin-top: 5px;">📝 ${escaparHtml(abono.observaciones)}</div>` : ''}
                </div>
            `;
        });
        abonosList.innerHTML = html;
    }

    // Guardar ID y saldo en el modal para usarlos después
    modal.dataset.articuloId = id;
    modal.dataset.saldoPendiente = articulo.saldoPendiente;
    modal.scrollTop = 0;
    if (modalContent) {
        modalContent.scrollTop = 0;
    }

    if (modalPagoAbortController) {
        modalPagoAbortController.abort();
    }
    modalPagoAbortController = new AbortController();
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            cerrarModalPago();
        }
    }, { signal: modalPagoAbortController.signal });

    modal.style.display = 'block';
    activarFocusTrap(modalContent, modalPagoAbortController.signal);
    } catch (error) {
        console.error('Error mostrando modal de pago:', error);
        mostrarNotificacion(`❌ Error al cargar información de pagos: ${error.message}`, true);
    }
}

async function registrarNuevoAbono() {
    const btnRegistrar = document.querySelector('#modalPago .btn-success[onclick*="registrarNuevoAbono"]');
    setBtnLoading(btnRegistrar, true);

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

        const saldoPendiente = Number(modal.dataset.saldoPendiente);
        if (Number.isFinite(saldoPendiente) && saldoPendiente <= 0) {
            mostrarNotificacion('❌ Este artículo no tiene saldo pendiente', true);
            return;
        }
        if (Number.isFinite(saldoPendiente) && monto > saldoPendiente) {
            mostrarNotificacion(`❌ El monto no puede superar el saldo pendiente ($${formatearMoneda(saldoPendiente)})`, true);
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
        mostrarNotificacion(`❌ Error al registrar abono: ${error.message}`, true);
    } finally {
        setBtnLoading(btnRegistrar, false);
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

        if (nuevoValor <= 0) {
            mostrarNotificacion('❌ Ingrese un valor válido mayor a cero', true);
            return;
        }

        const confirmado = await confirmarAccionAsync({
            titulo: 'Confirmar actualización de valor',
            mensaje: `¿Está seguro de actualizar el valor total a $${formatearMoneda(nuevoValor)}?`,
            confirmarTexto: 'Actualizar valor',
            peligro: false
        });
        if (confirmado) {
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
        mostrarNotificacion(`❌ Error al actualizar valor: ${error.message}`, true);
    }
}

let modalPagoAbortController = null;

function cerrarModalPago() {
    if (modalPagoAbortController) {
        modalPagoAbortController.abort();
        modalPagoAbortController = null;
    }
    const modal = document.getElementById('modalPago');
    if (modal) modal.style.display = 'none';
}
