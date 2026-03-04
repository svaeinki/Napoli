const { loadConfig } = require('./config');
const { PostgresStore } = require('./store/postgres-store');

async function run() {
    const config = loadConfig();
    if (config.storeMode !== 'postgres') {
        throw new Error('Para seed, exporta STORE_MODE=postgres');
    }

    const store = new PostgresStore(config);
    await store.init();
    await store.close();

    console.log('Seed OK: esquema y usuario demo listos');
}

run().catch((error) => {
    console.error('Error seed:', error);
    process.exit(1);
});
