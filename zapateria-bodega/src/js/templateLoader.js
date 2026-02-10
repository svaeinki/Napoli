// ============================================
// CARGADOR DE TEMPLATES HTML
// ============================================

async function cargarTemplate(ruta, contenedorId) {
    try {
        const response = await fetch(ruta);
        const html = await response.text();
        document.getElementById(contenedorId).innerHTML = html;
    } catch (error) {
        console.error(`Error cargando template ${ruta}:`, error);
    }
}

async function cargarTodosLosTemplates() {
    await Promise.all([
        cargarTemplate('html/tab-ingresar.html', 'ingresar'),
        cargarTemplate('html/tab-inventario.html', 'inventario'),
        cargarTemplate('html/tab-buscar.html', 'buscar'),
        cargarTemplate('html/tab-backup.html', 'backup'),
        cargarTemplate('html/ticket.html', 'ticketContainer'),
        cargarTemplate('html/modal-pagos.html', 'modalContainer')
    ]);
    
    console.log('✅ Todos los templates cargados');
}

// Promesa global para que otros módulos esperen a que los templates estén listos
window.templatesListos = new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', async () => {
        await cargarTodosLosTemplates();
        resolve();
    });
});