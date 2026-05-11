'use client';

import { useState, useEffect } from 'react';
import PageLayout from '@/components/layout/PageLayout';
import Button from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { cn, formatNumber } from '@/lib/utils';
import type { UserSettings, CreditInfo, UsageBreakdown } from '@/types';

// Mock data
const mockSettings: UserSettings = {
  default_mode: 'medium',
  notify_on_completion: true,
  email_notifications: true,
  webhook_url: '',
  custom_instructions: '',
  theme: 'dark',
};

const mockCredits: CreditInfo = {
  balance: 1240,
  used_this_month: 4560,
  tier: 'developer',
  tier_name: 'Developer Plan',
};

const mockUsage: UsageBreakdown[] = [
  { mode: 'lite', requests: 45, credits_used: 225, avg_credits_per_request: 5 },
  { mode: 'medium', requests: 128, credits_used: 3200, avg_credits_per_request: 25 },
  { mode: 'deep', requests: 13, credits_used: 1135, avg_credits_per_request: 87 },
];

const tiers = [
  { value: 'hobby', label: 'Hobby — 100 credits/mo', credits: 100 },
  { value: 'starter', label: 'Starter — 1,000 credits/mo', credits: 1000 },
  { value: 'developer', label: 'Developer — 5,000 credits/mo', credits: 5000 },
  { value: 'professional', label: 'Professional — 20,000 credits/mo', credits: 20000 },
  { value: 'enterprise', label: 'Enterprise — Custom', credits: 0 },
];

const themeOptions = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

const defaultModeOptions = [
  { value: 'lite', label: 'Lite — Quick overview' },
  { value: 'medium', label: 'Medium — Balanced research' },
  { value: 'deep', label: 'Deep — Comprehensive analysis' },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>(mockSettings);
  const [credits] = useState<CreditInfo>(mockCredits);
  const [usage] = useState<UsageBreakdown[]>(mockUsage);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'billing'>('general');
  const { success, error, ToastContainer } = useToast();

  const handleSave = async () => {
    setLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 800));
    setLoading(false);
    setSaved(true);
    success('Settings saved successfully');
    setTimeout(() => setSaved(false), 2000);
  };

  const handleCopyWebhook = () => {
    if (settings.webhook_url) {
      navigator.clipboard.writeText(settings.webhook_url);
      success('Webhook URL copied to clipboard');
    }
  };

  const totalUsage = usage.reduce((sum, u) => sum + u.credits_used, 0);
  const totalRequests = usage.reduce((sum, u) => sum + u.requests, 0);

  return (
    <PageLayout
      title="Settings"
      description="Manage your account preferences and billing"
    >
      <ToastContainer />
      
      {/* Tabs */}
      <div className="border-b border-[var(--border)] mb-6">
        <nav className="flex gap-6">
          <button
            onClick={() => setActiveTab('general')}
            className={cn(
              'pb-4 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'general'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
            )}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('billing')}
            className={cn(
              'pb-4 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'billing'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
            )}
          >
            Billing & Credits
          </button>
        </nav>
      </div>

      {activeTab === 'general' ? (
        <div className="max-w-2xl space-y-6">
          {/* General Settings */}
          <div className="card">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-1">
              Research Preferences
            </h3>
            <p className="text-sm text-[var(--foreground-muted)] mb-6">
              Customize your default research settings
            </p>

            <div className="space-y-6">
              <Select
                label="Default Research Mode"
                value={settings.default_mode}
                onChange={(e) => setSettings(s => ({ ...s, default_mode: e.target.value as any }))}
                options={defaultModeOptions}
              />

              <Textarea
                label="Custom Instructions"
                value={settings.custom_instructions}
                onChange={(e) => setSettings(s => ({ ...s, custom_instructions: e.target.value }))}
                placeholder="Add any special instructions that should be applied to all your research queries..."
                rows={4}
                helperText="These instructions will be included with every research query"
              />
            </div>
          </div>

          {/* Notifications */}
          <div className="card">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-1">
              Notifications
            </h3>
            <p className="text-sm text-[var(--foreground-muted)] mb-6">
              Configure how you want to be notified
            </p>

            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.notify_on_completion}
                  onChange={(e) => setSettings(s => ({ ...s, notify_on_completion: e.target.checked }))}
                  className="w-5 h-5 rounded border-[var(--border)] bg-[var(--background-elevated)] text-[var(--primary)] focus:ring-[var(--primary)]"
                />
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    Notify on completion
                  </p>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    Get notified when research jobs complete
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.email_notifications}
                  onChange={(e) => setSettings(s => ({ ...s, email_notifications: e.target.checked }))}
                  className="w-5 h-5 rounded border-[var(--border)] bg-[var(--background-elevated)] text-[var(--primary)] focus:ring-[var(--primary)]"
                />
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    Email notifications
                  </p>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    Receive email summaries of your research activity
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Webhook */}
          <div className="card">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-1">
              Webhook URL
            </h3>
            <p className="text-sm text-[var(--foreground-muted)] mb-6">
              Receive real-time updates via webhook
            </p>

            <div className="flex gap-3">
              <Input
                value={settings.webhook_url}
                onChange={(e) => setSettings(s => ({ ...s, webhook_url: e.target.value }))}
                placeholder="https://your-app.com/webhooks/veritas"
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

          {/* Theme */}
          <div className="card">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-1">
              Appearance
            </h3>
            <p className="text-sm text-[var(--foreground-muted)] mb-6">
              Customize the dashboard appearance
            </p>

            <Select
              label="Theme"
              value={settings.theme}
              onChange={(e) => setSettings(s => ({ ...s, theme: e.target.value as any }))}
              options={themeOptions}
            />
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-end gap-4">
            {saved && (
              <span className="text-sm text-[var(--success)] flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Saved
              </span>
            )}
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
          {/* Current Plan */}
          <div className="card">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-[var(--foreground)] mb-1">
                  Current Plan
                </h3>
                <p className="text-sm text-[var(--foreground-muted)]">
                  {credits.tier_name}
                </p>
              </div>
              <span className="badge badge-primary">
                Active
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-[var(--background-elevated)] rounded-lg">
                <p className="text-xs text-[var(--foreground-muted)] mb-1">Credits Remaining</p>
                <p className="text-2xl font-semibold text-[var(--foreground)]">
                  {formatNumber(credits.balance)}
                </p>
              </div>
              <div className="p-4 bg-[var(--background-elevated)] rounded-lg">
                <p className="text-xs text-[var(--foreground-muted)] mb-1">Used This Month</p>
                <p className="text-2xl font-semibold text-[var(--foreground)]">
                  {formatNumber(credits.used_this_month)}
                </p>
              </div>
              <div className="p-4 bg-[var(--background-elevated)] rounded-lg">
                <p className="text-xs text-[var(--foreground-muted)] mb-1">Total Requests</p>
                <p className="text-2xl font-semibold text-[var(--foreground)]">
                  {formatNumber(totalRequests)}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="primary">
                Upgrade Plan
              </Button>
              <Button variant="secondary">
                View Invoices
              </Button>
            </div>
          </div>

          {/* Usage Breakdown */}
          <div className="card">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-6">
              Usage Breakdown
            </h3>

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
                          width: `${(item.credits_used / totalUsage) * 100}%`
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-6 border-t border-[var(--border)]">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--foreground-muted)]">Total Usage</span>
                <span className="text-lg font-semibold text-[var(--foreground)]">
                  {formatNumber(totalUsage)} credits
                </span>
              </div>
            </div>
          </div>

          {/* Available Plans */}
          <div className="card">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-6">
              Available Plans
            </h3>

            <div className="space-y-3">
              {tiers.map((tier) => (
                <div
                  key={tier.value}
                  className={cn(
                    'flex items-center justify-between p-4 rounded-lg border transition-colors',
                    credits.tier === tier.value
                      ? 'border-[var(--primary)] bg-[var(--primary-subtle)]'
                      : 'border-[var(--border)] bg-[var(--background-elevated)] hover:border-[var(--border-hover)]'
                  )}
                >
                  <div className="flex items-center gap-3">
                    {credits.tier === tier.value && (
                      <svg className="w-5 h-5 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    <span className={cn(
                      'font-medium',
                      credits.tier === tier.value ? 'text-[var(--foreground)]' : 'text-[var(--foreground-muted)]'
                    )}>
                      {tier.label}
                    </span>
                  </div>
                  {credits.tier === tier.value ? (
                    <span className="text-xs text-[var(--primary)] font-medium">Current</span>
                  ) : (
                    <Button variant="ghost" size="sm">
                      Select
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
