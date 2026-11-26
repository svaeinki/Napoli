// ============================================
// GESTIÓN DE INVENTARIO
// ============================================

let articulosFiltrados = [];
let inventarioCache = [];
let inventarioCacheCargado = false;
let inventarioDirty = false;
let inventarioRefreshInFlight = null;
const ITEMS_POR_PAGINA = 50;
let paginaActualInventario = 1;

function inventarioTienePendienteRefresh() {
    return inventarioDirty || !inventarioCacheCargado;
}

function marcarInventarioDirty() {
    inventarioDirty = true;
}

function normalizarArticuloId(id) {
    const idNum = Number(id);
    if (!Number.isInteger(idNum) || idNum <= 0) {
        return null;
    }
    return idNum;
}

function leerContador(id) {
    const elemento = document.getElementById(id);
    if (!elemento) return null;
    const numero = parseInt(String(elemento.textContent || '0').replace(/[^\d-]/g, ''), 10);
    return Number.isFinite(numero) ? numero : 0;
}

function escribirContador(id, valor) {
    const elemento = document.getElementById(id);
    if (!elemento) return;
    elemento.textContent = String(Math.max(0, valor));
}

function ajustarContadoresPorCambioEstado(estadoAnterior, nuevoEstado) {
    if (!estadoAnterior || !nuevoEstado || estadoAnterior === nuevoEstado) {
        return;
    }

    const enBodega = leerContador('enBodega');
    const entregados = leerContador('entregados');
    if (enBodega === null || entregados === null) {
        return;
    }

    if (estadoAnterior === 'En Bodega' && nuevoEstado === 'Entregado') {
        escribirContador('enBodega', enBodega - 1);
        escribirContador('entregados', entregados + 1);
    } else if (estadoAnterior === 'Entregado' && nuevoEstado === 'En Bodega') {
        escribirContador('enBodega', enBodega + 1);
        escribirContador('entregados', entregados - 1);
    }
}

function ajustarContadoresPorEliminacion(estadoAnterior) {
    const total = leerContador('totalArticulos');
    if (total !== null) {
        escribirContador('totalArticulos', total - 1);
    }

    if (estadoAnterior === 'En Bodega') {
        const enBodega = leerContador('enBodega');
        if (enBodega !== null) {
            escribirContador('enBodega', enBodega - 1);
        }
    } else if (estadoAnterior === 'Entregado') {
        const entregados = leerContador('entregados');
        if (entregados !== null) {
            escribirContador('entregados', entregados - 1);
        }
    }
}

function construirHtmlAccionesArticulo(articuloId, estado) {
    const botonEstado = estado === 'En Bodega'
        ? `<button class="btn btn-success btn-small" onclick="marcarEntregado(${articuloId})">✓ Entregar</button>`
        : `<button class="btn btn-warning btn-small" onclick="marcarEnBodega(${articuloId})">↩ Devolver</button>`;

    return `
        ${botonEstado}
        <button class="btn btn-info btn-small" onclick="mostrarModalPago(${articuloId})">💰 Pagos</button>
        <button class="btn btn-secondary btn-small" onclick="verTicket(${articuloId})" title="Ver Ticket">👁️</button>
        <button class="btn btn-primary btn-small" onclick="reimprimirTicket(${articuloId})">🖨</button>
        <button class="btn btn-danger btn-small" onclick="eliminarArticulo(${articuloId})">🗑</button>
    `;
}

function obtenerFilaArticuloInventario(articuloId) {
    const tabla = document.getElementById('tablaInventario');
    if (!tabla || typeof tabla.querySelector !== 'function') {
        return null;
    }
    return tabla.querySelector(`tr[data-articulo-id="${articuloId}"]`);
}

function mostrarMensajeTablaVaciaSiCorresponde() {
    const tabla = document.getElementById('tablaInventario');
    if (!tabla || typeof tabla.querySelectorAll !== 'function') {
        return;
    }
    const filas = tabla.querySelectorAll('tbody tr');
    if (!filas || filas.length > 0) {
        return;
    }

    tabla.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--text-muted);">No hay artículos para mostrar.</p>';
}

function actualizarFilaInventarioEstado(id, nuevoEstado) {
    const articuloId = normalizarArticuloId(id);
    if (!articuloId || (nuevoEstado !== 'En Bodega' && nuevoEstado !== 'Entregado')) {
        return false;
    }

    const articulo = inventarioCache.find((item) => Number(item.id) === articuloId);
    const fila = obtenerFilaArticuloInventario(articuloId);
    const estadoAnterior = articulo
        ? articulo.estado
        : (fila && fila.dataset ? fila.dataset.estado : null);

    if (articulo) {
        articulo.estado = nuevoEstado;
        articulo.fechaEntrega = nuevoEstado === 'Entregado' ? new Date().toISOString() : null;
    }

    ajustarContadoresPorCambioEstado(estadoAnterior, nuevoEstado);

    if (!fila) {
        return true;
    }

    const filtro = obtenerFiltroActualInventario();
    const debeOcultarsePorFiltro =
        (filtro === 'bodega' && nuevoEstado !== 'En Bodega') ||
        (filtro === 'entregados' && nuevoEstado !== 'Entregado');

    if (debeOcultarsePorFiltro) {
        articulosFiltrados = articulosFiltrados.filter((item) => Number(item.id) !== articuloId);
        if (typeof fila.remove === 'function') {
            fila.remove();
        }
        mostrarMensajeTablaVaciaSiCorresponde();
        return true;
    }

    fila.dataset.estado = nuevoEstado;

    const claseAlerta = nuevoEstado === 'En Bodega' && articulo
        ? obtenerClaseAlerta(articulo.fechaIngreso)
        : '';
    fila.className = claseAlerta;

    const tiempoStrong = fila.querySelector('.celda-tiempo strong');
    if (tiempoStrong) {
        const tiempoTexto = (nuevoEstado === 'En Bodega' && articulo)
            ? calcularDiasEnBodega(articulo.fechaIngreso)
            : '-';
        tiempoStrong.textContent = tiempoTexto;
        tiempoStrong.className = claseAlerta ? 'text-alerta' : '';
    }

    const celdaEstado = fila.querySelector('.celda-estado');
    if (celdaEstado) {
        const claseEstado = nuevoEstado === 'En Bodega' ? 'status-bodega' : 'status-entregado';
        celdaEstado.innerHTML = `<span class="status-badge ${claseEstado}">${escaparHtml(nuevoEstado)}</span>`;
    }

    const celdaAcciones = fila.querySelector('.celda-acciones');
    if (celdaAcciones) {
        celdaAcciones.innerHTML = construirHtmlAccionesArticulo(articuloId, nuevoEstado);
    }

    return true;
}

function eliminarFilaInventarioLocal(id) {
    const articuloId = normalizarArticuloId(id);
    if (!articuloId) {
        return false;
    }

    const indexCache = inventarioCache.findIndex((item) => Number(item.id) === articuloId);
    const articulo = indexCache >= 0 ? inventarioCache[indexCache] : null;
    const estadoAnterior = articulo ? articulo.estado : null;
    if (indexCache >= 0) {
        inventarioCache.splice(indexCache, 1);
    }

    const indexFiltrados = articulosFiltrados.findIndex((item) => Number(item.id) === articuloId);
    if (indexFiltrados >= 0) {
        articulosFiltrados.splice(indexFiltrados, 1);
    }

    ajustarContadoresPorEliminacion(estadoAnterior);

    const fila = obtenerFilaArticuloInventario(articuloId);
    if (fila && typeof fila.remove === 'function') {
        fila.remove();
    }
    mostrarMensajeTablaVaciaSiCorresponde();

    return true;
}

function actualizarInventarioManual() {
    return actualizarInventario({ force: true, deferIfHidden: false });
}

function inventarioEstaVisible() {
    const tabInventario = document.getElementById('inventario');
    return Boolean(tabInventario && tabInventario.classList.contains('active'));
}

function calcularEstadisticasDesdeArticulos(articulos) {
    return articulos.reduce((stats, articulo) => {
        stats.total += 1;
        if (articulo.estado === 'En Bodega') stats.enBodega += 1;
        if (articulo.estado === 'Entregado') stats.entregados += 1;
        return stats;
    }, { total: 0, enBodega: 0, entregados: 0 });
}

function actualizarResumenInventario(stats) {
    const totalArticulos = document.getElementById('totalArticulos');
    const enBodega = document.getElementById('enBodega');
    const entregados = document.getElementById('entregados');

    if (totalArticulos) totalArticulos.textContent = stats.total;
    if (enBodega) enBodega.textContent = stats.enBodega;
    if (entregados) entregados.textContent = stats.entregados;
}

function contarArticulosAntiguos(articulos) {
    let cantidad = 0;
    for (const articulo of articulos) {
        if (articulo.estado !== 'En Bodega') continue;
        try {
            const dias = obtenerDiasEnBodega(articulo.fechaIngreso);
            if (Number.isInteger(dias) && dias >= 30) {
                cantidad += 1;
            }
        } catch (error) {
            // Ignorar fechas inválidas en el conteo de alerta.
        }
    }
    return cantidad;
}

function obtenerFiltroActualInventario() {
    const filtro = document.getElementById('filtroEstado');
    return filtro ? filtro.value : 'todos';
}

function filtrarArticulosPorEstado(articulos, filtro) {
    if (filtro === 'bodega') {
        return articulos.filter((articulo) => articulo.estado === 'En Bodega');
    }
    if (filtro === 'entregados') {
        return articulos.filter((articulo) => articulo.estado === 'Entregado');
    }
    return articulos;
}

async function actualizarInventario(options = {}) {
    const {
        deferIfHidden = true,
        force = false
    } = options;

    const visible = inventarioEstaVisible();
    if (deferIfHidden && !force && !visible) {
        inventarioDirty = true;
        return { success: true, deferred: true };
    }

    if (inventarioRefreshInFlight) {
        inventarioDirty = true;
        return inventarioRefreshInFlight;
    }

    inventarioDirty = false;
    inventarioRefreshInFlight = (async () => {
        try {
            // Si la lectura falla se conserva el inventario anterior y se muestra el error.
            inventarioCache = exigirListaIpc(await window.electronAPI.obtenerTodos());
            inventarioCacheCargado = true;

            const visibleDespuesFetch = inventarioEstaVisible();
            if (visibleDespuesFetch || force) {
                const stats = calcularEstadisticasDesdeArticulos(inventarioCache);
                actualizarResumenInventario(stats);
                actualizarBadgeInventario(contarArticulosAntiguos(inventarioCache));
            }

            await aplicarFiltro({ useCache: true, skipIfHidden: true });
            return { success: true };
        } catch (error) {
            console.error('Error actualizando inventario:', error);
            mostrarNotificacion(`❌ Error al cargar el inventario: ${error.message}`, true);
            return { success: false, error: error.message };
        } finally {
            inventarioRefreshInFlight = null;

            if (inventarioDirty && inventarioEstaVisible()) {
                inventarioDirty = false;
                void actualizarInventario({ deferIfHidden: false });
            }
        }
    })();

    return inventarioRefreshInFlight;
}

function actualizarBadgeInventario(cantidad) {
    const tabInventario = document.querySelector('.tab:nth-child(2)');
    if (!tabInventario) {
        return;
    }

    const badgeExistente = tabInventario.querySelector('.badge-alerta');

    if (badgeExistente) {
        badgeExistente.remove();
    }

    if (cantidad > 0) {
        const badge = document.createElement('span');
        badge.className = 'badge-alerta';
        badge.textContent = cantidad;
        tabInventario.appendChild(badge);
    }
}

async function aplicarFiltro(options = {}) {
    const {
        useCache = true,
        skipIfHidden = false
    } = options;

    try {
        if (!useCache || !inventarioCacheCargado) {
            inventarioCache = exigirListaIpc(await window.electronAPI.obtenerTodos());
            inventarioCacheCargado = true;
        }

        if (skipIfHidden && !inventarioEstaVisible()) {
            return;
        }

        const filtro = obtenerFiltroActualInventario();
        articulosFiltrados = filtrarArticulosPorEstado(inventarioCache, filtro);
        paginaActualInventario = 1;

        if (!inventarioEstaVisible()) {
            return;
        }

        mostrarTabla(articulosFiltrados, 'tablaInventario');
    } catch (error) {
        console.error('Error aplicando filtro de inventario:', error);
        mostrarNotificacion(`❌ Error filtrando inventario: ${error.message}`, true);
    }
}

function cambiarPaginaInventario(delta) {
    const totalPaginas = Math.max(1, Math.ceil(articulosFiltrados.length / ITEMS_POR_PAGINA));
    const nueva = paginaActualInventario + delta;
    if (nueva < 1 || nueva > totalPaginas) return;
    paginaActualInventario = nueva;
    mostrarTabla(articulosFiltrados, 'tablaInventario');
}

function construirHtmlFilas(datos) {
    let html = '';
    datos.forEach(art => {
        const claseAlerta = art.estado === 'En Bodega' ? obtenerClaseAlerta(art.fechaIngreso) : '';
        const diasEnBodega = art.estado === 'En Bodega' ? calcularDiasEnBodega(art.fechaIngreso) : '-';
        const fechaIngresoTexto = formatearFechaChile(art.fechaIngreso);
        const numeroBodega = (typeof art.numeroBodega === 'string' && art.numeroBodega.trim())
            ? art.numeroBodega
            : 'Sin ubicación';
        const estadoPago = (typeof art.estadoPago === 'string' && art.estadoPago.trim())
            ? art.estadoPago
            : 'Sin pago';
        const estadoPagoClase = obtenerClaseEstadoPago(estadoPago);

        html += `
            <tr class="${claseAlerta}" data-articulo-id="${art.id}" data-estado="${escaparHtml(art.estado)}">
                <td><strong>${String(art.id).padStart(4, '0')}</strong></td>
                <td>${escaparHtml(art.rut)}</td>
                <td>${escaparHtml(art.nombreCliente)}</td>
                <td>${escaparHtml(art.tipoArticulo)}</td>
                <td><small>${escaparHtml(art.descripcion)}</small></td>
                <td><strong style="color: var(--location-highlight);">${escaparHtml(numeroBodega)}</strong></td>
                <td><small>${escaparHtml(fechaIngresoTexto)}</small></td>
                <td class="celda-tiempo"><strong class="${claseAlerta ? 'text-alerta' : ''}">${escaparHtml(String(diasEnBodega))}</strong></td>
                <td class="estado-col celda-estado"><span class="status-badge ${art.estado === 'En Bodega' ? 'status-bodega' : 'status-entregado'}">${escaparHtml(art.estado)}</span></td>
                <td class="estado-pago-col celda-estado-pago"><span class="estado-pago-badge estado-pago-${estadoPagoClase}">${escaparHtml(estadoPago)}</span></td>
                <td><strong style="color: ${art.saldoPendiente > 0 ? 'var(--saldo-negative)' : 'var(--saldo-positive)'};">$${escaparHtml(formatearMoneda(art.saldoPendiente))}</strong></td>
                <td class="action-buttons celda-acciones">${construirHtmlAccionesArticulo(art.id, art.estado)}</td>
            </tr>
        `;
    });
    return html;
}

function mostrarTabla(datos, elementoId) {
    const elemento = document.getElementById(elementoId);
    if (!elemento) {
        return;
    }

    if (datos.length === 0) {
        const esInventario = elementoId === 'tablaInventario';
        if (esInventario) {
            elemento.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📦</div><div class="empty-state-text">No hay artículos para mostrar</div><div class="empty-state-hint">Ingresa un artículo desde la pestaña "Ingresar Artículo"</div></div>';
        } else {
            elemento.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--text-muted);">No se encontraron resultados.</p>';
        }
        return;
    }

    const usarPaginacion = elementoId === 'tablaInventario' && datos.length > ITEMS_POR_PAGINA;
    const totalPaginas = usarPaginacion ? Math.ceil(datos.length / ITEMS_POR_PAGINA) : 1;
    if (paginaActualInventario > totalPaginas) paginaActualInventario = totalPaginas;
    const inicio = usarPaginacion ? (paginaActualInventario - 1) * ITEMS_POR_PAGINA : 0;
    const datosPagina = usarPaginacion ? datos.slice(inicio, inicio + ITEMS_POR_PAGINA) : datos;

    let html = `
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>RUT</th>
                    <th>Cliente</th>
                    <th>Tipo</th>
                    <th>Descripción</th>
                    <th>Ubicación (opcional)</th>
                    <th>Fecha Ingreso</th>
                    <th>Tiempo en Bodega</th>
                    <th>Estado</th>
                    <th>Estado Pago</th>
                    <th>Saldo</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
    `;

    html += construirHtmlFilas(datosPagina);
    html += '</tbody></table>';

    if (usarPaginacion) {
        html += `
            <div class="pagination">
                <button class="btn btn-secondary btn-small" onclick="cambiarPaginaInventario(-1)" ${paginaActualInventario <= 1 ? 'disabled' : ''}>← Anterior</button>
                <span class="pagination-info">Página ${paginaActualInventario} de ${totalPaginas} (${datos.length} artículos)</span>
                <button class="btn btn-secondary btn-small" onclick="cambiarPaginaInventario(1)" ${paginaActualInventario >= totalPaginas ? 'disabled' : ''}>Siguiente →</button>
            </div>
        `;
    }

    elemento.innerHTML = html;
}


async function exportarDatos() {
    const btn = document.querySelector('[onclick="exportarDatos()"]');
    setBtnLoading(btn, true);
    try {
        const articulos = exigirListaIpc(await window.electronAPI.obtenerTodos());

        if (articulos.length === 0) {
            mostrarNotificacion('No hay datos para exportar', true);
            return;
        }

        const escaparCsv = (texto) => {
            if (!texto) return '';
            const str = String(texto);
            return str.replace(/"/g, '""').replace(/[\r\n]+/g, ' ');
        };

        let csv = 'ID,RUT,Cliente,Teléfono,Tipo,Descripción,Ubicación (opcional),Fecha Ingreso,Estado,Fecha Entrega,Observaciones,Valor Total,Total Abonado,Saldo Pendiente,Estado Pago\n';

        articulos.forEach(art => {
            const fechaIngresoExport = formatearFechaChileParaExport(art.fechaIngreso);
            const fechaEntregaExport = formatearFechaChileParaExport(art.fechaEntrega);
            csv += `${art.id},"${escaparCsv(art.rut)}","${escaparCsv(art.nombreCliente)}","${escaparCsv(art.telefono)}","${escaparCsv(art.tipoArticulo)}","${escaparCsv(art.descripcion)}","${escaparCsv(art.numeroBodega)}","${escaparCsv(fechaIngresoExport)}","${escaparCsv(art.estado)}","${escaparCsv(fechaEntregaExport)}","${escaparCsv(art.observaciones)}",${art.valorTotal},${art.totalAbonado},${art.saldoPendiente},"${escaparCsv(art.estadoPago)}"\n`;
        });

        // BOM UTF-8: sin él, Excel en Windows interpreta el CSV como ANSI y rompe los acentos.
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', `inventario_zapateria_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        mostrarNotificacion('📥 Datos exportados correctamente');
    } catch (error) {
        console.error('Error exportando CSV de inventario:', error);
        mostrarNotificacion(`❌ Error exportando CSV: ${error.message}`, true);
    } finally {
        setBtnLoading(btn, false);
    }
}

async function migrarDesdeLocalStorage() {
    const datosAntiguos = localStorage.getItem('articulosZapateria');

    if (!datosAntiguos) {
        mostrarNotificacion('❌ No se encontraron datos antiguos en LocalStorage', true);
        return;
    }

    const confirmacion = await confirmarAccionAsync({
        titulo: 'Confirmar migración',
        mensaje: '⚠️ ¿Desea migrar los datos desde LocalStorage a SQLite?\n\nEsto importará todos los artículos antiguos.',
        confirmarTexto: 'Migrar',
        peligro: true
    });
    if (confirmacion) {
        let resultado;
        try {
            resultado = await window.electronAPI.migrarDesdeLocalStorage(datosAntiguos);
        } catch (error) {
            console.error('Error en migración desde LocalStorage:', error);
            mostrarNotificacion(`❌ Error en migración: ${error.message}`, true);
            return;
        }

        if (resultado.success) {
            mostrarNotificacion(`✅ Migrados ${resultado.migrados ?? resultado.total} artículos correctamente`);
            localStorage.removeItem('articulosZapateria');
            await actualizarInventario();
        } else if (typeof resultado.migrados === 'number') {
            const detalle = resultado.errores && resultado.errores.length > 0
                ? ` Primer error: ${resultado.errores[0]}`
                : '';
            mostrarNotificacion(
                `⚠️ Migración parcial. Migrados: ${resultado.migrados}, Fallidos: ${resultado.fallidos}.${detalle}`,
                true
            );
            await actualizarInventario();
        } else {
            mostrarNotificacion('❌ Error en migración: ' + resultado.error, true);
        }
    }
}
