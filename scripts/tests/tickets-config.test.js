const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ticketsScript = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/js/tickets.js'),
    'utf8'
);

function crearContextoTickets({ resultadoGuardar }) {
    const context = {
        window: {
            electronAPI: {
                obtenerConfiguracion: async () => ({ printer: {} }),
                guardarConfiguracion: async () => resultadoGuardar
            }
        },
        escaparHtml: (texto) => String(texto ?? ''),
        formatearMoneda: (valor) => String(valor ?? 0),
        console
    };

    vm.createContext(context);
    vm.runInContext(ticketsScript, context, { filename: 'tickets.js' });
    return context;
}

test('Tickets.guardarConfiguracion propaga error real de config:guardar', async () => {
    const context = crearContextoTickets({
        resultadoGuardar: { success: false, error: 'EACCES: permiso denegado' }
    });

    const resultado = await context.window.Tickets.guardarConfiguracion({ header: 'Nuevo Header' });
    assert.equal(resultado.success, false);
    assert.equal(resultado.error, 'EACCES: permiso denegado');
});

test('Tickets.guardarConfiguracion confirma success cuando config:guardar persiste', async () => {
    const context = crearContextoTickets({
        resultadoGuardar: { success: true }
    });

    const resultado = await context.window.Tickets.guardarConfiguracion({ footer: 'Nuevo Footer' });
    assert.equal(resultado.success, true);
});
