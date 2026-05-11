/**
 * API Client
 * Dashboard API service with error handling and retries
 */

import { delay } from './utils';
import type {
  ApiKey,
  ApiResponse,
  CreditInfo,
  DashboardStats,
  HealthStatus,
  JobStatus,
  ResearchJob,
  ResearchMode,
  ResearchRequest,
  ResearchResponse,
  SecurityEvent,
  UsageBreakdown,
} from '../types';

function getApiBase(): string {
  return '/api/backend';
}

const API_BASE = getApiBase();
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

interface RequestConfig extends RequestInit {
  retries?: number;
}

type BackendRecord = Record<string, unknown>;

/**
 * Get API headers
 */
function getHeaders(): Headers {
  return new Headers({
    'Content-Type': 'application/json',
    'X-Veritas-Dashboard-Request': '1',
  });
}

function mergeHeaders(headers?: HeadersInit): Headers {
  const merged = getHeaders();

  if (headers) {
    new Headers(headers).forEach((value, key) => {
      merged.set(key, value);
    });
  }

  return merged;
}

async function readErrorMessage(response: Response): Promise<string> {
  const defaultMessage = `HTTP ${response.status}: ${response.statusText}`;
  const text = await response.text();

  if (!text) return defaultMessage;

  try {
    const errorData = JSON.parse(text) as { message?: unknown; error?: unknown };
    return asString(errorData.message) || asString(errorData.error) || defaultMessage;
  } catch {
    return text;
  }
}

/**
 * Fetch with retry logic
 */
async function fetchWithRetry<T>(
  url: string,
  config: RequestConfig = {}
): Promise<ApiResponse<T>> {
  const { retries = MAX_RETRIES, ...fetchConfig } = config;

  try {
    const response = await fetch(url, {
      ...fetchConfig,
      headers: mergeHeaders(fetchConfig.headers),
    });

    // Handle rate limiting with retry
    if (response.status === 429 && retries > 0) {
      const retryAfter = Number.parseInt(response.headers.get('Retry-After') || '', 10);
      const delayMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : RETRY_DELAY;
      await delay(delayMs);
      return fetchWithRetry(url, { ...fetchConfig, retries: retries - 1 });
    }

    // Handle server errors with retry
    if (response.status >= 500 && retries > 0) {
      await delay(RETRY_DELAY);
      return fetchWithRetry(url, { ...fetchConfig, retries: retries - 1 });
    }

    if (!response.ok) {
      return { error: await readErrorMessage(response) };
    }

    const text = await response.text();
    if (!text) return { data: undefined as T };

    try {
      return { data: JSON.parse(text) as T };
    } catch {
      return { error: 'Invalid JSON response from API' };
    }
  } catch (error) {
    if (retries > 0) {
      await delay(RETRY_DELAY);
      return fetchWithRetry(url, { ...fetchConfig, retries: retries - 1 });
    }

    return {
      error: error instanceof Error ? error.message : 'Network error. Please check your connection.',
    };
  }
}

function asRecord(value: unknown): BackendRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as BackendRecord : {};
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = asNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeDate(value: unknown, fallback = new Date(0).toISOString()): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return fallback;
}

function normalizeStatus(status: unknown): JobStatus {
  switch (asString(status).toLowerCase()) {
    case 'complete':
    case 'completed':
    case 'success':
    case 'partial':
      return 'complete';
    case 'processing':
    case 'researching':
    case 'running':
      return 'processing';
    case 'queued':
    case 'planning':
      return 'queued';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    case 'failed':
    case 'error':
    case 'rejected':
      return 'failed';
    case 'pending':
    default:
      return 'pending';
  }
}

function normalizeMode(mode: unknown): ResearchMode {
  const value = asString(mode).toLowerCase();
  if (value === 'lite' || value === 'medium' || value === 'deep') return value;
  return 'medium';
}

function sourceCountFrom(rawJob: BackendRecord): number | undefined {
  const data = asRecord(rawJob.data);
  const sources = rawJob.sources ?? data.sources;
  return Array.isArray(sources) ? sources.length : undefined;
}

function normalizeJob(rawJob: BackendRecord): ResearchJob {
  const error = asString(rawJob.error ?? rawJob.errorMessage);

  return {
    job_id: asString(rawJob.job_id ?? rawJob.jobId ?? rawJob.id),
    session_id: asString(rawJob.session_id ?? rawJob.sessionId),
    query: asString(rawJob.query),
    mode: normalizeMode(rawJob.mode),
    status: normalizeStatus(rawJob.status),
    confidence_score: asOptionalNumber(rawJob.confidence_score ?? rawJob.confidenceScore) ?? null,
    credits_used: asNumber(rawJob.credits_used ?? rawJob.creditsUsed),
    created_at: normalizeDate(rawJob.created_at ?? rawJob.createdAt),
    completed_at: rawJob.completed_at || rawJob.completedAt
      ? normalizeDate(rawJob.completed_at ?? rawJob.completedAt)
      : undefined,
    started_at: rawJob.started_at || rawJob.startedAt
      ? normalizeDate(rawJob.started_at ?? rawJob.startedAt)
      : undefined,
    error: error || undefined,
    sources_count: sourceCountFrom(rawJob),
    estimated_time: asOptionalNumber(rawJob.estimated_time ?? rawJob.estimatedTime),
  };
}

function defaultEstimatedSeconds(mode: ResearchMode): number {
  return {
    lite: 30,
    medium: 180,
    deep: 480,
  }[mode];
}

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `dashboard_${crypto.randomUUID()}`;
  }

  return `dashboard_${Date.now().toString(36)}`;
}

function normalizeResearchRequest(request: ResearchRequest): BackendRecord {
  const sessionId = request.session_id?.trim() || createSessionId();
  const outputSchema = request.output_schema ?? {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      key_facts: {
        type: 'array',
        items: { type: 'string' },
      },
      sources: {
        type: 'array',
        items: { type: 'string' },
      },
    },
  };

  return {
    query: request.query.trim(),
    mode: request.mode,
    session_id: sessionId,
    output_schema: outputSchema,
  };
}

function normalizeResearchResponse(
  rawResponse: BackendRecord,
  mode: ResearchMode
): ResearchResponse | null {
  const jobId = asString(rawResponse.job_id ?? rawResponse.jobId);
  if (!jobId) return null;

  const estimatedCompletionMs = asOptionalNumber(rawResponse.estimated_completion_ms);
  const estimatedTime =
    asOptionalNumber(rawResponse.estimated_time ?? rawResponse.estimatedTime ?? rawResponse.estimated_time_seconds) ??
    (estimatedCompletionMs ? Math.ceil(estimatedCompletionMs / 1000) : defaultEstimatedSeconds(mode));

  return {
    job_id: jobId,
    status: normalizeStatus(rawResponse.status),
    estimated_time: estimatedTime,
    position_in_queue: asOptionalNumber(rawResponse.position_in_queue ?? rawResponse.positionInQueue),
  };
}

function tierName(tier: string): string {
  if (!tier) return 'Unknown';
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

// ==================== Dashboard ====================

export async function getDashboardStats(): Promise<ApiResponse<DashboardStats>> {
  const response = await fetchWithRetry<BackendRecord>(`${API_BASE}/v1/stats`);
  if (response.error || !response.data) return { error: response.error || 'Dashboard stats unavailable' };

  const stats = response.data;
  return {
    data: {
      total_jobs: asNumber(stats.total_jobs ?? stats.totalJobs),
      jobs_today: asNumber(stats.jobs_today ?? stats.jobsToday),
      active_jobs: asNumber(stats.active_jobs ?? stats.activeJobs),
      credits_remaining: asNumber(stats.credits_remaining ?? stats.creditsRemaining),
      credits_used_this_month: asNumber(stats.credits_used_this_month ?? stats.creditsUsedThisMonth),
      avg_research_time: asNumber(stats.avg_research_time ?? stats.avgResearchTime),
      queue_length: asNumber(stats.queue_length ?? stats.queueLength),
      cache_hit_rate: asNumber(stats.cache_hit_rate ?? stats.cacheHitRate),
      active_sessions: asNumber(stats.active_sessions ?? stats.activeSessions),
    },
  };
}

// ==================== Jobs ====================

export async function getJobs(
  page = 1,
  limit = 20,
  status?: string
): Promise<ApiResponse<{ jobs: ResearchJob[]; total: number; page: number; totalPages: number }>> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (status && status !== 'all') params.set('status', status);

  const response = await fetchWithRetry<BackendRecord[] | { jobs?: BackendRecord[]; total?: number; page?: number; totalPages?: number }>(
    `${API_BASE}/v1/jobs?${params.toString()}`
  );
  if (response.error || !response.data) return { error: response.error || 'Jobs unavailable' };

  const rawJobs = Array.isArray(response.data) ? response.data : response.data.jobs || [];
  const normalizedJobs = rawJobs.map(normalizeJob);
  const filteredJobs = Array.isArray(response.data) && status
    ? normalizedJobs.filter((job) => job.status === normalizeStatus(status))
    : normalizedJobs;
  const safeLimit = Math.max(1, limit);
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * safeLimit;
  const jobs = Array.isArray(response.data) ? filteredJobs.slice(start, start + safeLimit) : filteredJobs;

  return {
    data: {
      jobs,
      total: Array.isArray(response.data) ? filteredJobs.length : asNumber(response.data.total, filteredJobs.length),
      page: Array.isArray(response.data) ? safePage : asNumber(response.data.page, safePage),
      totalPages: Array.isArray(response.data)
        ? Math.max(1, Math.ceil(filteredJobs.length / safeLimit))
        : asNumber(response.data.totalPages, Math.max(1, Math.ceil(filteredJobs.length / safeLimit))),
    },
  };
}

export async function getJob(jobId: string): Promise<ApiResponse<ResearchJob>> {
  const response = await fetchWithRetry<BackendRecord>(`${API_BASE}/v1/research/${encodeURIComponent(jobId)}`);
  if (response.error || !response.data) return { error: response.error || 'Job unavailable' };
  return { data: normalizeJob(response.data) };
}

export async function cancelJob(jobId: string): Promise<ApiResponse<void>> {
  return fetchWithRetry<void>(`${API_BASE}/v1/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
  });
}

// ==================== Research ====================

export async function createResearch(
  request: ResearchRequest
): Promise<ApiResponse<ResearchResponse>> {
  const response = await fetchWithRetry<BackendRecord>(`${API_BASE}/v1/research`, {
    method: 'POST',
    body: JSON.stringify(normalizeResearchRequest(request)),
  });

  if (response.error || !response.data) return { error: response.error || 'Research request failed' };

  const data = normalizeResearchResponse(response.data, request.mode);
  return data ? { data } : { error: 'Research endpoint did not return a job id' };
}

export async function getResearchResult(jobId: string): Promise<ApiResponse<ResearchJob>> {
  return getJob(jobId);
}

// ==================== Credits ====================

export async function getCredits(): Promise<ApiResponse<CreditInfo>> {
  const response = await fetchWithRetry<BackendRecord>(`${API_BASE}/v1/usage`);
  if (response.error || !response.data) return { error: response.error || 'Credit usage unavailable' };

  const usage = response.data;
  const tier = asString(usage.tier, 'unknown');

  return {
    data: {
      balance: asNumber(usage.creditsBalance ?? usage.credits_balance),
      used_this_month: asNumber(usage.creditsUsed ?? usage.credits_used),
      tier,
      tier_name: tierName(tier),
    },
  };
}

export async function getUsageBreakdown(
  days = 30
): Promise<ApiResponse<UsageBreakdown[]>> {
  const response = await fetchWithRetry<BackendRecord[]>(`${API_BASE}/v1/usage/breakdown?days=${days}`);
  if (response.error || !response.data) return { error: response.error || 'Usage breakdown unavailable' };

  return {
    data: response.data.map((item) => ({
      mode: normalizeMode(item.mode),
      requests: asNumber(item.requests),
      credits_used: asNumber(item.credits_used ?? item.creditsUsed),
      avg_credits_per_request: asNumber(item.avg_credits_per_request ?? item.avgCreditsPerRequest),
    })),
  };
}

// ==================== Security ====================

export async function getSecurityEvents(
  page = 1,
  limit = 50
): Promise<ApiResponse<{ events: SecurityEvent[]; total: number }>> {
  const response = await fetchWithRetry<{ events?: BackendRecord[]; total?: number }>(
    `${API_BASE}/v1/security/events?page=${page}&limit=${limit}`
  );
  if (response.error || !response.data) return { error: response.error || 'Security events unavailable' };

  return {
    data: {
      total: asNumber(response.data.total),
      events: (response.data.events || []).map((event) => ({
        id: asString(event.id),
        type: asString(event.type),
        risk_score: asNumber(event.risk_score ?? event.riskScore),
        source_url: asString(event.source_url ?? event.sourceUrl) || undefined,
        action: ['blocked', 'quarantined', 'allowed', 'flagged'].includes(asString(event.action))
          ? asString(event.action) as SecurityEvent['action']
          : 'flagged',
        timestamp: normalizeDate(event.timestamp),
        details: asRecord(event.details),
      })),
    },
  };
}

// ==================== API Keys ====================

export async function getApiKeys(): Promise<ApiResponse<ApiKey[]>> {
  const response = await fetchWithRetry<BackendRecord[]>(`${API_BASE}/v1/api-keys`);
  if (response.error || !response.data) return { error: response.error || 'API keys unavailable' };

  return {
    data: response.data.map((key) => ({
      id: asString(key.id),
      name: asString(key.name),
      key_preview: asString(key.key_preview ?? key.keyPreview),
      created_at: normalizeDate(key.created_at ?? key.createdAt),
      last_used_at: key.last_used_at || key.lastUsedAt
        ? normalizeDate(key.last_used_at ?? key.lastUsedAt)
        : undefined,
      usage_count: asNumber(key.usage_count ?? key.usageCount),
      status: ['active', 'revoked', 'expired'].includes(asString(key.status))
        ? asString(key.status) as ApiKey['status']
        : 'active',
      permissions: Array.isArray(key.permissions) ? key.permissions.map((item) => asString(item)) : [],
    })),
  };
}

export async function createApiKey(
  name: string,
  permissions: string[] = ['read', 'write']
): Promise<ApiResponse<ApiKey & { full_key: string }>> {
  const response = await fetchWithRetry<BackendRecord>(`${API_BASE}/v1/api-keys`, {
    method: 'POST',
    body: JSON.stringify({ name, permissions }),
  });
  if (response.error || !response.data) return { error: response.error || 'API key creation failed' };

  const key = response.data;
  return {
    data: {
      id: asString(key.id),
      name: asString(key.name),
      key_preview: asString(key.key_preview ?? key.keyPreview),
      created_at: normalizeDate(key.created_at ?? key.createdAt),
      last_used_at: key.last_used_at || key.lastUsedAt
        ? normalizeDate(key.last_used_at ?? key.lastUsedAt)
        : undefined,
      usage_count: asNumber(key.usage_count ?? key.usageCount),
      status: ['active', 'revoked', 'expired'].includes(asString(key.status))
        ? asString(key.status) as ApiKey['status']
        : 'active',
      permissions: Array.isArray(key.permissions) ? key.permissions.map((item) => asString(item)) : permissions,
      full_key: asString(key.full_key ?? key.fullKey),
    },
  };
}

export async function revokeApiKey(keyId: string): Promise<ApiResponse<void>> {
  return fetchWithRetry<void>(`${API_BASE}/v1/api-keys/${encodeURIComponent(keyId)}`, {
    method: 'DELETE',
  });
}

// ==================== Health ====================

function normalizeServiceStatus(value: unknown, fallback: 'connected' | 'disconnected'): 'connected' | 'disconnected' {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'connected' || normalized === 'healthy' || normalized === 'ok') return 'connected';
  if (normalized === 'disconnected' || normalized === 'unhealthy' || normalized === 'error') return 'disconnected';
  return fallback;
}

export async function healthCheck(): Promise<ApiResponse<HealthStatus>> {
  const response = await fetchWithRetry<BackendRecord>(`${API_BASE}/health`);
  if (response.error || !response.data) return { error: response.error || 'Health check unavailable' };

  const health = response.data;
  const rawStatus = asString(health.status).toLowerCase();
  const status: HealthStatus['status'] =
    rawStatus === 'healthy' || rawStatus === 'ok'
      ? 'healthy'
      : rawStatus === 'degraded'
        ? 'degraded'
        : 'unhealthy';
  const defaultServiceStatus = status === 'healthy' ? 'connected' : 'disconnected';
  const services = asRecord(health.services);

  return {
    data: {
      status,
      version: asString(health.version, 'unknown'),
      timestamp: asString(health.timestamp, new Date().toISOString()),
      uptime: asNumber(health.uptime),
      services: {
        database: normalizeServiceStatus(services.database, defaultServiceStatus),
        redis: normalizeServiceStatus(services.redis, defaultServiceStatus),
        search: normalizeServiceStatus(services.search, defaultServiceStatus),
        llm: normalizeServiceStatus(services.llm, defaultServiceStatus),
      },
    },
  };
}
