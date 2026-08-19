import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * The single database handle.
 *
 * Memoize the PROMISE, not the resolved handle. Memoizing the handle leaves a
 * window between the first caller's check and its assignment in which a second
 * caller also sees null, so both open a connection and both run the schema.
 * That window is hit on every cold start: _layout fires drainOutbox() (which
 * reaches getDb via dueRows) in the same tick as index's focus effect firing
 * listCollections().
 *
 * CREATE TABLE IF NOT EXISTS survives that, so it looks harmless. It is not.
 * Two live handles destroy the ordering the rest of the code rests on -- that
 * the per-keystroke setValue writes are serialised ahead of the loadDraft read
 * in finish() -- which is how a session gets submitted missing its last
 * reading. PRAGMA journal_mode = WAL racing on two connections can also throw.
 *
 * Assigning the promise before the first await closes the window: callers
 * arriving mid-open await the same open.
 */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  return (dbPromise ??= openAndMigrate());
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('radmachine.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS collection (
      utc_url     TEXT PRIMARY KEY,
      utc_name    TEXT NOT NULL,
      unit_name   TEXT NOT NULL,
      list_url    TEXT NOT NULL,
      downloaded_at TEXT NOT NULL,
      warning_message TEXT
    );

    CREATE TABLE IF NOT EXISTS test (
      utc_url  TEXT NOT NULL,
      slug     TEXT NOT NULL,
      name     TEXT NOT NULL,
      type     TEXT NOT NULL,
      ord      INTEGER NOT NULL,
      sublist  TEXT,
      ref_value REAL,
      ref_type  TEXT,
      tol_type  TEXT,
      tol_act_low REAL,
      tol_tol_low REAL,
      tol_tol_high REAL,
      tol_act_high REAL,
      tol_mc_pass TEXT,
      tol_mc_tol TEXT,
      calc_procedure TEXT,
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

    CREATE TABLE IF NOT EXISTS schedule (
      utc_url        TEXT PRIMARY KEY,
      unit_url       TEXT NOT NULL,
      unit_name      TEXT NOT NULL,
      site_url       TEXT,
      site_name      TEXT,
      frequency_url  TEXT,
      frequency_name TEXT,
      due_date       TEXT,
      refreshed_at   TEXT NOT NULL
    );
  `);
  try {
    await migrateTestCriteria(db);
  } catch {
    // A failed migration must not brick the app on startup. Worst case the
    // criteria columns stay missing and tolerance feedback reads as no_tol.
  }
  try {
    await migrateCollectionWarning(db);
  } catch {
    // Same rationale — missing warning_message only disables the banner.
  }
  return db;
}

/** Add criteria columns to databases created before v2.1. */
async function migrateTestCriteria(db: SQLite.SQLiteDatabase): Promise<void> {
  const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(test)`);
  const have = new Set(cols.map((c) => c.name));
  const add = [
    'ref_value REAL',
    'ref_type TEXT',
    'tol_type TEXT',
    'tol_act_low REAL',
    'tol_tol_low REAL',
    'tol_tol_high REAL',
    'tol_act_high REAL',
    'tol_mc_pass TEXT',
    'tol_mc_tol TEXT',
    'calc_procedure TEXT',
  ];
  for (const def of add) {
    const name = def.split(' ')[0];
    if (!have.has(name)) await db.execAsync(`ALTER TABLE test ADD COLUMN ${def}`);
  }
}

/** Add warning_message to databases created before tolerance banners. */
async function migrateCollectionWarning(db: SQLite.SQLiteDatabase): Promise<void> {
  const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(collection)`);
  if (!cols.some((c) => c.name === 'warning_message')) {
    await db.execAsync(`ALTER TABLE collection ADD COLUMN warning_message TEXT`);
  }
}
