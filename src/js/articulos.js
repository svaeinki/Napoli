// ============================================
// GESTIÓN DE ARTÍCULOS
// ============================================

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

    const nuevoArticulo = {
        rut: formatearRUT(rutInput),
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
        const articuloId = resultado.id;

        // Si hay abono inicial, registrarlo
        if (abonoInicial > 0) {
            const metodoPago = document.getElementById('metodoPagoInicial').value;
            await window.electronAPI.pagoRegistrarAbono(articuloId, abonoInicial, metodoPago, 'Abono inicial al ingresar');
        }

        // Obtener artículo completo con abonos actualizados
        const articuloCompleto = await window.electronAPI.obtenerPorId(articuloId);

        document.getElementById('formIngresar').reset();
        mostrarNotificacion('✅ Artículo ingresado correctamente. Imprimiendo ticket...');

        generarTicket(articuloCompleto);

        setTimeout(() => {
            window.electronAPI.imprimir();
        }, 500);

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
    } catch (error) {
        console.error('Error generando ticket:', error);
        mostrarNotificacion('❌ Error generando ticket', true);
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
    const articulo = await window.electronAPI.obtenerPorId(id);
    if (articulo) {
        await generarTicket(articulo);
        setTimeout(() => {
            window.electronAPI.imprimir();
        }, 500); // Pequeño delay para asegurar que el DOM se actualizó
    }
}

// Funciones para el modal de ticket (movidas desde el HTML para scope global)
function cerrarModalTicket() {
    document.getElementById('modalTicketContainer').innerHTML = '';
}

function imprimirDesdePreview() {
    window.electronAPI.imprimir();
}