import { getDb } from './schema';

/**
 * Wipe every list, test, session, schedule row, and queued payload stored
 * locally. Connection credentials and the cached instance name are kept.
 */
export async function clearAllDownloaded(): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM value`);
    await db.runAsync(`DELETE FROM outbox`);
    await db.runAsync(`DELETE FROM session`);
    await db.runAsync(`DELETE FROM test`);
    await db.runAsync(`DELETE FROM collection`);
    await db.runAsync(`DELETE FROM schedule`);
  });
}
