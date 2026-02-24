// ============================================
// BÚSQUEDA DE ARTÍCULOS
// ============================================

let _busquedaDebounceTimer = null;

// Versión con debounce para llamadas desde oninput — evita disparar una IPC por cada tecla.
function buscarArticulosDebounced() {
    clearTimeout(_busquedaDebounceTimer);
    _busquedaDebounceTimer = setTimeout(buscarArticulos, 300);
}

async function buscarArticulos() {
    try {
        const termino = document.getElementById('campoBuscar').value.trim();

        if (termino === '') {
            document.getElementById('resultadosBusqueda').innerHTML = '<p style="text-align: center; padding: 40px; color: var(--text-muted);">Ingrese un término de búsqueda...</p>';
            return;
        }

        const resultados = await window.electronAPI.buscar(termino);

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
