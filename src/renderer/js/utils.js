// ============================================
// UTILIDADES GENERALES
// ============================================

let _notificacionTimerId = null;

function mostrarNotificacion(mensaje, esError = false) {
    const notif = document.getElementById('notification');
    if (!notif) {
        console.error('No se encontró #notification para mostrar mensaje:', mensaje);
        return;
    }

    if (_notificacionTimerId) {
        clearTimeout(_notificacionTimerId);
    }

    notif.textContent = mensaje;
    notif.className = 'notification' + (esError ? ' error' : '');
    notif.style.display = 'block';

    _notificacionTimerId = setTimeout(() => {
        notif.style.display = 'none';
        _notificacionTimerId = null;
    }, 3000);
}

function formatearMoneda(valor) {
    return new Intl.NumberFormat('es-CL').format(valor || 0);
}

function obtenerTabActivaId() {
    if (!document || typeof document.querySelector !== 'function') {
        return null;
    }
    const activa = document.querySelector('.tab-content.active');
    return activa ? activa.id : null;
}

function registrarEventoDiagnostico(type, extra = {}) {
    if (typeof window === 'undefined' || !window.electronAPI || typeof window.electronAPI.diagEvent !== 'function') {
        return;
    }
    const payload = {
        type,
        tab: obtenerTabActivaId(),
        ...extra
    };
    window.electronAPI.diagEvent(payload).catch(() => {
        // No bloquear UI por fallos de diagnóstico.
    });
}

function asegurarBannerRuntime() {
    let banner = document.getElementById('runtimeWarningBanner');
    if (banner) {
        return banner;
    }

    banner = document.createElement('div');
    banner.id = 'runtimeWarningBanner';
    banner.className = 'runtime-warning-banner';
    document.body.insertBefore(banner, document.body.firstChild);
    return banner;
}

async function refrescarEstadoRuntimeUI() {
    if (!window.electronAPI || typeof window.electronAPI.obtenerRuntimeInfo !== 'function') {
        return;
    }

    try {
        const info = await window.electronAPI.obtenerRuntimeInfo();
        const banner = asegurarBannerRuntime();
        const warning = info && typeof info.dbWarning === 'string' ? info.dbWarning.trim() : '';
        if (warning) {
            banner.textContent = `Modo compatibilidad (rendimiento reducido): ${warning}`;
            banner.style.display = 'block';
        } else {
            banner.textContent = '';
            banner.style.display = 'none';
        }
    } catch (error) {
        // Ignorar: la app debe continuar aunque no se pueda consultar runtime info.
    }
}

function asegurarInputsEditablesActivos(scopeSelector) {
    let scope = null;
    if (document && typeof document.querySelector === 'function') {
        scope = document.querySelector(scopeSelector);
    }
    if (!scope && scopeSelector === '#ingresar' && document && typeof document.getElementById === 'function') {
        scope = document.getElementById('ingresar');
    }
    if (!scope && scopeSelector === '#buscar' && document && typeof document.getElementById === 'function') {
        scope = document.getElementById('buscar');
    }
    if (!scope) {
        return;
    }

    scope.removeAttribute('inert');
    scope.style.pointerEvents = '';

    if (scopeSelector === '#ingresar' && document && typeof document.getElementById === 'function') {
        const formIngresar = document.getElementById('formIngresar');
        if (formIngresar) {
            formIngresar.removeAttribute('inert');
            formIngresar.style.pointerEvents = '';
        }
    }

    let controles = [];
    if (typeof scope.querySelectorAll === 'function') {
        controles = Array.from(scope.querySelectorAll('input, textarea, button, select'));
    }
    if (controles.length === 0 && scopeSelector === '#ingresar' && document && typeof document.getElementById === 'function') {
        const formIngresar = document.getElementById('formIngresar');
        if (formIngresar && typeof formIngresar.querySelectorAll === 'function') {
            controles = Array.from(formIngresar.querySelectorAll('input, textarea, button, select'));
        }
    }
    controles.forEach((control) => {
        if (!control) return;
        control.disabled = false;

        // Dentro de ingresar/buscar no se espera readonly persistente.
        if (Object.prototype.hasOwnProperty.call(control, 'readOnly')) {
            control.readOnly = false;
        }
        control.removeAttribute('inert');
        control.style.pointerEvents = '';
    });

    registrarEventoDiagnostico('inputs:unlock', { scope: scopeSelector, controles: controles.length });
}

let guardiaFocoInputsInicializada = false;

function inicializarGuardiaFocoInputs() {
    if (guardiaFocoInputsInicializada) {
        return;
    }
    guardiaFocoInputsInicializada = true;

    document.addEventListener('pointerdown', (event) => {
        const target = event.target;
        if (!target || typeof target.matches !== 'function') {
            return;
        }

        if (!target.matches('input, textarea')) {
            return;
        }

        const scope = target.closest('#ingresar, #buscar');
        if (!scope) {
            return;
        }

        if (target.disabled || target.readOnly) {
            return;
        }

        const inputObjetivo = target;
        const verificarFoco = () => {
            if (document.activeElement === inputObjetivo) {
                return;
            }
            if (typeof inputObjetivo.focus === 'function') {
                inputObjetivo.focus({ preventScroll: true });
            }
            registrarEventoDiagnostico('focus_guard_forced', {
                scope: scope.id || null,
                controlId: inputObjetivo.id || null
            });
        };

        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => setTimeout(verificarFoco, 0));
        } else {
            setTimeout(verificarFoco, 0);
        }
    }, true);
}

let resolverConfirmacionPendiente = null;
let modalConfirmacionAbortController = null;

function limpiarListenersModalConfirmacion() {
    if (modalConfirmacionAbortController) {
        modalConfirmacionAbortController.abort();
        modalConfirmacionAbortController = null;
    }
}

function resolverModalConfirmacion(decision) {
    const modal = document.getElementById('modalConfirmacion');
    if (modal) {
        modal.style.display = 'none';
    }
    limpiarListenersModalConfirmacion();

    if (resolverConfirmacionPendiente) {
        const resolve = resolverConfirmacionPendiente;
        resolverConfirmacionPendiente = null;
        resolve(Boolean(decision));
    }
}

async function confirmarAccionAsync({ titulo = 'Confirmar acción', mensaje = '', confirmarTexto = 'Confirmar', peligro = false } = {}) {
    const modal = document.getElementById('modalConfirmacion');
    const tituloEl = document.getElementById('modalConfirmacionTitulo');
    const mensajeEl = document.getElementById('modalConfirmacionMensaje');
    const aceptarBtn = document.getElementById('modalConfirmacionAceptar');

    if (!modal || !tituloEl || !mensajeEl || !aceptarBtn) {
        return confirm(`${titulo}\n\n${mensaje}`);
    }

    if (resolverConfirmacionPendiente) {
        resolverModalConfirmacion(false);
    }

    tituloEl.textContent = titulo;
    mensajeEl.textContent = mensaje;
    aceptarBtn.textContent = confirmarTexto;
    aceptarBtn.classList.toggle('btn-danger', Boolean(peligro));
    if (!peligro) {
        aceptarBtn.classList.remove('btn-danger');
        aceptarBtn.classList.add('btn-primary');
    } else {
        aceptarBtn.classList.remove('btn-primary');
    }

    modal.style.display = 'block';

    modalConfirmacionAbortController = new AbortController();
    const { signal } = modalConfirmacionAbortController;

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            resolverModalConfirmacion(false);
        }
    }, { signal });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            resolverModalConfirmacion(false);
        }
    }, { signal });

    if (typeof modal.querySelector === 'function') {
        const modalContent = modal.querySelector('.modal-content-confirmacion') || modal.querySelector('.modal-content');
        activarFocusTrap(modalContent, signal);
    }

    return await new Promise((resolve) => {
        resolverConfirmacionPendiente = resolve;
    });
}

function desbloquearFormularioIngreso({ focusRut = true } = {}) {
    asegurarInputsEditablesActivos('#ingresar');

    if (!focusRut) {
        return;
    }

    const campoRut = document.getElementById('rut');
    if (!campoRut || typeof campoRut.focus !== 'function') {
        return;
    }

    const enfocar = () => campoRut.focus();
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(enfocar);
    } else {
        setTimeout(enfocar, 0);
    }
}

function showTab(tabName) {
    // Limpiar debounce de búsqueda pendiente al cambiar de tab
    if (typeof _busquedaDebounceTimer !== 'undefined' && _busquedaDebounceTimer !== null) {
        clearTimeout(_busquedaDebounceTimer);
        _busquedaDebounceTimer = null;
    }

    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
    });

    const tabContent = document.getElementById(tabName);
    if (tabContent) {
        tabContent.classList.add('active');
    }

    // Identificar el botón correspondiente
    const buttons = document.querySelectorAll('.tab');
    const targetButton = Array.from(buttons).find(btn => btn.getAttribute('onclick') === `showTab('${tabName}')`);

    if (targetButton) {
        targetButton.classList.add('active');
        targetButton.setAttribute('aria-selected', 'true');
    }

    if (tabName === 'inventario') {
        const debeRefrescar = typeof inventarioTienePendienteRefresh === 'function'
            ? inventarioTienePendienteRefresh()
            : true;
        if (debeRefrescar) {
            void actualizarInventario({ force: true, deferIfHidden: false });
        }
    } else if (tabName === 'ingresar') {
        desbloquearFormularioIngreso({ focusRut: true });
    } else if (tabName === 'buscar') {
        asegurarInputsEditablesActivos('#buscar');
        const campoBuscar = document.getElementById('campoBuscar');
        if (campoBuscar && typeof campoBuscar.focus === 'function') {
            setTimeout(() => campoBuscar.focus(), 0);
        }
    } else if (tabName === 'backup') {
        verificarDropbox();
        if (typeof refrescarChecklistActualizacion === 'function') {
            refrescarChecklistActualizacion();
        }
    }

    registrarEventoDiagnostico('tab:show', { tabName });
}

const TIMEZONE_CHILE = 'America/Santiago';

const FORMATEADOR_PARTES_CHILE = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE_CHILE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
});

const FORMATEADOR_FECHA_CHILE = new Intl.DateTimeFormat('es-CL', {
    timeZone: TIMEZONE_CHILE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
});

const FORMATEADOR_DIA_CHILE = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE_CHILE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
});

function esFechaValida(fecha) {
    return fecha instanceof Date && !Number.isNaN(fecha.getTime());
}

function obtenerPartesEnChile(fecha) {
    const partes = FORMATEADOR_PARTES_CHILE.formatToParts(fecha);
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

    // Fecha de calendario inexistente (ej. 31-02): rechazar.
    const calendario = new Date(localAsUtc);
    if (
        !esFechaValida(calendario) ||
        calendario.getUTCFullYear() !== anio ||
        calendario.getUTCMonth() !== mes - 1 ||
        calendario.getUTCDate() !== dia
    ) {
        return null;
    }

    // Probar los offsets vigentes alrededor de la fecha (cubre los cambios de horario).
    const DIA_MS = 24 * 60 * 60 * 1000;
    const offsets = new Set([
        obtenerOffsetChileMinutos(new Date(localAsUtc - DIA_MS)),
        obtenerOffsetChileMinutos(new Date(localAsUtc)),
        obtenerOffsetChileMinutos(new Date(localAsUtc + DIA_MS))
    ]);

    let candidatoMismoDia = null;
    for (const offset of offsets) {
        const fecha = new Date(localAsUtc - (offset * 60000));
        if (!esFechaValida(fecha)) continue;
        const partes = obtenerPartesEnChile(fecha);
        if (partes.year !== anio || partes.month !== mes || partes.day !== dia) continue;
        if (partes.hour === hora && partes.minute === minuto && partes.second === segundo) {
            return fecha;
        }
        if (!candidatoMismoDia) candidatoMismoDia = fecha;
    }

    // Hora inexistente (el reloj se adelantó, ej. 00:00 del día del cambio):
    // se usa el instante equivalente del mismo día, en vez de descartar la fecha.
    return candidatoMismoDia;
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

// dd-mm-aaaa / dd/mm/aaaa [hh[:mm[:ss]]] [a. m./p. m.]
const REGEX_FECHA_LOCAL_CHILE = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:[,\s]+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?(?:\s*([AaPp]\.?\s*[Mm]\.?))?$/;

function parsearFechaLocalChile(texto) {
    const match = texto.match(REGEX_FECHA_LOCAL_CHILE);
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

    if (anio < 100) anio += 2000;

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

function parseFechaIngreso(fechaIngreso) {
    if (fechaIngreso === null || fechaIngreso === undefined) return null;

    if (fechaIngreso instanceof Date) {
        return esFechaValida(fechaIngreso) ? new Date(fechaIngreso.getTime()) : null;
    }

    if (typeof fechaIngreso === 'number') {
        const fecha = new Date(fechaIngreso);
        return esFechaValida(fecha) ? fecha : null;
    }

    if (typeof fechaIngreso !== 'string') {
        return null;
    }

    const texto = fechaIngreso.trim();
    if (!texto) return null;

    const iso = parsearFechaIso(texto);
    if (iso) return iso;

    // Si tiene formato dd-mm-aaaa no se delega al parser nativo: este lo leería como mm-dd-aaaa.
    if (REGEX_FECHA_LOCAL_CHILE.test(texto)) {
        return parsearFechaLocalChile(texto);
    }

    const fallback = new Date(texto);
    return esFechaValida(fallback) ? fallback : null;
}

function obtenerClaveDiaChile(fecha) {
    return FORMATEADOR_DIA_CHILE.format(fecha);
}

function parsearClaveDia(clave) {
    const [anio, mes, dia] = String(clave).split('-').map((value) => Number(value));
    if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) {
        return null;
    }
    return { anio, mes, dia };
}

function diferenciaDiasEntreClaves(claveInicio, claveFin) {
    const inicio = parsearClaveDia(claveInicio);
    const fin = parsearClaveDia(claveFin);
    if (!inicio || !fin) return null;

    const inicioUtc = Date.UTC(inicio.anio, inicio.mes - 1, inicio.dia);
    const finUtc = Date.UTC(fin.anio, fin.mes - 1, fin.dia);
    return Math.floor((finUtc - inicioUtc) / (1000 * 60 * 60 * 24));
}

function obtenerDiasEnBodega(fechaIngreso) {
    const fecha = parseFechaIngreso(fechaIngreso);
    if (!fecha) return null;

    const claveIngreso = obtenerClaveDiaChile(fecha);
    const claveHoy = obtenerClaveDiaChile(new Date());
    return diferenciaDiasEntreClaves(claveIngreso, claveHoy);
}

function formatearFechaChile(fechaRaw, { fallback = 'Fecha inválida' } = {}) {
    const fecha = parseFechaIngreso(fechaRaw);
    if (!fecha) return fallback;
    return FORMATEADOR_FECHA_CHILE.format(fecha);
}

function formatearFechaChileParaExport(fechaRaw) {
    const fecha = parseFechaIngreso(fechaRaw);
    if (!fecha) return fechaRaw ? String(fechaRaw) : '';
    return FORMATEADOR_FECHA_CHILE.format(fecha);
}

function calcularDiasEnBodega(fechaIngreso) {
    try {
        const dias = obtenerDiasEnBodega(fechaIngreso);
        if (!Number.isInteger(dias)) return 'Fecha inválida';

        if (dias === 0) return 'Hoy';
        if (dias === 1) return 'Ayer';
        if (dias < 0) return 'Fecha futura';
        if (dias < 30) return `Hace ${dias} días`;
        if (dias < 60) return 'Hace 1 mes';
        if (dias < 365) return `Hace ${Math.floor(dias / 30)} meses`;
        return `Hace ${Math.floor(dias / 365)} años`;
    } catch (error) {
        console.error('Error calculando días:', error);
        return 'N/A';
    }
}

function obtenerClaseAlerta(fechaIngreso) {
    try {
        const dias = obtenerDiasEnBodega(fechaIngreso);
        if (!Number.isInteger(dias)) return '';
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

function obtenerClaseEstadoPago(estadoPago) {
    const estado = typeof estadoPago === 'string'
        ? estadoPago.trim().toLowerCase()
        : '';

    if (!estado) return 'sin';
    if (estado === 'pagado') return 'pagado';
    if (estado === 'abonado') return 'abonado';
    return 'sin';
}

function activarFocusTrap(modalElement, signal) {
    if (!modalElement) return;
    const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    modalElement.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab') return;
        const focusables = Array.from(modalElement.querySelectorAll(FOCUSABLE)).filter(
            (el) => el.offsetParent !== null
        );
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (event.shiftKey) {
            if (document.activeElement === first) {
                event.preventDefault();
                last.focus();
            }
        } else {
            if (document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    }, { signal });

    const firstFocusable = modalElement.querySelector(FOCUSABLE);
    if (firstFocusable) {
        setTimeout(() => firstFocusable.focus(), 0);
    }
}

function setBtnLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
        btn.classList.add('btn-loading');
        btn.disabled = true;
        btn.dataset.prevText = btn.textContent;
    } else {
        btn.classList.remove('btn-loading');
        btn.disabled = false;
        if (btn.dataset.prevText) {
            btn.textContent = btn.dataset.prevText;
            delete btn.dataset.prevText;
        }
    }
}

// ============================================
// RESPUESTAS IPC DE LECTURA
// ============================================

// Las lecturas IPC devuelven los datos directamente, o { success: false, error } si fallan
// (p. ej. durante una restauración). Sin esta verificación un error se veía como "sin datos".
function esRespuestaErrorIpc(resultado) {
    return Boolean(
        resultado &&
        typeof resultado === 'object' &&
        !Array.isArray(resultado) &&
        resultado.success === false
    );
}

function exigirLecturaIpc(resultado) {
    if (esRespuestaErrorIpc(resultado)) {
        const error = new Error(resultado.error || 'Error leyendo datos');
        if (resultado.code) error.code = resultado.code;
        throw error;
    }
    return resultado;
}

function exigirListaIpc(resultado) {
    const datos = exigirLecturaIpc(resultado);
    if (!Array.isArray(datos)) {
        throw new Error('Respuesta inesperada de la base de datos');
    }
    return datos;
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
