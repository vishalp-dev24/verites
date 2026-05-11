'use client';

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
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Sidebar />
      
      <main className="lg:ml-64">
        <Header 
          title={title} 
          description={description}
          status={status}
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
