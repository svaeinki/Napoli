// ============================================
// UTILIDADES GENERALES
// ============================================

function mostrarNotificacion(mensaje, esError = false) {
    const notif = document.getElementById('notification');
    notif.textContent = mensaje;
    notif.className = 'notification' + (esError ? ' error' : '');
    notif.style.display = 'block';
    
    setTimeout(() => {
        notif.style.display = 'none';
    }, 3000);
}

function formatearMoneda(valor) {
    return new Intl.NumberFormat('es-CL').format(valor || 0);
}

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    
    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');

    if (tabName === 'inventario') {
        actualizarInventario();
    } else if (tabName === 'backup') {
        verificarDropbox();
    }
}

function calcularDiasEnBodega(fechaIngreso) {
    try {
        const partes = fechaIngreso.split(',')[0].trim().split('/');
        const fecha = new Date(partes[2], partes[1] - 1, partes[0]);
        
        const ahora = new Date();
        const diferencia = ahora - fecha;
        const dias = Math.floor(diferencia / (1000 * 60 * 60 * 24));
        
        if (dias === 0) return 'Hoy';
        if (dias === 1) return 'Ayer';
        if (dias < 30) return `Hace ${dias} días`;
        if (dias < 60) return `Hace 1 mes`;
        if (dias < 365) return `Hace ${Math.floor(dias / 30)} meses`;
        return `Hace ${Math.floor(dias / 365)} años`;
    } catch (error) {
        return 'N/A';
    }
}

function obtenerClaseAlerta(fechaIngreso) {
    try {
        const partes = fechaIngreso.split(',')[0].trim().split('/');
        const fecha = new Date(partes[2], partes[1] - 1, partes[0]);
        
        const ahora = new Date();
        const dias = Math.floor((ahora - fecha) / (1000 * 60 * 60 * 24));
        
        if (dias >= 60) return 'alerta-critica';
        if (dias >= 30) return 'alerta-warning';
        return '';
    } catch (error) {
        return '';
    }
}