'use client';

import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; isPositive: boolean };
  icon: React.ReactNode;
  color: 'primary' | 'success' | 'warning' | 'info' | 'violet';
  loading?: boolean;
}

const StatCard = ({
  title,
  value,
  subtitle,
  trend,
  icon,
  color,
  loading = false,
}: StatCardProps) => {
  const colorStyles = {
    primary: { bg: 'bg-[var(--primary)]/10', text: 'text-[var(--primary)]', border: 'border-[var(--primary)]/20' },
    success: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
    warning: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
    info: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
    violet: { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' },
  };

  const style = colorStyles[color];

  if (loading) {
    return (
      <div className="card animate-pulse">
        <div className="flex items-start justify-between">
          <div className={cn('w-10 h-10 rounded-lg', style.bg)} />
          <div className="w-16 h-5 rounded bg-[var(--background-subtle)]" />
        </div>
        <div className="mt-4 space-y-2">
          <div className="w-20 h-8 rounded bg-[var(--background-subtle)]" />
          <div className="w-32 h-4 rounded bg-[var(--background-subtle)]" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "card group",
    )}>
      <div className="flex items-start justify-between">
        <div className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110',
          style.bg,
          style.text
        )}>
          {icon}
        </div>
        {trend && (
          <div className={cn(
            'flex items-center gap-1 text-xs font-medium',
            trend.isPositive ? 'text-emerald-400' : 'text-red-400'
          )}>
            <svg
              className={cn('w-3 h-3', !trend.isPositive && 'rotate-180')}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>

      <div className="mt-4">
        <p className="text-2xl font-semibold text-[var(--foreground)]">
          {typeof value === 'number' ? formatNumber(value) : value}
        </p>
        <p className="text-sm text-[var(--foreground-muted)] mt-1">{title}</p>
        {subtitle && (
          <p className="text-xs text-[var(--foreground-subtle)] mt-2">{subtitle}</p>
        )}
      </div>
    </div>
  );
};

export default StatCard;
