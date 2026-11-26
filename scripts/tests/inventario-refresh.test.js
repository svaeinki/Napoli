const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const inventarioScript = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/js/inventario.js'),
    'utf8'
);

// Helpers reales de utils.js para validar respuestas IPC de lectura.
function cargarHelpersIpc() {
    const utilsContext = { AbortController, console, document: {}, window: {} };
    vm.createContext(utilsContext);
    vm.runInContext(
        fs.readFileSync(path.join(__dirname, '../../src/renderer/js/utils.js'), 'utf8'),
        utilsContext,
        { filename: 'utils.js' }
    );
    return {
        esRespuestaErrorIpc: utilsContext.esRespuestaErrorIpc,
        exigirLecturaIpc: utilsContext.exigirLecturaIpc,
        exigirListaIpc: utilsContext.exigirListaIpc
    };
}

function crearContextoInventario({ articulos, inventarioActivo }) {
    let obtenerTodosCalls = 0;
    let tablaRenderCount = 0;
    let obtenerDiasCalls = 0;
    let estaActivo = inventarioActivo;
    const notificaciones = [];
    const filasTablaPorId = new Map();

    function crearFilaTablaFake(id, estado = 'En Bodega') {
        const tiempoStrong = { textContent: estado === 'En Bodega' ? 'Hoy' : '-', className: '' };
        const celdaEstado = { innerHTML: '' };
        const celdaAcciones = { innerHTML: '' };

        const fila = {
            dataset: { articuloId: String(id), estado },
            className: '',
            remove: () => {
                filasTablaPorId.delete(id);
            },
            querySelector: (selector) => {
                if (selector === '.celda-tiempo strong') return tiempoStrong;
                if (selector === '.celda-estado') return celdaEstado;
                if (selector === '.celda-acciones') return celdaAcciones;
                return null;
            },
            __cells: {
                tiempoStrong,
                celdaEstado,
                celdaAcciones
            }
        };

        return fila;
    }

    const tablaInventario = {
        innerHTML: '',
        querySelector: (selector) => {
            const match = /^tr\[data-articulo-id="(\d+)"\]$/.exec(selector);
            if (!match) return null;
            return filasTablaPorId.get(Number(match[1])) || null;
        },
        querySelectorAll: (selector) => {
            if (selector === 'tbody tr') {
                return Array.from(filasTablaPorId.values());
            }
            return [];
        }
    };

    const elements = {
        inventario: {
            classList: {
                contains: (className) => className === 'active' && estaActivo
            }
        },
        totalArticulos: { textContent: '' },
        enBodega: { textContent: '' },
        entregados: { textContent: '' },
        filtroEstado: { value: 'todos' },
        tablaInventario
    };

    const context = {
        window: {
            electronAPI: {
                obtenerTodos: async () => {
                    obtenerTodosCalls += 1;
                    return typeof articulos === 'function' ? articulos() : articulos;
                }
            }
        },
        document: {
            getElementById: (id) => elements[id] || null,
            querySelector: () => null,
            createElement: () => ({ className: '', textContent: '' })
        },
        mostrarNotificacion: (mensaje, esError = false) => {
            notificaciones.push({ mensaje, esError });
        },
        ...cargarHelpersIpc(),
        obtenerDiasEnBodega: () => {
            obtenerDiasCalls += 1;
            return 0;
        },
        calcularDiasEnBodega: () => 'Hoy',
        formatearFechaChile: () => '23/02/2026, 10:46:19',
        obtenerClaseAlerta: () => '',
        obtenerClaseEstadoPago: () => 'sin',
        formatearMoneda: (valor) => String(valor ?? 0),
        escaparHtml: (texto) => String(texto ?? ''),
        console
    };

    vm.createContext(context);
    vm.runInContext(inventarioScript, context, { filename: 'inventario.js' });

    context.mostrarTabla = (datos, elementoId) => {
        tablaRenderCount += 1;
        const elemento = elements[elementoId];
        if (elemento) {
            elemento.innerHTML = `filas:${datos.length}`;
        }
    };
    context.actualizarBadgeInventario = () => {};

    context.__helpers = {
        setInventarioActivo: (value) => {
            estaActivo = value;
        },
        insertarFilaTabla: (id, estado = 'En Bodega') => {
            const fila = crearFilaTablaFake(id, estado);
            filasTablaPorId.set(Number(id), fila);
            return fila;
        },
        obtenerFilaTabla: (id) => filasTablaPorId.get(Number(id)) || null,
        getObtenerTodosCalls: () => obtenerTodosCalls,
        getTablaRenderCount: () => tablaRenderCount,
        getObtenerDiasCalls: () => obtenerDiasCalls,
        getNotificaciones: () => notificaciones,
        getElemento: (id) => elements[id]
    };

    return context;
}

test('actualizarInventario realiza una sola lectura de obtenerTodos por refresh normal', async () => {
    const context = crearContextoInventario({
        inventarioActivo: true,
        articulos: [
            { id: 1, estado: 'En Bodega' },
            { id: 2, estado: 'Entregado' },
            { id: 3, estado: 'En Bodega' }
        ]
    });

    const resultado = await context.actualizarInventario({ deferIfHidden: false });

    assert.equal(resultado.success, true);
    assert.equal(context.__helpers.getObtenerTodosCalls(), 1);
    assert.equal(context.__helpers.getTablaRenderCount(), 1);
    assert.equal(context.__helpers.getElemento('totalArticulos').textContent, 3);
    assert.equal(context.__helpers.getElemento('enBodega').textContent, 2);
    assert.equal(context.__helpers.getElemento('entregados').textContent, 1);
});

test('actualizarInventario difiere refresh cuando inventario no esta visible', async () => {
    const context = crearContextoInventario({
        inventarioActivo: false,
        articulos: [{ id: 1, estado: 'En Bodega' }]
    });

    const resultado = await context.actualizarInventario();

    assert.equal(resultado.success, true);
    assert.equal(resultado.deferred, true);
    assert.equal(context.__helpers.getObtenerTodosCalls(), 0);
    assert.equal(context.__helpers.getTablaRenderCount(), 0);
});

test('al volver a inventario se consume dirty y se renderiza', async () => {
    const context = crearContextoInventario({
        inventarioActivo: false,
        articulos: [{ id: 1, estado: 'En Bodega' }]
    });

    await context.actualizarInventario();
    context.__helpers.setInventarioActivo(true);
    const resultado = await context.actualizarInventario();

    assert.equal(resultado.success, true);
    assert.equal(context.__helpers.getObtenerTodosCalls(), 1);
    assert.equal(context.__helpers.getTablaRenderCount(), 1);
});

test('si inventario esta oculto durante refresh forzado, actualiza cache sin renderizar tabla', async () => {
    const context = crearContextoInventario({
        inventarioActivo: false,
        articulos: [
            { id: 1, estado: 'En Bodega' },
            { id: 2, estado: 'Entregado' }
        ]
    });

    const resultadoOculto = await context.actualizarInventario({ force: true, deferIfHidden: false });

    assert.equal(resultadoOculto.success, true);
    assert.equal(context.__helpers.getObtenerTodosCalls(), 1);
    assert.equal(context.__helpers.getTablaRenderCount(), 0);

    context.__helpers.setInventarioActivo(true);
    await context.aplicarFiltro({ useCache: true });

    assert.equal(context.__helpers.getObtenerTodosCalls(), 1);
    assert.equal(context.__helpers.getTablaRenderCount(), 1);
});

test('si inventario se oculta antes de completar fetch, evita calculo de alertas y render', async () => {
    let resolverFetch;
    const fetchPendiente = new Promise((resolve) => {
        resolverFetch = resolve;
    });

    const context = crearContextoInventario({
        inventarioActivo: true,
        articulos: [{ id: 1, estado: 'En Bodega' }]
    });

    context.window.electronAPI.obtenerTodos = async () => fetchPendiente;
    const refreshPromise = context.actualizarInventario({ deferIfHidden: false });

    context.__helpers.setInventarioActivo(false);
    resolverFetch([{ id: 1, estado: 'En Bodega' }]);

    const resultado = await refreshPromise;
    assert.equal(resultado.success, true);
    assert.equal(context.__helpers.getTablaRenderCount(), 0);
    assert.equal(context.__helpers.getObtenerDiasCalls(), 0);
});

test('marcarInventarioDirty marca pendiente sin disparar lecturas', async () => {
    const context = crearContextoInventario({
        inventarioActivo: true,
        articulos: [{ id: 1, estado: 'En Bodega' }]
    });

    const lecturasAntes = context.__helpers.getObtenerTodosCalls();
    context.marcarInventarioDirty();

    assert.equal(context.inventarioTienePendienteRefresh(), true);
    assert.equal(context.__helpers.getObtenerTodosCalls(), lecturasAntes);
});

test('actualizarFilaInventarioEstado modifica solo la fila local sin releer inventario', async () => {
    const context = crearContextoInventario({
        inventarioActivo: true,
        articulos: [{ id: 10, estado: 'En Bodega', fechaIngreso: '2026-02-23T10:00:00.000Z' }]
    });

    await context.actualizarInventario({ deferIfHidden: false });
    context.__helpers.insertarFilaTabla(10, 'En Bodega');
    const lecturasAntes = context.__helpers.getObtenerTodosCalls();

    const resultado = context.actualizarFilaInventarioEstado(10, 'Entregado');
    const fila = context.__helpers.obtenerFilaTabla(10);

    assert.equal(resultado, true);
    assert.equal(context.__helpers.getObtenerTodosCalls(), lecturasAntes);
    assert.equal(fila.dataset.estado, 'Entregado');
    assert.match(fila.__cells.celdaEstado.innerHTML, /Entregado/);
    assert.match(fila.__cells.celdaAcciones.innerHTML, /Devolver/);
});

test('eliminarFilaInventarioLocal remueve fila local sin releer inventario', async () => {
    const context = crearContextoInventario({
        inventarioActivo: true,
        articulos: [{ id: 11, estado: 'En Bodega', fechaIngreso: '2026-02-23T10:00:00.000Z' }]
    });

    await context.actualizarInventario({ deferIfHidden: false });
    context.__helpers.insertarFilaTabla(11, 'En Bodega');
    const lecturasAntes = context.__helpers.getObtenerTodosCalls();

    const resultado = context.eliminarFilaInventarioLocal(11);

    assert.equal(resultado, true);
    assert.equal(context.__helpers.getObtenerTodosCalls(), lecturasAntes);
    assert.equal(context.__helpers.obtenerFilaTabla(11), null);
});

test('si la lectura falla (p. ej. restauración en curso) se avisa el error y se conserva el inventario', async () => {
    let respuesta = [
        { id: 1, estado: 'En Bodega' },
        { id: 2, estado: 'Entregado' }
    ];
    const context = crearContextoInventario({
        inventarioActivo: true,
        articulos: () => respuesta
    });

    await context.actualizarInventario({ deferIfHidden: false });
    assert.equal(context.__helpers.getElemento('totalArticulos').textContent, 2);
    const rendersAntes = context.__helpers.getTablaRenderCount();

    respuesta = { success: false, error: 'Restauración en curso. Intente nuevamente al terminar.', code: 'RESTORE_BUSY' };
    const resultado = await context.actualizarInventario({ force: true, deferIfHidden: false });

    assert.equal(resultado.success, false);
    assert.match(resultado.error, /Restauración en curso/);
    const errores = context.__helpers.getNotificaciones().filter((n) => n.esError);
    assert.equal(errores.length, 1);
    assert.match(errores[0].mensaje, /Restauración en curso/);
    // No se renderiza una tabla vacía ni se ponen los contadores en cero.
    assert.equal(context.__helpers.getTablaRenderCount(), rendersAntes);
    assert.equal(context.__helpers.getElemento('totalArticulos').textContent, 2);
});
