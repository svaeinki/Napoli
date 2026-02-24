const test = require('node:test');
const assert = require('node:assert/strict');
const { createUniqueTimestampGenerator } = require('../../src/backup-filename');

test('genera nombres únicos aun con el mismo instante', () => {
    const fixedDate = new Date('2026-02-24T12:34:56.789Z');
    const gen = createUniqueTimestampGenerator({ now: () => fixedDate });

    const a = gen();
    const b = gen();
    const c = gen();

    assert.notEqual(a, b);
    assert.notEqual(b, c);
    assert.match(b, /-1$/);
    assert.match(c, /-2$/);
});

test('reinicia sufijo al cambiar de timestamp base', () => {
    const dates = [
        new Date('2026-02-24T12:34:56.789Z'),
        new Date('2026-02-24T12:34:56.789Z'),
        new Date('2026-02-24T12:34:56.790Z')
    ];
    let idx = 0;
    const gen = createUniqueTimestampGenerator({
        now: () => dates[Math.min(idx++, dates.length - 1)]
    });

    const a = gen();
    const b = gen();
    const c = gen();

    assert.notEqual(a, b);
    assert.notEqual(b, c);
    assert.match(b, /-1$/);
    assert.doesNotMatch(c, /-1$/);
});
