// ============================================
// GESTIÓN DE INVENTARIO
// ============================================

let articulosFiltrados = [];

async function actualizarInventario() {
    try {
    const stats = await window.electronAPI.obtenerEstadisticas();

    document.getElementById('totalArticulos').textContent = stats.total;
    document.getElementById('enBodega').textContent = stats.enBodega;
    document.getElementById('entregados').textContent = stats.entregados;

    // Calcular artículos antiguos (más de 30 días)
    const todosArticulos = await window.electronAPI.obtenerTodos();
    const articulosAntiguos = todosArticulos.filter(art => {
        if (art.estado !== 'En Bodega') return false;
        try {
            const partes = art.fechaIngreso.split(',')[0].trim().split('/');
            const fecha = new Date(partes[2], partes[1] - 1, partes[0]);
            const ahora = new Date();
            const dias = Math.floor((ahora - fecha) / (1000 * 60 * 60 * 24));
            return dias >= 30;
        } catch (error) {
            return false;
        }
    });

    // Actualizar badge en la pestaña
    actualizarBadgeInventario(articulosAntiguos.length);

    await aplicarFiltro();
    } catch (error) {
        console.error('Error actualizando inventario:', error);
        mostrarNotificacion('❌ Error al cargar el inventario', true);
    }
}

function actualizarBadgeInventario(cantidad) {
    const tabInventario = document.querySelector('.tab:nth-child(2)');
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

async function aplicarFiltro() {
    const filtro = document.getElementById('filtroEstado').value;
    const todosArticulos = await window.electronAPI.obtenerTodos();

    if (filtro === 'bodega') {
        articulosFiltrados = todosArticulos.filter(a => a.estado === 'En Bodega');
    } else if (filtro === 'entregados') {
        articulosFiltrados = todosArticulos.filter(a => a.estado === 'Entregado');
    } else {
        articulosFiltrados = todosArticulos;
    }

    mostrarTabla(articulosFiltrados, 'tablaInventario');
}

function mostrarTabla(datos, elementoId) {
    const elemento = document.getElementById(elementoId);

    if (datos.length === 0) {
        elemento.innerHTML = '<p style="text-align: center; padding: 40px; color: #999;">No hay artículos para mostrar.</p>';
        return;
    }

    let html = `
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>RUT</th>
                    <th>Cliente</th>
                    <th>Tipo</th>
                    <th>Descripción</th>
                    <th>N° Bodega</th>
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

    datos.forEach(art => {
        const claseAlerta = art.estado === 'En Bodega' ? obtenerClaseAlerta(art.fechaIngreso) : '';
        const diasEnBodega = art.estado === 'En Bodega' ? calcularDiasEnBodega(art.fechaIngreso) : '-';

        html += `
            <tr class="${claseAlerta}">
                <td><strong>${String(art.id).padStart(4, '0')}</strong></td>
                <td>${escaparHtml(art.rut)}</td>
                <td>${escaparHtml(art.nombreCliente)}</td>
                <td>${escaparHtml(art.tipoArticulo)}</td>
                <td><small>${escaparHtml(art.descripcion)}</small></td>
                <td><strong style="color: #667eea;">${escaparHtml(art.numeroBodega)}</strong></td>
                <td><small>${escaparHtml(art.fechaIngreso)}</small></td>
                <td><strong class="${claseAlerta ? 'text-alerta' : ''}">${diasEnBodega}</strong></td>
                <td><span class="status-badge ${art.estado === 'En Bodega' ? 'status-bodega' : 'status-entregado'}">${escaparHtml(art.estado)}</span></td>
                <td><span class="estado-pago-badge estado-pago-${art.estadoPago.toLowerCase().replace(' ', '')}">${escaparHtml(art.estadoPago)}</span></td>
                <td><strong style="color: ${art.saldoPendiente > 0 ? '#f44336' : '#4caf50'};">$${formatearMoneda(art.saldoPendiente)}</strong></td>
                <td class="action-buttons">
                    ${art.estado === 'En Bodega' ?
                `<button class="btn btn-success btn-small" onclick="marcarEntregado(${art.id})">✓ Entregar</button>` :
                `<button class="btn btn-warning btn-small" onclick="marcarEnBodega(${art.id})">↩ Devolver</button>`
            }
                    <button class="btn btn-info btn-small" onclick="mostrarModalPago(${art.id})">💰 Pagos</button>
                    <button class="btn btn-secondary btn-small" onclick="verTicket(${art.id})" title="Ver Ticket">👁️</button>
                    <button class="btn btn-primary btn-small" onclick="reimprimirTicket(${art.id})">🖨</button>
                    <button class="btn btn-danger btn-small" onclick="eliminarArticulo(${art.id})">🗑</button>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    elemento.innerHTML = html;
}

async function exportarDatos() {
    const articulos = await window.electronAPI.obtenerTodos();

    if (articulos.length === 0) {
        mostrarNotificacion('No hay datos para exportar', true);
        return;
    }

    const escaparCsv = (texto) => {
        if (!texto) return '';
        const str = String(texto);
        return str.replace(/"/g, '""').replace(/[\r\n]+/g, ' ');
    };

    let csv = 'ID,RUT,Cliente,Teléfono,Tipo,Descripción,Bodega,Fecha Ingreso,Estado,Fecha Entrega,Observaciones,Valor Total,Total Abonado,Saldo Pendiente,Estado Pago\n';

    articulos.forEach(art => {
        csv += `${art.id},"${escaparCsv(art.rut)}","${escaparCsv(art.nombreCliente)}","${escaparCsv(art.telefono)}","${escaparCsv(art.tipoArticulo)}","${escaparCsv(art.descripcion)}","${escaparCsv(art.numeroBodega)}","${escaparCsv(art.fechaIngreso)}","${escaparCsv(art.estado)}","${escaparCsv(art.fechaEntrega)}","${escaparCsv(art.observaciones)}",${art.valorTotal},${art.totalAbonado},${art.saldoPendiente},"${escaparCsv(art.estadoPago)}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `inventario_zapateria_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    mostrarNotificacion('📥 Datos exportados correctamente');
}

async function migrarDesdeLocalStorage() {
    const datosAntiguos = localStorage.getItem('articulosZapateria');

    if (!datosAntiguos) {
        mostrarNotificacion('❌ No se encontraron datos antiguos en LocalStorage', true);
        return;
    }

    if (confirm('⚠️ ¿Desea migrar los datos desde LocalStorage a SQLite?\n\nEsto importará todos los artículos antiguos.')) {
        const resultado = await window.electronAPI.migrarDesdeLocalStorage(datosAntiguos);

        if (resultado.success) {
            mostrarNotificacion(`✅ Migrados ${resultado.total} artículos correctamente`);
            localStorage.removeItem('articulosZapateria');
            await actualizarInventario();
        } else {
            mostrarNotificacion('❌ Error en migración: ' + resultado.error, true);
        }
    }
}