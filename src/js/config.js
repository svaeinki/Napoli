async function abrirConfiguracion() {
    const modal = document.getElementById('modalConfigContainer');
    if (!modal) {
        mostrarNotificacion('❌ No se encontró el contenedor del modal de configuración', true);
        return;
    }

    // Cargar el HTML del modal si no está cargado, o mostrarlo
    if (!document.getElementById('modal-config')) {
        try {
            const response = await fetch('html/modal-config.html');
            if (!response.ok) {
                throw new Error(`No se pudo cargar modal-config.html (HTTP ${response.status})`);
            }
            const html = await response.text();
            modal.innerHTML = html;
        } catch (error) {
            console.error('Error cargando modal:', error);
            mostrarNotificacion('❌ Error cargando la configuración de impresión', true);
            return;
        }
    }

    // Cargar valores actuales
    const config = await window.electronAPI.obtenerConfiguracion();
    const defaults = (window.Tickets && window.Tickets.config) ? window.Tickets.config : {
        width: '58mm',
        header: 'NAPOLI\nReparadora de Calzado',
        footer: 'Gracias por preferir Napoli\nConserve este ticket'
    };
    const printerConfig = (config && config.printer) ? config.printer : {};
    const header = (typeof printerConfig.header === 'string' && printerConfig.header.trim())
        ? printerConfig.header
        : defaults.header;
    const footer = (typeof printerConfig.footer === 'string' && printerConfig.footer.trim())
        ? printerConfig.footer
        : defaults.footer;
    const width = printerConfig.width === '80mm' ? '80mm' : defaults.width;

    document.getElementById('configPrinterWidth').value = width;
    document.getElementById('configTicketHeader').value = header;
    document.getElementById('configTicketFooter').value = footer;

    const modalConfig = document.getElementById('modal-config');
    if (!modalConfig) {
        mostrarNotificacion('❌ No se pudo abrir el modal de configuración', true);
        return;
    }

    if (!modalConfig.dataset.closeOutsideBound) {
        modalConfig.addEventListener('click', (event) => {
            if (event.target === modalConfig) {
                cerrarConfiguracion();
            }
        });
        modalConfig.dataset.closeOutsideBound = '1';
    }

    modalConfig.style.display = 'flex';
}

function cerrarConfiguracion() {
    const container = document.getElementById('modalConfigContainer');
    if (container) {
        container.innerHTML = '';
    }
}

async function guardarConfiguracionImpresora() {
    try {
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
    } catch (error) {
        console.error('Error guardando configuración de impresión:', error);
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

    const ticketGenerado = await generarTicket(articuloPrueba);
    if (ticketGenerado) {
        setTimeout(() => {
            window.electronAPI.imprimir();
        }, 500);
    } else {
        mostrarNotificacion('❌ No se pudo generar el ticket de prueba', true);
    }
}
