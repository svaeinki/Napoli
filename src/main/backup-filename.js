function createUniqueTimestampGenerator({ now = () => new Date() } = {}) {
    let lastBase = '';
    let collisionCounter = 0;

    return function generarTimestampUnico() {
        const date = now();
        const base = date.toISOString().replace(/:/g, '-').replace(/\./g, '-');

        if (base === lastBase) {
            collisionCounter += 1;
        } else {
            lastBase = base;
            collisionCounter = 0;
        }

        if (collisionCounter === 0) {
            return base;
        }
        return `${base}-${collisionCounter}`;
    };
}

module.exports = {
    createUniqueTimestampGenerator
};
