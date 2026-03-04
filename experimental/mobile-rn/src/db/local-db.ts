import * as SQLite from 'expo-sqlite';

export type PendingOperation = {
    op_id: string;
    entity: 'articulo' | 'abono';
    op: 'upsert' | 'delete' | 'append';
    payload_json: string;
    created_at: string;
};

export async function openLocalDb() {
    const db = await SQLite.openDatabaseAsync('napoli-mobile.db');

    await db.execAsync(`
        CREATE TABLE IF NOT EXISTS pending_ops (
            op_id TEXT PRIMARY KEY,
            entity TEXT NOT NULL,
            op TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sync_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            cursor TEXT NOT NULL DEFAULT '0'
        );

        INSERT OR IGNORE INTO sync_state (id, cursor) VALUES (1, '0');
    `);

    return db;
}

export async function enqueueOperation(db: SQLite.SQLiteDatabase, op: PendingOperation) {
    await db.runAsync(
        `INSERT OR REPLACE INTO pending_ops (op_id, entity, op, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [op.op_id, op.entity, op.op, op.payload_json, op.created_at]
    );
}
