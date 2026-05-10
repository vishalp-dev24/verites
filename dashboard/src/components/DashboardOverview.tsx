
'use client';

import { useEffect, useState } from 'react';

interface Stats {
  totalRequests: number;
  creditsRemaining: number;
  cacheHitRate: number;
  activeSessions: number;
}

const mockStats: Stats = {
  totalRequests: 1247,
  creditsRemaining: 1240,
  cacheHitRate: 0.32,
  activeSessions: 8,
};

export default function DashboardOverview() {
  const [stats] = useState<Stats>(mockStats);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Credits Card */}
      <div className="card">
        <div className="flex items-center">
          <div className="flex-shrink-0 p-3 bg-blue-100 rounded-md">
            <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500">Credits Remaining</p>
            <p className="text-2xl font-semibold text-gray-900">{stats.creditsRemaining.toLocaleString()}</p>
          </div>
        </div>
        <div className="mt-4">
          <div className="text-sm text-green-600">
            Projected to last 28 days at current usage
          </div>
        </div>
      </div>

      {/* Requests Card */}
      <div className="card">
        <div className="flex items-center">
          <div className="flex-shrink-0 p-3 bg-green-100 rounded-md">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500">Total Requests</p>
            <p className="text-2xl font-semibold text-gray-900">{stats.totalRequests.toLocaleString()}</p>
          </div>
        </div>
        <div className="mt-4">
          <div className="text-sm text-gray-500">
            This billing period
          </div>
        </div>
      </div>

      {/* Cache Card */}
      <div className="card">
        <div className="flex items-center">
          <div className="flex-shrink-0 p-3 bg-purple-100 rounded-md">
            <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500">Cache Hit Rate</p>
            <p className="text-2xl font-semibold text-gray-900">{(stats.cacheHitRate * 100).toFixed(0)}%</p>
          </div>
        </div>
        <div className="mt-4">
          <div className="text-sm text-green-600">
            Saved 380 credits
          </div>
        </div>
      </div>

      {/* Sessions Card */}
      <div className="card">
        <div className="flex items-center">
          <div className="flex-shrink-0 p-3 bg-yellow-100 rounded-md">
            <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500">Active Sessions</p>
            <p className="text-2xl font-semibold text-gray-900">{stats.activeSessions}</p>
          </div>
        </div>
        <div className="mt-4">
          <div className="text-sm text-gray-500">
            Memory enabled sessions
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card lg:col-span-4">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Research Jobs</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Job ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Query
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mode
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Credits
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {[
                { id: 'res_abc123', query: 'Latest AI developments', mode: 'medium', status: 'complete', credits: 25 },
                { id: 'res_def456', query: 'EV market trends 2026', mode: 'deep', status: 'complete', credits: 87 },
                { id: 'res_ghi789', query: 'Cloud computing insights', mode: 'lite', status: 'complete', credits: 5 },
              ].map((job) => (
                <tr key={job.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                    {job.id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 truncate max-w-xs">
                    {job.query}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      job.mode === 'deep' ? 'bg-red-100 text-red-800' :
                      job.mode === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {job.mode}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                      {job.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {job.credits}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
