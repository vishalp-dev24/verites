/**
 * API Client
 * Dashboard API service with error handling and retries
 */

import { delay } from './utils';
import type {
  ApiResponse,
  DashboardStats,
  ResearchJob,
  ResearchRequest,
  ResearchResponse,
  CreditInfo,
  UsageBreakdown,
  SecurityEvent,
  ApiKey,
  HealthStatus,
} from '../types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

interface RequestConfig extends RequestInit {
  retries?: number;
}

/**
 * Check if API key is set
 */
function hasApiKey(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('apiKey');
}

/**
 * Get API headers
 */
function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (typeof window !== 'undefined') {
    const apiKey = localStorage.getItem('apiKey');
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }
  }
  
  return headers;
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
      headers: {
        ...getHeaders(),
        ...fetchConfig.headers,
      },
    });

    // Handle rate limiting with retry
    if (response.status === 429 && retries > 0) {
      const retryAfter = response.headers.get('Retry-After');
      const delayMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : RETRY_DELAY;
      await delay(delayMs);
      return fetchWithRetry(url, { ...config, retries: retries - 1 });
    }

    // Handle server errors with retry
    if (response.status >= 500 && retries > 0) {
      await delay(RETRY_DELAY);
      return fetchWithRetry(url, { ...config, retries: retries - 1 });
    }

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {
        // Use default error message if JSON parsing fails
      }
      
      return { error: errorMessage };
    }

    const data = await response.json();
    return { data };
  } catch (error) {
    if (retries > 0) {
      await delay(RETRY_DELAY);
      return fetchWithRetry(url, { ...config, retries: retries - 1 });
    }
    
    return { 
      error: error instanceof Error ? error.message : 'Network error. Please check your connection.' 
    };
  }
}

// ==================== Dashboard ====================

export async function getDashboardStats(): Promise<ApiResponse<DashboardStats>> {
  return fetchWithRetry(`${API_BASE}/api/stats`);
}

// ==================== Jobs ====================

export async function getJobs(
  page = 1,
  limit = 20,
  status?: string
): Promise<ApiResponse<{ jobs: ResearchJob[]; total: number; page: number; totalPages: number }>> {
  const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
  if (status) params.append('status', status);
  return fetchWithRetry(`${API_BASE}/api/jobs?${params}`);
}

export async function getJob(jobId: string): Promise<ApiResponse<ResearchJob>> {
  return fetchWithRetry(`${API_BASE}/api/jobs/${jobId}`);
}

export async function cancelJob(jobId: string): Promise<ApiResponse<void>> {
  return fetchWithRetry(`${API_BASE}/api/jobs/${jobId}/cancel`, {
    method: 'POST',
  });
}

// ==================== Research ====================

export async function createResearch(
  request: ResearchRequest
): Promise<ApiResponse<ResearchResponse>> {
  return fetchWithRetry(`${API_BASE}/api/research`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getResearchResult(jobId: string): Promise<ApiResponse<ResearchJob>> {
  return fetchWithRetry(`${API_BASE}/api/research/${jobId}/result`);
}

// ==================== Credits ====================

export async function getCredits(): Promise<ApiResponse<CreditInfo>> {
  return fetchWithRetry(`${API_BASE}/api/credits`);
}

export async function getUsageBreakdown(
  days = 30
): Promise<ApiResponse<UsageBreakdown[]>> {
  return fetchWithRetry(`${API_BASE}/api/credits/usage?days=${days}`);
}

// ==================== Security ====================

export async function getSecurityEvents(
  page = 1,
  limit = 50
): Promise<ApiResponse<{ events: SecurityEvent[]; total: number }>> {
  return fetchWithRetry(`${API_BASE}/api/security/events?page=${page}&limit=${limit}`);
}

// ==================== API Keys ====================

export async function getApiKeys(): Promise<ApiResponse<ApiKey[]>> {
  return fetchWithRetry(`${API_BASE}/api/keys`);
}

export async function createApiKey(
  name: string,
  permissions: string[] = ['read', 'write']
): Promise<ApiResponse<ApiKey & { full_key: string }>> {
  return fetchWithRetry(`${API_BASE}/api/keys`, {
    method: 'POST',
    body: JSON.stringify({ name, permissions }),
  });
}

export async function revokeApiKey(keyId: string): Promise<ApiResponse<void>> {
  return fetchWithRetry(`${API_BASE}/api/keys/${keyId}`, {
    method: 'DELETE',
  });
}

// ==================== Health ====================

export async function healthCheck(): Promise<ApiResponse<HealthStatus>> {
  return fetchWithRetry(`${API_BASE}/health`);
}

// ==================== Local Storage ====================

export const apiKeyStorage = {
  set: (key: string): void => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('apiKey', key);
    }
  },
  
  get: (): string | null => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('apiKey');
    }
    return null;
  },
  
  clear: (): void => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('apiKey');
    }
  },
  
  has: (): boolean => hasApiKey(),
};
