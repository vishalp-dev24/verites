const PLACEHOLDER_VALUES = new Set([
  'admin',
  'password',
  'change-me',
  'dev-dashboard-api-key',
  'dev-dashboard-password',
  'replace-with-a-long-random-dashboard-password',
  'replace-with-a-tenant-api-key-for-the-dashboard',
  'replace-with-a-strong-password',
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
