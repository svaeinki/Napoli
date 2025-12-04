// ============================================
// GESTIÓN DE ARTÍCULOS
// ============================================

async function ingresarArticulo(e) {
    e.preventDefault();

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