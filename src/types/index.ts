/**
 * Core types for Research Platform
 * Defines all request/response schemas and internal types
 */

export type ResearchMode = 'lite' | 'medium' | 'deep';

export type ResearchStatus =
  | 'planning'
  | 'dispatching'
  | 'researching'
  | 'verifying'
  | 'synthesizing'
  | 'complete'
  | 'failed'
  | 'cancelled';

export type WorkerStatus =
  | 'idle'
  | 'planning'
  | 'active'
  | 'complete'
  | 'failed'
  | 'checkpointed';

export interface ResearchRequest {
  query: string;
  mode: ResearchMode;
  session_id: string;
  output_schema: Record<string, unknown>;
  cost_controls?: CostControls;
  language?: string;
  date_range_days?: number;
  domain_whitelist?: string[];
  domain_blacklist?: string[];
  cache?: boolean;
  batch?: string[];
  batch_delivery?: 'wait_for_all' | 'streaming';
}

export interface CostControls {
  max_budget_paise: number;
  fallback_mode: ResearchMode;
  on_budget_hit: 'return_best_available' | 'fail_clean' | 'notify_and_pause';
  quality_threshold: number;
  max_iterations: number;
}

export interface ResearchResponse {
  job_id: string;
  session_id: string;
  mode: ResearchMode;
  status: ResearchStatus;
  confidence_score: number;
  quality_achieved: boolean;
  budget_reached: boolean;
  data: unknown;
  sources: Source[];
  contradictions: Contradiction[];
  follow_up_queries: string[];
  knowledge_gaps: string[];
  worker_failures: WorkerFailure[];
  trace: ResearchTrace;
  security_events: SecurityEvent[];
  processing_time_ms: number;
  credits_used: number;
  cache_hit: boolean;
}

export interface Source {
  url: string;
  title: string;
  trust_score: number;
  type: 'primary' | 'secondary';
  publish_date: string;
  content_excerpt: string;
}

export interface Contradiction {
  claim_a: string;
  claim_b: string;
  source_a: string;
  source_b: string;
  severity: 'low' | 'medium' | 'high';
}

export interface WorkerFailure {
  task_id: string;
  type: string;
  reason: string;
  impact: 'minor' | 'major' | 'critical';
  action_taken: string;
}

export interface ResearchTrace {
  plan: TaskManifest;
  worker_outcomes: WorkerOutcome[];
  orchestrator_doubts: Doubt[];
  iterations: number;
  termination_reason: string;
}

export interface TaskManifest {
  job_id: string;
  query: string;
  mode: ResearchMode;
  tasks: Task[];
  estimated_cost: CostEstimate;
  session_context?: {
    topics_researched: string[];
    follow_up_queries: string[];
  };
  fingerprint?: string;
  created_at: string;
  locked: boolean;
}

export interface Task {
  task_id: string;
  topic?: string;
  covers?: string;
  must_not_overlap_with?: string[];
  title?: string;
  query?: string;
  mode: string;
  source_config?: {
    max_sources: number;
    target_sources: number;
    date_range_days?: number;
  };
  coverage?: {
    must_cover: string[];
    must_not_overlap: string[];
  };
  estimated_cost?: {
    min_paise: number;
    max_paise: number;
  };
  status: WorkerStatus;
  created_at?: string;
  updated_at?: string;
  started_at?: string;
  completed_at?: string;
  result?: unknown;
  artifact_id?: string;
  checkpoint?: Checkpoint;
}

export interface CostEstimate {
  min_paise: number;
  max_paise: number;
  confidence: number;
  breakdown: {
    worker_count: number;
    estimated_sources: number;
    estimated_iterations: number;
  };
}

export interface Checkpoint {
  last_source_index: number;
  sources_fetched: string[];
  compressed_summary: string;
  artifact_id: string;
}

export interface WorkerOutcome {
  task_id: string;
  sources_count: number;
  summary: string;
  artifact_id: string;
  completed_at: string;
}

export interface Doubt {
  finding: string;
  reason: string;
  re_dispatched_task_id: string;
  resolved: boolean;
}

export interface SecurityEvent {
  type: 'injection_attempt' | 'blocked_domain' | 'suspicious_content';
  risk_score: number;
  source_url?: string;
  action: string;
  timestamp: string;
}

export interface BlackboardEntry {
  job_id: string;
  task_id: string;
  verified_facts: Fact[];
  contradictions: Contradiction[];
  domain_access_log: DomainAccess[];
  worker_status: Record<string, WorkerStatus>;
  updated_at: string;
}

export interface Fact {
  claim: string;
  confidence: number;
  sources: string[];
  verified: boolean;
}

export interface DomainAccess {
  domain: string;
  last_access: string;
  worker_count: number;
}

export interface Artifact {
  artifact_id: string;
  job_id: string;
  task_id: string;
  content: string;
  sources: Source[];
  raw_html: string;
  extracted_at: string;
}

export interface SessionMemory {
  session_id: string;
  topics_researched: string[];
  key_conclusions: string[];
  follow_up_queries: string[];
  timestamp: string;
  ttl: number;
}

export interface TrustScoreInput {
  domain: string;
  content_freshness_days: number;
  source_type: 'primary' | 'secondary';
  citation_depth: number;
  cross_source_consistency: number;
}

export interface TrustScoreOutput {
  score: number;
  factors: {
    domain_authority: number;
    freshness: number;
    source_type_weight: number;
    citation_quality: number;
    consistency: number;
  };
}

export interface TaskResult {
  task_id: string;
  status: 'completed' | 'failed';
  summary: string;
  sources: Source[];
  processedUrls: string[];
  artifacts: { raw: string; summary: string };
  metadata: {
    duration_ms: number;
    sources_count: number;
    queries_made: number;
    tokens_used: number;
  };
}
