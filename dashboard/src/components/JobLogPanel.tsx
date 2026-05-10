
'use client';

import { useState } from 'react';

interface Job {
  id: string;
  query: string;
  mode: string;
  status: string;
  confidence: number;
  credits: number;
  time: string;
  sources: number;
}

const mockJobs: Job[] = [
  { id: 'res_abc123', query: 'Latest AI model developments', mode: 'medium', status: 'complete', confidence: 0.92, credits: 25, time: '2 min ago', sources: 12 },
  { id: 'res_def456', query: 'EV market trends 2026', mode: 'deep', status: 'complete', confidence: 0.88, credits: 87, time: '15 min ago', sources: 45 },
  { id: 'res_ghi789', query: 'Cloud computing cost optimization', mode: 'lite', status: 'complete', confidence: 0.85, credits: 5, time: '1 hour ago', sources: 4 },
  { id: 'res_jkl012', query: 'Blockchain voting systems', mode: 'medium', status: 'failed', confidence: 0, credits: 3, time: '2 hours ago', sources: 0 },
];

export default function JobLogPanel() {
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const getModeColor = (mode: string) => {
    switch (mode) {
      case 'deep': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'lite': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Job List */}
      <div className="lg:col-span-2">
        <div className="card">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Research Job Log</h3>
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Query</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Mode</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Credits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {mockJobs.map((job) => (
                <tr
                  key={job.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedJob(job)}
                >
                  <td className="px-4 py-3 text-sm text-gray-900 truncate max-w-xs">
                    {job.query}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${getModeColor(job.mode)}`}>
                      {job.mode}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      job.status === 'complete' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{job.credits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Job Detail */}
      <div className="lg:col-span-1">
        {selectedJob ? (
          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Job Details</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500">Job ID</label>
                <p className="text-sm font-mono">{selectedJob.id}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Query</label>
                <p className="text-sm">{selectedJob.query}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Mode</label>
                <p className="text-sm capitalize">{selectedJob.mode}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Confidence Score</label>
                <p className="text-sm">{(selectedJob.confidence * 100).toFixed(0)}%</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Sources</label>
                <p className="text-sm">{selectedJob.sources} sources</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Credits Used</label>
                <p className="text-sm">{selectedJob.credits}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="card h-full flex items-center justify-center text-gray-500">
            Select a job to view details
          </div>
        )}
      </div>
    </div>
  );
}
