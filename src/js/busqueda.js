// ============================================
// BÚSQUEDA DE ARTÍCULOS
// ============================================

let _busquedaDebounceTimer = null;

// Versión con debounce para llamadas desde oninput — evita disparar una IPC por cada tecla.
function buscarArticulosDebounced() {
    clearTimeout(_busquedaDebounceTimer);
    _busquedaDebounceTimer = setTimeout(buscarArticulos, 300);
}

function toggleSearchClear() {
    const input = document.getElementById('campoBuscar');
    const btn = document.getElementById('btnLimpiarBusqueda');
    if (btn) {
        btn.style.display = input && input.value.length > 0 ? 'block' : 'none';
    }
}

function limpiarBusqueda() {
    const input = document.getElementById('campoBuscar');
    if (input) {
        input.value = '';
        input.focus();
    }
    toggleSearchClear();
    const resultados = document.getElementById('resultadosBusqueda');
    if (resultados) {
        resultados.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--text-muted);">Ingrese un término de búsqueda...</p>';
    }
    const countEl = document.getElementById('searchResultCount');
    if (countEl) countEl.textContent = '';
}

function actualizarContadorResultados(cantidad) {
    const countEl = document.getElementById('searchResultCount');
    if (!countEl) return;
    if (cantidad === null) {
        countEl.textContent = '';
    } else if (cantidad === 0) {
        countEl.textContent = 'Sin resultados';
    } else {
        countEl.textContent = `${cantidad} resultado${cantidad !== 1 ? 's' : ''} encontrado${cantidad !== 1 ? 's' : ''}`;
    }
}

async function buscarArticulos() {
    try {
        const termino = document.getElementById('campoBuscar').value.trim();

        if (termino === '') {
            document.getElementById('resultadosBusqueda').innerHTML = '<p style="text-align: center; padding: 40px; color: var(--text-muted);">Ingrese un término de búsqueda...</p>';
            actualizarContadorResultados(null);
            return;
        }

        const resultados = await window.electronAPI.buscar(termino);

        actualizarContadorResultados(resultados.length);

        if (resultados.length === 0) {
            document.getElementById('resultadosBusqueda').innerHTML = '<p style="text-align: center; padding: 40px; color: var(--text-muted);">No se encontraron resultados.</p>';
        } else {
            mostrarTabla(resultados, 'resultadosBusqueda');
        }
    } catch (error) {
        console.error('Error buscando artículos:', error);
        mostrarNotificacion(`❌ Error realizando la búsqueda: ${error.message}`, true);
    }
}
