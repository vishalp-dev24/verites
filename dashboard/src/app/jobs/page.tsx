'use client';

import { useState } from 'react';
import PageLayout from '@/components/layout/PageLayout';
import { ModeBadge, StatusBadge } from '@/components/ui/StatusBadge';
import Button from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { formatRelativeTime, truncate, cn } from '@/lib/utils';
import type { ResearchJob, JobStatus, ResearchMode } from '@/types';

// Mock data
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
  {
    job_id: 'res_pqr678vwx234',
    session_id: 'sess_128',
    query: 'SaaS pricing models for enterprise software',
    mode: 'lite',
    status: 'queued',
    confidence_score: null,
    credits_used: 0,
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    job_id: 'res_stu901yza567',
    session_id: 'sess_129',
    query: 'Cybersecurity trends for financial services',
    mode: 'deep',
    status: 'cancelled',
    confidence_score: null,
    credits_used: 0,
    created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
];

const statusFilters: { value: string; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'queued', label: 'Queued' },
  { value: 'processing', label: 'Processing' },
  { value: 'complete', label: 'Complete' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const modeFilters: { value: string; label: string }[] = [
  { value: 'all', label: 'All Modes' },
  { value: 'lite', label: 'Lite' },
  { value: 'medium', label: 'Medium' },
  { value: 'deep', label: 'Deep' },
];

export default function JobsPage() {
  const [jobs] = useState<ResearchJob[]>(mockJobs);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [modeFilter, setModeFilter] = useState<string>('all');
  const [selectedJob, setSelectedJob] = useState<ResearchJob | null>(null);

  const filteredJobs = jobs.filter(job => {
    const statusMatch = statusFilter === 'all' || job.status === statusFilter;
    const modeMatch = modeFilter === 'all' || job.mode === modeFilter;
    return statusMatch && modeMatch;
  });

  return (
    <PageLayout
      title="Research Jobs"
      description="View and manage your research jobs"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Filters */}
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

          {/* Stats */}
          <div className="card">
            <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4">Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--foreground-muted)]">Total</span>
                <span className="font-medium">{jobs.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--foreground-muted)]">Complete</span>
                <span className="font-medium text-emerald-400">
                  {jobs.filter(j => j.status === 'complete').length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--foreground-muted)]">Processing</span>
                <span className="font-medium text-violet-400">
                  {jobs.filter(j => ['processing', 'queued', 'pending'].includes(j.status)).length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--foreground-muted)]">Failed</span>
                <span className="font-medium text-red-400">
                  {jobs.filter(j => j.status === 'failed').length}
                </span>
              </div>
              <div className="pt-3 border-t border-[var(--border)]">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--foreground-muted)]">Total Credits</span>
                  <span className="font-medium">
                    {jobs.reduce((sum, j) => sum + j.credits_used, 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Job List */}
        <div className="lg:col-span-2">
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--background-elevated)]">
                    <th className="text-left text-xs font-medium text-[var(--foreground-muted)] px-4 py-3">
                      Query
                    </th>
                    <th className="text-left text-xs font-medium text-[var(--foreground-muted)] px-4 py-3">
                      Mode
                    </th>
                    <th className="text-left text-xs font-medium text-[var(--foreground-muted)] px-4 py-3">
                      Status
                    </th>
                    <th className="text-right text-xs font-medium text-[var(--foreground-muted)] px-4 py-3">
                      Credits
                    </th>
                    <th className="text-right text-xs font-medium text-[var(--foreground-muted)] px-4 py-3">
                      Time
                    </th>
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
                        <span className="text-sm text-[var(--foreground)] max-w-[200px] truncate block">
                          {truncate(job.query, 40)}
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

            {filteredJobs.length === 0 && (
              <div className="text-center py-12">
                <p className="text-[var(--foreground-muted)]">No jobs match your filters</p>
              </div>
            )}
          </div>

          {/* Job Detail Panel */}
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
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-[var(--foreground-subtle)]">Query</label>
                  <p className="text-sm text-[var(--foreground)] mt-1">{selectedJob.query}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-[var(--foreground-subtle)]">Mode</label>
                    <p className="text-sm text-[var(--foreground)] mt-1 capitalize">
                      {selectedJob.mode}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--foreground-subtle)]">Status</label>
                    <p className="text-sm mt-1">
                      <StatusBadge status={selectedJob.status} />
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--foreground-subtle)]">Credits Used</label>
                    <p className="text-sm text-[var(--foreground)] mt-1">{selectedJob.credits_used}</p>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--foreground-subtle)])">Confidence</label>
                    <p className="text-sm text-[var(--foreground)] mt-1">
                      {selectedJob.confidence_score
                        ? `${(selectedJob.confidence_score * 100).toFixed(0)}%`
                        : '—'}
                    </p>
                  </div>
                </div>

                {selectedJob.error && (
                  <div className="p-3 bg-[var(--error-subtle)] rounded-lg border border-[var(--error)]/20">
                    <p className="text-sm text-[var(--error)]">{selectedJob.error}</p>
                  </div>
                )}

                <div className="pt-4 border-t border-[var(--border)] flex gap-3">
                  {selectedJob.status === 'processing' && (
                    <Button variant="secondary" size="sm">
                      Cancel Job
                    </Button>
                  )}
                  {selectedJob.status === 'complete' && (
                    <Button variant="primary" size="sm">
                      View Results
                    </Button>
                  )}
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
