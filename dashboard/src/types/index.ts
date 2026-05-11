/**
 * Veritas Dashboard Types
 * Core type definitions for the research platform
 */

// API Response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

// Dashboard Stats
export interface DashboardStats {
  total_jobs: number;
  jobs_today: number;
  active_jobs: number;
  credits_remaining: number;
  credits_used_this_month: number;
  avg_research_time: number;
  queue_length: number;
  cache_hit_rate: number;
  active_sessions: number;
}

// Research Job
export type JobStatus = 'pending' | 'queued' | 'processing' | 'complete' | 'failed' | 'cancelled';
export type ResearchMode = 'lite' | 'medium' | 'deep';

export interface ResearchJob {
  job_id: string;
  session_id: string;
  query: string;
  mode: ResearchMode;
  status: JobStatus;
  confidence_score: number | null;
  credits_used: number;
  created_at: string;
  completed_at?: string;
  started_at?: string;
  error?: string;
  sources_count?: number;
  estimated_time?: number;
  result?: ResearchResult;
}

interface ResearchResult {
  summary: string;
  sources: Source[];
  citations: Citation[];
}

interface Source {
  url: string;
  title: string;
  domain: string;
  confidence: number;
  accessed_at: string;
}

interface Citation {
  text: string;
  source_index: number;
}

// Credits
export interface CreditInfo {
  balance: number;
  used_this_month: number;
  tier: string;
  tier_name: string;
}

export interface UsageBreakdown {
  mode: ResearchMode;
  requests: number;
  credits_used: number;
  avg_credits_per_request: number;
}

// Security Events
export interface SecurityEvent {
  id: string;
  type: string;
  risk_score: number;
  source_url?: string;
  action: 'blocked' | 'quarantined' | 'allowed' | 'flagged';
  timestamp: string;
  details?: Record<string, unknown>;
}

// API Keys
export interface ApiKey {
  id: string;
  name: string;
  key_preview: string;
  created_at: string;
  last_used_at?: string;
  usage_count: number;
  status: 'active' | 'revoked' | 'expired';
  permissions: string[];
}

// User Settings
export interface UserSettings {
  default_mode: ResearchMode;
  notify_on_completion: boolean;
  email_notifications: boolean;
  webhook_url?: string;
  custom_instructions?: string;
  theme: 'dark' | 'light' | 'system';
}

// Research Request
export interface ResearchRequest {
  query: string;
  mode: ResearchMode;
  output_schema?: OutputSchema;
  session_id?: string;
  custom_instructions?: string;
}

export interface OutputSchema {
  sections?: string[];
  format?: 'markdown' | 'json' | 'structured';
  max_length?: number;
  include_sources?: boolean;
}

// Research Response
export interface ResearchResponse {
  job_id: string;
  status: JobStatus;
  estimated_time: number;
  position_in_queue?: number;
}

// Health Check
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: string;
  uptime: number;
  services: {
    database: 'connected' | 'disconnected';
    redis: 'connected' | 'disconnected';
    search: 'connected' | 'disconnected';
  };
}

// Navigation
export interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
  active?: boolean;
}

// Component Props
export interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
}

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md';
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}
