'use client';

import { cn } from '@/lib/utils';
import Link from 'next/link';

interface HeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  status?: 'healthy' | 'degraded' | 'unhealthy';
  isMobileMenuOpen?: boolean;
  onMobileMenuClick?: () => void;
}

const Header = ({
  title,
  description,
  children,
  status = 'healthy',
  isMobileMenuOpen = false,
  onMobileMenuClick,
}: HeaderProps) => {
  const statusStyles = {
    healthy: { bg: 'bg-emerald-500', pulse: 'animate-pulse-slow', text: 'text-emerald-400' },
    degraded: { bg: 'bg-amber-500', pulse: '', text: 'text-amber-400' },
    unhealthy: { bg: 'bg-red-500', pulse: '', text: 'text-red-400' },
  };

  const statusLabels = {
    healthy: 'System Healthy',
    degraded: 'Degraded',
    unhealthy: 'System Issue',
  };

  return (
    <header className="sticky top-0 z-30 bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--border)]">
      <div className="px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          {/* Left: Title & Description */}
          <div className="flex items-center gap-4">
            {/* Mobile Menu Button */}
            <button
              type="button"
              onClick={onMobileMenuClick}
              aria-label={isMobileMenuOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={isMobileMenuOpen}
              className="lg:hidden p-2 -ml-2 text-[var(--foreground-muted)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--background-surface)]"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isMobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold text-[var(--foreground)]">{title}</h1>
                <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-[var(--background-surface)] border border-[var(--border)]">
                  <span className={cn('w-2 h-2 rounded-full', statusStyles[status].bg, statusStyles[status].pulse)} />
                  <span className={cn('text-xs font-medium', statusStyles[status].text)}>
                    {statusLabels[status]}
                  </span>
                </div>
              </div>
              {description && (
                <p className="text-sm text-[var(--foreground-muted)] mt-0.5">{description}</p>
              )}
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            {/* Notifications */}
            <button className="relative p-2 text-[var(--foreground-muted)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--background-surface)] transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[var(--primary)] rounded-full" />
            </button>

            {/* Add Credits Button */}
            <Link
              href="/settings#billing"
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)] rounded-lg transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Credits
            </Link>
          </div>
        </div>

        {children && (
          <div className="mt-4">{children}</div>
        )}
      </div>
    </header>
  );
};

export default Header;
