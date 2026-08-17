/**
 * Thin RadMachine REST client.
 *
 * Auth is a CUSTOM header: RadAuthorization. The standard Authorization
 * header does not work against this API.
 *
 * get() raises on non-2xx because callers want the data or nothing.
 * post() does NOT raise -- the outbox needs to inspect the status itself,
 * since a 400 can mean success (duplicate user_key).
 */
export class RadClient {
  constructor(private base: string, private token: string) {}

  private url(path: string, params?: Record<string, string>): string {
    const full = path.startsWith('http') ? path : this.base + path;
    if (!params) return full;
    const q = new URLSearchParams(params).toString();
    return q ? `${full}?${q}` : full;
  }

  private headers(): Record<string, string> {
    return {
      RadAuthorization: `Token ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  async get<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
    const url = this.url(path, params);
    const r = await fetch(url, { method: 'GET', headers: this.headers() });
    const body = await r.text();
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`GET ${url} -> ${r.status}: ${body.slice(0, 300)}`);
    }
    return JSON.parse(body) as T;
  }

  async post(path: string, data: unknown): Promise<{ status: number; body: string }> {
    const r = await fetch(this.url(path), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(data),
    });
    return { status: r.status, body: await r.text() };
  }
}
