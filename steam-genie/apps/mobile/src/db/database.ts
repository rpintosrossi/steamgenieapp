import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('steam_genie.db');
  }
  return db;
}

const CURRENT_DB_VERSION = 3;

export async function initDatabase(): Promise<void> {
  const database = getDatabase();

  await database.execAsync('PRAGMA journal_mode = WAL;');

  const versionRow = await database.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version;',
  );
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion < CURRENT_DB_VERSION) {
    // Fresh install or outdated schema — recreate tables
    await database.execAsync(`
      DROP TABLE IF EXISTS sync_queue;
      DROP TABLE IF EXISTS work_orders_cache;
      DROP TABLE IF EXISTS tasks_cache;
      DROP TABLE IF EXISTS photo_queue;

      CREATE TABLE sync_queue (
        id                  TEXT PRIMARY KEY,
        client_operation_id TEXT UNIQUE NOT NULL,
        operation_type      TEXT NOT NULL,
        entity_type         TEXT NOT NULL,
        entity_id           TEXT,
        payload             TEXT NOT NULL,
        occurred_at         TEXT NOT NULL,
        status              TEXT NOT NULL DEFAULT 'PENDING',
        attempts            INTEGER NOT NULL DEFAULT 0,
        last_error          TEXT,
        created_at          TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE photo_queue (
        id                    TEXT PRIMARY KEY,
        client_operation_id   TEXT UNIQUE NOT NULL,
        photo_kind            TEXT NOT NULL DEFAULT 'task',
        service_execution_id  TEXT,
        work_order_task_id    TEXT,
        periodic_instance_id  TEXT,
        phase                 TEXT,
        local_uri             TEXT NOT NULL,
        mime_type             TEXT NOT NULL DEFAULT 'image/jpeg',
        captured_at           TEXT,
        gps_lat               REAL,
        gps_lng               REAL,
        device_id             TEXT,
        status                TEXT NOT NULL DEFAULT 'PENDING',
        attempts              INTEGER NOT NULL DEFAULT 0,
        last_error            TEXT,
        created_at            TEXT NOT NULL DEFAULT (datetime('now'))
      );

      PRAGMA user_version = ${CURRENT_DB_VERSION};
    `);
  }
}
