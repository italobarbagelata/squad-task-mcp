export interface ApiClientOptions {
  apiUrl: string;
  email: string;
  password: string;
  /** Per-request timeout in ms. Defaults to SQUAD_HTTP_TIMEOUT_MS or 30000. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

function resolveTimeoutMs(explicit?: number): number {
  if (explicit && explicit > 0) return explicit;
  const fromEnv = parseInt(process.env.SQUAD_HTTP_TIMEOUT_MS || '', 10);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_TIMEOUT_MS;
}

/** Encode a single path segment (IDs, keys) before interpolating it into a URL path. */
export function seg(value: string | number): string {
  return encodeURIComponent(String(value));
}

/**
 * Per-session API client. Each user/session gets their own instance
 * with their own credentials and tokens.
 */
export class ApiClient {
  private apiUrl: string;
  private email: string;
  private password: string;
  private timeoutMs: number;
  private accessToken: string | null = null;
  private refreshToken_: string | null = null;
  /** Shared in-flight auth (login or refresh) so concurrent 401s trigger a single call. */
  private authInFlight: Promise<void> | null = null;

  constructor(options: ApiClientOptions) {
    this.apiUrl = options.apiUrl;
    this.email = options.email;
    this.password = options.password;
    this.timeoutMs = resolveTimeoutMs(options.timeoutMs);
  }

  private async fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`Request to ${url} timed out after ${this.timeoutMs} ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private storeTokens(data: Record<string, unknown>): void {
    this.accessToken = (data.accessToken ?? data.access_token ?? null) as string | null;
    this.refreshToken_ = (data.refreshToken ?? data.refresh_token ?? null) as string | null;
  }

  private async login(): Promise<void> {
    const res = await this.fetchWithTimeout(`${this.apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    if (!res.ok) {
      throw new Error(`Login failed: ${res.status} ${await res.text()}`);
    }
    this.storeTokens(await res.json());
  }

  private async refreshOrLogin(): Promise<void> {
    if (!this.refreshToken_) {
      await this.login();
      return;
    }
    const res = await this.fetchWithTimeout(`${this.apiUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.refreshToken_, refresh_token: this.refreshToken_ }),
    });
    if (!res.ok) {
      await this.login();
      return;
    }
    this.storeTokens(await res.json());
  }

  /** Run an auth operation single-flight: concurrent callers await the same promise. */
  private singleFlight(op: () => Promise<void>): Promise<void> {
    if (!this.authInFlight) {
      this.authInFlight = op().finally(() => {
        this.authInFlight = null;
      });
    }
    return this.authInFlight;
  }

  async api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
    if (!this.accessToken) {
      await this.singleFlight(() => this.login());
    }

    const doRequest = async (token: string | null): Promise<Response> => {
      return this.fetchWithTimeout(`${this.apiUrl}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...options.headers,
        },
      });
    };

    const tokenUsed = this.accessToken;
    let res = await doRequest(tokenUsed);

    if (res.status === 401) {
      // Only refresh if nobody else already rotated the token meanwhile.
      if (this.accessToken === tokenUsed) {
        await this.singleFlight(() => this.refreshOrLogin());
      } else if (this.authInFlight) {
        await this.authInFlight;
      }
      res = await doRequest(this.accessToken);
    }

    if (res.status === 204) {
      return undefined as T;
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error ${res.status}: ${body}`);
    }

    return res.json() as Promise<T>;
  }

  async ensureAuth(): Promise<void> {
    if (!this.accessToken) {
      await this.singleFlight(() => this.login());
    }
  }
}

/** Create an ApiClient from environment variables (for stdio/local mode). */
export function createApiClientFromEnv(): ApiClient {
  const email = process.env.SQUAD_EMAIL || process.env.TASKMANAGER_EMAIL;
  const password = process.env.SQUAD_PASSWORD || process.env.TASKMANAGER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Missing credentials: set SQUAD_EMAIL and SQUAD_PASSWORD (or legacy TASKMANAGER_EMAIL / TASKMANAGER_PASSWORD).',
    );
  }
  return new ApiClient({
    apiUrl: process.env.SQUAD_API_URL || process.env.TASKMANAGER_API_URL || 'http://localhost:8000',
    email,
    password,
  });
}
