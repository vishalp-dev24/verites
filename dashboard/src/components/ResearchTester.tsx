
'use client';

import { useState } from 'react';

export default function ResearchTester() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'lite' | 'medium' | 'deep'>('medium');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setResult({
      job_id: 'res_' + Math.random().toString(36).substr(2, 9),
      confidence: 0.92,
      credits: mode === 'deep' ? 87 : mode === 'medium' ? 25 : 5,
      sources: mode === 'deep' ? 45 : mode === 'medium' ? 12 : 4,
      status: 'complete',
    });
    
    setLoading(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Test Form */}
      <div className="card">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Test Research</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Query</label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter your research question..."
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Mode</label>
            <div className="mt-1 flex space-x-4">
              {(['lite', 'medium', 'deep'] as const).map((m) => (
                <label key={m} className="inline-flex items-center">
                  <input
                    type="radio"
                    value={m}
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    className="text-blue-600"
                  />
                  <span className="ml-2 capitalize">{m}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !query}
            className="btn-primary w-full"
          >
            {loading ? 'Researching...' : 'Start Research'}
          </button>
        </form>
      </div>

      {/* Result */}
      <div>
        {result ? (
          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Result</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Job ID</span>
                <span className="text-sm font-mono">{result.job_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Confidence</span>
                <span className="text-sm">{(result.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Sources</span>
                <span className="text-sm">{result.sources}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Credits Used</span>
                <span className="text-sm">{result.credits}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Status</span>
                <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                  {result.status}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="card h-full flex items-center justify-center text-gray-500">
            Submit a query to see results
          </div>
        )}
      </div>
    </div>
  );
}
