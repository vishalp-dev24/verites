'use client';

import { useEffect, useMemo, useState } from 'react';
import PageLayout from '@/components/layout/PageLayout';
import Button from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { getCredits, getUsageBreakdown } from '@/lib/api';
import { cn, formatNumber } from '@/lib/utils';
import type { CreditInfo, UsageBreakdown, UserSettings } from '@/types';

const SETTINGS_STORAGE_KEY = 'veritas-dashboard-settings';

const DEFAULT_SETTINGS: UserSettings = {
  default_mode: 'medium',
  notify_on_completion: true,
  email_notifications: false,
  webhook_url: '',
  custom_instructions: '',
  theme: 'dark',
};

const themeOptions = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

const defaultModeOptions = [
  { value: 'lite', label: 'Lite - Quick overview' },
  { value: 'medium', label: 'Medium - Balanced research' },
  { value: 'deep', label: 'Deep - Comprehensive analysis' },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [credits, setCredits] = useState<CreditInfo | null>(null);
  const [usage, setUsage] = useState<UsageBreakdown[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'billing'>('general');
  const [billingError, setBillingError] = useState<string | null>(null);
  const { success, ToastContainer } = useToast();

  useEffect(() => {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      } catch {
        setSettings(DEFAULT_SETTINGS);
      }
    }

    async function loadBilling() {
      const [creditsResult, usageResult] = await Promise.all([
        getCredits(),
        getUsageBreakdown(),
      ]);

      if (creditsResult.data) setCredits(creditsResult.data);
      if (usageResult.data) setUsage(usageResult.data);

      const errors = [creditsResult.error, usageResult.error].filter(Boolean);
      setBillingError(errors.length > 0 ? errors.join(' ') : null);
    }

    void loadBilling();
  }, []);

  const totalUsage = useMemo(() => usage.reduce((sum, item) => sum + item.credits_used, 0), [usage]);
  const totalRequests = useMemo(() => usage.reduce((sum, item) => sum + item.requests, 0), [usage]);

  const handleSave = () => {
    setLoading(true);
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    setLoading(false);
    success('Settings saved');
  };

  const handleCopyWebhook = () => {
    if (settings.webhook_url) {
      navigator.clipboard.writeText(settings.webhook_url);
      success('Webhook URL copied');
    }
  };

  return (
    <PageLayout
      title="Settings"
      description="Manage dashboard preferences and billing visibility"
    >
      <ToastContainer />

      <div className="border-b border-[var(--border)] mb-6">
        <nav className="flex gap-6">
          <TabButton label="General" active={activeTab === 'general'} onClick={() => setActiveTab('general')} />
          <TabButton label="Billing & Credits" active={activeTab === 'billing'} onClick={() => setActiveTab('billing')} />
        </nav>
      </div>

      {activeTab === 'general' ? (
        <div className="max-w-2xl space-y-6">
          <div className="card">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-6">
              Research Preferences
            </h3>

            <div className="space-y-6">
              <Select
                label="Default Research Mode"
                value={settings.default_mode}
                onChange={(e) => setSettings((current) => ({ ...current, default_mode: e.target.value as UserSettings['default_mode'] }))}
                options={defaultModeOptions}
              />

              <Textarea
                label="Custom Instructions"
                value={settings.custom_instructions}
                onChange={(e) => setSettings((current) => ({ ...current, custom_instructions: e.target.value }))}
                rows={4}
              />
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-6">
              Notifications
            </h3>

            <div className="space-y-4">
              <Checkbox
                label="Notify on completion"
                checked={settings.notify_on_completion}
                onChange={(checked) => setSettings((current) => ({ ...current, notify_on_completion: checked }))}
              />
              <Checkbox
                label="Email notifications"
                checked={settings.email_notifications}
                onChange={(checked) => setSettings((current) => ({ ...current, email_notifications: checked }))}
              />
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-6">
              Webhook URL
            </h3>

            <div className="flex gap-3">
              <Input
                value={settings.webhook_url}
                onChange={(e) => setSettings((current) => ({ ...current, webhook_url: e.target.value }))}
                className="flex-1"
              />
              <Button
                variant="secondary"
                onClick={handleCopyWebhook}
                disabled={!settings.webhook_url}
              >
                Copy
              </Button>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-6">
              Appearance
            </h3>

            <Select
              label="Theme"
              value={settings.theme}
              onChange={(e) => setSettings((current) => ({ ...current, theme: e.target.value as UserSettings['theme'] }))}
              options={themeOptions}
            />
          </div>

          <div className="flex items-center justify-end">
            <Button
              variant="primary"
              onClick={handleSave}
              loading={loading}
            >
              Save Changes
            </Button>
          </div>
        </div>
      ) : (
        <div className="max-w-3xl space-y-6">
          {billingError && (
            <div className="card border-l-4 border-l-[var(--warning)]">
              <p className="text-sm text-[var(--warning)]">{billingError}</p>
            </div>
          )}

          <div className="card">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-[var(--foreground)] mb-1">
                  Current Plan
                </h3>
                <p className="text-sm text-[var(--foreground-muted)]">
                  {credits?.tier_name || 'Unavailable'}
                </p>
              </div>
              <span className="badge badge-primary">
                {credits ? 'Active' : 'Unknown'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <Metric label="Credits Remaining" value={formatNumber(credits?.balance || 0)} />
              <Metric label="Used This Month" value={formatNumber(credits?.used_this_month || 0)} />
              <Metric label="Total Requests" value={formatNumber(totalRequests)} />
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-6">
              Usage Breakdown
            </h3>

            {usage.length > 0 ? (
              <div className="space-y-4">
                {usage.map((item) => (
                  <div key={item.mode} className="flex items-center gap-4">
                    <div className="w-20">
                      <span className={cn(
                        'badge',
                        item.mode === 'lite' && 'badge-success',
                        item.mode === 'medium' && 'badge-warning',
                        item.mode === 'deep' && 'badge-primary'
                      )}>
                        {item.mode}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-[var(--foreground-muted)]">
                          {item.requests} requests
                        </span>
                        <span className="text-[var(--foreground)]">
                          {formatNumber(item.credits_used)} credits
                        </span>
                      </div>
                      <div className="w-full bg-[var(--background-elevated)] rounded-full h-2">
                        <div
                          className={cn(
                            'h-2 rounded-full transition-all duration-500',
                            item.mode === 'lite' && 'bg-[var(--success)]',
                            item.mode === 'medium' && 'bg-[var(--warning)]',
                            item.mode === 'deep' && 'bg-[var(--primary)]'
                          )}
                          style={{
                            width: `${totalUsage > 0 ? (item.credits_used / totalUsage) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--foreground-muted)]">No usage breakdown is available.</p>
            )}
          </div>
        </div>
      )}
    </PageLayout>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'pb-4 text-sm font-medium border-b-2 transition-colors',
        active
          ? 'border-[var(--primary)] text-[var(--primary)]'
          : 'border-transparent text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
      )}
    >
      {label}
    </button>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-5 h-5 rounded border-[var(--border)] bg-[var(--background-elevated)] text-[var(--primary)] focus:ring-[var(--primary)]"
      />
      <span className="text-sm font-medium text-[var(--foreground)]">{label}</span>
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 bg-[var(--background-elevated)] rounded-lg">
      <p className="text-xs text-[var(--foreground-muted)] mb-1">{label}</p>
      <p className="text-2xl font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}
