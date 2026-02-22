const CONFIG_IMPRESION_DEFAULT = {
    width: '58mm', // '58mm' o '80mm'
    fontProfile58: 'legible', // compacto | legible | extra_grande
    contentWidth58mm: 48,
    header: 'NAPOLI\nReparadora de Calzado',
    footer: 'Gracias por preferir Napoli\nConserve este ticket'
};

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

const Tickets = {
    // Configuración por defecto
    config: { ...CONFIG_IMPRESION_DEFAULT },

    async init() {
        // Cargar configuración guardada
        const savedConfig = await window.electronAPI.obtenerConfiguracion();
        if (savedConfig && savedConfig.printer) {
            const printer = savedConfig.printer;
            this.config = {
                width: printer.width === '80mm' ? '80mm' : CONFIG_IMPRESION_DEFAULT.width,
                fontProfile58: perfil58ConDefault(printer.fontProfile58),
                contentWidth58mm: contentWidth58ConDefault(printer.contentWidth58mm),
                header: textoConDefault(printer.header, CONFIG_IMPRESION_DEFAULT.header),
                footer: textoConDefault(printer.footer, CONFIG_IMPRESION_DEFAULT.footer)
            };
        }
    },

    async generarHTML(articulo) {
        // Asegurarse de tener la config actualizada
        await this.init();

        const widthClass = this.config.width === '80mm' ? 'width-80mm' : 'width-58mm';
        const fontProfile58 = perfil58ConDefault(this.config.fontProfile58);
        const contentWidth58mm = contentWidth58ConDefault(this.config.contentWidth58mm);
        const fontProfileClass = widthClass === 'width-58mm'
            ? `font58-${fontProfile58}`
            : '';
        const ticketClassName = fontProfileClass
            ? `ticket-content ${widthClass} ${fontProfileClass}`
            : `ticket-content ${widthClass}`;
        const ticketInlineStyle = widthClass === 'width-58mm'
            ? ` style="--ticket-content-width-mm: ${contentWidth58mm}mm;"`
            : '';

        // Formatear textos
        const headerHtml = escaparHtml(String(this.config.header || '')).replace(/\n/g, '<br>');
        const footerHtml = escaparHtml(String(this.config.footer || '')).replace(/\n/g, '<br>');
        const numeroBodega = typeof articulo.numeroBodega === 'string' ? articulo.numeroBodega.trim() : '';

        return `
            <div class="${ticketClassName}"${ticketInlineStyle}>
                <div class="ticket-header">
                    ${headerHtml}
                    <div class="ticket-meta ticket-code">TICKET #${String(articulo.id).padStart(4, '0')}</div>
                    <div class="ticket-meta">${escaparHtml(articulo.fechaIngreso)}</div>
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
        `;
    },

    async guardarConfiguracion(nuevaConfig) {
        const configTentativa = { ...this.config, ...nuevaConfig };
        this.config = {
            width: configTentativa.width === '80mm' ? '80mm' : '58mm',
            fontProfile58: perfil58ConDefault(configTentativa.fontProfile58),
            contentWidth58mm: contentWidth58ConDefault(configTentativa.contentWidth58mm),
            header: textoConDefault(configTentativa.header, CONFIG_IMPRESION_DEFAULT.header),
            footer: textoConDefault(configTentativa.footer, CONFIG_IMPRESION_DEFAULT.footer)
        };
        await window.electronAPI.guardarConfiguracion({ printer: this.config });
        return { success: true };
    }
};

window.Tickets = Tickets;
