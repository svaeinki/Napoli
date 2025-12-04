// ============================================
// SISTEMA DE TEMA OSCURO
// ============================================

function toggleTheme() {
    const body = document.body;
    const themeIcon = document.getElementById('themeIcon');
    
    if (body.classList.contains('dark-theme')) {
        // Cambiar a tema claro
        body.classList.remove('dark-theme');
        themeIcon.textContent = '🌙';
        localStorage.setItem('theme', 'light');
    } else {
        // Cambiar a tema oscuro
        body.classList.add('dark-theme');
        themeIcon.textContent = '☀️';
        localStorage.setItem('theme', 'dark');
    }
}

// Cargar tema guardado al iniciar
function cargarTemaGuardado() {
    const temaGuardado = localStorage.getItem('theme');
    const themeIcon = document.getElementById('themeIcon');
    
    if (temaGuardado === 'dark') {
        document.body.classList.add('dark-theme');
        if (themeIcon) themeIcon.textContent = '☀️';
    }
}

// Aplicar tema al cargar la página
document.addEventListener('DOMContentLoaded', cargarTemaGuardado);