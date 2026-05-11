/**
 * Utility Functions
 * Shared utilities for the dashboard
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes with proper precedence
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format date to relative time (e.g., "2 min ago")
 */
export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  
  return then.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  });
}

/**
 * Format date to full date string
 */
export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format number with commas
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/**
 * Format credits with currency-like formatting
 */
export function formatCredits(credits: number): string {
  return credits.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals = 0): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Generate a unique ID
 */
export function generateId(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delay function for async operations
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Get color for job status
 */
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    queued: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    processing: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    complete: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    failed: 'bg-red-500/10 text-red-400 border-red-500/20',
    cancelled: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };
  return colors[status] || colors.pending;
}

/**
 * Get color for research mode
 */
export function getModeColor(mode: string): string {
  const colors: Record<string, string> = {
    lite: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    deep: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  };
  return colors[mode] || colors.lite;
}

/**
 * Get mode description
 */
export function getModeDescription(mode: string): string {
  const descriptions: Record<string, string> = {
    lite: 'Quick overview (~5 credits)',
    medium: 'Balanced research (~25 credits)',
    deep: 'Comprehensive analysis (~87 credits)',
  };
  return descriptions[mode] || '';
}

/**
 * Get estimated time for mode
 */
export function getEstimatedTime(mode: string): string {
  const times: Record<string, string> = {
    lite: '30 sec',
    medium: '2-3 min',
    deep: '5-8 min',
  };
  return times[mode] || 'unknown';
}
