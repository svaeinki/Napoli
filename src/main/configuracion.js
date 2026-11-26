// Configuración persistente (config.json en userData): carga con migraciones y
// recuperación ante archivo corrupto, guardado atómico, configuración de impresora,
// registro de decisiones operativas y cifrado del token de Dropbox con safeStorage.
const { safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { USER_DATA_PATH, CONFIG_PATH } = require('./rutas');
const { timestampIsoSeguro, escribirJsonAtomico } = require('./utilidades');

const OPERATIONAL_DECISIONS_MAX = 50;
const PRINTER_CONFIG_DEFAULTS = Object.freeze({
    width: '58mm',
    fontProfile58: 'legible',
    contentWidth58mm: 48,
    verticalShift58mm: 15,
    topOffset58mm: 15,
    finalTrim58mm: 0,
    driverCompatAnchor58: true,
    header: 'NAPOLI\nReparadora de Calzado',
    footer: 'Gracias por preferir Napoli\nConserve este ticket'
});

function normalizarDecisionOperativa(rawDecision) {
    if (!rawDecision || typeof rawDecision !== 'object') {
        return null;
    }

    const code = typeof rawDecision.code === 'string' ? rawDecision.code.trim() : '';
    if (!code) {
        return null;
    }

    const context = typeof rawDecision.context === 'string' && rawDecision.context.trim()
        ? rawDecision.context.trim()
        : 'general';
    const note = typeof rawDecision.note === 'string'
        ? rawDecision.note.trim().slice(0, 500)
        : '';
    const ts = typeof rawDecision.ts === 'string' && rawDecision.ts.trim()
        ? rawDecision.ts.trim()
        : new Date().toISOString();

    return {
        code,
        context,
        accepted: rawDecision.accepted !== false,
        note,
        ts
    };
}

function normalizarListaDecisionesOperativas(rawList) {
    if (!Array.isArray(rawList)) {
        return [];
    }

    const normalizadas = [];
    for (const decision of rawList) {
        const item = normalizarDecisionOperativa(decision);
        if (!item) continue;
        normalizadas.push(item);
    }
    return normalizadas.slice(-OPERATIONAL_DECISIONS_MAX);
}

function registrarDecisionOperativa(decision, configExistente = null) {
    try {
        const config = (configExistente && typeof configExistente === 'object')
            ? configExistente
            : cargarConfiguracion();

        const decisionNormalizada = normalizarDecisionOperativa(decision);
        if (!decisionNormalizada) {
            return null;
        }

        const decisionesActuales = normalizarListaDecisionesOperativas(config.operationalDecisions);
        const yaRegistrada = decisionesActuales.some((item) =>
            item.code === decisionNormalizada.code && item.context === decisionNormalizada.context
        );
        if (yaRegistrada) {
            if (!Array.isArray(config.operationalDecisions) || config.operationalDecisions.length !== decisionesActuales.length) {
                config.operationalDecisions = decisionesActuales;
                guardarConfiguracion(config);
            }
            return null;
        }

        const actualizada = [...decisionesActuales, decisionNormalizada].slice(-OPERATIONAL_DECISIONS_MAX);
        config.operationalDecisions = actualizada;
        guardarConfiguracion(config);
        return decisionNormalizada;
    } catch (error) {
        console.error('Error registrando decisión operativa:', error);
        return null;
    }
}

function crearConfiguracionPorDefecto() {
    return {
        printer: { ...PRINTER_CONFIG_DEFAULTS },
        operationalDecisions: []
    };
}

// Guarda una copia del config.json ilegible en vez de perderlo (contiene el token de Dropbox).
function preservarConfiguracionCorrupta() {
    const destino = path.join(USER_DATA_PATH, `config.corrupt-${timestampIsoSeguro()}.json`);
    try {
        fs.copyFileSync(CONFIG_PATH, destino);
        console.error(`config.json ilegible; se conservó una copia en ${destino}`);
        return true;
    } catch (error) {
        console.error('No se pudo conservar copia del config.json ilegible:', error);
        return false;
    }
}

function guardarConfiguracionInicial(config) {
    try {
        guardarConfiguracion(config);
    } catch (saveError) {
        console.error('Error guardando configuración inicial:', saveError);
    }
    return config;
}

// Cargar configuración (incluye token de Dropbox)
function cargarConfiguracion() {
    let raw = null;
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        }
    } catch (error) {
        // No se pudo leer (permisos, archivo bloqueado...): no sobrescribir lo que haya en disco.
        console.error('Error leyendo configuración:', error);
        return crearConfiguracionPorDefecto();
    }

    if (raw === null) {
        return guardarConfiguracionInicial(crearConfiguracionPorDefecto());
    }

    let config = null;
    try {
        config = JSON.parse(raw);
    } catch (error) {
        console.error('Error parseando configuración:', error);
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        // Solo se reemplaza el archivo si antes se pudo conservar una copia.
        if (!preservarConfiguracionCorrupta()) {
            return crearConfiguracionPorDefecto();
        }
        return guardarConfiguracionInicial(crearConfiguracionPorDefecto());
    }

    try {
        let configModificada = false;

        if (!config.printer || typeof config.printer !== 'object') {
            config.printer = {};
            configModificada = true;
        }

        // Migración v1: verticalShift58mm era inefectivo (Electron margin anulado por @page CSS).
        // Ahora funciona via CSS var — bumpeamos valores bajos a un default seguro.
        if (
            config.printer &&
            !config._migrated_verticalShift_v1 &&
            typeof config.printer.verticalShift58mm === 'number' &&
            config.printer.verticalShift58mm < 8
        ) {
            config.printer.verticalShift58mm = 10;
            config._migrated_verticalShift_v1 = true;
            configModificada = true;
        }
        // Migración v2: offset ahora es inline style directo (eliminado doble mecanismo Electron margin).
        // Default bumpeado a 15 mm para cubrir impresoras con mayor distancia cabezal→sierra.
        if (
            config.printer &&
            !config._migrated_verticalShift_v2 &&
            typeof config.printer.verticalShift58mm === 'number' &&
            config.printer.verticalShift58mm < 12
        ) {
            config.printer.verticalShift58mm = 15;
            config._migrated_verticalShift_v2 = true;
            configModificada = true;
        }
        // Migración v3: endurece mínimo operativo del offset para evitar recorte superior.
        if (
            config.printer &&
            !config._migrated_verticalShift_v3 &&
            Number.isFinite(Number(config.printer.verticalShift58mm)) &&
            Number(config.printer.verticalShift58mm) < 8
        ) {
            config.printer.verticalShift58mm = 15;
            config._migrated_verticalShift_v3 = true;
            configModificada = true;
        }

        const printerNormalizado = sanitizarConfigImpresora(config.printer || {});
        const printerCompleto = { ...PRINTER_CONFIG_DEFAULTS, ...printerNormalizado };
        const printerAnterior = JSON.stringify(config.printer);
        const printerNuevo = JSON.stringify(printerCompleto);
        if (printerAnterior !== printerNuevo) {
            config.printer = printerCompleto;
            configModificada = true;
        }

        const decisionesNormalizadas = normalizarListaDecisionesOperativas(config.operationalDecisions);
        if (JSON.stringify(config.operationalDecisions || []) !== JSON.stringify(decisionesNormalizadas)) {
            config.operationalDecisions = decisionesNormalizadas;
            configModificada = true;
        }

        if (configModificada) {
            try {
                guardarConfiguracion(config);
            } catch (saveError) {
                console.error('Error persistiendo configuración migrada:', saveError);
            }
        }
        return config;
    } catch (error) {
        console.error('Error normalizando configuración:', error);
        return config;
    }
}

// Guardar configuración
function guardarConfiguracion(config) {
    escribirJsonAtomico(CONFIG_PATH, config);
}

// Cifrar token usando safeStorage de Electron
function cifrarToken(token) {
    if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.encryptString(token).toString('base64');
    }
    return token;
}

// Descifrar token
function descifrarToken(tokenCifrado) {
    if (!tokenCifrado) return null;
    try {
        if (safeStorage.isEncryptionAvailable()) {
            const buffer = Buffer.from(tokenCifrado, 'base64');
            return safeStorage.decryptString(buffer);
        }
    } catch (error) {
        // Si falla el descifrado, asumir que es un token sin cifrar (migración)
        console.error('Token sin cifrar detectado, se cifrará en el próximo guardado');
    }
    return tokenCifrado;
}

function sanitizarConfigImpresora(printerConfig = {}) {
    const widthsPermitidos = new Set(['58mm', '80mm']);
    const perfilesPermitidos = new Set(['compacto', 'legible', 'extra_grande']);
    const sanitizarCalibracion58mm = (valor, fallback, min = 0, max = 8) => {
        const parsed = Number(valor);
        const fallbackNumber = Number(fallback);
        const fallbackSanitizado = Number.isFinite(fallbackNumber)
            ? Math.min(max, Math.max(min, fallbackNumber))
            : min;
        if (!Number.isFinite(parsed)) return fallbackSanitizado;
        const clamped = Math.min(max, Math.max(min, parsed));
        return Math.round(clamped * 2) / 2;
    };
    const width = widthsPermitidos.has(printerConfig.width)
        ? printerConfig.width
        : PRINTER_CONFIG_DEFAULTS.width;
    const fontProfileRaw = typeof printerConfig.fontProfile58 === 'string'
        ? printerConfig.fontProfile58.trim().toLowerCase()
        : '';
    const fontProfile58 = perfilesPermitidos.has(fontProfileRaw)
        ? fontProfileRaw
        : PRINTER_CONFIG_DEFAULTS.fontProfile58;
    const contentWidthRaw = Number(printerConfig.contentWidth58mm);
    const contentWidth58mm = Number.isFinite(contentWidthRaw)
        ? Math.min(54, Math.max(44, contentWidthRaw))
        : PRINTER_CONFIG_DEFAULTS.contentWidth58mm;
    const verticalShiftRaw = Number.isFinite(Number(printerConfig.verticalShift58mm))
        ? printerConfig.verticalShift58mm
        : printerConfig.topOffset58mm;
    const verticalShift58mm = sanitizarCalibracion58mm(
        verticalShiftRaw,
        PRINTER_CONFIG_DEFAULTS.verticalShift58mm,
        8,
        35
    );
    const finalTrim58mm = sanitizarCalibracion58mm(
        printerConfig.finalTrim58mm,
        PRINTER_CONFIG_DEFAULTS.finalTrim58mm,
        0,
        8
    );
    const driverCompatAnchor58 = typeof printerConfig.driverCompatAnchor58 === 'boolean'
        ? printerConfig.driverCompatAnchor58
        : PRINTER_CONFIG_DEFAULTS.driverCompatAnchor58;
    const header = typeof printerConfig.header === 'string' && printerConfig.header.trim()
        ? printerConfig.header.slice(0, 500)
        : PRINTER_CONFIG_DEFAULTS.header;
    const footer = typeof printerConfig.footer === 'string' && printerConfig.footer.trim()
        ? printerConfig.footer.slice(0, 500)
        : PRINTER_CONFIG_DEFAULTS.footer;
    return {
        width,
        header,
        footer,
        fontProfile58,
        contentWidth58mm,
        verticalShift58mm,
        topOffset58mm: verticalShift58mm,
        finalTrim58mm,
        driverCompatAnchor58
    };
}

module.exports = {
    cargarConfiguracion,
    guardarConfiguracion,
    registrarDecisionOperativa,
    sanitizarConfigImpresora,
    cifrarToken,
    descifrarToken
};
