import { NextRequest, NextResponse } from 'next/server';
import { enforceDashboardAuth } from '../../../../lib/server/dashboard-auth';
import { isUnsafeExampleSecret } from '../../../../lib/server/env';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const FORWARDED_HEADER_ALLOWLIST = [
  'accept',
  'accept-language',
  'content-type',
  'user-agent',
];

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getDashboardPrincipalRateLimitKey(): string {
  return `dashboard:${process.env.DASHBOARD_USERNAME || 'local-dev'}`;
}

function enforceDashboardProxyRateLimit(): NextResponse | null {
  const limit = parsePositiveInteger(process.env.DASHBOARD_PROXY_REQUESTS_PER_MINUTE, 60);
  const now = Date.now();
  const windowMs = 60_000;
  const key = getDashboardPrincipalRateLimitKey();
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  bucket.count += 1;
  if (bucket.count <= limit) return null;

  const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
  return NextResponse.json(
    { error: 'Dashboard proxy rate limit exceeded', retry_after: retryAfter },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'Cache-Control': 'no-store',
      },
    }
  );
}

function enforceMutationCsrfHeader(request: NextRequest): NextResponse | null {
  if (request.method === 'GET' || request.method === 'HEAD') return null;

  if (request.headers.get('x-veritas-dashboard-request') === '1') return null;

  return NextResponse.json(
    { error: 'Missing dashboard request header' },
    {
      status: 403,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}

function isAllowedBackendRequest(method: string, path: string[]): boolean {
  const [first, second, third, fourth] = path;

  if (method === 'GET' && first === 'health' && path.length === 1) return true;
  if (first !== 'v1') return false;

  if (method === 'GET' && second === 'stats' && path.length === 2) return true;
  if (method === 'GET' && second === 'jobs' && path.length === 2) return true;
  if (method === 'POST' && second === 'jobs' && Boolean(third) && fourth === 'cancel' && path.length === 4) {
    return true;
  }
  if (method === 'POST' && second === 'research' && path.length === 2) return true;
  if (method === 'GET' && second === 'research' && Boolean(third) && path.length === 3) return true;
  if (method === 'GET' && second === 'usage' && path.length === 2) return true;
  if (method === 'GET' && second === 'usage' && third === 'breakdown' && path.length === 3) return true;
  if (method === 'GET' && second === 'security' && third === 'events' && path.length === 3) return true;
  if ((method === 'GET' || method === 'POST') && second === 'api-keys' && path.length === 2) return true;
  if (method === 'DELETE' && second === 'api-keys' && Boolean(third) && path.length === 3) return true;

  return false;
}

function getBackendConfig() {
  const apiUrl = process.env.API_URL || process.env.VERITAS_API_URL || process.env.NEXT_PUBLIC_API_URL;
  const apiKey = process.env.DASHBOARD_API_KEY;

  if (!apiUrl || !apiKey) {
    return {
      error: 'Dashboard API proxy is not configured. Set API_URL and DASHBOARD_API_KEY on the dashboard server.',
    };
  }

  if (process.env.NODE_ENV === 'production' && isUnsafeExampleSecret(apiKey)) {
    return {
      error: 'Dashboard API proxy uses an unsafe example API key.',
    };
  }

  return {
    apiUrl: apiUrl.replace(/\/$/, ''),
    apiKey,
  };
}

function forwardedHeaders(request: NextRequest, apiKey: string): Headers {
  const headers = new Headers();

  for (const name of FORWARDED_HEADER_ALLOWLIST) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  headers.set('x-api-key', apiKey);

  return headers;
}

async function proxy(request: NextRequest, context: RouteContext) {
  const authResponse = enforceDashboardAuth(request);
  if (authResponse) return authResponse;

  const csrfResponse = enforceMutationCsrfHeader(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = enforceDashboardProxyRateLimit();
  if (rateLimitResponse) return rateLimitResponse;

  const config = getBackendConfig();
  if ('error' in config) {
    return NextResponse.json({ error: config.error }, { status: 500 });
  }

  const { path } = await context.params;
  if (!isAllowedBackendRequest(request.method, path)) {
    return NextResponse.json({ error: 'Dashboard proxy route not allowed' }, { status: 404 });
  }

  const requestUrl = new URL(request.url);
  const targetUrl = new URL(path.join('/'), `${config.apiUrl}/`);
  targetUrl.search = requestUrl.search;

  const body = request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : await request.arrayBuffer();

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers: forwardedHeaders(request, config.apiKey),
    body,
    cache: 'no-store',
  });

  const responseHeaders = new Headers(upstream.headers);
  for (const name of HOP_BY_HOP_HEADERS) {
    responseHeaders.delete(name);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
