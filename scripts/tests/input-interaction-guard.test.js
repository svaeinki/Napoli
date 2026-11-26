const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const utilsScript = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/js/utils.js'),
    'utf8'
);

test('asegurarInputsEditablesActivos desbloquea controles editables de ingresar', () => {
    const control = {
        disabled: true,
        readOnly: true,
        style: { pointerEvents: 'none' },
        removeAttribute: () => {}
    };

    const tabIngresar = {
        style: { pointerEvents: 'none' },
        removeAttribute: () => {},
        querySelectorAll: () => []
    };

    const formIngresar = {
        style: { pointerEvents: 'none' },
        removeAttribute: () => {},
        querySelectorAll: () => [control]
    };

    const context = {
        document: {
            querySelector: (selector) => (selector === '#ingresar' ? tabIngresar : null),
            getElementById: (id) => {
                if (id === 'formIngresar') return formIngresar;
                return null;
            }
        },
        window: {
            electronAPI: {
                diagEvent: async () => ({ success: true })
            }
        },
        requestAnimationFrame: (callback) => callback(),
        setTimeout: (callback) => callback(),
        console
    };

    vm.createContext(context);
    vm.runInContext(utilsScript, context, { filename: 'utils.js' });

    context.asegurarInputsEditablesActivos('#ingresar');

    assert.equal(tabIngresar.style.pointerEvents, '');
    assert.equal(control.disabled, false);
    assert.equal(control.readOnly, false);
    assert.equal(control.style.pointerEvents, '');
});

test('guardia de foco fuerza focus en input de ingresar cuando click no lo activa', () => {
    let pointerdownHandler = null;
    let focusCalls = 0;

    const scopeIngresar = { id: 'ingresar' };
    const input = {
        id: 'rut',
        disabled: false,
        readOnly: false,
        style: {},
        matches: (selector) => selector === 'input, textarea',
        closest: (selector) => (selector === '#ingresar, #buscar' ? scopeIngresar : null),
        focus: () => {
            focusCalls += 1;
            context.document.activeElement = input;
        }
    };

    const context = {
        document: {
            activeElement: null,
            querySelector: () => null,
            getElementById: () => null,
            addEventListener: (eventName, handler) => {
                if (eventName === 'pointerdown') {
                    pointerdownHandler = handler;
                }
            },
            removeEventListener: () => {}
        },
        window: {
            electronAPI: {
                diagEvent: async () => ({ success: true })
            }
        },
        requestAnimationFrame: (callback) => callback(),
        setTimeout: (callback) => callback(),
        console
    };

    vm.createContext(context);
    vm.runInContext(utilsScript, context, { filename: 'utils.js' });

    context.inicializarGuardiaFocoInputs();
    assert.equal(typeof pointerdownHandler, 'function');

    pointerdownHandler({ target: input });

    assert.equal(focusCalls, 1);
    assert.equal(context.document.activeElement, input);
});
