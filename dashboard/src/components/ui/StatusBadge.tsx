'use client';

import { cn } from '@/lib/utils';
import { forwardRef } from 'react';
import type { JobStatus, ResearchMode } from '@/types';

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: JobStatus;
}

interface ModeBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  mode: ResearchMode;
}

const StatusBadge = forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, className, ...props }, ref) => {
    const statusStyles: Record<JobStatus, { bg: string; text: string; dot: string }> = {
      pending: { 
        bg: 'bg-slate-500/10', 
        text: 'text-slate-400',
        dot: 'bg-slate-400'
      },
      queued: { 
        bg: 'bg-blue-500/10', 
        text: 'text-blue-400',
        dot: 'bg-blue-400'
      },
      processing: { 
        bg: 'bg-violet-500/10', 
        text: 'text-violet-400',
        dot: 'bg-violet-400'
      },
      complete: { 
        bg: 'bg-emerald-500/10', 
        text: 'text-emerald-400',
        dot: 'bg-emerald-400'
      },
      failed: { 
        bg: 'bg-red-500/10', 
        text: 'text-red-400',
        dot: 'bg-red-400'
      },
      cancelled: { 
        bg: 'bg-amber-500/10', 
        text: 'text-amber-400',
        dot: 'bg-amber-400'
      },
    };

    const style = statusStyles[status];

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border',
          style.bg,
          style.text,
          'border-current/20',
          className
        )}
        {...props}
      >
        <span className={cn('w-1.5 h-1.5 rounded-full', style.dot)} />
        <span className="capitalize">{status}</span>
      </span>
    );
  }
);

StatusBadge.displayName = 'StatusBadge';

const ModeBadge = forwardRef<HTMLSpanElement, ModeBadgeProps>(
  ({ mode, className, ...props }, ref) => {
    const modeStyles: Record<ResearchMode, { bg: string; text: string; border: string }> = {
      lite: { 
        bg: 'bg-emerald-500/10', 
        text: 'text-emerald-400',
        border: 'border-emerald-500/20'
      },
      medium: { 
        bg: 'bg-amber-500/10', 
        text: 'text-amber-400',
        border: 'border-amber-500/20'
      },
      deep: { 
        bg: 'bg-violet-500/10', 
        text: 'text-violet-400',
        border: 'border-violet-500/20'
      },
    };

    const style = modeStyles[mode];

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border capitalize',
          style.bg,
          style.text,
          style.border,
          className
        )}
        {...props}
      >
        {mode}
      </span>
    );
  }
);

ModeBadge.displayName = 'ModeBadge';

export { StatusBadge, ModeBadge };
export default StatusBadge;
