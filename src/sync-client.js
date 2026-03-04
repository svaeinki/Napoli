const { randomUUID } = require('node:crypto');

const DEFAULT_TIMEOUT_MS = 10000;

class SyncClient {
    constructor({ diagnostics } = {}) {
        this.diagnostics = diagnostics || null;
        this.baseUrl = null;
        this.username = null;
        this.password = null;
        this.deviceId = `desktop-${randomUUID().slice(0, 8)}`;
        this.accessToken = null;
        this.refreshToken = null;
        this.configuredAt = null;
    }

    log(type, payload = {}) {
        if (this.diagnostics && typeof this.diagnostics.log === 'function') {
            this.diagnostics.log(type, payload);
        }
    }

    getStatus() {
        return {
            configured: Boolean(this.baseUrl && this.username && this.password),
            authenticated: Boolean(this.accessToken),
            baseUrl: this.baseUrl,
            username: this.username,
            deviceId: this.deviceId,
            configuredAt: this.configuredAt
        };
    }

    configure({ baseUrl, username, password, deviceId } = {}) {
        this.baseUrl = String(baseUrl || '').trim().replace(/\/$/, '');
        this.username = String(username || '').trim();
        this.password = String(password || '').trim();
        if (deviceId && String(deviceId).trim()) {
            this.deviceId = String(deviceId).trim();
        }
        this.accessToken = null;
        this.refreshToken = null;
        this.configuredAt = new Date().toISOString();
    }

    async request(path, { method = 'GET', body, useAuth = true } = {}) {
        if (!this.baseUrl) {
            throw new Error('Sync remoto no configurado');
        }

        const headers = { 'content-type': 'application/json' };
        if (useAuth && this.accessToken) {
            headers.authorization = `Bearer ${this.accessToken}`;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

        try {
            const response = await fetch(`${this.baseUrl}${path}`, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal
            });

            const text = await response.text();
            let payload = {};
            try {
                payload = text ? JSON.parse(text) : {};
            } catch (error) {
                payload = { raw: text };
            }

            if (response.status === 401 && useAuth && this.refreshToken) {
                const refreshed = await this.refresh();
                if (refreshed) {
                    return this.request(path, { method, body, useAuth: true });
                }
            }

            if (!response.ok) {
                throw new Error(payload.error || `Error HTTP ${response.status} en ${path}`);
            }

            return payload;
        } finally {
            clearTimeout(timer);
        }
    }

    async login() {
        if (!this.baseUrl || !this.username || !this.password) {
            throw new Error('Config remota incompleta: baseUrl/username/password');
        }

        const payload = await this.request('/auth/login', {
            method: 'POST',
            useAuth: false,
            body: {
                username: this.username,
                password: this.password
            }
        });

        const accessToken = payload?.data?.access_token;
        const refreshToken = payload?.data?.refresh_token;

        if (!accessToken || !refreshToken) {
            throw new Error('Respuesta de login sin tokens');
        }

        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.log('sync:login', { ok: true, baseUrl: this.baseUrl, username: this.username, deviceId: this.deviceId });
        return { success: true };
    }

    async refresh() {
        if (!this.refreshToken) {
            return false;
        }

        try {
            const payload = await this.request('/auth/refresh', {
                method: 'POST',
                useAuth: false,
                body: { refresh_token: this.refreshToken }
            });

            const accessToken = payload?.data?.access_token;
            const refreshToken = payload?.data?.refresh_token;
            if (!accessToken || !refreshToken) {
                return false;
            }

            this.accessToken = accessToken;
            this.refreshToken = refreshToken;
            this.log('sync:refresh', { ok: true, deviceId: this.deviceId });
            return true;
        } catch (error) {
            this.log('sync:refresh', { ok: false, error: error.message });
            return false;
        }
    }

    async configureAndLogin(config) {
        this.configure(config);
        await this.login();
        return this.getStatus();
    }

    async push(ops) {
        if (!Array.isArray(ops) || ops.length === 0) {
            return {
                success: true,
                accepted: [],
                rejected: [],
                server_time: new Date().toISOString(),
                next_cursor: '0'
            };
        }

        return this.request('/sync/push', {
            method: 'POST',
            body: {
                device_id: this.deviceId,
                ops
            }
        });
    }

    async pull(cursor = '0', limit = 500) {
        const since = encodeURIComponent(String(cursor || '0'));
        const max = encodeURIComponent(String(limit || 500));
        return this.request(`/sync/pull?since=${since}&limit=${max}`, { method: 'GET' });
    }
}

module.exports = SyncClient;
