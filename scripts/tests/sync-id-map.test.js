const test = require('node:test');
const assert = require('node:assert/strict');

const { legacyToUuid } = require('../../src/sync-id-map');

test('legacyToUuid genera UUID estable y con formato valido', () => {
    const a = legacyToUuid('articulo', 123);
    const b = legacyToUuid('articulo', 123);
    const c = legacyToUuid('articulo', 124);

    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
});
