'use client';

import { useState } from 'react';
import PageLayout from '@/components/layout/PageLayout';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { ApiKey } from '@/types';

// Mock data
const mockApiKeys: ApiKey[] = [
  {
    id: 'key_123',
    name: 'Production',
    key_preview: 'sk_veritas_...xyz789',
    created_at: '2024-05-01T10:00:00Z',
    last_used_at: '2024-05-11T05:30:00Z',
    usage_count: 1247,
    status: 'active',
    permissions: ['read', 'write'],
  },
  {
    id: 'key_456',
    name: 'Development',
    key_preview: 'sk_veritas_...abc123',
    created_at: '2024-05-05T14:20:00Z',
    last_used_at: '2024-05-10T18:45:00Z',
    usage_count: 342,
    status: 'active',
    permissions: ['read', 'write'],
  },
  {
    id: 'key_789',
    name: 'Testing',
    key_preview: 'sk_veritas_...def456',
    created_at: '2024-04-20T09:15:00Z',
    last_used_at: '2024-04-25T12:00:00Z',
    usage_count: 56,
    status: 'revoked',
    permissions: ['read'],
  },
];

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>(mockApiKeys);
  const [isCreating, setIsCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [showNewKey, setShowNewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const { success, error, ToastContainer } = useToast();

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    
    setIsCreating(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const fullKey = `sk_veritas_${Math.random().toString(36).substr(2, 24)}`;
    const keyId = `key_${Math.random().toString(36).substr(2, 9)}`;
    
    const newKey: ApiKey = {
      id: keyId,
      name: newKeyName,
      key_preview: `${fullKey.slice(0, 12)}...${fullKey.slice(-6)}`,
      created_at: new Date().toISOString(),
      usage_count: 0,
      status: 'active',
      permissions: ['read', 'write'],
    };
    
    setApiKeys([newKey, ...apiKeys]);
    setShowNewKey(fullKey);
    setNewKeyName('');
    setIsCreating(false);
    success('API key created successfully');
  };

  const handleRevoke = async (keyId: string) => {
    setLoading(keyId);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 600));
    
    setApiKeys(apiKeys.map(k => 
      k.id === keyId ? { ...k, status: 'revoked' as const } : k
    ));
    setLoading(null);
    success('API key revoked');
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    success('Copied to clipboard');
  };

  return (
    <PageLayout
      title="API Keys"
      description="Manage your API keys for accessing the Veritas platform"
    >
      <ToastContainer />

      <div className="max-w-4xl space-y-6">
        {/* Info Card */}
        <div className="card border-l-4 border-l-[var(--info)]">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-[var(--info-subtle)] flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[var(--info)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1">
                Keep your API keys secure
              </h3>
              <p className="text-sm text-[var(--foreground-muted)]">
                API keys provide full access to your account. Never share them in client-side code 
                or public repositories. Use environment variables to store keys securely.
              </p>
            </div>
          </div>
        </div>

        {/* Create New Key */}
        <div className="card">
          <h3 className="text-lg font-semibold text-[var(--foreground)] mb-1">
            Create New API Key
          </h3>
          <p className="text-sm text-[var(--foreground-muted)] mb-6">
            Generate a new API key for your applications
          </p>

          <div className="flex gap-3">
            <Input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g., Production Server"
              className="flex-1"
            />
            <Button
              variant="primary"
              onClick={handleCreate}
              loading={isCreating}
              disabled={!newKeyName.trim()}
            >
              Create Key
            </Button>
          </div>
        </div>

        {/* New Key Alert */}
        {showNewKey && (
          <div className="card bg-[var(--success-subtle)] border-[var(--success)]/30 animate-fade-in">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-[var(--success)] mb-2">
                  API Key Created
                </h4>
                <p className="text-sm text-[var(--foreground-muted)] mb-4">
                  Copy this key now. You won&apos;t be able to see it again!
                </p>
                <div className="flex items-center gap-3 p-3 bg-[var(--background-surface)] rounded-lg border border-[var(--border)]">
                  <code className="text-sm font-mono text-[var(--foreground)] flex-1 truncate">
                    {showNewKey}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(showNewKey)}
                  >
                    Copy
                  </Button>
                </div>
              </div>
              <button
                onClick={() => setShowNewKey(null)}
                className="text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* API Keys List */}
        <div className="card">
          <h3 className="text-lg font-semibold text-[var(--foreground)] mb-6">
            Your API Keys
          </h3>

          <div className="space-y-4">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className={cn(
                  'p-4 rounded-lg border transition-colors',
                  key.status === 'active'
                    ? 'border-[var(--border)] bg-[var(--background-elevated)]'
                    : 'border-[var(--border-subtle)] bg-[var(--background-subtle)] opacity-60'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className="text-sm font-semibold text-[var(--foreground)]">
                        {key.name}
                      </h4>
                      <span className={cn(
                        'badge',
                        key.status === 'active' ? 'badge-success' : 'badge-default'
                      )}>
                        {key.status}
                      </span>
                    </div>
                    
                    <code className="text-xs font-mono text-[var(--foreground-subtle)]">
                      {key.key_preview}
                    </code>
                    
                    <div className="flex items-center gap-4 mt-3 text-xs text-[var(--foreground-muted)]">
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Created {formatRelativeTime(key.created_at)}
                      </span>
                      {key.last_used_at && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                          </svg>
                          Last used {formatRelativeTime(key.last_used_at)}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.5-1.5H6" />
                        </svg>
                        {key.usage_count.toLocaleString()} uses
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {key.status === 'active' ? (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleRevoke(key.id)}
                        loading={loading === key.id}
                      >
                        Revoke
                      </Button>
                    ) : (
                      <span className="text-xs text-[var(--foreground-subtle)]">
                        Revoked
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {apiKeys.length === 0 && (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-full bg-[var(--background-elevated)] flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-[var(--foreground-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
              </div>
              <p className="text-sm text-[var(--foreground-muted)]">
                No API keys yet. Create your first key above.
              </p>
            </div>
          )}
        </div>

        {/* Documentation Link */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1">
                API Documentation
              </h3>
              <p className="text-sm text-[var(--foreground-muted)]">
                Learn how to integrate with the Veritas API
              </p>
            </div>
            <Button variant="secondary" href="/docs">
              View Docs
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </Button>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
