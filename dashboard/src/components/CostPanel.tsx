
'use client';

import { useState } from 'react';

export default function CostPanel() {
  const [timeRange, setTimeRange] = useState('7d');

  const costData = [
    { mode: 'Lite', count: 150, credits: 750, avgPerRequest: 5 },
    { mode: 'Medium', count: 80, credits: 2400, avgPerRequest: 30 },
    { mode: 'Deep', count: 17, credits: 1440, credits: 1440, avgPerRequest: 85 },
  ];

  return (
    <div className="space-y-6">
      {/* Cost Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <p className="text-sm text-gray-500">Credits Used</p>
          <p className="text-3xl font-bold">4,590</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Credits Remaining</p>
          <p className="text-3xl font-bold">1,210</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Avg Cost/Request</p>
          <p className="text-3xl font-bold">16.5 credits</p>
        </div>
      </div>

      {/* Cost by Mode */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Cost by Mode</h3>
          <select
            className="border rounded-md px-3 py-1 text-sm"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        </div>
        <table className="min-w-full">
          <thead>
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 py-2">Mode</th>
              <th className="text-right text-xs font-medium text-gray-500 py-2">Requests</th>
              <th className="text-right text-xs font-medium text-gray-500 py-2">Credits</th>
              <th className="text-right text-xs font-medium text-gray-500 py-2">Avg/Request</th>
            </tr>
          </thead>
          <tbody>
            {costData.map((row) => (
              <tr key={row.mode} className="border-t">
                <td className="py-3 text-sm font-medium">{row.mode}</td>
                <td className="py-3 text-sm text-right">{row.count}</td>
                <td className="py-3 text-sm text-right">{row.credits.toLocaleString()}</td>
                <td className="py-3 text-sm text-right">{row.avgPerRequest}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Billing */}
      <div className="card">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Billing</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Current Plan</p>
            <p className="text-xl font-semibold">Developer</p>
            <p className="text-sm text-gray-500 mt-1">$29/month</p>
          </div>
          <div className="flex space-x-3">
            <button className="btn-secondary">Change Plan</button>
            <button className="btn-primary">Add Credits</button>
          </div>
        </div>
      </div>
    </div>
  );
}
