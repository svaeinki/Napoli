const test = require('node:test');
const assert = require('node:assert/strict');
const DropboxManager = require('../../src/dropbox');
const { cargarMainProcess } = require('./helpers/main-process-harness');

const { iniciarAutorizacionPKCE, completarAutorizacionPKCE, describirErrorDropbox } = DropboxManager;

function respuestaJson(cuerpo, status = 200) {
    return new Response(JSON.stringify(cuerpo), {
        status,
        headers: { 'content-type': 'application/json' }
    });
}

function fetchFalso(rutas) {
    const llamadas = [];
    const fn = async (url, opciones = {}) => {
        llamadas.push({ url: String(url), opciones });
        for (const [patron, responder] of rutas) {
            if (String(url).includes(patron)) return responder(url, opciones);
        }
        throw new Error(`URL no esperada en test: ${url}`);
    };
    fn.llamadas = llamadas;
    return fn;
}

test('la autorización usa PKCE y pide token offline (con refresh token)', async () => {
    const pendiente = await iniciarAutorizacionPKCE('appkey12345');
    const url = new URL(pendiente.url);
    assert.equal(url.hostname, 'dropbox.com');
    assert.equal(url.searchParams.get('client_id'), 'appkey12345');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('token_access_type'), 'offline');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(url.searchParams.get('code_challenge'));
});

test('el código se canjea con code_verifier (sin client secret) y entrega refresh token', async () => {
    const fetchImpl = fetchFalso([
        ['oauth2/token', () => respuestaJson({ access_token: 'acc-1', refresh_token: 'ref-1', expires_in: 14400 })]
    ]);
    const pendiente = await iniciarAutorizacionPKCE('appkey12345', { fetchImpl });
    const credenciales = await completarAutorizacionPKCE(pendiente, 'CODIGO-123');

    assert.deepEqual(credenciales, { appKey: 'appkey12345', refreshToken: 'ref-1', accessToken: 'acc-1', expiresIn: 14400 });
    const canje = new URL(fetchImpl.llamadas[0].url);
    assert.equal(canje.searchParams.get('grant_type'), 'authorization_code');
    assert.equal(canje.searchParams.get('code'), 'CODIGO-123');
    assert.ok(canje.searchParams.get('code_verifier'));
    assert.equal(canje.searchParams.get('client_secret'), null);
});

test('una autorización vencida se rechaza', async () => {
    const pendiente = await iniciarAutorizacionPKCE('appkey12345');
    pendiente.creadoEn -= DropboxManager.AUTORIZACION_PENDIENTE_TTL_MS + 1;
    await assert.rejects(() => completarAutorizacionPKCE(pendiente, 'X'), /expiró/);
});

test('con refresh token, el SDK renueva el acceso antes de llamar a la API', async () => {
    const fetchImpl = fetchFalso([
        ['oauth2/token', () => respuestaJson({ access_token: 'acceso-renovado', expires_in: 14400 })],
        ['users/get_current_account', () => respuestaJson({ name: { display_name: 'Napoli' }, email: 'x@example.com' })]
    ]);
    const manager = new DropboxManager({ appKey: 'appkey12345', refreshToken: 'ref-1' }, { fetchImpl });

    const resultado = await manager.verificarConexion();

    assert.equal(resultado.success, true);
    assert.equal(resultado.usuario, 'Napoli');
    const [renovacion, api] = fetchImpl.llamadas;
    const urlRenovacion = new URL(renovacion.url);
    assert.equal(urlRenovacion.searchParams.get('grant_type'), 'refresh_token');
    assert.equal(urlRenovacion.searchParams.get('refresh_token'), 'ref-1');
    assert.equal(api.opciones.headers.Authorization, 'Bearer acceso-renovado');
    assert.equal(manager.usaTokenHeredado, false);
});

test('un 401 de Dropbox se traduce a un mensaje claro de reconexión', () => {
    assert.match(describirErrorDropbox({ status: 401, message: 'Response failed with a 401 code' }), /Vuelva a conectar/);
    assert.match(describirErrorDropbox({ error: { error_summary: 'expired_access_token/' } }), /expiró/);
});

test('IPC: iniciar autorización valida el App key y abre Dropbox en el navegador', async (t) => {
    const main = cargarMainProcess({ dropboxFactory: DropboxManager });
    t.after(() => main.limpiar());
    await main.listo;

    const invalida = await main.invocar('dropbox:iniciarAutorizacion', 'x; rm -rf');
    assert.equal(invalida.success, false);
    assert.equal(main.abiertos.length, 0);

    const resultado = await main.invocar('dropbox:iniciarAutorizacion', 'appkey12345');
    assert.equal(resultado.success, true);
    assert.equal(main.abiertos.length, 1);
    assert.match(main.abiertos[0], /^https:\/\/dropbox\.com\/oauth2\/authorize\?/);

    const sinPendiente = cargarMainProcess({ dropboxFactory: DropboxManager });
    t.after(() => sinPendiente.limpiar());
    await sinPendiente.listo;
    const completar = await sinPendiente.invocar('dropbox:completarAutorizacion', 'CODIGO');
    assert.equal(completar.success, false);
    assert.match(completar.error, /No hay una autorización/);
});

test('IPC: al arrancar con credenciales OAuth guardadas se usa el refresh token (no el token antiguo)', async (t) => {
    const creados = [];
    function DropboxEspia(credenciales) {
        creados.push(credenciales);
        this.estaConfigurado = () => true;
    }
    const main = cargarMainProcess({
        dropboxFactory: DropboxEspia,
        configInicial: {
            dropboxAuth: { appKey: 'appkey12345', refreshToken: Buffer.from('enc:ref-guardado').toString('base64') },
            dropboxToken: Buffer.from('enc:token-viejo').toString('base64')
        }
    });
    t.after(() => main.limpiar());
    await main.listo;

    // Objeto creado dentro del sandbox vm: se compara por contenido.
    assert.deepEqual(JSON.parse(JSON.stringify(creados)), [{ appKey: 'appkey12345', refreshToken: 'ref-guardado' }]);

    await main.invocar('dropbox:desconectar');
    const config = JSON.parse(require('fs').readFileSync(main.configPath, 'utf8'));
    assert.equal(config.dropboxAuth, undefined);
    assert.equal(config.dropboxToken, undefined);
});
