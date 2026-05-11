'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Home,
  Search,
  History,
  Settings,
  Key,
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  Zap,
  TrendingUp,
  Clock,
  Database,
  CreditCard,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Mock data
const stats = [
  { label: 'Total Jobs', value: '1,247', change: '+12%', icon: Activity },
  { label: 'Jobs Today', value: '23', change: '+5%', icon: Clock },
  { label: 'Active Jobs', value: '3', change: '0', icon: Loader2 },
  { label: 'Credits Remaining', value: '1,240', change: '-8%', icon: CreditCard },
];

const jobs = [
  {
    id: 'res_abc123',
    query: 'Latest AI model developments and breakthroughs in 2026',
    mode: 'medium',
    status: 'complete',
    confidence: 0.92,
    credits: 25,
    time: '2 min ago',
    sources: 12,
  },
  {
    id: 'res_def456',
    query: 'EV market trends and projections for 2026-2028',
    mode: 'deep',
    status: 'complete',
    confidence: 0.88,
    credits: 87,
    time: '15 min ago',
    sources: 45,
  },
  {
    id: 'res_ghi789',
    query: 'Cloud computing cost optimization strategies',
    mode: 'lite',
    status: 'complete',
    confidence: 0.85,
    credits: 5,
    time: '1 hour ago',
    sources: 4,
  },
  {
    id: 'res_jkl012',
    query: 'Blockchain voting systems security analysis',
    mode: 'medium',
    status: 'failed',
    confidence: null,
    credits: 3,
    time: '2 hours ago',
    sources: 0,
  },
  {
    id: 'res_mno345',
    query: 'Quantum computing investment landscape',
    mode: 'deep',
    status: 'processing',
    confidence: null,
    credits: 12,
    time: '30 sec ago',
    sources: 0,
  },
];

const health = {
  status: 'healthy' as const,
  uptime: '7d 12h 34m',
  services: {
    database: 'connected' as const,
    redis: 'connected' as const,
    search: 'connected' as const,
  },
};

const navItems = [
  { label: 'Dashboard', href: '/', icon: Home },
  { label: 'Research', href: '/research', icon: Search },
  { label: 'Jobs', href: '/jobs', icon: History, badge: 3 },
  { label: 'API Keys', href: '/api-keys', icon: Key },
  { label: 'Settings', href: '/settings', icon: Settings },
];

const modeStyles = {
  lite: 'bg-[var(--mode-lite-bg)] text-[var(--mode-lite)]',
  medium: 'bg-[var(--mode-medium-bg)] text-[var(--mode-medium)]',
  deep: 'bg-[var(--mode-deep-bg)] text-[var(--mode-deep)]',
};

const statusStyles = {
  complete: { icon: CheckCircle2, className: 'text-[var(--success)]' },
  failed: { icon: XCircle, className: 'text-[var(--error)]' },
  processing: { icon: Loader2, className: 'text-[var(--info)] animate-spin' },
};

export default function DashboardPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen bg-[var(--background)]">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex-shrink-0 flex flex-col bg-[var(--background-elevated)] border-r border-[var(--border)]',
          sidebarOpen ? 'w-64' : 'w-16'
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--foreground)] flex items-center justify-center flex-shrink-0">
              <span className="text-[var(--background)] font-bold text-sm">V</span>
            </div>
            {sidebarOpen && (
              <span className="font-semibold text-[var(--foreground)]">Veritas</span>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === '/';
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'text-[var(--foreground)] bg-[var(--background-surface)]'
                    : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--background-hover)]'
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="px-2 py-0.5 text-xs bg-[var(--accent-subtle)] text-[var(--accent)] rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-4 text-[var(--foreground-tertiary)] hover:text-[var(--foreground)] border-t border-[var(--border)]"
        >
          <ChevronRight
            className={cn('w-5 h-5 transition-transform', sidebarOpen && 'rotate-180')}
          />
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-[var(--border)] bg-[var(--background)] sticky top-0 z-10">
          <div>
            <h1 className="text-base font-semibold text-[var(--foreground)]">Dashboard</h1>
            <p className="text-xs text-[var(--foreground-tertiary)]">
              Overview of your research activity
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs">
              <div
                className={cn(
                  'w-2 h-2 rounded-full',
                  health.status === 'healthy' ? 'bg-[var(--success)]' : 'bg-[var(--error)]'
                )}
              />
              <span className="text-[var(--foreground-secondary)]">
                {health.status === 'healthy' ? 'All systems operational' : 'Issues detected'}
              </span>
            </div>
            <Link
              href="/research"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--foreground)] text-[var(--background)] text-sm font-medium hover:bg-[var(--foreground-secondary)] transition-colors"
            >
              <Search className="w-4 h-4" />
              New Research
            </Link>
          </div>
        </header>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat) => {
              const Icon = stat.icon;
              const isPositive = stat.change.startsWith('+');
              return (
                <div
                  key={stat.label}
                  className="p-4 rounded-lg bg-[var(--background-elevated)] border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wider text-[var(--foreground-tertiary)]">
                      {stat.label}
                    </span>
                    <Icon className="w-4 h-4 text-[var(--foreground-tertiary)]" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-[var(--foreground)] tabular-nums">
                      {stat.value}
                    </span>
                    <span
                      className={cn(
                        'text-xs font-medium',
                        isPositive ? 'text-[var(--success)]' : 'text-[var(--error)]'
                      )}
                    >
                      {stat.change}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recent Jobs */}
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

            <div className="rounded-lg border border-[var(--border)] overflow-hidden">
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
                  {jobs.map((job) => {
                    const StatusIcon = statusStyles[job.status].icon;
                    return (
                      <tr
                        key={job.id}
                        className="border-b border-[var(--border)] hover:bg-[var(--background-hover)] transition-colors"
                      >
                        <td className="px-4 py-3 max-w-md">
                          <p className="font-medium text-[var(--foreground-primary)] truncate">
                            {job.query}
                          </p>
                          <p className="text-xs text-[var(--foreground-tertiary)]">
                            {job.id} • {job.sources} sources
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex px-2 py-1 text-xs font-medium rounded',
                              modeStyles[job.mode]
                            )}
                          >
                            {job.mode}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <StatusIcon
                              className={cn('w-4 h-4', statusStyles[job.status].className)}
                            />
                            <span className="capitalize text-[var(--foreground-secondary)]">
                              {job.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[var(--foreground-primary)]">
                            {job.credits}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-[var(--foreground-tertiary)]">
                          {job.time}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-[var(--background-elevated)] border border-[var(--border)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-[var(--accent)]" />
                </div>
                <div>
                  <p className="text-xs text-[var(--foreground-tertiary)]">Cache Hit Rate</p>
                  <p className="text-lg font-semibold text-[var(--foreground)]">32%</p>
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
                  <p className="text-lg font-semibold text-[var(--foreground)]">156s</p>
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
                  <p className="text-lg font-semibold text-[var(--foreground)]">8</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
