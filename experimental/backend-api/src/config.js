function readEnv(name, fallback) {
    const value = process.env[name];
    if (value === undefined || value === null || String(value).trim() === '') {
        return fallback;
    }
    return String(value).trim();
}

function loadConfig() {
    return {
        env: readEnv('NODE_ENV', 'development'),
        port: Number.parseInt(readEnv('PORT', '4500'), 10),
        host: readEnv('HOST', '0.0.0.0'),
        storeMode: readEnv('STORE_MODE', 'memory'),
        databaseUrl: readEnv('DATABASE_URL', ''),
        jwtAccessSecret: readEnv('JWT_ACCESS_SECRET', 'dev_access_secret_change_me'),
        jwtRefreshSecret: readEnv('JWT_REFRESH_SECRET', 'dev_refresh_secret_change_me'),
        accessTokenTtl: readEnv('ACCESS_TOKEN_TTL', '15m'),
        refreshTokenTtl: readEnv('REFRESH_TOKEN_TTL', '30d'),
        demoUsername: readEnv('DEMO_USERNAME', 'admin'),
        demoPassword: readEnv('DEMO_PASSWORD', 'admin123'),
        demoSucursalId: readEnv('DEMO_SUCURSAL_ID', '00000000-0000-0000-0000-000000000001')
    };
}

module.exports = { loadConfig };
