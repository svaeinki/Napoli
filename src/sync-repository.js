const { randomUUID } = require('node:crypto');

class SyncRepository {
    constructor({ syncClient, diagnostics } = {}) {
        this.syncClient = syncClient;
        this.diagnostics = diagnostics || null;
        this.pendingOps = [];
        this.lastCursor = '0';
        this.lastPushAt = null;
        this.lastPullAt = null;
    }

    log(type, payload = {}) {
        if (this.diagnostics && typeof this.diagnostics.log === 'function') {
            this.diagnostics.log(type, payload);
        }
    }

    getStatus() {
        return {
            ...this.syncClient.getStatus(),
            pendingOps: this.pendingOps.length,
            lastCursor: this.lastCursor,
            lastPushAt: this.lastPushAt,
            lastPullAt: this.lastPullAt
        };
    }

    async configureRemote(config) {
        const status = await this.syncClient.configureAndLogin(config);
        this.log('sync:configured', {
            baseUrl: status.baseUrl,
            username: status.username,
            deviceId: status.deviceId
        });
        return status;
    }

    queueOperation({ entity, op, payload, clientUpdatedAt } = {}) {
        const queued = {
            op_id: `desktop-${Date.now()}-${randomUUID().slice(0, 8)}`,
            entity,
            op,
            payload: payload || {},
            client_updated_at: clientUpdatedAt || new Date().toISOString()
        };
        this.pendingOps.push(queued);
        return queued;
    }

    async pushPending() {
        if (this.pendingOps.length === 0) {
            return {
                success: true,
                accepted: [],
                rejected: [],
                pending: 0
            };
        }

        const response = await this.syncClient.push(this.pendingOps);
        const rejectedById = new Set(response.rejected.map((item) => item.op_id));
        this.pendingOps = this.pendingOps.filter((item) => rejectedById.has(item.op_id));
        this.lastPushAt = new Date().toISOString();

        if (response.next_cursor) {
            this.lastCursor = response.next_cursor;
        }

        this.log('sync:push', {
            accepted: response.accepted.length,
            rejected: response.rejected.length,
            pendingAfter: this.pendingOps.length
        });

        return {
            ...response,
            pending: this.pendingOps.length
        };
    }

    async pull(cursor = null, limit = 500) {
        const since = cursor || this.lastCursor;
        const response = await this.syncClient.pull(since, limit);

        if (response.next_cursor) {
            this.lastCursor = response.next_cursor;
        }
        this.lastPullAt = new Date().toISOString();
        this.log('sync:pull', {
            articulos: Array.isArray(response?.data?.articulos) ? response.data.articulos.length : 0,
            abonos: Array.isArray(response?.data?.abonos) ? response.data.abonos.length : 0,
            cursor: this.lastCursor
        });

        return response;
    }
}

module.exports = SyncRepository;
