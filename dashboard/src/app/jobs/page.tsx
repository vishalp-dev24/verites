'use client';

import { useEffect, useMemo, useState } from 'react';
import PageLayout from '@/components/layout/PageLayout';
import { ModeBadge, StatusBadge } from '@/components/ui/StatusBadge';
import Button from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { getJobs } from '@/lib/api';
import { formatRelativeTime, truncate, cn } from '@/lib/utils';
import type { ResearchJob } from '@/types';

const statusFilters = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'queued', label: 'Queued' },
  { value: 'processing', label: 'Processing' },
  { value: 'complete', label: 'Complete' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const modeFilters = [
  { value: 'all', label: 'All Modes' },
  { value: 'lite', label: 'Lite' },
  { value: 'medium', label: 'Medium' },
  { value: 'deep', label: 'Deep' },
];

export default function JobsPage() {
  const [jobs, setJobs] = useState<ResearchJob[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');
  const [selectedJob, setSelectedJob] = useState<ResearchJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadJobs() {
      setLoading(true);
      const result = await getJobs(1, 100, statusFilter);
      if (!active) return;

      if (result.error) {
        setError(result.error);
        setJobs([]);
      } else {
        setError(null);
        setJobs(result.data?.jobs || []);
      }

      setLoading(false);
    }

    void loadJobs();

    return () => {
      active = false;
    };
  }, [statusFilter]);

  const filteredJobs = useMemo(() => (
    modeFilter === 'all' ? jobs : jobs.filter((job) => job.mode === modeFilter)
  ), [jobs, modeFilter]);

  const activeCount = jobs.filter((job) => ['pending', 'queued', 'processing'].includes(job.status)).length;

  return (
    <PageLayout
      title="Research Jobs"
      description="View tenant-scoped research jobs"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="card">
            <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4">Filters</h3>
            <div className="space-y-4">
              <Select
                label="Status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={statusFilters}
              />
              <Select
                label="Mode"
                value={modeFilter}
                onChange={(e) => setModeFilter(e.target.value)}
                options={modeFilters}
              />
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4">Summary</h3>
            <div className="space-y-3">
              <SummaryRow label="Total" value={jobs.length} />
              <SummaryRow label="Complete" value={jobs.filter((job) => job.status === 'complete').length} tone="success" />
              <SummaryRow label="Active" value={activeCount} tone="info" />
              <SummaryRow label="Failed" value={jobs.filter((job) => job.status === 'failed').length} tone="error" />
              <div className="pt-3 border-t border-[var(--border)]">
                <SummaryRow
                  label="Total Credits"
                  value={jobs.reduce((sum, job) => sum + job.credits_used, 0).toLocaleString()}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {error && (
            <div className="card border-l-4 border-l-[var(--warning)] mb-4">
              <p className="text-sm text-[var(--warning)]">{error}</p>
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--background-elevated)]">
                    <th className="text-left text-xs font-medium text-[var(--foreground-muted)] px-4 py-3">Query</th>
                    <th className="text-left text-xs font-medium text-[var(--foreground-muted)] px-4 py-3">Mode</th>
                    <th className="text-left text-xs font-medium text-[var(--foreground-muted)] px-4 py-3">Status</th>
                    <th className="text-right text-xs font-medium text-[var(--foreground-muted)] px-4 py-3">Credits</th>
                    <th className="text-right text-xs font-medium text-[var(--foreground-muted)] px-4 py-3">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {filteredJobs.map((job) => (
                    <tr
                      key={job.job_id}
                      onClick={() => setSelectedJob(job)}
                      className={cn(
                        'cursor-pointer transition-colors',
                        selectedJob?.job_id === job.job_id
                          ? 'bg-[var(--primary-subtle)]'
                          : 'hover:bg-[var(--background-surface-hover)]'
                      )}
                    >
                      <td className="px-4 py-3">
                        <span className="text-sm text-[var(--foreground)] max-w-[260px] truncate block">
                          {truncate(job.query, 56)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ModeBadge mode={job.mode} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-[var(--foreground-muted)]">
                          {job.credits_used}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-[var(--foreground-subtle)]">
                          {formatRelativeTime(job.created_at)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!loading && filteredJobs.length === 0 && (
              <div className="text-center py-12">
                <p className="text-[var(--foreground-muted)]">No jobs match your filters.</p>
              </div>
            )}
          </div>

          {selectedJob && (
            <div className="card mt-4 animate-fade-in">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--foreground)]">
                    Job Details
                  </h3>
                  <code className="text-xs font-mono text-[var(--foreground-subtle)]">
                    {selectedJob.job_id}
                  </code>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedJob(null)}
                >
                  Close
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-[var(--foreground-subtle)]">Query</label>
                  <p className="text-sm text-[var(--foreground)] mt-1">{selectedJob.query}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Detail label="Mode" value={selectedJob.mode} />
                  <div>
                    <label className="text-xs text-[var(--foreground-subtle)]">Status</label>
                    <p className="text-sm mt-1">
                      <StatusBadge status={selectedJob.status} />
                    </p>
                  </div>
                  <Detail label="Credits Used" value={selectedJob.credits_used} />
                  <Detail
                    label="Confidence"
                    value={selectedJob.confidence_score
                      ? `${(selectedJob.confidence_score * 100).toFixed(0)}%`
                      : '-'}
                  />
                </div>

                {selectedJob.error && (
                  <div className="p-3 bg-[var(--error-subtle)] rounded-lg border border-[var(--error)]/20">
                    <p className="text-sm text-[var(--error)]">{selectedJob.error}</p>
                  </div>
                )}

                <div className="pt-4 border-t border-[var(--border)] flex gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(selectedJob.job_id)}
                  >
                    Copy ID
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: 'success' | 'info' | 'error';
}) {
  const color = {
    success: 'text-emerald-400',
    info: 'text-violet-400',
    error: 'text-red-400',
  }[tone || 'success'];

  return (
    <div className="flex justify-between text-sm">
      <span className="text-[var(--foreground-muted)]">{label}</span>
      <span className={cn('font-medium', tone && color)}>{value}</span>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <label className="text-xs text-[var(--foreground-subtle)]">{label}</label>
      <p className="text-sm text-[var(--foreground)] mt-1 capitalize">{value}</p>
    </div>
  );
}
