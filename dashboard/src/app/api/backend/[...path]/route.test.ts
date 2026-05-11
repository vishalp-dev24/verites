import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';

describe('dashboard backend proxy', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function stubDashboardConfig(username = 'admin', password = 'local-dev-password') {
    vi.stubEnv('API_URL', 'https://api.example.test');
    vi.stubEnv('DASHBOARD_API_KEY', 'server-key');
    vi.stubEnv('DASHBOARD_USERNAME', username);
    vi.stubEnv('DASHBOARD_PASSWORD', password);
  }

  function basicAuthHeader(username = 'admin', password = 'local-dev-password') {
    return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  function dashboardMutationHeaders(username = 'admin', password = 'local-dev-password'): Record<string, string> {
    return {
      authorization: basicAuthHeader(username, password),
      'x-veritas-dashboard-request': '1',
    };
  }

  it('drops browser supplied credential headers and injects the server API key', async () => {
    stubDashboardConfig();
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('https://dashboard.example.test/api/backend/v1/research', {
      method: 'POST',
      headers: {
        ...dashboardMutationHeaders(),
        'x-admin-token': 'browser-admin-token',
        'x-api-key': 'browser-api-key',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query: 'test' }),
    });

    await POST(request, {
      params: Promise.resolve({ path: ['v1', 'research'] }),
    });

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('x-api-key')).toBe('server-key');
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('x-admin-token')).toBeNull();
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('rejects backend paths outside the dashboard allowlist', async () => {
    stubDashboardConfig();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('https://dashboard.example.test/api/backend/v1/session/shared/clear', {
      method: 'POST',
      headers: dashboardMutationHeaders(),
    });

    const response = await POST(request, {
      params: Promise.resolve({ path: ['v1', 'session', 'shared', 'clear'] }),
    });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires dashboard auth before using the server API key', async () => {
    stubDashboardConfig();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('https://dashboard.example.test/api/backend/v1/api-keys', {
      method: 'POST',
    });

    const response = await POST(request, {
      params: Promise.resolve({ path: ['v1', 'api-keys'] }),
    });

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects published example dashboard credentials in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DASHBOARD_USERNAME', 'veritas-admin');
    vi.stubEnv('DASHBOARD_PASSWORD', 'replace-with-a-long-random-dashboard-password');
    vi.stubEnv('API_URL', 'https://api.example.test');
    vi.stubEnv('DASHBOARD_API_KEY', 'server-key');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('https://dashboard.example.test/api/backend/health', {
      method: 'GET',
      headers: {
        authorization: `Basic ${Buffer.from('veritas-admin:replace-with-a-long-random-dashboard-password').toString('base64')}`,
      },
    });

    const response = await GET(request, {
      params: Promise.resolve({ path: ['health'] }),
    });

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rate limits repeated dashboard auth failures', async () => {
    stubDashboardConfig('auth-limit-user', 'correct-local-dev-password');
    vi.stubEnv('DASHBOARD_AUTH_ATTEMPTS_PER_MINUTE', '1');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const makeRequest = () => new NextRequest('https://dashboard.example.test/api/backend/health', {
      method: 'GET',
      headers: {
        authorization: basicAuthHeader('auth-limit-user', 'wrong-password'),
      },
    });

    const first = await GET(makeRequest(), {
      params: Promise.resolve({ path: ['health'] }),
    });
    const second = await GET(makeRequest(), {
      params: Promise.resolve({ path: ['health'] }),
    });

    expect(first.status).toBe(401);
    expect(second.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects documented placeholder dashboard API keys in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('API_URL', 'https://api.example.test');
    vi.stubEnv('DASHBOARD_API_KEY', 'replace-with-a-tenant-api-key-for-the-dashboard');
    vi.stubEnv('DASHBOARD_USERNAME', 'veritas-admin');
    vi.stubEnv('DASHBOARD_PASSWORD', 'correct-horse-battery-staple');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('https://dashboard.example.test/api/backend/health', {
      method: 'GET',
      headers: {
        authorization: basicAuthHeader('veritas-admin', 'correct-horse-battery-staple'),
      },
    });

    const response = await GET(request, {
      params: Promise.resolve({ path: ['health'] }),
    });

    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects mutating requests without the dashboard csrf header', async () => {
    stubDashboardConfig();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('https://dashboard.example.test/api/backend/v1/research', {
      method: 'POST',
      headers: {
        authorization: basicAuthHeader(),
      },
    });

    const response = await POST(request, {
      params: Promise.resolve({ path: ['v1', 'research'] }),
    });

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rate limits authenticated dashboard proxy calls before they hit the API', async () => {
    stubDashboardConfig('proxy-limit-user', 'proxy-limit-password');
    vi.stubEnv('DASHBOARD_PROXY_REQUESTS_PER_MINUTE', '1');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const requestOptions = {
      method: 'POST',
      headers: {
        ...dashboardMutationHeaders('proxy-limit-user', 'proxy-limit-password'),
        'x-forwarded-for': '203.0.113.42',
      },
      body: JSON.stringify({ query: 'test' }),
    };

    const first = await POST(new NextRequest(
      'https://dashboard.example.test/api/backend/v1/research',
      requestOptions
    ), {
      params: Promise.resolve({ path: ['v1', 'research'] }),
    });
    const second = await POST(new NextRequest(
      'https://dashboard.example.test/api/backend/v1/research',
      {
        ...requestOptions,
        headers: {
          ...requestOptions.headers,
          'x-forwarded-for': '198.51.100.99',
        },
      }
    ), {
      params: Promise.resolve({ path: ['v1', 'research'] }),
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
