'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
}

const navigation: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    label: 'Research',
    href: '/research',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    ),
  },
  {
    label: 'Jobs',
    href: '/jobs',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
      </svg>
    ),
    badge: 0,
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.16.956c.147.878.783 1.598 1.596 1.879l.991.326c.546.18.844.761.65 1.297l-.339.946c-.333.93-.056 1.971.691 2.588l.772.638c.445.368.517 1.04.157 1.505l-.745 1.005c-.577.78-1.6 1.08-2.496.732l-1.041-.408c-.83-.325-1.758-.24-2.5.228l-.856.54a1.96 1.96 0 01-2.055 0l-.856-.54c-.742-.468-1.67-.553-2.5-.228l-1.04.408c-.897.348-1.92.048-2.497-.732L4.017 13.37c-.36-.465-.288-1.137.157-1.505l.772-.638c.747-.617 1.024-1.659.691-2.588l-.339-.946c-.194-.536.104-1.117.65-1.297l.991-.326c.813-.281 1.449-1.001 1.596-1.879l.16-.956zM12 15a3 3 0 100-6 3 3 0 000 6z" />
      </svg>
    ),
  },
  {
    label: 'API Keys',
    href: '/api-keys',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
  },
];

const Sidebar = () => {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-[var(--background-elevated)] border-r border-[var(--border)] flex flex-col h-screen fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-[var(--border)]">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--info)] flex items-center justify-center">
            <span className="text-white font-bold text-sm">V</span>
          </div>
          <span className="font-semibold text-lg text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors">
            Veritas
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-[var(--primary-subtle)] text-[var(--primary)]'
                      : 'text-[var(--foreground-muted)] hover:bg-[var(--background-surface-hover)] hover:text-[var(--foreground)]'
                  )}
                >
                  <span className={cn(
                    'transition-colors',
                    isActive && 'text-[var(--primary)]'
                  )}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="ml-auto bg-[var(--primary)] text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Credits */}
      <div className="p-4 border-t border-[var(--border)]">
        <div className="bg-[var(--background-surface)] rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[var(--foreground-muted)]">Credits</span>
            <span className="text-sm font-semibold text-[var(--foreground)]">1,240</span>
          </div>
          <div className="w-full bg-[var(--background-subtle)] rounded-full h-1.5 mb-3">
            <div className="bg-[var(--primary)] h-1.5 rounded-full" style={{ width: '62%' }} />
          </div>
          <Link
            href="/settings#billing"
            className="w-full text-center text-xs text-[var(--foreground-subtle)] hover:text-[var(--foreground)] transition-colors"
          >
            View usage →
          </Link>
        </div>
      </div>

      {/* User */}
      <div className="p-4 border-t border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[var(--background-surface)] flex items-center justify-center border border-[var(--border)]">
            <span className="text-sm font-medium text-[var(--foreground)]">U</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--foreground)] truncate">User</p>
            <p className="text-xs text-[var(--foreground-subtle)] truncate">Developer Plan</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
