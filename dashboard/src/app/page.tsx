
'use client';

import { useState, useEffect } from 'react';
import DashboardOverview from '../components/DashboardOverview';
import JobLogPanel from '../components/JobLogPanel';
import SecurityPanel from '../components/SecurityPanel';
import CostPanel from '../components/CostPanel';
import ResearchTester from '../components/ResearchTester';

type Tab = 'overview' | 'jobs' | 'security' | 'cost' | 'test';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate loading
    setTimeout(() => setIsLoading(false), 500);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">
                Research Platform
              </h1>
              <span className="ml-3 px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                System Healthy
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">Credits: 1,240</span>
              <button className="btn-primary">Add Credits</button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'jobs', label: 'Research Jobs' },
              { id: 'cost', label: 'Cost & Usage' },
              { id: 'security', label: 'Security' },
              { id: 'test', label: 'Test API' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && <DashboardOverview />}
        {activeTab === 'jobs' && <JobLogPanel />}
        {activeTab === 'cost' && <CostPanel />}
        {activeTab === 'security' && <SecurityPanel />}
        {activeTab === 'test' && <ResearchTester />}
      </main>
    </div>
  );
}
