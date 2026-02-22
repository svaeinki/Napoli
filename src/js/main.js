// ============================================
// INICIALIZACIÓN PRINCIPAL
// ============================================

window.onload = async function () {
    console.log('🚀 Aplicación iniciada');

    try {
        // Esperar a que los templates se carguen completamente
        await window.templatesListos;

        await actualizarInventario();
        await verificarDropbox();
    } catch (error) {
        console.error('❌ Error en inicialización de la aplicación:', error);
        alert('No se pudo iniciar la aplicación correctamente. Reinicia la app y revisa los archivos HTML.');
    }
};

// ============================================
// DETECCIÓN DE ESCÁNER (BARCODE/QR)
// ============================================

let scanBuffer = '';
let lastKeyTime = 0;
const MAX_DELAY_MS = 50; // Tiempo máximo entre teclas para considerar escáner

document.addEventListener('keydown', (e) => {
    const currentTime = Date.now();
    const timeDiff = currentTime - lastKeyTime;
    lastKeyTime = currentTime;

    // Si el foco está en un input y no es el de búsqueda, permitir escritura normal
    // A MENOS que sea muy rápido (escáner)
    const activeElement = document.activeElement;
    const isInput = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA';
    const isSearchInput = activeElement.id === 'campoBuscar';

    // Evitar falsos positivos del escáner cuando el usuario escribe en formularios.
    if (isInput && !isSearchInput) {
        scanBuffer = '';
        return;
    }

    // Si es Enter
    if (e.key === 'Enter') {
        if (scanBuffer.length > 0) {
            // Es probable que sea un escáner si el buffer tiene contenido
            // Verificar si el input fue rápido (promedio) o si simplemente acumulamos buffer rápido

            console.log('Posible escaneo detectado:', scanBuffer);

            // Ejecutar búsqueda
            handleScan(scanBuffer);

            scanBuffer = '';

            // Prevenir submit de formulario si estamos en un paso intermedio
            if (!isInput) {
                e.preventDefault();
            }
        }
    } else if (e.key.length === 1) {
        // Es un caracter imprimible
        if (timeDiff < MAX_DELAY_MS) {
            scanBuffer += e.key;
        } else {
            // Si es lento, es tecleo manual, reiniciar buffer
            // Pero si es el primer caracter de una ráfaga rápida, lo guardamos
            if (scanBuffer.length > 0) {
                scanBuffer = ''; // Reiniciar si hubo una pausa larga
            }
            scanBuffer += e.key;
        }
    } else {
        // Teclas especiales reinician el buffer
        if (scanBuffer.length > 0 && e.key !== 'Shift') {
            scanBuffer = '';
        }
    }

    // Limpiar buffer si pasa mucho tiempo sin Enter (timeout)
    clearTimeout(window.scanTimeout);
    window.scanTimeout = setTimeout(() => {
        scanBuffer = '';
    }, 200);
});

function handleScan(scannedText) {
    // Limpiar texto (quitar espacios, etc)
    const codigo = scannedText.trim();
    if (!codigo) return;

    console.log('Procesando código escaneado:', codigo);

    // Cambiar a tab buscar
    showTab('buscar');

    // Llenar campo y buscar
    const campoBuscar = document.getElementById('campoBuscar');
    if (campoBuscar) {
        campoBuscar.value = codigo;
        // Disparar evento de búsqueda
        buscarArticulos();

        mostrarNotificacion('🔎 Escaneo detectado: ' + codigo);
    }
}

console.log('✅ Módulos cargados correctamente');
