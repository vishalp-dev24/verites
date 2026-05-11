'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Clock,
  CreditCard,
  Database,
  Loader2,
  Search,
  TrendingUp,
  Zap,
} from 'lucide-react';
import PageLayout from '@/components/layout/PageLayout';
import Button from '@/components/ui/Button';
import { ModeBadge, StatusBadge } from '@/components/ui/StatusBadge';
import { getDashboardStats, getJobs, healthCheck } from '@/lib/api';
import { formatNumber, formatRelativeTime, truncate } from '@/lib/utils';
import type { DashboardStats, HealthStatus, ResearchJob } from '@/types';

const EMPTY_STATS: DashboardStats = {
  total_jobs: 0,
  jobs_today: 0,
  active_jobs: 0,
  credits_remaining: 0,
  credits_used_this_month: 0,
  avg_research_time: 0,
  queue_length: 0,
  cache_hit_rate: 0,
  active_sessions: 0,
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [jobs, setJobs] = useState<ResearchJob[]>([]);
  const [health, setHealth] = useState<HealthStatus['status']>('degraded');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      setLoading(true);
      const [statsResult, jobsResult, healthResult] = await Promise.all([
        getDashboardStats(),
        getJobs(1, 5),
        healthCheck(),
      ]);

      if (!active) return;

      const errors = [statsResult.error, jobsResult.error, healthResult.error].filter(Boolean);
      setError(errors.length > 0 ? errors.join(' ') : null);

      if (statsResult.data) setStats(statsResult.data);
      if (jobsResult.data) setJobs(jobsResult.data.jobs);
      if (healthResult.data) setHealth(healthResult.data.status);
      setLoading(false);
    }

    void loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  const statCards = useMemo(() => ([
    { label: 'Total Jobs', value: formatNumber(stats.total_jobs), icon: Activity },
    { label: 'Jobs Today', value: formatNumber(stats.jobs_today), icon: Clock },
    { label: 'Active Jobs', value: formatNumber(stats.active_jobs), icon: Loader2 },
    { label: 'Credits Remaining', value: formatNumber(stats.credits_remaining), icon: CreditCard },
  ]), [stats]);

  return (
    <PageLayout
      title="Dashboard"
      description="Overview of your research activity"
      status={health}
      headerActions={(
        <Button variant="primary" size="sm" href="/research">
          <Search className="w-4 h-4" />
          New Research
        </Button>
      )}
    >
      <div className="space-y-6">
        {error && (
          <div className="card border-l-4 border-l-[var(--warning)]">
            <p className="text-sm text-[var(--warning)]">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="p-4 rounded-lg bg-[var(--background-elevated)] border border-[var(--border)]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-[var(--foreground-tertiary)]">
                    {stat.label}
                  </span>
                  <Icon className="w-4 h-4 text-[var(--foreground-tertiary)]" />
                </div>
                <span className="mt-2 block text-2xl font-semibold text-[var(--foreground)] tabular-nums">
                  {loading ? '...' : stat.value}
                </span>
              </div>
            );
          })}
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">
              Recent Research Jobs
            </h2>
            <Link
              href="/jobs"
              className="text-xs text-[var(--foreground-secondary)] hover:text-[var(--foreground)]"
            >
              View all
            </Link>
          </div>

          <div className="rounded-lg border border-[var(--border)] overflow-hidden bg-[var(--background-elevated)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--background-elevated)] border-b border-[var(--border)]">
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--foreground-tertiary)]">Query</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--foreground-tertiary)]">Mode</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--foreground-tertiary)]">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[var(--foreground-tertiary)]">Credits</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-[var(--foreground-tertiary)]">Time</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr
                    key={job.job_id}
                    className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--background-hover)] transition-colors"
                  >
                    <td className="px-4 py-3 max-w-md">
                      <p className="font-medium text-[var(--foreground-primary)] truncate">
                        {truncate(job.query, 72)}
                      </p>
                      <p className="text-xs text-[var(--foreground-tertiary)]">
                        {job.job_id}
                        {job.sources_count ? ` - ${job.sources_count} sources` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <ModeBadge mode={job.mode} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[var(--foreground-primary)]">
                        {job.credits_used}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--foreground-tertiary)]">
                      {formatRelativeTime(job.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!loading && jobs.length === 0 && (
              <div className="text-center py-12">
                <p className="text-sm text-[var(--foreground-muted)]">No research jobs found.</p>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-[var(--background-elevated)] border border-[var(--border)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-[var(--accent)]" />
              </div>
              <div>
                <p className="text-xs text-[var(--foreground-tertiary)]">Cache Hit Rate</p>
                <p className="text-lg font-semibold text-[var(--foreground)]">
                  {Math.round(stats.cache_hit_rate * 100)}%
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-[var(--background-elevated)] border border-[var(--border)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--success-bg)] flex items-center justify-center">
                <Zap className="w-5 h-5 text-[var(--success)]" />
              </div>
              <div>
                <p className="text-xs text-[var(--foreground-tertiary)]">Avg Research Time</p>
                <p className="text-lg font-semibold text-[var(--foreground)]">
                  {stats.avg_research_time}s
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-[var(--background-elevated)] border border-[var(--border)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--mode-medium-bg)] flex items-center justify-center">
                <Database className="w-5 h-5 text-[var(--mode-medium)]" />
              </div>
              <div>
                <p className="text-xs text-[var(--foreground-tertiary)]">Active Sessions</p>
                <p className="text-lg font-semibold text-[var(--foreground)]">
                  {stats.active_sessions}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
