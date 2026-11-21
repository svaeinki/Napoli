const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { cargarMainProcess } = require('./helpers/main-process-harness');

test('config.json ilegible se conserva como copia antes de usar valores por defecto', async (t) => {
    const contenidoCorrupto = '{"dropboxToken":"enc:abc","printer":{"width":"80m';
    const main = cargarMainProcess({ configInicial: contenidoCorrupto });
    t.after(() => main.limpiar());
    await main.listo;

    const copias = fs.readdirSync(main.userData).filter((nombre) => nombre.startsWith('config.corrupt-'));
    assert.equal(copias.length, 1, 'debe existir una copia del config corrupto');
    assert.equal(fs.readFileSync(`${main.userData}/${copias[0]}`, 'utf8'), contenidoCorrupto);

    const config = JSON.parse(fs.readFileSync(main.configPath, 'utf8'));
    assert.equal(config.printer.width, '58mm');
});

test('config válido no genera copias y config:guardar escribe sin dejar temporales', async (t) => {
    const main = cargarMainProcess({ configInicial: { printer: { width: '80mm' }, dropboxToken: 'enc:xyz' } });
    t.after(() => main.limpiar());
    await main.listo;

    const resultado = await main.invocar('config:guardar', { printer: { width: '58mm', header: 'NUEVO' } });
    assert.equal(resultado.success, true);

    const config = JSON.parse(fs.readFileSync(main.configPath, 'utf8'));
    assert.equal(config.printer.width, '58mm');
    assert.equal(config.printer.header, 'NUEVO');
    assert.equal(config.dropboxToken, 'enc:xyz', 'el token de Dropbox no debe perderse');

    const residuos = fs.readdirSync(main.userData).filter((nombre) => nombre.includes('.tmp') || nombre.startsWith('config.corrupt-'));
    assert.deepEqual(residuos, []);
});
