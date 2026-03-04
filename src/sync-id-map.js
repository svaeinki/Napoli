const { createHash } = require('node:crypto');

function legacyToUuid(namespace, value) {
    const source = `${namespace}:${String(value)}`;
    const hex = createHash('sha1').update(source).digest('hex').slice(0, 32);
    const bytes = hex.split('');

    // Forzar UUID v4-like shape estable para IDs legacy.
    bytes[12] = '4';
    bytes[16] = '8';

    return `${bytes.slice(0, 8).join('')}-${bytes.slice(8, 12).join('')}-${bytes.slice(12, 16).join('')}-${bytes.slice(16, 20).join('')}-${bytes.slice(20, 32).join('')}`;
}

module.exports = {
    legacyToUuid
};
