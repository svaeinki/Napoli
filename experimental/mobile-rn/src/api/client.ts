export type SyncOperation = {
    op_id: string;
    entity: 'articulo' | 'abono';
    op: 'upsert' | 'delete' | 'append';
    payload: Record<string, unknown>;
    client_updated_at?: string;
};

export type ApiClientConfig = {
    baseUrl: string;
};

export class ApiClient {
    private readonly baseUrl: string;

    constructor(config: ApiClientConfig) {
        this.baseUrl = config.baseUrl.replace(/\/$/, '');
    }

    async login(username: string, password: string): Promise<string> {
        const response = await fetch(`${this.baseUrl}/auth/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            throw new Error(`Login failed (${response.status})`);
        }

        const body = await response.json();
        return body.data.access_token;
    }

    async pull(token: string, since = '0') {
        const response = await fetch(`${this.baseUrl}/sync/pull?since=${encodeURIComponent(since)}`, {
            headers: { authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error(`sync/pull failed (${response.status})`);
        }

        return response.json();
    }

    async push(token: string, deviceId: string, ops: SyncOperation[]) {
        const response = await fetch(`${this.baseUrl}/sync/push`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${token}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                device_id: deviceId,
                ops
            })
        });

        if (!response.ok) {
            throw new Error(`sync/push failed (${response.status})`);
        }

        return response.json();
    }
}
