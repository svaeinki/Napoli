let modalConfigAbortController = null;

const TICKET_TEXTOS_DEFAULT = {
    header: 'NAPOLI\nReparadora de Calzado',
    footer: 'Gracias por preferir Napoli\nConserve este ticket'
};

function obtenerDefaultsTextosTicket() {
    const defaults = (window.Tickets && window.Tickets.config) ? window.Tickets.config : {};
    const header = (typeof defaults.header === 'string' && defaults.header.trim())
        ? defaults.header
        : TICKET_TEXTOS_DEFAULT.header;
    const footer = (typeof defaults.footer === 'string' && defaults.footer.trim())
        ? defaults.footer
        : TICKET_TEXTOS_DEFAULT.footer;
    return { header, footer };
}

async function abrirConfiguracion() {
    const modal = document.getElementById('modalConfigContainer');
    if (!modal) {
        mostrarNotificacion('❌ No se encontró el contenedor del modal de configuración', true);
        return;
    }

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

    const config = await window.electronAPI.obtenerConfiguracion();
    const printerConfig = (config && config.printer) ? config.printer : {};
    const defaults = obtenerDefaultsTextosTicket();

    const header = (typeof printerConfig.header === 'string' && printerConfig.header.trim())
        ? printerConfig.header
        : defaults.header;
    const footer = (typeof printerConfig.footer === 'string' && printerConfig.footer.trim())
        ? printerConfig.footer
        : defaults.footer;

    const headerInput = document.getElementById('configTicketHeader');
    if (headerInput) {
        headerInput.value = header;
    }
    const footerInput = document.getElementById('configTicketFooter');
    if (footerInput) {
        footerInput.value = footer;
    }

    const modalConfig = document.getElementById('modal-config');
    if (!modalConfig) {
        mostrarNotificacion('❌ No se pudo abrir el modal de configuración', true);
        return;
    }

    modalConfig.style.display = 'flex';
    modalConfig.scrollTop = 0;
    const modalContent = modalConfig.querySelector('.modal-content');
    if (modalContent) {
        modalContent.scrollTop = 0;
    }

    if (modalConfigAbortController) {
        modalConfigAbortController.abort();
    }
    modalConfigAbortController = new AbortController();
    const { signal } = modalConfigAbortController;

    if (modalContent) {
        modalContent.addEventListener('click', (event) => {
            event.stopPropagation();
        }, { signal });
    }
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (!document.getElementById('modal-config')) return;
        event.preventDefault();
        cerrarConfiguracion();
    }, { signal });
}

function cerrarConfiguracion() {
    if (modalConfigAbortController) {
        modalConfigAbortController.abort();
        modalConfigAbortController = null;
    }
    const container = document.getElementById('modalConfigContainer');
    if (container) {
        container.innerHTML = '';
    }
}

function leerConfigImpresionDesdeModal() {
    const defaults = obtenerDefaultsTextosTicket();
    const headerInput = document.getElementById('configTicketHeader');
    const footerInput = document.getElementById('configTicketFooter');
    return {
        header: headerInput ? headerInput.value : defaults.header,
        footer: footerInput ? footerInput.value : defaults.footer
    };
}

async function guardarConfiguracionImpresora() {
    try {
        const nuevaConfig = leerConfigImpresionDesdeModal();
        const resultado = await window.Tickets.guardarConfiguracion(nuevaConfig);

        if (resultado.success) {
            mostrarNotificacion('✅ Configuración guardada');
            cerrarConfiguracion();
        } else {
            const detalle = (resultado && resultado.error) ? `: ${resultado.error}` : '';
            mostrarNotificacion(`❌ Error guardando configuración${detalle}`, true);
        }
    } catch (error) {
        console.error('Error guardando configuración de impresión:', error);
        mostrarNotificacion('❌ Error guardando configuración', true);
    }
}

async function pruebaImpresion() {
    const articuloPrueba = {
        id: 9999,
        rut: '12.345.678-9',
        nombreCliente: 'Cliente de Prueba',
        telefono: '+56 9 1234 5678',
        tipoArticulo: 'Servicio de Prueba',
        descripcion: 'Esta es una impresión de prueba para verificar el formato.',
        numeroBodega: 'TEST',
        observaciones: 'Sin observaciones',
        fechaIngreso: new Date().toISOString(),
        valorTotal: 15000,
        totalAbonado: 5000,
        saldoPendiente: 10000
    };

    try {
        const configOverride = leerConfigImpresionDesdeModal();
        const ticketHtml = await window.Tickets.generarHTML(articuloPrueba, configOverride);
        const ticketContainer = document.getElementById('ticketContainer');
        if (!ticketContainer) {
            throw new Error('No se encontró ticketContainer');
        }

        ticketContainer.innerHTML = `
            <div class="ticket-container">
                <div id="ticket">
                    ${ticketHtml}
                </div>
            </div>
        `;

        await window.Tickets.init();
        const width = (window.Tickets && window.Tickets.config && window.Tickets.config.width === '80mm')
            ? '80mm'
            : '58mm';

        setTimeout(() => {
            window.electronAPI.imprimir({ width }).then((resultadoImpresion) => {
                if (!resultadoImpresion || !resultadoImpresion.success) {
                    const mensaje = resultadoImpresion && resultadoImpresion.error
                        ? resultadoImpresion.error
                        : 'La impresora rechazó el ticket de prueba';
                    mostrarNotificacion(`❌ ${mensaje}`, true);
                }
            }).catch((err) => {
                console.error('Error imprimiendo ticket de prueba:', err);
                mostrarNotificacion('❌ Error al imprimir ticket de prueba', true);
            });
        }, 500);
    } catch (error) {
        console.error('Error imprimiendo ticket de prueba:', error);
        mostrarNotificacion('❌ No se pudo generar el ticket de prueba', true);
    }
}
