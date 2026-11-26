const test = require('node:test');
const assert = require('node:assert/strict');

const { esFileUrl, esUrlExternaPermitida } = require('../../src/main/navigation-security');

test('esUrlExternaPermitida permite solo https en dominios allowlist', () => {
    assert.equal(esUrlExternaPermitida('https://www.dropbox.com/developers/apps'), true);
    assert.equal(esUrlExternaPermitida('https://dropbox.com/home'), true);
    assert.equal(esUrlExternaPermitida('https://sub.dropbox.com/path'), true);

    assert.equal(esUrlExternaPermitida('http://dropbox.com/home'), false);
    assert.equal(esUrlExternaPermitida('https://example.com'), false);
    assert.equal(esUrlExternaPermitida('javascript:alert(1)'), false);
    assert.equal(esUrlExternaPermitida(''), false);
});

test('esFileUrl detecta navegación interna file://', () => {
    assert.equal(esFileUrl('file:///C:/Program%20Files/Napoli%20Reparadora/resources/app/src/index.html'), true);
    assert.equal(esFileUrl('https://dropbox.com'), false);
    assert.equal(esFileUrl(null), false);
});
