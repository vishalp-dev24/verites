const PLACEHOLDER_VALUES = new Set([
  'admin',
  'password',
  'change-me',
  'dev-dashboard-api-key',
  'dev-dashboard-password',
  'replace-with-a-long-random-dashboard-password',
  'replace-with-a-random-admin-token',
  'replace-with-a-tenant-api-key-for-the-dashboard',
  'replace-with-a-strong-password',
  'replace-with-db-password',
  'replace-with-redis-password',
  'sk-your-openai-key-here',
  'tvly-your-key-here',
  'your-exa-key-here',
  'akia...',
  '...',
]);

export function isUnsafeExampleSecret(value: string | undefined | null): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();
  return PLACEHOLDER_VALUES.has(trimmed)
    || PLACEHOLDER_VALUES.has(lower)
    || lower.startsWith('replace-with-')
    || lower.endsWith('...')
    || lower.includes('your-');
}

function collectUrlCredentialIssues(name: string, value: string | undefined): string[] {
  if (!value) return [];

  try {
    const url = new URL(value);
    const issues: string[] = [];
    const username = decodeURIComponent(url.username || '');
    const password = decodeURIComponent(url.password || '');

    if (isUnsafeExampleSecret(username)) {
      issues.push(`${name} username must not use an example value`);
    }
    if (isUnsafeExampleSecret(password)) {
      issues.push(`${name} password must not use an example value`);
    }

    return issues;
  } catch {
    return [`${name} must be a valid URL`];
  }
}

export function requireProductionConfig(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const missing: string[] = [];
  const invalid: string[] = [];

  for (const name of ['DATABASE_URL', 'REDIS_URL', 'ADMIN_API_TOKEN', 'ALLOWED_ORIGINS']) {
    if (!process.env[name]) missing.push(name);
  }

  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasBedrock = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  if (!hasOpenAI && !hasBedrock) {
    missing.push('OPENAI_API_KEY or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY');
  }

  if (!process.env.TAVILY_API_KEY && !process.env.EXA_API_KEY) {
    missing.push('TAVILY_API_KEY or EXA_API_KEY');
  }

  const origins = process.env.ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) || [];
  if (origins.includes('*')) {
    invalid.push('ALLOWED_ORIGINS must not include * in production');
  }

  for (const name of [
    'DB_PASSWORD',
    'REDIS_PASSWORD',
    'ADMIN_API_TOKEN',
    'DASHBOARD_API_KEY',
    'DASHBOARD_PASSWORD',
    'OPENAI_API_KEY',
    'TAVILY_API_KEY',
    'EXA_API_KEY',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
  ]) {
    if (isUnsafeExampleSecret(process.env[name])) {
      invalid.push(`${name} must not use an example value`);
    }
  }

  invalid.push(...collectUrlCredentialIssues('DATABASE_URL', process.env.DATABASE_URL));
  invalid.push(...collectUrlCredentialIssues('REDIS_URL', process.env.REDIS_URL));

  if (missing.length > 0 || invalid.length > 0) {
    throw new Error([
      missing.length > 0 ? `Missing production configuration: ${missing.join(', ')}` : '',
      invalid.length > 0 ? `Invalid production configuration: ${invalid.join(', ')}` : '',
    ].filter(Boolean).join('; '));
  }
}
