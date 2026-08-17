import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('radmachine.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS collection (
      utc_url     TEXT PRIMARY KEY,
      utc_name    TEXT NOT NULL,
      unit_name   TEXT NOT NULL,
      list_url    TEXT NOT NULL,
      downloaded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test (
      utc_url  TEXT NOT NULL,
      slug     TEXT NOT NULL,
      name     TEXT NOT NULL,
      type     TEXT NOT NULL,
      ord      INTEGER NOT NULL,
      sublist  TEXT,
      PRIMARY KEY (utc_url, slug)
    );

    CREATE TABLE IF NOT EXISTS session (
      id             TEXT PRIMARY KEY,
      utc_url        TEXT NOT NULL,
      user_key       TEXT NOT NULL UNIQUE,
      status         TEXT NOT NULL,
      work_started   TEXT NOT NULL,
      work_completed TEXT
    );

    CREATE TABLE IF NOT EXISTS value (
      session_id TEXT NOT NULL,
      slug       TEXT NOT NULL,
      value      TEXT,
      comment    TEXT,
      PRIMARY KEY (session_id, slug)
    );

    CREATE TABLE IF NOT EXISTS outbox (
      session_id   TEXT PRIMARY KEY,
      payload      TEXT NOT NULL,
      status       TEXT NOT NULL,
      attempts     INTEGER NOT NULL DEFAULT 0,
      next_attempt TEXT,
      session_url  TEXT,
      error        TEXT
    );
  `);
  return db;
}
