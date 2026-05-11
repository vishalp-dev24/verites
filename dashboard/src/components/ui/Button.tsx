'use client';

import { cn } from '@/lib/utils';
import Link, { type LinkProps } from 'next/link';
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ForwardedRef,
  type ReactNode,
} from 'react';

interface ButtonBaseProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

type ButtonElementProps = ButtonBaseProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: undefined;
  };

type LinkElementProps = ButtonBaseProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps | 'href'> &
  Pick<LinkProps, 'href' | 'replace' | 'scroll' | 'shallow' | 'prefetch' | 'locale'> & {
    disabled?: boolean;
    onClick?: AnchorHTMLAttributes<HTMLAnchorElement>['onClick'];
  };

type ButtonProps = ButtonElementProps | LinkElementProps;

const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  ({
    className,
    variant = 'secondary',
    size = 'md',
    loading = false,
    fullWidth = false,
    leftIcon,
    rightIcon,
    children,
    disabled,
    ...props
  }, ref) => {
    const variants = {
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      ghost: 'btn-ghost',
      danger: 'btn-danger',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2.5 text-sm',
      lg: 'px-6 py-3 text-base',
    };

    const isDisabled = disabled || loading;
    const buttonClassName = cn(
      variants[variant],
      sizes[size],
      fullWidth && 'w-full',
      isDisabled && 'opacity-60 cursor-not-allowed',
      className
    );

    const content = loading ? (
      <>
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        Loading...
      </>
    ) : (
      <>
        {leftIcon && <span className="-ml-0.5">{leftIcon}</span>}
        {children}
        {rightIcon && <span className="-mr-0.5">{rightIcon}</span>}
      </>
    );

    if ('href' in props && props.href) {
      const {
        href,
        replace,
        scroll,
        shallow,
        prefetch,
        locale,
        onClick,
        tabIndex,
        ...linkProps
      } = props as LinkElementProps;

      return (
        <Link
          ref={ref as ForwardedRef<HTMLAnchorElement>}
          href={href}
          replace={replace}
          scroll={scroll}
          shallow={shallow}
          prefetch={prefetch}
          locale={locale}
          aria-disabled={isDisabled || undefined}
          tabIndex={isDisabled ? -1 : tabIndex}
          className={buttonClassName}
          onClick={(event) => {
            if (isDisabled) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }

            onClick?.(event);
          }}
          {...linkProps}
        >
          {content}
        </Link>
      );
    }

    return (
      <button
        ref={ref as ForwardedRef<HTMLButtonElement>}
        className={buttonClassName}
        disabled={isDisabled}
        {...(props as ButtonElementProps)}
      >
        {content}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
