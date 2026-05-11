'use client';

import { useState } from 'react';
import PageLayout from '@/components/layout/PageLayout';
import Button from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { ModeBadge } from '@/components/ui/StatusBadge';
import { getModeDescription, getEstimatedTime, cn } from '@/lib/utils';
import type { ResearchMode } from '@/types';

interface ResearchModeCard {
  mode: ResearchMode;
  title: string;
  description: string;
  credits: number;
  time: string;
}

const researchModes: ResearchModeCard[] = [
  {
    mode: 'lite',
    title: 'Lite',
    description: 'Quick overview with key insights. Best for rapid fact-checking and summaries.',
    credits: 5,
    time: '30 sec',
  },
  {
    mode: 'medium',
    title: 'Medium',
    description: 'Balanced depth with quality sources. Ideal for most research needs.',
    credits: 25,
    time: '2-3 min',
  },
  {
    mode: 'deep',
    title: 'Deep',
    description: 'Comprehensive analysis with extensive sources. For critical decisions.',
    credits: 87,
    time: '5-8 min',
  },
];

export default function ResearchPage() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<ResearchMode>('medium');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ jobId: string; estimatedTime: number } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSubmitting(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setResult({
      jobId: `res_${Math.random().toString(36).substr(2, 9)}`,
      estimatedTime: mode === 'deep' ? 480 : mode === 'medium' ? 180 : 30,
    });
    
    setIsSubmitting(false);
  };

  return (
    <PageLayout
      title="New Research"
      description="Start a new research query with your desired depth level"
    >
      <div className="max-w-4xl mx-auto">
        {/* Research Form */}
        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Query Input */}
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-[var(--foreground)]">
                Research Query
              </label>
              <Textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter your research question or topic..."
                rows={4}
                className="text-base"
              />
              <p className="text-xs text-[var(--foreground-subtle)]">
                Be specific for better results. Include context, timeframes, and key aspects.
              </p>
            </div>

            {/* Mode Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-[var(--foreground)]">
                Research Depth
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {researchModes.map((m) => (
                  <button
                    key={m.mode}
                    type="button"
                    onClick={() => setMode(m.mode)}
                    className={cn(
                      'relative p-5 rounded-xl border-2 text-left transition-all duration-200',
                      mode === m.mode
                        ? 'border-[var(--primary)] bg-[var(--primary-subtle)]'
                        : 'border-[var(--border)] bg-[var(--background-elevated)] hover:border-[var(--border-hover)]'
                    )}
                  >
                    {/* Selected indicator */}
                    {mode === m.mode && (
                      <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[var(--primary)] flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                    
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <ModeBadge mode={m.mode} />
                      </div>
                      
                      <p className={cn(
                        'text-sm font-medium',
                        mode === m.mode ? 'text-[var(--foreground)]' : 'text-[var(--foreground-muted)]'
                      )}>
                        {m.description}
                      </p>
                      
                      <div className="flex items-center gap-4 pt-2 text-xs text-[var(--foreground-subtle)]">
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {m.time}
                        </span>
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {m.credits} credits
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Submit */}
            <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
              <div className="text-sm text-[var(--foreground-muted)]">
                <span className="text-[var(--foreground)] font-medium">
                  {researchModes.find(m => m.mode === mode)?.credits} credits
                </span>{' '}
                will be deducted
              </div>
              <Button 
                type="submit" 
                variant="primary" 
                size="lg"
                loading={isSubmitting}
                disabled={!query.trim() || isSubmitting}
              >
                {isSubmitting ? 'Starting Research...' : 'Start Research'}
              </Button>
            </div>
          </form>
        </div>

        {/* Result */}
        {result && (
          <div className="mt-6 card p-6 animate-fade-in">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-[var(--success-subtle)] flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[var(--foreground)]">Research Started</h3>
                <p className="text-sm text-[var(--foreground-muted)] mt-1">
                  Your research is now being processed. Estimated completion time: {getEstimatedTime(mode)}.
                </p>
                <div className="mt-4 p-3 bg-[var(--background-elevated)] rounded-lg border border-[var(--border)]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--foreground-muted)]">Job ID</span>
                    <code className="text-xs font-mono text-[var(--primary)]">{result.jobId}</code>
                  </div>
                </div>
                <div className="mt-4 flex gap-3">
                  <Button variant="secondary" href="/jobs">
                    View Jobs
                  </Button>
                  <Button variant="ghost" onClick={() => { setResult(null); setQuery(''); }}>
                    Start New Research
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
