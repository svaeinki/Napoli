const fastify = require('fastify');
const { loadConfig } = require('./config');
const { buildApp } = require('./app');
const { InMemoryStore } = require('./store/in-memory-store');
const { PostgresStore } = require('./store/postgres-store');

async function createStore(config) {
    if (config.storeMode === 'postgres') {
        if (!config.databaseUrl) {
            throw new Error('DATABASE_URL es obligatorio cuando STORE_MODE=postgres');
        }
        const store = new PostgresStore(config);
        await store.init();
        return store;
    }

    const store = new InMemoryStore(config);
    await store.init();
    return store;
}

async function main() {
    const config = loadConfig();
    const store = await createStore(config);
    const app = buildApp({ fastify, config, store });

    app.addHook('onClose', async () => {
        if (store && typeof store.close === 'function') {
            await store.close();
        }
    });

    await app.listen({ port: config.port, host: config.host });
    app.log.info({
        port: config.port,
        host: config.host,
        storeMode: config.storeMode
    }, 'Napoli backend API experimental listo');
}

if (require.main === module) {
    main().catch((error) => {
        console.error('Error iniciando backend experimental:', error);
        process.exit(1);
    });
}

module.exports = { main };
