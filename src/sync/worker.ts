import type { SubmitOutcome } from '../api/submit';

export type OutboxStatus = 'queued' | 'sent' | 'failed';

export type OutboxState = {
  status: OutboxStatus;
  sessionUrl: string | null;
  error: string | null;
};

const MAX_BACKOFF_MS = 5 * 60 * 1000;

/** Where does an outbox row go after this response? */
export function nextState(outcome: SubmitOutcome, _attempts: number): OutboxState {
  switch (outcome.kind) {
    case 'sent':
      return { status: 'sent', sessionUrl: outcome.url || null, error: null };
    case 'duplicate':
      // An earlier attempt landed. The real url is resolved by a follow-up
      // GET ?user_key=..., which is not this function's job.
      return { status: 'sent', sessionUrl: null, error: null };
    case 'rejected':
      return { status: 'failed', sessionUrl: null, error: outcome.message };
    case 'auth':
      // NOT terminal. An auth error is a property of the credentials, not of
      // the payload: an expired or rotated token -- or a captive portal
      // answering 403 -- would otherwise fail every queued session in one
      // pass, and no code path moves a row from 'failed' back to 'queued'.
      // The reading survives in the value table but nothing can reach it.
      // Keep the row queued, keep the message for the queue screen.
      return { status: 'queued', sessionUrl: null, error: outcome.message };
    case 'retry':
      return { status: 'queued', sessionUrl: null, error: outcome.message };
  }
}

/** Exponential backoff, capped at five minutes. */
export function backoffMs(attempts: number): number {
  return Math.min(1000 * 2 ** attempts, MAX_BACKOFF_MS);
}
