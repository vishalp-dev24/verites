/**
 * Dashboard API Service
 * Client for Research Platform backend
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${url}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': localStorage.getItem('apiKey') || '',
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      return { error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const data = await response.json();
    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Network error' };
  }
}

// Dashboard Stats
export interface DashboardStats {
  total_jobs: number;
  jobs_today: number;
  active_jobs: number;
  credits_remaining: number;
  avg_research_time: number;
  queue_length: number;
}

export function getDashboardStats(): Promise<ApiResponse<DashboardStats>> {
  return fetchJson('/api/stats');
}

// Research Jobs
export interface ResearchJob {
  job_id: string;
  session_id: string;
  query: string;
  mode: string;
  status: string;
  confidence_score: number;
  credits_used: number;
  created_at: string;
  completed_at?: string;
  error?: string;
}

export function getJobs(page = 1, limit = 20): Promise<ApiResponse<{ jobs: ResearchJob[]; total: number; page: number }>> {
  return fetchJson(`/api/jobs?page=${page}&limit=${limit}`);
}

export function getJob(jobId: string): Promise<ApiResponse<ResearchJob>> {
  return fetchJson(`/api/jobs/${jobId}`);
}

// Credits
export interface CreditInfo {
  balance: number;
  used_this_month: number;
  tier: string;
  tier_name: string;
}

export function getCredits(): Promise<ApiResponse<CreditInfo>> {
  return fetchJson('/api/credits');
}

// Security Events
export interface SecurityEvent {
  type: string;
  risk_score: number;
  source_url?: string;
  action: string;
  timestamp: string;
}

export function getSecurityEvents(page = 1): Promise<ApiResponse<{ events: SecurityEvent[]; total: number }>> {
  return fetchJson(`/api/security/events?page=${page}`);
}

// Research API
export interface ResearchRequest {
  query: string;
  mode: 'lite' | 'medium' | 'deep';
  output_schema?: Record<string, unknown>;
}

export interface ResearchResponse {
  job_id: string;
  status: string;
  estimated_time: number;
}

export function createResearch(request: ResearchRequest): Promise<ApiResponse<ResearchResponse>> {
  return fetchJson('/api/research', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

// Health Check
export function healthCheck(): Promise<ApiResponse<{ status: string; version: string; timestamp: string }>> {
  return fetchJson('/health');
}

// API Key management
export function setApiKey(key: string): void {
  localStorage.setItem('apiKey', key);
}

export function getApiKey(): string | null {
  return localStorage.getItem('apiKey');
}

export function clearApiKey(): void {
  localStorage.removeItem('apiKey');
}
