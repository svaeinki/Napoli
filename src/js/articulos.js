// ============================================
// GESTIÓN DE ARTÍCULOS
// ============================================

async function imprimirTicketConConfigActual() {
    const config = (window.Tickets && window.Tickets.config) ? window.Tickets.config : {};
    const width = config.width === '80mm' ? '80mm' : '58mm';
    const verticalShiftRaw = Number(config.verticalShift58mm);
    const verticalShiftMm = width === '58mm' && Number.isFinite(verticalShiftRaw)
        ? verticalShiftRaw
        : 0;
    const resultado = await window.electronAPI.imprimir({ width, verticalShiftMm });
    if (!resultado || !resultado.success) {
        const mensaje = resultado && resultado.error
            ? resultado.error
            : 'No se pudo enviar el ticket a la impresora';
        mostrarNotificacion(`❌ Error imprimiendo ticket: ${mensaje}`, true);
        return false;
    }
    return true;
}

async function ingresarArticulo(e) {
    e.preventDefault();

    try {
    const rutInput = document.getElementById('rut').value.trim();

    // Validar RUT
    if (!validarRUT(rutInput)) {
        mostrarNotificacion('❌ RUT inválido. Por favor verifica el RUT ingresado.', true);
        document.getElementById('rut').focus();
        return;
    }

    // Obtener valores numéricos sin formato
    const valorTotal = obtenerValorNumerico(document.getElementById('valorTotal'));
    const abonoInicial = obtenerValorNumerico(document.getElementById('abonoInicial'));

    // Validar que el abono no sea mayor al valor total
    if (abonoInicial > 0 && valorTotal === 0) {
        mostrarNotificacion('❌ No puedes registrar un abono sin un valor total del servicio.', true);
        return;
    }

    if (abonoInicial > valorTotal) {
        mostrarNotificacion('❌ El abono inicial no puede ser mayor al valor total.', true);
        return;
    }

    const numeroBodegaInput = document.getElementById('numeroBodega').value.trim();

    const nuevoArticulo = {
        rut: formatearRUT(rutInput),
        nombreCliente: document.getElementById('nombreCliente').value.trim(),
        telefono: document.getElementById('telefono').value.trim(),
        tipoArticulo: document.getElementById('tipoArticulo').value,
        descripcion: document.getElementById('descripcion').value.trim(),
        numeroBodega: numeroBodegaInput ? numeroBodegaInput.toUpperCase() : null,
        observaciones: document.getElementById('observaciones').value.trim(),
        fechaIngreso: new Date().toISOString(),
        valorTotal: valorTotal,
        abonoInicial: abonoInicial,
        metodoPagoInicial: document.getElementById('metodoPagoInicial').value,
        observacionesAbonoInicial: 'Abono inicial al ingresar'
    };

    const resultado = await window.electronAPI.insertarArticulo(nuevoArticulo);

    if (resultado.success) {
        const articuloId = resultado.id;

        // Obtener artículo completo con abonos actualizados
        let articuloCompleto = null;
        try {
            articuloCompleto = await window.electronAPI.obtenerPorId(articuloId);
        } catch (errorDetalle) {
            console.warn('No se pudo recargar artículo recién insertado, se usará snapshot local:', errorDetalle);
        }
        if (!articuloCompleto) {
            articuloCompleto = {
                ...nuevoArticulo,
                id: articuloId,
                totalAbonado: abonoInicial,
                saldoPendiente: Math.max(0, valorTotal - abonoInicial),
                estadoPago: abonoInicial >= valorTotal && valorTotal > 0
                    ? 'Pagado'
                    : (abonoInicial > 0 ? 'Abonado' : 'Sin pago')
            };
        }

        document.getElementById('formIngresar').reset();
        mostrarNotificacion('✅ Artículo ingresado correctamente. Imprimiendo ticket...');

        const ticketGenerado = await generarTicket(articuloCompleto);
        if (ticketGenerado) {
            setTimeout(async () => {
                await imprimirTicketConConfigActual();
            }, 500);
        } else {
            mostrarNotificacion('⚠️ Artículo guardado, pero no se pudo generar el ticket', true);
        }

        await actualizarInventario();
    } else {
        mostrarNotificacion('❌ ' + resultado.error, true);
    }
    } catch (error) {
        console.error('Error ingresando artículo:', error);
        mostrarNotificacion('❌ Error al ingresar el artículo', true);
    }
}

async function marcarEntregado(id) {
    try {
        const articulo = await window.electronAPI.obtenerPorId(id);
        const confirmado = articulo
            ? await confirmarAccionAsync({
                titulo: 'Confirmar entrega',
                mensaje: `¿Entregar el artículo "${articulo.descripcion}" a ${articulo.nombreCliente}?`,
                confirmarTexto: 'Entregar',
                peligro: false
            })
            : false;
        if (articulo && confirmado) {
            const resultado = await window.electronAPI.actualizarEstado(id, 'Entregado');
            if (resultado.success) {
                if (typeof actualizarFilaInventarioEstado === 'function') {
                    actualizarFilaInventarioEstado(id, 'Entregado');
                }
                if (typeof marcarInventarioDirty === 'function') {
                    marcarInventarioDirty();
                }
                mostrarNotificacion('✅ Artículo marcado como entregado');
                setTimeout(() => {
                    const tabIngresar = document.getElementById('ingresar');
                    const ingresarActivo = Boolean(tabIngresar && tabIngresar.classList.contains('active'));
                    if (ingresarActivo && typeof desbloquearFormularioIngreso === 'function') {
                        desbloquearFormularioIngreso({ focusRut: false });
                    }
                    if (typeof asegurarInputsEditablesActivos === 'function') {
                        asegurarInputsEditablesActivos('#buscar');
                    }
                }, 0);
            } else {
                mostrarNotificacion(`❌ No se pudo marcar entregado: ${resultado.error}`, true);
            }
        }
    } catch (error) {
        console.error('Error marcando artículo como entregado:', error);
        mostrarNotificacion(`❌ Error marcando entregado: ${error.message}`, true);
    }
}

async function marcarEnBodega(id) {
    try {
        const confirmado = await confirmarAccionAsync({
            titulo: 'Confirmar devolución',
            mensaje: '¿Devolver el artículo a bodega?',
            confirmarTexto: 'Devolver',
            peligro: false
        });
        if (confirmado) {
            const resultado = await window.electronAPI.actualizarEstado(id, 'En Bodega');
            if (resultado.success) {
                if (typeof actualizarFilaInventarioEstado === 'function') {
                    actualizarFilaInventarioEstado(id, 'En Bodega');
                }
                if (typeof marcarInventarioDirty === 'function') {
                    marcarInventarioDirty();
                }
                mostrarNotificacion('↩ Artículo devuelto a bodega');
                setTimeout(() => {
                    const tabIngresar = document.getElementById('ingresar');
                    const ingresarActivo = Boolean(tabIngresar && tabIngresar.classList.contains('active'));
                    if (ingresarActivo && typeof desbloquearFormularioIngreso === 'function') {
                        desbloquearFormularioIngreso({ focusRut: false });
                    }
                    if (typeof asegurarInputsEditablesActivos === 'function') {
                        asegurarInputsEditablesActivos('#buscar');
                    }
                }, 0);
            } else {
                mostrarNotificacion(`❌ No se pudo devolver a bodega: ${resultado.error}`, true);
            }
        }
    } catch (error) {
        console.error('Error devolviendo artículo a bodega:', error);
        mostrarNotificacion(`❌ Error devolviendo a bodega: ${error.message}`, true);
    }
}

async function eliminarArticulo(id) {
    try {
        const articulo = await window.electronAPI.obtenerPorId(id);
        const confirmado = articulo
            ? await confirmarAccionAsync({
                titulo: 'Confirmar eliminación',
                mensaje: `¿Está seguro de eliminar el artículo "${articulo.descripcion}"?\n\nEsta acción no se puede deshacer.`,
                confirmarTexto: 'Eliminar',
                peligro: true
            })
            : false;
        if (articulo && confirmado) {
            const resultado = await window.electronAPI.eliminar(id);
            if (resultado.success) {
                if (typeof eliminarFilaInventarioLocal === 'function') {
                    eliminarFilaInventarioLocal(id);
                }
                if (typeof marcarInventarioDirty === 'function') {
                    marcarInventarioDirty();
                }
                void buscarArticulos();
                mostrarNotificacion('🗑️ Artículo eliminado');
            } else {
                mostrarNotificacion(`❌ No se pudo eliminar: ${resultado.error}`, true);
            }
        }
    } catch (error) {
        console.error('Error eliminando artículo:', error);
        mostrarNotificacion(`❌ Error eliminando artículo: ${error.message}`, true);
    }
}

async function generarTicket(articulo) {
    try {
        const ticketHtml = await window.Tickets.generarHTML(articulo);
        document.getElementById('ticketContainer').innerHTML = `
            <div class="ticket-container">
                <div id="ticket">
                    ${ticketHtml}
                </div>
            </div>
        `;

        // Mostrar también en el div antiguo por compatibilidad si es necesario, 
        // o mejor, actualizar el modal de preview si existe.
        // Por ahora, el ticketContainer es invisible en pantalla normal (display: none en CSS)
        // pero visible en impresión.

        // Si queremos mostrar un preview:
        const previewContainer = document.getElementById('ticketContenido');
        if (previewContainer) {
            previewContainer.innerHTML = ticketHtml;
            document.getElementById('ticket').style.display = 'block';
        }
        return true;
    } catch (error) {
        console.error('Error generando ticket:', error);
        mostrarNotificacion('❌ Error generando ticket', true);
        return false;
    }
}

async function verTicket(id) {
    try {
        const articulo = await window.electronAPI.obtenerPorId(id);
        if (!articulo) return;

        const ticketHtml = await window.Tickets.generarHTML(articulo);

        // Cargar modal si no existe en el DOM (aunque index.html debe tener el container)
        // Usaremos templateLoader si es necesario, pero asumimos que el fetch funciona
        const response = await fetch('html/modal-ticket.html');
        if (!response.ok) {
            throw new Error(`No se pudo cargar modal-ticket.html (HTTP ${response.status})`);
        }
        const modalHtml = await response.text();

        document.getElementById('modalTicketContainer').innerHTML = modalHtml;

        // Inyectar contenido del ticket
        document.getElementById('previewContainer').innerHTML = ticketHtml;

        // Mostrar modal
        document.getElementById('modalTicket').style.display = 'block';

    } catch (error) {
        console.error('Error mostrando ticket:', error);
        mostrarNotificacion('❌ Error al mostrar ticket', true);
    }
}

async function reimprimirTicket(id) {
    try {
        const articulo = await window.electronAPI.obtenerPorId(id);
        if (articulo) {
            const ticketGenerado = await generarTicket(articulo);
            if (ticketGenerado) {
                setTimeout(async () => {
                    await imprimirTicketConConfigActual();
                }, 500); // Pequeño delay para asegurar que el DOM se actualizó
            }
        }
    } catch (error) {
        console.error('Error reimprimiendo ticket:', error);
        mostrarNotificacion(`❌ Error reimprimiendo ticket: ${error.message}`, true);
    }
}

// Funciones para el modal de ticket (movidas desde el HTML para scope global)
function cerrarModalTicket() {
    document.getElementById('modalTicketContainer').innerHTML = '';
}

async function imprimirDesdePreview() {
    await imprimirTicketConConfigActual();
}
