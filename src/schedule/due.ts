export type DueState = 'overdue' | 'due' | 'ok' | 'unscheduled';

/**
 * Where does this collection stand, as of `now`?
 *
 * Overdue and due are counted together on the dashboard but shown apart: a
 * daily control three days late and one due this morning are different
 * situations, and a single combined number hides that.
 *
 * A missing or unparseable date is 'unscheduled', never 'overdue' -- ad-hoc
 * collections have no due date, and painting them red would be noise the user
 * cannot act on.
 */
export function dueState(dueDate: string | null, now: Date): DueState {
  if (!dueDate) return 'unscheduled';
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return 'unscheduled';

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  if (d < startOfToday) return 'overdue';
  if (d < startOfTomorrow) return 'due';
  return 'ok';
}
