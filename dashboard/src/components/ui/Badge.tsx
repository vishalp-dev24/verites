'use client';

import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary' | 'lite' | 'medium' | 'deep';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({
    className,
    variant = 'default',
    size = 'md',
    children,
    ...props
  }, ref) => {
    const variants: Record<BadgeVariant, string> = {
      default: 'badge-default',
      success: 'badge-success',
      warning: 'badge-warning',
      error: 'badge-error',
      info: 'badge-info',
      primary: 'badge-primary',
      lite: 'badge-success', // lite mode uses success colors
      medium: 'badge-warning', // medium mode uses warning colors
      deep: 'badge-primary', // deep mode uses primary colors
    };

    const sizes = {
      sm: 'text-[10px] px-1.5 py-0.5',
      md: 'text-xs px-2.5 py-0.5',
    };

    return (
      <span
        ref={ref}
        className={cn(variants[variant], sizes[size], className)}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

export default Badge;
