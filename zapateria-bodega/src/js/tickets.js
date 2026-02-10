const Tickets = {
    // Configuración por defecto
    config: {
        width: '58mm', // '58mm' o '80mm'
        header: 'NAPOLI\nReparadora de Calzado',
        footer: 'Gracias por su preferencia\nConserve este ticket'
    },

    async init() {
        // Cargar configuración guardada
        const savedConfig = await window.electronAPI.obtenerConfiguracion();
        if (savedConfig.printer) {
            this.config = { ...this.config, ...savedConfig.printer };
        }
    },

    async generarHTML(articulo) {
        // Asegurarse de tener la config actualizada
        await this.init();

        const widthClass = this.config.width === '80mm' ? 'width-80mm' : 'width-58mm';

        // Generar QR
        let qrImg = '';
        try {
            // El ID del artículo será el contenido del QR
            qrImg = await window.electronAPI.generarQR(String(articulo.id));
        } catch (e) {
            console.error('Error generando QR:', e);
        }

        // Formatear textos
        const headerHtml = this.config.header.replace(/\n/g, '<br>');
        const footerHtml = this.config.footer.replace(/\n/g, '<br>');

        return `
            <div class="ticket-content ${widthClass}">
                <div class="ticket-header">
                    ${headerHtml}
                    <br><br>
                    <strong>TICKET #${String(articulo.id).padStart(4, '0')}</strong>
                    <br>
                    ${escaparHtml(articulo.fechaIngreso)}
                </div>

                <div class="ticket-body">
                    <div class="ticket-row">
                        <span class="ticket-label">Cliente:</span>
                        <span class="ticket-value">${escaparHtml(articulo.nombreCliente)}</span>
                    </div>
                     <div class="ticket-row">
                        <span class="ticket-label">RUT:</span>
                        <span class="ticket-value">${escaparHtml(articulo.rut)}</span>
                    </div>
                    ${articulo.telefono ? `
                    <div class="ticket-row">
                        <span class="ticket-label">Tel:</span>
                        <span class="ticket-value">${escaparHtml(articulo.telefono)}</span>
                    </div>` : ''}
                    
                    <div class="ticket-divider"></div>

                    <div class="ticket-row">
                        <span class="ticket-label">Servicio:</span>
                        <span class="ticket-value">${escaparHtml(articulo.tipoArticulo)}</span>
                    </div>
                    
                    <div style="margin: 5px 0;">
                        <span class="ticket-label">Detalle:</span><br>
                        <span style="font-size: 11px;">${escaparHtml(articulo.descripcion)}</span>
                    </div>

                    <div class="ticket-divider"></div>
                    
                    <center>NÚMERO DE BODEGA</center>
                    <span class="ticket-big-text">
                        ${escaparHtml(articulo.numeroBodega)}
                    </span>

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

                ${qrImg ? `
                <div class="ticket-qr">
                    <img src="${qrImg}" width="100" />
                </div>
                ` : ''}

                <div class="ticket-footer">
                    ${footerHtml}
                </div>
            </div>
        `;
    },

    async guardarConfiguracion(nuevaConfig) {
        this.config = { ...this.config, ...nuevaConfig };
        await window.electronAPI.guardarConfiguracion({ printer: this.config });
        return { success: true };
    }
};

window.Tickets = Tickets;
