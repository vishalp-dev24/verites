import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_TENANT_ID = 'tenant_default';
export const DEFAULT_TENANT_NAME = 'Default Tenant';
export const DEFAULT_TENANT_EMAIL = 'bootstrap@example.invalid';
export const DEFAULT_API_KEY_NAME = 'Bootstrap key';
export const DEFAULT_INITIAL_FREE_CREDITS = 250;
export const MIN_LITE_RESEARCH_CREDITS = 13;

const FLAG_MAP = new Map([
  ['--tenant-id', 'tenantId'],
  ['--name', 'name'],
  ['--email', 'email'],
  ['--credits', 'initialCredits'],
  ['--key-name', 'apiKeyName'],
  ['--force-new-key', 'forceNewKey'],
]);

const BOOLEAN_FLAGS = new Set(['forceNewKey']);

export function hashApiKey(apiKey) {
  return createHash('sha256').update(apiKey).digest('hex');
}

export function generateApiKey() {
  return `vts_${randomBytes(32).toString('base64url')}`;
}

export function generateKeyId() {
  return `key_${randomBytes(12).toString('hex')}`;
}

export function parseArgs(argv = []) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const separatorIndex = token.indexOf('=');
    const flag = separatorIndex === -1 ? token : token.slice(0, separatorIndex);
    const inlineValue = separatorIndex === -1 ? undefined : token.slice(separatorIndex + 1);
    const optionName = FLAG_MAP.get(flag);

    if (!optionName) {
      throw new Error(`Unknown bootstrap option: ${flag}`);
    }

    if (BOOLEAN_FLAGS.has(optionName)) {
      if (inlineValue !== undefined && inlineValue !== '') {
        parsed[optionName] = readBoolean(inlineValue, optionName);
      } else {
        parsed[optionName] = true;
      }
      continue;
    }

    const value = inlineValue ?? argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${flag} requires a value`);
    }

    if (inlineValue === undefined) index += 1;
    parsed[optionName] = value;
  }

  return parsed;
}

export function resolveBootstrapOptions({ env = {}, argv = [] } = {}) {
  const args = parseArgs(argv);
  const isProduction = env.NODE_ENV === 'production';
  const email = args.email ?? env.BOOTSTRAP_TENANT_EMAIL ?? (isProduction ? undefined : DEFAULT_TENANT_EMAIL);
  const initialCredits = parsePositiveInteger(
    args.initialCredits ?? env.BOOTSTRAP_INITIAL_CREDITS,
    DEFAULT_INITIAL_FREE_CREDITS,
    'initialCredits'
  );

  if (!email) {
    throw new Error('BOOTSTRAP_TENANT_EMAIL or --email is required in production');
  }

  if (initialCredits < MIN_LITE_RESEARCH_CREDITS) {
    throw new Error(`initialCredits must be at least ${MIN_LITE_RESEARCH_CREDITS} for one default lite research reservation`);
  }

  const options = {
    tenantId: String(args.tenantId ?? env.BOOTSTRAP_TENANT_ID ?? DEFAULT_TENANT_ID).trim(),
    name: String(args.name ?? env.BOOTSTRAP_TENANT_NAME ?? DEFAULT_TENANT_NAME).trim(),
    email: String(email).trim().toLowerCase(),
    apiKeyName: String(args.apiKeyName ?? env.BOOTSTRAP_API_KEY_NAME ?? DEFAULT_API_KEY_NAME).trim(),
    initialCredits,
    forceNewKey: args.forceNewKey ?? readBoolean(env.BOOTSTRAP_FORCE_NEW_KEY, 'forceNewKey', false),
  };

  validateOptions(options);
  return options;
}

export async function bootstrapFirstTenant({ prisma, env = {}, argv = [] } = {}) {
  if (!prisma) {
    throw new Error('A Prisma client is required');
  }

  const options = resolveBootstrapOptions({ env, argv });
  const existingTenant = await prisma.tenant.findUnique({
    where: { tenantId: options.tenantId },
  });

  let tenant = existingTenant;
  let tenantCreated = false;
  let initialCreditsGranted = false;

  if (tenant && tenant.isActive === false) {
    throw new Error(`Tenant ${options.tenantId} exists but is inactive; refusing to reactivate it from bootstrap`);
  }

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        tenantId: options.tenantId,
        name: options.name,
        email: options.email,
        tier: 'free',
        creditsBalance: options.initialCredits,
        creditsUsed: 0,
        isActive: true,
      },
    });
    tenantCreated = true;
    initialCreditsGranted = true;
  } else if (shouldGrantInitialCredits(tenant, options.initialCredits)) {
    tenant = await prisma.tenant.update({
      where: { tenantId: options.tenantId },
      data: { creditsBalance: options.initialCredits },
    });
    initialCreditsGranted = true;
  }

  const existingKey = await prisma.apiKey.findFirst({
    where: {
      tenantId: options.tenantId,
      isActive: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  let apiKeyResult;
  if (!existingKey || options.forceNewKey) {
    const fullKey = generateApiKey();
    const key = await prisma.apiKey.create({
      data: {
        keyId: generateKeyId(),
        tenantId: options.tenantId,
        keyHash: hashApiKey(fullKey),
        name: options.apiKeyName,
      },
    });

    apiKeyResult = {
      created: true,
      id: key.keyId,
      name: key.name ?? options.apiKeyName,
      full_key: fullKey,
      one_time_secret: true,
    };
  } else {
    apiKeyResult = {
      created: false,
      existing_key_id: existingKey.keyId,
      raw_key_recoverable: false,
      reason: 'active_api_key_exists',
      force_new_key_hint: 'npm run db:bootstrap -- --force-new-key',
    };
  }

  return {
    tenant: {
      created: tenantCreated,
      tenant_id: tenant.tenantId,
      name: tenant.name,
      email: tenant.email,
      tier: tenant.tier,
      credits_balance: tenant.creditsBalance,
      initial_credits_granted: initialCreditsGranted,
    },
    api_key: apiKeyResult,
  };
}

export async function runCli(argv = process.argv.slice(2), env = process.env) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const result = await bootstrapFirstTenant({ prisma, env, argv });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`[bootstrap] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

function shouldGrantInitialCredits(tenant, initialCredits) {
  return tenant.tier === 'free'
    && Number(tenant.creditsUsed ?? 0) === 0
    && Number(tenant.creditsBalance ?? 0) < initialCredits;
}

function validateOptions(options) {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(options.tenantId)) {
    throw new Error('tenantId must be 1-128 characters using letters, numbers, dot, underscore, colon, or dash');
  }

  if (!options.name) {
    throw new Error('tenant name is required');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(options.email)) {
    throw new Error('tenant email is invalid');
  }

  if (!options.apiKeyName) {
    throw new Error('API key name is required');
  }
}

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function readBoolean(value, name, fallback = undefined) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())) return true;
  if (['0', 'false', 'no', 'off'].includes(String(value).toLowerCase())) return false;
  throw new Error(`${name} must be a boolean`);
}

function isDirectExecution(metaUrl, argvPath) {
  if (!argvPath) return false;
  return fileURLToPath(metaUrl) === path.resolve(argvPath);
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  await runCli();
}
