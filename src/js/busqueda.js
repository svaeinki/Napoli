// ============================================
// BÚSQUEDA DE ARTÍCULOS
// ============================================

async function buscarArticulos() {
    try {
        const termino = document.getElementById('campoBuscar').value.trim();

        if (termino === '') {
            document.getElementById('resultadosBusqueda').innerHTML = '<p style="text-align: center; padding: 40px; color: #999;">Ingrese un término de búsqueda...</p>';
            return;
        }

        const resultados = await window.electronAPI.buscar(termino);

        if (resultados.length === 0) {
            document.getElementById('resultadosBusqueda').innerHTML = '<p style="text-align: center; padding: 40px; color: #999;">No se encontraron resultados.</p>';
        } else {
            mostrarTabla(resultados, 'resultadosBusqueda');
        }
    } catch (error) {
        console.error('Error buscando artículos:', error);
        mostrarNotificacion('❌ Error realizando la búsqueda', true);
    }
}
