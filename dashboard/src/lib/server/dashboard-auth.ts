import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isUnsafeExampleSecret } from './env';

const authAttemptBuckets = new Map<string, { count: number; resetAt: number }>();

function dashboardAuthRequired(): boolean {
  return process.env.NODE_ENV === 'production'
    || Boolean(process.env.DASHBOARD_USERNAME)
    || Boolean(process.env.DASHBOARD_PASSWORD);
}

function safeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
}

function parseBasicAuth(value: string | null): { username: string; password: string } | null {
  if (!value?.startsWith('Basic ')) return null;

  try {
    const decoded = Buffer.from(value.slice('Basic '.length), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex < 1) return null;

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function authAttemptRateLimitKey(credentials: { username: string; password: string } | null): string {
  const username = credentials?.username?.slice(0, 128) || 'anonymous';
  return `dashboard-auth:${username}`;
}

function dashboardAuthRateLimitResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many dashboard authentication attempts', retry_after: retryAfter },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'Cache-Control': 'no-store',
      },
    }
  );
}

function enforceAuthAttemptRateLimit(credentials: { username: string; password: string } | null): NextResponse | null {
  const limit = parsePositiveInteger(process.env.DASHBOARD_AUTH_ATTEMPTS_PER_MINUTE, 10);
  const now = Date.now();
  const windowMs = 60_000;
  const key = authAttemptRateLimitKey(credentials);
  const bucket = authAttemptBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    authAttemptBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  bucket.count += 1;
  if (bucket.count <= limit) return null;

  return dashboardAuthRateLimitResponse(Math.ceil((bucket.resetAt - now) / 1000));
}

function clearAuthAttemptRateLimit(credentials: { username: string; password: string }): void {
  authAttemptBuckets.delete(authAttemptRateLimitKey(credentials));
}

function dashboardAuthConfigError(): string | null {
  if (!dashboardAuthRequired()) return null;

  const username = process.env.DASHBOARD_USERNAME;
  const password = process.env.DASHBOARD_PASSWORD;

  if (!username || !password) {
    return 'Dashboard authentication is not configured. Set DASHBOARD_USERNAME and DASHBOARD_PASSWORD.';
  }

  if (process.env.NODE_ENV === 'production') {
    if (isUnsafeExampleSecret(username) || isUnsafeExampleSecret(password)) {
      return 'Dashboard authentication uses an unsafe example credential.';
    }

    if (password.length < 16) {
      return 'DASHBOARD_PASSWORD must be at least 16 characters in production.';
    }
  }

  return null;
}

export function dashboardUnauthorizedResponse(): NextResponse {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Veritas Dashboard", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  });
}

export function enforceDashboardAuth(request: NextRequest): NextResponse | null {
  const configError = dashboardAuthConfigError();
  if (configError) {
    return NextResponse.json({ error: configError }, { status: 503 });
  }

  if (!dashboardAuthRequired()) return null;

  const credentials = parseBasicAuth(request.headers.get('authorization'));
  if (!credentials) {
    return enforceAuthAttemptRateLimit(null) || dashboardUnauthorizedResponse();
  }

  const username = process.env.DASHBOARD_USERNAME || '';
  const password = process.env.DASHBOARD_PASSWORD || '';
  if (!safeEqual(credentials.username, username) || !safeEqual(credentials.password, password)) {
    return enforceAuthAttemptRateLimit(credentials) || dashboardUnauthorizedResponse();
  }

  clearAuthAttemptRateLimit(credentials);
  return null;
}
