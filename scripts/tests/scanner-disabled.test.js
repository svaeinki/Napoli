const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const mainRendererScript = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/js/main.js'),
    'utf8'
);

test('main.js del renderer no registra handler de scanner', () => {
    assert.ok(
        !mainRendererScript.includes('SCANNER_ENABLED'),
        'El código del scanner debería haber sido removido'
    );
    assert.ok(
        !mainRendererScript.includes('scanBuffer'),
        'El buffer del scanner debería haber sido removido'
    );
});
