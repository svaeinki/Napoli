const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const mainRendererScript = fs.readFileSync(
    path.join(__dirname, '../../src/js/main.js'),
    'utf8'
);

test('con SCANNER_ENABLED=false el keydown no dispara busqueda por escaneo', () => {
    let keydownHandler = null;
    let showTabCalls = 0;
    let buscarCalls = 0;
    let preventDefaultCalls = 0;

    const context = {
        window: {
            templatesListos: Promise.resolve()
        },
        document: {
            activeElement: { tagName: 'BODY', id: '' },
            addEventListener: (eventName, handler) => {
                if (eventName === 'keydown') {
                    keydownHandler = handler;
                }
            },
            getElementById: (id) => {
                if (id === 'campoBuscar') {
                    return { value: '' };
                }
                return null;
            }
        },
        actualizarInventario: async () => ({ success: true }),
        verificarDropbox: async () => ({ success: true }),
        showTab: () => {
            showTabCalls += 1;
        },
        buscarArticulos: () => {
            buscarCalls += 1;
        },
        mostrarNotificacion: () => {},
        setTimeout,
        clearTimeout,
        Date,
        console
    };

    vm.createContext(context);
    vm.runInContext(mainRendererScript, context, { filename: 'main.js' });

    assert.equal(typeof keydownHandler, 'function');

    keydownHandler({
        key: '1',
        preventDefault: () => {
            preventDefaultCalls += 1;
        }
    });

    keydownHandler({
        key: 'Enter',
        preventDefault: () => {
            preventDefaultCalls += 1;
        }
    });

    assert.equal(showTabCalls, 0);
    assert.equal(buscarCalls, 0);
    assert.equal(preventDefaultCalls, 0);
});
