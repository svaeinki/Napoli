const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const utilsScript = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/js/utils.js'),
    'utf8'
);

test('desbloquearFormularioIngreso habilita controles y recupera foco en RUT', () => {
    let focusCalls = 0;

    function crearControl({ readOnly = true } = {}) {
        return {
            disabled: true,
            readOnly,
            style: { pointerEvents: 'none' },
            removeAttribute: () => {}
        };
    }

    const controles = [
        crearControl({ readOnly: true }),
        crearControl({ readOnly: false }),
        crearControl({ readOnly: true })
    ];

    const tabIngresar = {
        style: { pointerEvents: 'none' },
        removeAttribute: () => {}
    };

    const formIngresar = {
        style: { pointerEvents: 'none' },
        removeAttribute: () => {},
        querySelectorAll: () => controles
    };

    const campoRut = {
        focus: () => {
            focusCalls += 1;
        }
    };

    const elements = {
        ingresar: tabIngresar,
        formIngresar,
        rut: campoRut
    };

    const context = {
        document: {
            getElementById: (id) => elements[id] || null,
            querySelectorAll: () => []
        },
        requestAnimationFrame: (callback) => callback(),
        setTimeout: (callback) => callback(),
        console
    };

    vm.createContext(context);
    vm.runInContext(utilsScript, context, { filename: 'utils.js' });

    context.desbloquearFormularioIngreso({ focusRut: true });

    controles.forEach((control) => {
        assert.equal(control.disabled, false);
        assert.equal(control.readOnly, false);
        assert.equal(control.style.pointerEvents, '');
    });
    assert.equal(formIngresar.style.pointerEvents, '');
    assert.equal(tabIngresar.style.pointerEvents, '');
    assert.equal(focusCalls, 1);
});
