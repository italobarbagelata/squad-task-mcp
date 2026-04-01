const API_URL = process.env.SQUAD_API_URL || process.env.TASKMANAGER_API_URL || 'http://localhost:8000';
const EMAIL = process.env.SQUAD_EMAIL || process.env.TASKMANAGER_EMAIL || 'claude@agent.ai';
const PASSWORD = process.env.SQUAD_PASSWORD || process.env.TASKMANAGER_PASSWORD || 'claude-agent-2024';

let accessToken: string | null = null;
let refreshToken: string | null = null;

async function login(): Promise<void> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  accessToken = data.accessToken ?? data.access_token;
  refreshToken = data.refreshToken ?? data.refresh_token;
}

async function refreshAuth(): Promise<void> {
  if (!refreshToken) {
    await login();
    return;
  }
  const res = await fetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken, refresh_token: refreshToken }),
  });
  if (!res.ok) {
    await login();
    return;
  }
  const data = await res.json();
  accessToken = data.accessToken ?? data.access_token;
  refreshToken = data.refreshToken ?? data.refresh_token;
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!accessToken) {
    await login();
  }

  const doRequest = async (): Promise<Response> => {
    return fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...options.headers,
      },
    });
  };

  let res = await doRequest();

  if (res.status === 401) {
    await refreshAuth();
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

export async function ensureAuth(): Promise<void> {
  if (!accessToken) {
    await login();
  }
}
