'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import { ModeBadge, StatusBadge } from '@/components/ui/StatusBadge';
import { SkeletonTableRow } from '@/components/ui/Skeleton';
import type { ResearchJob } from '@/types';

interface RecentJobsProps {
  jobs: ResearchJob[];
  loading?: boolean;
}

const RecentJobs = ({ jobs, loading = false }: RecentJobsProps) => {
  if (loading) {
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[var(--foreground)]">Recent Research Jobs</h3>
        </div>
        <div className="table-container overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Query</th>
                <th>Mode</th>
                <th>Status</th>
                <th>Credits</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              <SkeletonTableRow columns={6} />
              <SkeletonTableRow columns={6} />
              <SkeletonTableRow columns={6} />
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[var(--foreground)]">Recent Research Jobs</h3>
        </div>
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--background-subtle)] flex items-center justify-center">
            <svg className="w-8 h-8 text-[var(--foreground-subtle)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className="text-[var(--foreground-muted)]">No research jobs yet</p>
          <Link href="/research" className="text-[var(--primary)] hover:underline text-sm mt-2 inline-block">
            Start your first research →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-[var(--foreground)]">Recent Research Jobs</h3>
        <Link
          href="/jobs"
          className="text-sm text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors"
        >
          View all →
        </Link>
      </div>

      <div className="table-container overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Query</th>
              <th>Mode</th>
              <th>Status</th>
              <th>Credits</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.job_id} className="group cursor-pointer">
                <td>
                  <Link
                    href={`/jobs/${job.job_id}`}
                    className="font-mono text-xs text-[var(--primary)] hover:underline"
                  >
                    {job.job_id.slice(0, 12)}...
                  </Link>
                </td>
                <td>
                  <span className="text-sm text-[var(--foreground)] max-w-xs truncate block">
                    {job.query}
                  </span>
                </td>
                <td>
                  <ModeBadge mode={job.mode} />
                </td>
                <td>
                  <StatusBadge status={job.status} />
                </td>
                <td>
                  <span className="text-sm text-[var(--foreground-muted)]">{job.credits_used}</span>
                </td>
                <td>
                  <span className="text-sm text-[var(--foreground-subtle)]">
                    {formatRelativeTime(job.created_at)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RecentJobs;
