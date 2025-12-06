async function abrirConfiguracion() {
    const modal = document.getElementById('modalContainer');
    // Cargar el HTML del modal si no está cargado, o mostrarlo
    if (!document.getElementById('modal-config')) {
        try {
            const response = await fetch('html/modal-config.html');
            const html = await response.text();
            modal.innerHTML = html;
        } catch (error) {
            console.error('Error cargando modal:', error);
            return;
        }
    }

    // Cargar valores actuales
    const config = await window.electronAPI.obtenerConfiguracion();
    const printerConfig = config.printer || window.Tickets.config;

    document.getElementById('configPrinterWidth').value = printerConfig.width || '58mm';
    document.getElementById('configTicketHeader').value = printerConfig.header || '';
    document.getElementById('configTicketFooter').value = printerConfig.footer || '';

    document.getElementById('modal-config').style.display = 'flex';
}

function cerrarConfiguracion() {
    const modal = document.getElementById('modal-config');
    if (modal) {
        modal.style.display = 'none';
        modal.remove(); // Limpiar para recargar fresco la próxima vez
    }
}

async function guardarConfiguracionImpresora() {
    const width = document.getElementById('configPrinterWidth').value;
    const header = document.getElementById('configTicketHeader').value;
    const footer = document.getElementById('configTicketFooter').value;

    const nuevaConfig = {
        width,
        header,
        footer
    };

    const resultado = await window.Tickets.guardarConfiguracion(nuevaConfig);

    if (resultado.success) {
        mostrarNotificacion('✅ Configuración guardada');
        cerrarConfiguracion();
    } else {
        mostrarNotificacion('❌ Error guardando configuración', true);
    }
}

async function pruebaImpresion() {
    // Generar un ticket de prueba
    const articuloPrueba = {
        id: 9999,
        rut: '12.345.678-9',
        nombreCliente: 'Cliente de Prueba',
        telefono: '+56 9 1234 5678',
        tipoArticulo: 'Servicio de Prueba',
        descripcion: 'Esta es una impresión de prueba para verificar el ancho y formato.',
        numeroBodega: 'TEST',
        observaciones: 'Sin observaciones',
        fechaIngreso: new Date().toLocaleString('es-CL'),
        valorTotal: 15000,
        totalAbonado: 5000,
        saldoPendiente: 10000
    };

    await generarTicket(articuloPrueba);
    setTimeout(() => {
        window.electronAPI.imprimir();
    }, 500);
}
