const test = require('node:test');
const assert = require('node:assert/strict');

const {
    formatearFechaChile,
    formatearFechaChileParaExport,
    normalizarFechaIngresoIso,
    parseFechaChileInput
} = require('../../src/chile-date');

test('parsea formato legado con p. m. y conserva hora Chile al normalizar a ISO', () => {
    const iso = normalizarFechaIngresoIso('23-02-2026, 10:46:19 p. m.', { fallbackNow: false });
    assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
    assert.equal(formatearFechaChile(iso), '23-02-2026, 22:46:19');
});

test('parsea formato legado con a. m. correctamente', () => {
    const iso = normalizarFechaIngresoIso('23/02/2026 12:05:00 a. m.', { fallbackNow: false });
    assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
    assert.equal(formatearFechaChile(iso), '23-02-2026, 00:05:00');
});

test('acepta ISO y devuelve Date válida', () => {
    const fecha = parseFechaChileInput('2026-02-24T01:46:19.000Z');
    assert.equal(fecha instanceof Date, true);
    assert.equal(Number.isNaN(fecha.getTime()), false);
});

test('en inválidos, normalización sin fallback devuelve null y export preserva texto', () => {
    const iso = normalizarFechaIngresoIso('fecha sin formato', { fallbackNow: false });
    assert.equal(iso, null);
    assert.equal(formatearFechaChileParaExport('fecha sin formato'), 'fecha sin formato');
});

test('hora inexistente por cambio de horario no intercambia día y mes', () => {
    // 08-09-2024 00:00 no existe en Chile (el reloj saltó a 01:00).
    const fecha = parseFechaChileInput('08-09-2024');
    assert.ok(fecha instanceof Date);
    assert.equal(formatearFechaChile(fecha), '08-09-2024, 01:00:00');
});

test('hora repetida al atrasar el reloj sigue siendo válida', () => {
    // 06-04-2024 23:30 ocurre dos veces en Chile; se acepta la primera.
    const fecha = parseFechaChileInput('06-04-2024 23:30');
    assert.ok(fecha instanceof Date);
    assert.equal(formatearFechaChile(fecha), '06-04-2024, 23:30:00');
});

test('fecha de calendario inexistente con formato dd-mm-aaaa se rechaza sin usar el parser nativo', () => {
    assert.equal(parseFechaChileInput('31-02-2024'), null);
    assert.equal(normalizarFechaIngresoIso('13-25-2024', { fallbackNow: false }), null);
});
