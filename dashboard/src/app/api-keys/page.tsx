'use client';

import { useEffect, useState } from 'react';
import PageLayout from '@/components/layout/PageLayout';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { createApiKey, getApiKeys, revokeApiKey } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import type { ApiKey } from '@/types';

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadKeys() {
    setLoading(true);
    const result = await getApiKeys();
    setError(result.error || null);
    if (result.data) setKeys(result.data);
    setLoading(false);
  }

  useEffect(() => {
    void loadKeys();
  }, []);

  async function handleCreate() {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setSaving(true);
    setError(null);
    const result = await createApiKey(trimmedName);
    setSaving(false);

    if (result.error || !result.data) {
      setError(result.error || 'API key creation failed');
      return;
    }

    setNewKey(result.data.full_key);
    setName('');
    await loadKeys();
  }

  async function handleRevoke(keyId: string) {
    setError(null);
    const result = await revokeApiKey(keyId);
    if (result.error) {
      setError(result.error);
      return;
    }

    await loadKeys();
  }

  return (
    <PageLayout
      title="API Keys"
      description="Create and revoke tenant-scoped API credentials"
    >
      <div className="max-w-4xl space-y-6">
        {error && (
          <div className="card border-l-4 border-l-[var(--error)]">
            <p className="text-sm text-[var(--error)]">{error}</p>
          </div>
        )}

        {newKey && (
          <div className="card border-l-4 border-l-[var(--warning)]">
            <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">
              Copy this key now
            </h3>
            <p className="text-sm text-[var(--foreground-muted)] mb-4">
              The full API key is shown once and is not stored by the dashboard.
            </p>
            <code className="block p-3 rounded-md bg-[var(--background-elevated)] text-sm text-[var(--foreground)] break-all">
              {newKey}
            </code>
          </div>
        )}

        <div className="card">
          <h3 className="text-lg font-semibold text-[var(--foreground)] mb-1">
            Create API Key
          </h3>
          <p className="text-sm text-[var(--foreground-muted)] mb-6">
            New keys are hashed by the backend. The browser receives the raw key only in this response.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Production ingestion key"
              className="flex-1"
            />
            <Button
              variant="primary"
              onClick={handleCreate}
              disabled={!name.trim() || saving}
            >
              {saving ? 'Creating...' : 'Create Key'}
            </Button>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-[var(--foreground)] mb-6">
            Existing API Keys
          </h3>

          {loading ? (
            <p className="text-sm text-[var(--foreground-muted)]">Loading API keys...</p>
          ) : keys.length > 0 ? (
            <div className="space-y-3">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="p-4 rounded-lg border border-[var(--border)] bg-[var(--background-elevated)]"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-semibold text-[var(--foreground)]">{key.name}</h4>
                        <span className={key.status === 'active' ? 'badge badge-success' : 'badge badge-default'}>
                          {key.status}
                        </span>
                      </div>
                      <code className="text-xs text-[var(--foreground-subtle)]">{key.key_preview}</code>
                      <p className="text-xs text-[var(--foreground-muted)] mt-2">
                        Created {formatRelativeTime(key.created_at)}
                        {key.last_used_at ? ` - Last used ${formatRelativeTime(key.last_used_at)}` : ''}
                      </p>
                    </div>

                    <Button
                      variant="danger"
                      size="sm"
                      disabled={key.status !== 'active'}
                      onClick={() => handleRevoke(key.id)}
                    >
                      Revoke
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-sm text-[var(--foreground-muted)]">
                No API keys exist for this tenant.
              </p>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
