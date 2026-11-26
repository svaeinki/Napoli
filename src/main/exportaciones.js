// Exportación del inventario a JSON y a Excel (.xlsx) en la carpeta de backups,
// con subida opcional a Dropbox.
const path = require('path');
const fs = require('fs');
const estado = require('./estado');
const { BACKUPS_PATH } = require('./rutas');
const { timestampIsoSeguro, medirOperacionDb, respuestaBloqueoRestoreEscritura } = require('./utilidades');
const { formatearFechaChileParaExport } = require('./chile-date');

async function exportarJSON() {
    try {
        const bloqueo = respuestaBloqueoRestoreEscritura();
        if (bloqueo) return bloqueo;

        if (!estado.dbService) {
            throw new Error('Base de datos no inicializada');
        }

        const timestamp = timestampIsoSeguro();
        const jsonPath = path.join(BACKUPS_PATH, `napoli_export_${timestamp}.json`);

        const datos = await medirOperacionDb('backup:exportarJSON:obtenerTodos', () => estado.dbService.obtenerTodos());
        fs.writeFileSync(jsonPath, JSON.stringify(datos, null, 2));

        console.log('✅ JSON exportado:', jsonPath);

        // Subir a Dropbox si está configurado
        if (estado.dropboxManager && estado.dropboxManager.estaConfigurado()) {
            try {
                await estado.dropboxManager.subirBackupJSON(jsonPath);
            } catch (error) {
                console.error('JSON exportado localmente, pero falló subida a Dropbox:', error.message);
            }
        }

        return { success: true, filename: path.basename(jsonPath) };
    } catch (error) {
        console.error('Error exportando JSON:', error);
        return { success: false, error: error.message };
    }
}

async function exportarExcel() {
    try {
        const bloqueo = respuestaBloqueoRestoreEscritura();
        if (bloqueo) return bloqueo;

        if (!estado.dbService) {
            throw new Error('Base de datos no inicializada');
        }

        const xl = require('excel4node');
        const timestamp = timestampIsoSeguro();
        const excelPath = path.join(BACKUPS_PATH, `napoli_inventario_${timestamp}.xlsx`);

        const workbook = new xl.Workbook();
        const worksheet = workbook.addWorksheet('Inventario Napoli');
        const toText = (value) => (value === null || value === undefined ? '' : String(value));
        const toNumber = (value) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
        };

        // Configurar columnas
        const columns = [
            { header: 'ID', width: 8 },
            { header: 'RUT', width: 15 },
            { header: 'Cliente', width: 25 },
            { header: 'Teléfono', width: 15 },
            { header: 'Tipo Servicio', width: 20 },
            { header: 'Descripción', width: 40 },
            { header: 'Ubicación (opcional)', width: 20 },
            { header: 'Fecha Ingreso', width: 18 },
            { header: 'Estado', width: 12 },
            { header: 'Fecha Entrega', width: 18 },
            { header: 'Valor Total', width: 14 },
            { header: 'Total Abonado', width: 14 },
            { header: 'Saldo Pendiente', width: 16 },
            { header: 'Estado Pago', width: 12 },
            { header: 'Observaciones', width: 30 }
        ];
        columns.forEach((column, index) => {
            worksheet.column(index + 1).setWidth(column.width);
        });

        const headerStyle = workbook.createStyle({
            font: {
                bold: true,
                color: '#FFFFFF'
            },
            fill: {
                type: 'pattern',
                patternType: 'solid',
                fgColor: '#667EEA'
            },
            alignment: {
                horizontal: 'center',
                vertical: 'center',
                wrapText: true
            }
        });
        const moneyStyle = workbook.createStyle({
            numberFormat: '$#,##0'
        });
        const centeredStyle = workbook.createStyle({
            alignment: {
                horizontal: 'center',
                vertical: 'center'
            }
        });
        const wrappedStyle = workbook.createStyle({
            alignment: {
                vertical: 'center',
                wrapText: true
            }
        });

        columns.forEach((column, index) => {
            worksheet.cell(1, index + 1).string(column.header).style(headerStyle);
        });

        // Obtener datos
        const datos = await medirOperacionDb('backup:exportarExcel:obtenerTodos', () => estado.dbService.obtenerTodos());

        // Agregar filas
        datos.forEach((articulo, index) => {
            const row = index + 2;
            const fechaIngresoTexto = formatearFechaChileParaExport(articulo.fechaIngreso);
            const fechaEntregaTexto = formatearFechaChileParaExport(articulo.fechaEntrega);
            worksheet.cell(row, 1).number(toNumber(articulo.id)).style(centeredStyle);
            worksheet.cell(row, 2).string(toText(articulo.rut));
            worksheet.cell(row, 3).string(toText(articulo.nombreCliente)).style(wrappedStyle);
            worksheet.cell(row, 4).string(toText(articulo.telefono));
            worksheet.cell(row, 5).string(toText(articulo.tipoArticulo)).style(wrappedStyle);
            worksheet.cell(row, 6).string(toText(articulo.descripcion)).style(wrappedStyle);
            worksheet.cell(row, 7).string(toText(articulo.numeroBodega));
            worksheet.cell(row, 8).string(toText(fechaIngresoTexto));
            worksheet.cell(row, 9).string(toText(articulo.estado)).style(centeredStyle);
            worksheet.cell(row, 10).string(toText(fechaEntregaTexto));
            worksheet.cell(row, 11).number(toNumber(articulo.valorTotal)).style(moneyStyle);
            worksheet.cell(row, 12).number(toNumber(articulo.totalAbonado)).style(moneyStyle);
            worksheet.cell(row, 13).number(toNumber(articulo.saldoPendiente)).style(moneyStyle);
            worksheet.cell(row, 14).string(toText(articulo.estadoPago || 'Sin pago')).style(centeredStyle);
            worksheet.cell(row, 15).string(toText(articulo.observaciones)).style(wrappedStyle);
        });

        // Guardar archivo
        await new Promise((resolve, reject) => {
            workbook.write(excelPath, (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
        console.log('✅ Excel exportado:', excelPath);

        // Subir a Dropbox si está configurado
        if (estado.dropboxManager && estado.dropboxManager.estaConfigurado()) {
            const subida = await estado.dropboxManager.subirArchivo(excelPath, `/NapoliReparadora/Exports/${path.basename(excelPath)}`);
            if (!subida.success) {
                return {
                    success: true,
                    filename: path.basename(excelPath),
                    path: excelPath,
                    warning: `Excel exportado localmente, pero falló subida a Dropbox: ${subida.error}`
                };
            }
        }

        return { success: true, filename: path.basename(excelPath), path: excelPath };
    } catch (error) {
        console.error('Error exportando Excel:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    exportarJSON,
    exportarExcel
};
