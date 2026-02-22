// ============================================
// UTILIDADES GENERALES
// ============================================

function mostrarNotificacion(mensaje, esError = false) {
    const notif = document.getElementById('notification');
    if (!notif) {
        console.warn('No se encontró #notification para mostrar mensaje:', mensaje);
        return;
    }

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

    const tabContent = document.getElementById(tabName);
    if (tabContent) {
        tabContent.classList.add('active');
    }

    // Identificar el botón correspondiente
    const buttons = document.querySelectorAll('.tab');
    const targetButton = Array.from(buttons).find(btn => btn.getAttribute('onclick') === `showTab('${tabName}')`);

    if (targetButton) {
        targetButton.classList.add('active');
    }

    if (tabName === 'inventario') {
        actualizarInventario();
    } else if (tabName === 'backup') {
        verificarDropbox();
        if (typeof refrescarChecklistActualizacion === 'function') {
            refrescarChecklistActualizacion();
        }
    }
}

function construirFechaSegura(anio, mes, dia, hora = 0, minuto = 0, segundo = 0) {
    const fecha = new Date(anio, mes - 1, dia, hora, minuto, segundo);
    if (Number.isNaN(fecha.getTime())) return null;
    if (fecha.getFullYear() !== anio || fecha.getMonth() !== mes - 1 || fecha.getDate() !== dia) {
        return null;
    }
    return fecha;
}

function parseFechaIngreso(fechaIngreso) {
    if (!fechaIngreso) return null;

    if (fechaIngreso instanceof Date) {
        return Number.isNaN(fechaIngreso.getTime()) ? null : new Date(fechaIngreso.getTime());
    }

    if (typeof fechaIngreso === 'number') {
        const fecha = new Date(fechaIngreso);
        return Number.isNaN(fecha.getTime()) ? null : fecha;
    }

    // Formatos históricos esperados:
    // - dd/mm/yyyy, hh:mm:ss
    // - dd-mm-yyyy hh:mm:ss
    // - dd.mm.yyyy
    if (typeof fechaIngreso === 'string') {
        const texto = fechaIngreso.trim();
        if (!texto) return null;

        const matchFechaLocal = texto.match(
            /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:[,\s]+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/
        );

        if (matchFechaLocal) {
            const dia = parseInt(matchFechaLocal[1], 10);
            const mes = parseInt(matchFechaLocal[2], 10);
            let anio = parseInt(matchFechaLocal[3], 10);
            const hora = parseInt(matchFechaLocal[4] || '0', 10);
            const minuto = parseInt(matchFechaLocal[5] || '0', 10);
            const segundo = parseInt(matchFechaLocal[6] || '0', 10);

            if (anio < 100) {
                anio += 2000;
            }

            const fechaLocal = construirFechaSegura(anio, mes, dia, hora, minuto, segundo);
            if (fechaLocal) {
                return fechaLocal;
            }
        }

        // Formatos ISO y otros parseables nativamente.
        const fechaISO = new Date(texto);
        if (!Number.isNaN(fechaISO.getTime())) {
            return fechaISO;
        }
    }

    return null;
}

function calcularDiasEnBodega(fechaIngreso) {
    try {
        const fecha = parseFechaIngreso(fechaIngreso);
        if (!fecha) return 'Fecha inválida';

        const ahora = new Date();
        // Resetear horas para comparar solo días
        fecha.setHours(0, 0, 0, 0);
        ahora.setHours(0, 0, 0, 0);
        const diferencia = ahora - fecha;
        const dias = Math.floor(diferencia / (1000 * 60 * 60 * 24));

        if (dias === 0) return 'Hoy';
        if (dias === 1) return 'Ayer';
        if (dias < 0) return 'Fecha futura'; // Por si acaso
        if (dias < 30) return `Hace ${dias} días`;
        if (dias < 60) return `Hace 1 mes`;
        if (dias < 365) return `Hace ${Math.floor(dias / 30)} meses`;
        return `Hace ${Math.floor(dias / 365)} años`;
    } catch (error) {
        console.error('Error calculando días:', error);
        return 'N/A';
    }
}

function obtenerClaseAlerta(fechaIngreso) {
    try {
        const fecha = parseFechaIngreso(fechaIngreso);
        if (!fecha) return '';

        const ahora = new Date();
        const dias = Math.floor((ahora - fecha) / (1000 * 60 * 60 * 24));

        if (dias >= 60) return 'alerta-critica';
        if (dias >= 30) return 'alerta-warning';
        return '';
    } catch (error) {
        return '';
    }
}

// ============================================
// FORMATEO DE NÚMEROS
// ============================================

function formatearNumeroInput(input) {
    // Eliminar todo excepto números
    let valor = input.value.replace(/\D/g, '');

    // Si está vacío, dejarlo vacío
    if (valor === '') {
        input.value = '';
        return;
    }

    // Convertir a número
    const numero = parseInt(valor);

    // Formatear con separadores de miles
    input.value = new Intl.NumberFormat('es-CL').format(numero);
}

function obtenerValorNumerico(inputElement) {
    const valor = inputElement.value.replace(/\./g, '').replace(/,/g, '');
    return parseInt(valor) || 0;
}

function escaparHtml(texto) {
    if (!texto) return '';
    return texto
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
