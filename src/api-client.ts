export interface ApiClientOptions {
  apiUrl: string;
  email: string;
  password: string;
}

/**
 * Per-session API client. Each user/session gets their own instance
 * with their own credentials and tokens.
 */
export class ApiClient {
  private apiUrl: string;
  private email: string;
  private password: string;
  private accessToken: string | null = null;
  private refreshToken_: string | null = null;

  constructor(options: ApiClientOptions) {
    this.apiUrl = options.apiUrl;
    this.email = options.email;
    this.password = options.password;
  }

  private async login(): Promise<void> {
    const res = await fetch(`${this.apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    if (!res.ok) {
      throw new Error(`Login failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    this.accessToken = data.accessToken ?? data.access_token;
    this.refreshToken_ = data.refreshToken ?? data.refresh_token;
  }

  private async refreshAuth(): Promise<void> {
    if (!this.refreshToken_) {
      await this.login();
      return;
    }
    const res = await fetch(`${this.apiUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.refreshToken_, refresh_token: this.refreshToken_ }),
    });
    if (!res.ok) {
      await this.login();
      return;
    }
    const data = await res.json();
    this.accessToken = data.accessToken ?? data.access_token;
    this.refreshToken_ = data.refreshToken ?? data.refresh_token;
  }

  async api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
    if (!this.accessToken) {
      await this.login();
    }

    const doRequest = async (): Promise<Response> => {
      return fetch(`${this.apiUrl}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
          ...options.headers,
        },
      });
    };

    let res = await doRequest();

    if (res.status === 401) {
      await this.refreshAuth();
      res = await doRequest();
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
      await this.login();
    }
  }
}

/** Create an ApiClient from environment variables (for stdio/local mode) */
export function createApiClientFromEnv(): ApiClient {
  return new ApiClient({
    apiUrl: process.env.SQUAD_API_URL || process.env.TASKMANAGER_API_URL || 'http://localhost:8000',
    email: process.env.SQUAD_EMAIL || process.env.TASKMANAGER_EMAIL || 'claude@agent.ai',
    password: process.env.SQUAD_PASSWORD || process.env.TASKMANAGER_PASSWORD || 'claude-agent-2024',
  });
}
