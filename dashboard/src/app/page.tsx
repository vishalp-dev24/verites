'use client';

import { useEffect, useState } from 'react';
import PageLayout from '@/components/layout/PageLayout';
import StatCard from '@/components/dashboard/StatCard';
import RecentJobs from '@/components/dashboard/RecentJobs';
import { useQuery } from '@/lib/hooks/useQuery';
import { getDashboardStats, getJobs, healthCheck } from '@/lib/api';
import type { DashboardStats, ResearchJob, HealthStatus } from '@/types';

// Mock data for demo
const mockStats: DashboardStats = {
  total_jobs: 1247,
  jobs_today: 23,
  active_jobs: 3,
  credits_remaining: 1240,
  credits_used_this_month: 4560,
  avg_research_time: 156,
  queue_length: 2,
  cache_hit_rate: 0.32,
  active_sessions: 8,
};

const mockJobs: ResearchJob[] = [
  {
    job_id: 'res_abc123xyz789',
    session_id: 'sess_123',
    query: 'Latest AI model developments and breakthroughs in 2026',
    mode: 'medium',
    status: 'complete',
    confidence_score: 0.92,
    credits_used: 25,
    created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    completed_at: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
    sources_count: 12,
  },
  {
    job_id: 'res_def456uvw012',
    session_id: 'sess_124',
    query: 'EV market trends and projections for 2026-2028',
    mode: 'deep',
    status: 'complete',
    confidence_score: 0.88,
    credits_used: 87,
    created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    sources_count: 45,
  },
  {
    job_id: 'res_ghi789rst345',
    session_id: 'sess_125',
    query: 'Cloud computing cost optimization strategies',
    mode: 'lite',
    status: 'complete',
    confidence_score: 0.85,
    credits_used: 5,
    created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    sources_count: 4,
  },
  {
    job_id: 'res_jkl012pqr678',
    session_id: 'sess_126',
    query: 'Blockchain voting systems security analysis',
    mode: 'medium',
    status: 'failed',
    confidence_score: null,
    credits_used: 3,
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    error: 'Source validation failed',
  },
  {
    job_id: 'res_mno345stu901',
    session_id: 'sess_127',
    query: 'Quantum computing investment landscape',
    mode: 'deep',
    status: 'processing',
    confidence_score: null,
    credits_used: 12,
    created_at: new Date(Date.now() - 30 * 1000).toISOString(),
  },
];

const mockHealth: HealthStatus = {
  status: 'healthy',
  version: '1.0.0',
  timestamp: new Date().toISOString(),
  uptime: 86400 * 7,
  services: {
    database: 'connected',
    redis: 'connected',
    search: 'connected',
  },
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>(mockStats);
  const [jobs, setJobs] = useState<ResearchJob[]>(mockJobs);
  const [health, setHealth] = useState<HealthStatus>(mockHealth);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API loading
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <PageLayout
      title="Dashboard"
      description="Overview of your research activity and platform health"
      status={health.status}
    >
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Credits Remaining"
          value={stats.credits_remaining}
          subtitle={`${Math.round(stats.credits_remaining / 50)} projected days`}
          trend={{ value: 12, isPositive: true }}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          color="primary"
          loading={loading}
        />
        
        <StatCard
          title="Total Research Jobs"
          value={stats.total_jobs}
          subtitle={`${stats.jobs_today} jobs today`}
          trend={{ value: 8, isPositive: true }}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12m-3.75 0v-1.063c0-1.45.333-2.85.937-4.143M12 10.97a2.971 2.971 0 001.792-2.666 2.969 2.969 0 01-1.792-2.666 2.971 2.971 0 00-1.792 2.666 2.97 2.97 0 011.792 2.666z" />
            </svg>
          }
          color="info"
          loading={loading}
        />
        
        <StatCard
          title="Active Sessions"
          value={stats.active_sessions}
          subtitle="Memory-enabled"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
          color="success"
          loading={loading}
        />
        
        <StatCard
          title="Cache Hit Rate"
          value={`${(stats.cache_hit_rate * 100).toFixed(0)}%`}
          subtitle={`Saved ${Math.round(stats.total_jobs * stats.cache_hit_rate * 2)} credits`}
          trend={{ value: 5, isPositive: true }}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          }
          color="violet"
          loading={loading}
        />
      </div>

      {/* Recent Jobs */}
      <RecentJobs jobs={jobs} loading={loading} />
    </PageLayout>
  );
}
