const BASE = '/api/v1';

interface ApiOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = opts.token ?? localStorage.getItem('drydock_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, error.detail ?? error.message ?? 'Request failed', error);
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
  }
}

export const endpoints = {
  login: (email: string, password: string) =>
    api<{ accessToken: string; refreshToken: string; expiresIn: number }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    }),
  me: () => api<{ id: string; tenantId: string; email: string; firstName: string; lastName: string; permissions: string[] }>('/auth/me'),
  customers: (page = 1, pageSize = 25) => api<{ data: unknown[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>(`/customers?page=${page}&pageSize=${pageSize}`),
  vendors: (page = 1, pageSize = 25) => api<{ data: unknown[]; meta: { total: number } }>(`/vendors?page=${page}&pageSize=${pageSize}`),
  accounts: () => api<{ data: unknown[] }>('/accounts'),
  periods: () => api<unknown[]>('/accounting-periods'),
  health: () => api<{ status: string; version: string }>('/health'),
};
