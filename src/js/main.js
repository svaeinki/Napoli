// ============================================
// INICIALIZACIÓN PRINCIPAL
// ============================================

window.onload = async function () {
    try {
        // Esperar a que los templates se carguen completamente
        await window.templatesListos;

        if (typeof inicializarGuardiaFocoInputs === 'function') {
            inicializarGuardiaFocoInputs();
        }
        if (typeof refrescarEstadoRuntimeUI === 'function') {
            await refrescarEstadoRuntimeUI();
            setInterval(() => {
                void refrescarEstadoRuntimeUI();
            }, 30000);
        }

        await actualizarInventario();
        await verificarDropbox();
    } catch (error) {
        console.error('Error en inicialización de la aplicación:', error);
        alert('No se pudo iniciar la aplicación correctamente. Reinicia la app y revisa los archivos HTML.');
    }
};
