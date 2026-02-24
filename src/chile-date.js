const TIMEZONE_CHILE = 'America/Santiago';

const PARTS_FORMATTER = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE_CHILE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
});

const DISPLAY_FORMATTER = new Intl.DateTimeFormat('es-CL', {
    timeZone: TIMEZONE_CHILE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
});

function esFechaValida(fecha) {
    return fecha instanceof Date && !Number.isNaN(fecha.getTime());
}

function obtenerPartesEnChile(fecha) {
    const partes = PARTS_FORMATTER.formatToParts(fecha);
    const resultado = {};
    for (const parte of partes) {
        if (
            parte.type === 'year' ||
            parte.type === 'month' ||
            parte.type === 'day' ||
            parte.type === 'hour' ||
            parte.type === 'minute' ||
            parte.type === 'second'
        ) {
            resultado[parte.type] = Number(parte.value);
        }
    }
    return resultado;
}

function obtenerOffsetChileMinutos(fecha) {
    const partes = obtenerPartesEnChile(fecha);
    const asUtc = Date.UTC(
        partes.year,
        partes.month - 1,
        partes.day,
        partes.hour,
        partes.minute,
        partes.second
    );
    return Math.round((asUtc - fecha.getTime()) / 60000);
}

function construirFechaChileSegura(anio, mes, dia, hora = 0, minuto = 0, segundo = 0) {
    const localAsUtc = Date.UTC(anio, mes - 1, dia, hora, minuto, segundo);
    let utcMs = localAsUtc - (obtenerOffsetChileMinutos(new Date(localAsUtc)) * 60000);
    utcMs = localAsUtc - (obtenerOffsetChileMinutos(new Date(utcMs)) * 60000);

    const fecha = new Date(utcMs);
    if (!esFechaValida(fecha)) return null;

    const validacion = obtenerPartesEnChile(fecha);
    if (
        validacion.year !== anio ||
        validacion.month !== mes ||
        validacion.day !== dia ||
        validacion.hour !== hora ||
        validacion.minute !== minuto ||
        validacion.second !== segundo
    ) {
        return null;
    }

    return fecha;
}

function normalizarMeridiem(raw) {
    if (!raw) return null;
    const normalizado = String(raw).toLowerCase().replace(/[\s.]/g, '');
    if (normalizado === 'am') return 'am';
    if (normalizado === 'pm') return 'pm';
    return null;
}

function parsearFechaIso(texto) {
    if (!/^\d{4}-\d{2}-\d{2}T/.test(texto)) {
        return null;
    }
    const fecha = new Date(texto);
    return esFechaValida(fecha) ? fecha : null;
}

function parsearFechaLocalChile(texto) {
    const match = texto.match(
        /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:[,\s]+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?(?:\s*([AaPp]\.?\s*[Mm]\.?))?$/
    );
    if (!match) {
        return null;
    }

    const dia = Number(match[1]);
    const mes = Number(match[2]);
    let anio = Number(match[3]);
    let hora = Number(match[4] || 0);
    const minuto = Number(match[5] || 0);
    const segundo = Number(match[6] || 0);
    const meridiem = normalizarMeridiem(match[7]);

    if (anio < 100) {
        anio += 2000;
    }

    if (meridiem) {
        if (hora < 1 || hora > 12) return null;
        if (meridiem === 'pm' && hora < 12) hora += 12;
        if (meridiem === 'am' && hora === 12) hora = 0;
    } else if (hora < 0 || hora > 23) {
        return null;
    }

    if (minuto < 0 || minuto > 59 || segundo < 0 || segundo > 59) {
        return null;
    }

    return construirFechaChileSegura(anio, mes, dia, hora, minuto, segundo);
}

function parseFechaChileInput(fechaRaw) {
    if (fechaRaw === null || fechaRaw === undefined) {
        return null;
    }

    if (fechaRaw instanceof Date) {
        return esFechaValida(fechaRaw) ? new Date(fechaRaw.getTime()) : null;
    }

    if (typeof fechaRaw === 'number') {
        const fecha = new Date(fechaRaw);
        return esFechaValida(fecha) ? fecha : null;
    }

    if (typeof fechaRaw !== 'string') {
        return null;
    }

    const texto = fechaRaw.trim();
    if (!texto) return null;

    const iso = parsearFechaIso(texto);
    if (iso) return iso;

    const localChile = parsearFechaLocalChile(texto);
    if (localChile) return localChile;

    const fallback = new Date(texto);
    return esFechaValida(fallback) ? fallback : null;
}

function normalizarFechaIsoChile(fechaRaw, { fallbackNow = true } = {}) {
    const fecha = parseFechaChileInput(fechaRaw);
    if (fecha) return fecha.toISOString();
    return fallbackNow ? new Date().toISOString() : null;
}

function normalizarFechaIngresoIso(fechaRaw, { fallbackNow = true } = {}) {
    return normalizarFechaIsoChile(fechaRaw, { fallbackNow });
}

function formatearFechaChile(fechaRaw, { fallback = 'Fecha inválida' } = {}) {
    const fecha = parseFechaChileInput(fechaRaw);
    if (!fecha) return fallback;
    return DISPLAY_FORMATTER.format(fecha);
}

function formatearFechaChileParaExport(fechaRaw) {
    const fecha = parseFechaChileInput(fechaRaw);
    if (!fecha) return fechaRaw ? String(fechaRaw) : '';
    return DISPLAY_FORMATTER.format(fecha);
}

module.exports = {
    TIMEZONE_CHILE,
    formatearFechaChile,
    formatearFechaChileParaExport,
    normalizarFechaIsoChile,
    normalizarFechaIngresoIso,
    parseFechaChileInput
};
