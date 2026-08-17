export type SubmitOutcome =
  | { kind: 'sent'; url: string }
  | { kind: 'duplicate' }
  | { kind: 'rejected'; message: string }
  | { kind: 'auth'; message: string }
  | { kind: 'retry'; message: string };

const DUPLICATE_MARKER = 'user key already exists';

/**
 * What does this response mean for the outbox?
 *
 * The important case is the duplicate user_key. If a previous attempt reached
 * the server but the response never got back to the phone, the retry is
 * rejected with a 400 -- and that rejection is proof the session exists.
 */
export function classifyResponse(status: number, body: string): SubmitOutcome {
  if (status === 201 || status === 200) {
    let url = '';
    try {
      url = JSON.parse(body)?.url ?? '';
    } catch {
      url = '';
    }
    return { kind: 'sent', url };
  }

  if (status === 400) {
    if (body.toLowerCase().includes(DUPLICATE_MARKER)) return { kind: 'duplicate' };
    return { kind: 'rejected', message: body };
  }

  if (status === 401 || status === 403) return { kind: 'auth', message: body };

  return { kind: 'retry', message: `HTTP ${status}: ${body}` };
}
