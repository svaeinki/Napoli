const CONFIG_IMPRESION_DEFAULT = {
    width: '58mm', // '58mm' o '80mm'
    fontProfile58: 'legible', // compacto | legible | extra_grande
    contentWidth58mm: 48,
    verticalShift58mm: 15,
    finalTrim58mm: 0,
    driverCompatAnchor58: true,
    header: 'NAPOLI\nReparadora de Calzado',
    footer: 'Gracias por preferir Napoli\nConserve este ticket'
};
const TOP_PRIMER_HEIGHT_58MM = 5;
const TOP_PRIMER_LINE = '##############################';

function textoConDefault(texto, fallback) {
    if (typeof texto !== 'string') return fallback;
    return texto.trim() ? texto : fallback;
}

function perfil58ConDefault(perfil, fallback = CONFIG_IMPRESION_DEFAULT.fontProfile58) {
    const permitidos = new Set(['compacto', 'legible', 'extra_grande']);
    const valor = typeof perfil === 'string' ? perfil.trim().toLowerCase() : '';
    return permitidos.has(valor) ? valor : fallback;
}

function contentWidth58ConDefault(valor, fallback = CONFIG_IMPRESION_DEFAULT.contentWidth58mm) {
    const parsed = Number(valor);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(54, Math.max(44, parsed));
}

function calibracion58ConDefault(valor, fallback, min = 0, max = 8) {
    const parsed = Number(valor);
    const fallbackNumber = Number(fallback);
    const fallbackSanitizado = Number.isFinite(fallbackNumber)
        ? Math.min(max, Math.max(min, fallbackNumber))
        : min;
    if (!Number.isFinite(parsed)) return fallbackSanitizado;
    const clamped = Math.min(max, Math.max(min, parsed));
    return Math.round(clamped * 2) / 2;
}

function normalizarConfigImpresion(config, fallback = CONFIG_IMPRESION_DEFAULT) {
    const origen = (config && typeof config === 'object') ? config : {};
    const width = origen.width === '80mm' ? '80mm' : '58mm';
    const verticalShiftRaw = Number.isFinite(Number(origen.verticalShift58mm))
        ? Number(origen.verticalShift58mm)
        : Number(origen.topOffset58mm);
    const driverCompatRaw = typeof origen.driverCompatAnchor58 === 'boolean'
        ? origen.driverCompatAnchor58
        : fallback.driverCompatAnchor58 !== false;
    const driverCompatAnchor58 = width === '58mm' ? true : driverCompatRaw;
    return {
        width,
        fontProfile58: perfil58ConDefault(origen.fontProfile58, fallback.fontProfile58),
        contentWidth58mm: contentWidth58ConDefault(origen.contentWidth58mm, fallback.contentWidth58mm),
        verticalShift58mm: calibracion58ConDefault(verticalShiftRaw, fallback.verticalShift58mm, 8, 35),
        finalTrim58mm: calibracion58ConDefault(origen.finalTrim58mm, fallback.finalTrim58mm, 0, 8),
        driverCompatAnchor58,
        header: textoConDefault(origen.header, fallback.header),
        footer: textoConDefault(origen.footer, fallback.footer)
    };
}

const Tickets = {
    // Configuración por defecto
    config: { ...CONFIG_IMPRESION_DEFAULT },
    _configCargada: false,

    async init() {
        // Cargar configuración guardada
        const savedConfig = await window.electronAPI.obtenerConfiguracion();
        const printer = (savedConfig && savedConfig.printer) ? savedConfig.printer : {};
        this.config = normalizarConfigImpresion(printer, CONFIG_IMPRESION_DEFAULT);
        this._configCargada = true;
    },

    async generarHTML(articulo, configOverride = null) {
        if (!this._configCargada) {
            await this.init();
        }

        const configEfectiva = (configOverride && typeof configOverride === 'object')
            ? normalizarConfigImpresion({ ...this.config, ...configOverride }, CONFIG_IMPRESION_DEFAULT)
            : normalizarConfigImpresion(this.config, CONFIG_IMPRESION_DEFAULT);

        const widthClass = configEfectiva.width === '80mm' ? 'width-80mm' : 'width-58mm';
        const fontProfile58 = perfil58ConDefault(configEfectiva.fontProfile58);
        const contentWidth58mm = contentWidth58ConDefault(configEfectiva.contentWidth58mm);
        const finalTrim58mm = calibracion58ConDefault(
            configEfectiva.finalTrim58mm,
            CONFIG_IMPRESION_DEFAULT.finalTrim58mm,
            0,
            8
        );
        const fontProfileClass = widthClass === 'width-58mm'
            ? `font58-${fontProfile58}`
            : '';
        const ticketClassName = fontProfileClass
            ? `ticket-content ${widthClass} ${fontProfileClass}`
            : `ticket-content ${widthClass}`;
        const ticketInlineStyle = widthClass === 'width-58mm'
            ? ` style="--ticket-content-width-mm: ${contentWidth58mm}mm; --ticket-final-trim-mm: ${finalTrim58mm}mm; --ticket-primer-height-mm: ${TOP_PRIMER_HEIGHT_58MM}mm;"`
            : '';

        // Formatear textos
        const headerHtml = escaparHtml(String(configEfectiva.header || '')).replace(/\n/g, '<br>');
        const topPrimerHtml = widthClass === 'width-58mm'
            ? `<div class="ticket-top-primer" aria-hidden="true" role="presentation">${Array.from({ length: 8 }, () => `<div class="ticket-top-primer-line">${TOP_PRIMER_LINE}</div>`).join('')}</div>`
            : '';
        const footerHtml = escaparHtml(String(configEfectiva.footer || '')).replace(/\n/g, '<br>');
        const numeroBodega = typeof articulo.numeroBodega === 'string' ? articulo.numeroBodega.trim() : '';
        const fechaIngresoTicket = formatearFechaChile(articulo.fechaIngreso);

        return `
            <div class="${ticketClassName}"${ticketInlineStyle}>
                ${topPrimerHtml}
                <div class="ticket-main">
                    <div class="ticket-header">
                        ${headerHtml}
                        <div class="ticket-meta ticket-code">TICKET #${String(articulo.id).padStart(4, '0')}</div>
                        <div class="ticket-meta">${escaparHtml(fechaIngresoTicket)}</div>
                    </div>

                    <div class="ticket-body">
                        <div class="ticket-row ticket-row-stacked">
                            <span class="ticket-label">Cliente:</span>
                            <span class="ticket-value">${escaparHtml(articulo.nombreCliente)}</span>
                        </div>
                        <div class="ticket-row ticket-row-stacked">
                            <span class="ticket-label">RUT:</span>
                            <span class="ticket-value">${escaparHtml(articulo.rut)}</span>
                        </div>
                        ${articulo.telefono ? `
                        <div class="ticket-row ticket-row-stacked">
                            <span class="ticket-label">Tel:</span>
                            <span class="ticket-value">${escaparHtml(articulo.telefono)}</span>
                        </div>` : ''}
                        
                        <div class="ticket-divider"></div>

                        <div class="ticket-row ticket-row-stacked">
                            <span class="ticket-label">Servicio:</span>
                            <span class="ticket-value">${escaparHtml(articulo.tipoArticulo)}</span>
                        </div>
                        
                        <div class="ticket-detail-block">
                            <span class="ticket-label">Detalle:</span>
                            <span class="ticket-detail-text">${escaparHtml(articulo.descripcion)}</span>
                        </div>

                        ${numeroBodega ? `
                        <div class="ticket-divider"></div>
                        
                        <div class="ticket-section-title">UBICACIÓN</div>
                        <span class="ticket-big-text">
                            ${escaparHtml(numeroBodega)}
                        </span>
                        ` : ''}

                        ${articulo.valorTotal > 0 ? `
                            <div class="ticket-totals">
                                <div class="ticket-row">
                                    <span>Total:</span>
                                    <span>$${formatearMoneda(articulo.valorTotal)}</span>
                                </div>
                                <div class="ticket-row">
                                    <span>Abonado:</span>
                                    <span>$${formatearMoneda(articulo.totalAbonado)}</span>
                                </div>
                                <div class="ticket-total-row">
                                    <strong>SALDO:</strong>
                                    <strong>$${formatearMoneda(articulo.saldoPendiente)}</strong>
                                </div>
                            </div>
                        ` : ''}
                    </div>

                    <div class="ticket-footer">
                        ${footerHtml}
                    </div>
                </div>
            </div>
        `;
    },

    async guardarConfiguracion(nuevaConfig) {
        try {
            const configTentativa = { ...this.config, ...nuevaConfig };
            const configNormalizada = normalizarConfigImpresion(configTentativa, CONFIG_IMPRESION_DEFAULT);
            const resultado = await window.electronAPI.guardarConfiguracion({ printer: configNormalizada });

            if (!resultado || !resultado.success) {
                return {
                    success: false,
                    error: (resultado && resultado.error) ? resultado.error : 'No se pudo guardar configuración'
                };
            }

            this.config = configNormalizada;
            this._configCargada = true;
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message || 'Error guardando configuración' };
        }
    }
};

window.Tickets = Tickets;
