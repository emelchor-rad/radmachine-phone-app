/**
 * 'YYYY-MM-DD HH:mm:ss' in the PHONE's local time.
 *
 * These stamps record when the physicist did the work, not when the phone
 * managed to sync, so they must never be derived from the server clock.
 */
export function nowStamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}
