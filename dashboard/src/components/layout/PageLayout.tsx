'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

interface PageLayoutProps {
  children: React.ReactNode;
  title: string;
  description?: string;
  status?: 'healthy' | 'degraded' | 'unhealthy';
  headerActions?: React.ReactNode;
}

const PageLayout = ({
  children,
  title,
  description,
  status,
  headerActions,
}: PageLayoutProps) => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Sidebar
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />

      {mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-[35] bg-[var(--background-overlay)] lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <main className="lg:ml-64">
        <Header
          title={title}
          description={description}
          status={status}
          isMobileMenuOpen={mobileSidebarOpen}
          onMobileMenuClick={() => setMobileSidebarOpen((isOpen) => !isOpen)}
        >
          {headerActions}
        </Header>

        <div className="px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </div>
      </main>
    </div>
  );
};

export default PageLayout;
