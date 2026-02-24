const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const utilsScript = fs.readFileSync(
    path.join(__dirname, '../../src/js/utils.js'),
    'utf8'
);

function crearClassList() {
    const values = new Set();
    return {
        add: (...clases) => clases.forEach((c) => values.add(c)),
        remove: (...clases) => clases.forEach((c) => values.delete(c)),
        toggle: (clase, force) => {
            if (force === true) {
                values.add(clase);
                return true;
            }
            if (force === false) {
                values.delete(clase);
                return false;
            }
            if (values.has(clase)) {
                values.delete(clase);
                return false;
            }
            values.add(clase);
            return true;
        },
        contains: (clase) => values.has(clase)
    };
}

test('confirmarAccionAsync usa modal async cuando está disponible', async () => {
    let confirmCalls = 0;
    const handlersDocumento = {};

    const modal = {
        style: { display: 'none' },
        addEventListener: () => {},
        removeEventListener: () => {}
    };
    const titulo = { textContent: '' };
    const mensaje = { textContent: '' };
    const aceptar = { textContent: '', classList: crearClassList() };

    const elements = {
        modalConfirmacion: modal,
        modalConfirmacionTitulo: titulo,
        modalConfirmacionMensaje: mensaje,
        modalConfirmacionAceptar: aceptar
    };

    const context = {
        document: {
            querySelector: () => null,
            getElementById: (id) => elements[id] || null,
            addEventListener: (eventName, handler) => {
                handlersDocumento[eventName] = handler;
            },
            removeEventListener: (eventName) => {
                delete handlersDocumento[eventName];
            }
        },
        window: {
            electronAPI: {
                diagEvent: async () => ({ success: true })
            }
        },
        confirm: () => {
            confirmCalls += 1;
            return true;
        },
        requestAnimationFrame: (callback) => callback(),
        setTimeout: (callback) => callback(),
        console
    };

    vm.createContext(context);
    vm.runInContext(utilsScript, context, { filename: 'utils.js' });

    const promise = context.confirmarAccionAsync({
        titulo: 'Confirmar entrega',
        mensaje: '¿Seguro?',
        confirmarTexto: 'Entregar',
        peligro: true
    });

    assert.equal(confirmCalls, 0);
    assert.equal(modal.style.display, 'block');
    assert.equal(titulo.textContent, 'Confirmar entrega');
    assert.equal(mensaje.textContent, '¿Seguro?');
    assert.equal(aceptar.textContent, 'Entregar');
    assert.equal(aceptar.classList.contains('btn-danger'), true);

    context.resolverModalConfirmacion(true);
    const decision = await promise;
    assert.equal(decision, true);
    assert.equal(modal.style.display, 'none');
});

test('confirmarAccionAsync hace fallback a confirm nativo si no existe modal', async () => {
    let confirmCalls = 0;

    const context = {
        document: {
            querySelector: () => null,
            getElementById: () => null,
            addEventListener: () => {},
            removeEventListener: () => {}
        },
        window: {},
        confirm: () => {
            confirmCalls += 1;
            return false;
        },
        requestAnimationFrame: (callback) => callback(),
        setTimeout: (callback) => callback(),
        console
    };

    vm.createContext(context);
    vm.runInContext(utilsScript, context, { filename: 'utils.js' });

    const decision = await context.confirmarAccionAsync({
        titulo: 'Fallback',
        mensaje: 'Sin modal'
    });

    assert.equal(confirmCalls, 1);
    assert.equal(decision, false);
});
