// ============================================
// CARGADOR DE TEMPLATES HTML
// ============================================

async function cargarTemplate(ruta, contenedorId) {
    const response = await fetch(ruta);
    if (!response.ok) {
        throw new Error(`No se pudo cargar ${ruta} (HTTP ${response.status})`);
    }

    const html = await response.text();
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) {
        throw new Error(`Contenedor no encontrado: ${contenedorId}`);
    }

    contenedor.innerHTML = html;
}

async function cargarTodosLosTemplates() {
    const cargas = [
        cargarTemplate('html/tab-ingresar.html', 'ingresar'),
        cargarTemplate('html/tab-inventario.html', 'inventario'),
        cargarTemplate('html/tab-buscar.html', 'buscar'),
        cargarTemplate('html/tab-backup.html', 'backup'),
        cargarTemplate('html/ticket.html', 'ticketContainer'),
        cargarTemplate('html/modal-pagos.html', 'modalContainer')
    ];

    const resultados = await Promise.allSettled(cargas);
    const errores = resultados
        .filter(r => r.status === 'rejected')
        .map(r => r.reason?.message || String(r.reason));

    if (errores.length > 0) {
        throw new Error(`Falló la carga de templates: ${errores.join(' | ')}`);
    }
    
    console.log('✅ Todos los templates cargados');
}

// Promesa global para que otros módulos esperen a que los templates estén listos
window.templatesListos = new Promise((resolve, reject) => {
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            await cargarTodosLosTemplates();
            resolve();
        } catch (error) {
            console.error('❌ Error cargando templates iniciales:', error);
            reject(error);
        }
    });
});
