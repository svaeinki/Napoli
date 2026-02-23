function sanitizarAnchoContenido58(valor, fallback = 48) {
    const parsed = Number(valor);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(54, Math.max(44, parsed));
}

let modalConfigEscHandler = null;

function sanitizarCalibracion58(valor, fallback = 0, max = 8) {
    const parsed = Number(valor);
    const fallbackNumber = Number(fallback);
    const fallbackSanitizado = Number.isFinite(fallbackNumber)
        ? Math.min(max, Math.max(0, fallbackNumber))
        : 0;
    if (!Number.isFinite(parsed)) return fallbackSanitizado;
    const clamped = Math.min(max, Math.max(0, parsed));
    return Math.round(clamped * 2) / 2;
}

function actualizarPreviewAncho58mm(valor) {
    const ancho = sanitizarAnchoContenido58(valor);
    const target = document.getElementById('configTicketContentWidth58Value');
    if (target) {
        target.textContent = `${ancho.toFixed(1)} mm`;
    }
}

function actualizarPreviewOffsetSuperior58mm(valor) {
    const offset = sanitizarCalibracion58(valor, 2, 20);
    const target = document.getElementById('configTicketVerticalShift58Value');
    if (target) {
        target.textContent = `${offset.toFixed(1)} mm`;
    }
}

function actualizarPreviewRecorteFinal58mm(valor) {
    const trim = sanitizarCalibracion58(valor, 0, 8);
    const target = document.getElementById('configTicketFinalTrim58Value');
    if (target) {
        target.textContent = `${trim.toFixed(1)} mm`;
    }
}

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
        fontProfile58: 'legible',
        contentWidth58mm: 48,
        verticalShift58mm: 2,
        finalTrim58mm: 0,
        driverCompatAnchor58: true,
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
    const perfilesPermitidos = new Set(['compacto', 'legible', 'extra_grande']);
    const fontProfile58 = perfilesPermitidos.has(printerConfig.fontProfile58)
        ? printerConfig.fontProfile58
        : (defaults.fontProfile58 || 'legible');
    const contentWidth58mm = sanitizarAnchoContenido58(
        printerConfig.contentWidth58mm,
        sanitizarAnchoContenido58(defaults.contentWidth58mm, 48)
    );
    const verticalShiftRaw = Number.isFinite(Number(printerConfig.verticalShift58mm))
        ? printerConfig.verticalShift58mm
        : printerConfig.topOffset58mm;
    const verticalShift58mm = sanitizarCalibracion58(
        verticalShiftRaw,
        sanitizarCalibracion58(defaults.verticalShift58mm, 2, 20),
        20
    );
    const finalTrim58mm = sanitizarCalibracion58(
        printerConfig.finalTrim58mm,
        sanitizarCalibracion58(defaults.finalTrim58mm, 0, 8),
        8
    );
    const widthSelect = document.getElementById('configPrinterWidth');
    if (widthSelect) {
        widthSelect.value = width;
    }
    const fontProfileSelect = document.getElementById('configTicketFontProfile58');
    if (fontProfileSelect) {
        fontProfileSelect.value = fontProfile58;
    }
    const contentWidthInput = document.getElementById('configTicketContentWidth58');
    if (contentWidthInput) {
        contentWidthInput.value = String(contentWidth58mm);
    }
    actualizarPreviewAncho58mm(contentWidth58mm);
    const verticalShiftInput = document.getElementById('configTicketVerticalShift58');
    if (verticalShiftInput) {
        verticalShiftInput.value = String(verticalShift58mm);
    }
    actualizarPreviewOffsetSuperior58mm(verticalShift58mm);
    const finalTrimInput = document.getElementById('configTicketFinalTrim58');
    if (finalTrimInput) {
        finalTrimInput.value = String(finalTrim58mm);
    }
    actualizarPreviewRecorteFinal58mm(finalTrim58mm);
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
        if (!modalContent.dataset.stopPropagationBound) {
            modalContent.addEventListener('click', (event) => {
                event.stopPropagation();
            });
            modalContent.dataset.stopPropagationBound = '1';
        }
    }

    if (modalConfigEscHandler) {
        document.removeEventListener('keydown', modalConfigEscHandler);
    }
    modalConfigEscHandler = (event) => {
        if (event.key !== 'Escape') return;
        if (!document.getElementById('modal-config')) return;
        event.preventDefault();
        cerrarConfiguracion();
    };
    document.addEventListener('keydown', modalConfigEscHandler);
}

function cerrarConfiguracion() {
    if (modalConfigEscHandler) {
        document.removeEventListener('keydown', modalConfigEscHandler);
        modalConfigEscHandler = null;
    }
    const container = document.getElementById('modalConfigContainer');
    if (container) {
        container.innerHTML = '';
    }
}

function leerConfigImpresionDesdeModal() {
    const defaults = (window.Tickets && window.Tickets.config) ? window.Tickets.config : {
        width: '58mm',
        fontProfile58: 'legible',
        contentWidth58mm: 48,
        verticalShift58mm: 2,
        finalTrim58mm: 0,
        driverCompatAnchor58: true,
        header: 'NAPOLI\nReparadora de Calzado',
        footer: 'Gracias por preferir Napoli\nConserve este ticket'
    };
    const widthSelect = document.getElementById('configPrinterWidth');
    const fontProfileSelect = document.getElementById('configTicketFontProfile58');
    const contentWidthInput = document.getElementById('configTicketContentWidth58');
    const verticalShiftInput = document.getElementById('configTicketVerticalShift58');
    const finalTrimInput = document.getElementById('configTicketFinalTrim58');
    const headerInput = document.getElementById('configTicketHeader');
    const footerInput = document.getElementById('configTicketFooter');

    const width = widthSelect
        ? (widthSelect.value === '80mm' ? '80mm' : '58mm')
        : (defaults.width === '80mm' ? '80mm' : '58mm');
    const driverCompatAnchor58 = width === '58mm'
        ? true
        : defaults.driverCompatAnchor58 !== false;

    return {
        width,
        fontProfile58: fontProfileSelect ? fontProfileSelect.value : (defaults.fontProfile58 || 'legible'),
        contentWidth58mm: sanitizarAnchoContenido58(
            contentWidthInput ? contentWidthInput.value : defaults.contentWidth58mm,
            sanitizarAnchoContenido58(defaults.contentWidth58mm, 48)
        ),
        verticalShift58mm: sanitizarCalibracion58(
            verticalShiftInput ? verticalShiftInput.value : defaults.verticalShift58mm,
            sanitizarCalibracion58(defaults.verticalShift58mm, 2, 20),
            20
        ),
        finalTrim58mm: sanitizarCalibracion58(
            finalTrimInput ? finalTrimInput.value : defaults.finalTrim58mm,
            sanitizarCalibracion58(defaults.finalTrim58mm, 0, 8),
            8
        ),
        driverCompatAnchor58,
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

        setTimeout(async () => {
            const resultadoImpresion = await window.electronAPI.imprimir({
                width: configOverride.width,
                verticalShiftMm: configOverride.width === '58mm'
                    ? configOverride.verticalShift58mm
                    : 0
            });
            if (!resultadoImpresion || !resultadoImpresion.success) {
                const mensaje = resultadoImpresion && resultadoImpresion.error
                    ? resultadoImpresion.error
                    : 'La impresora rechazó el ticket de prueba';
                mostrarNotificacion(`❌ ${mensaje}`, true);
            }
        }, 500);
    } catch (error) {
        console.error('Error imprimiendo ticket de prueba:', error);
        mostrarNotificacion('❌ No se pudo generar el ticket de prueba', true);
    }
}
