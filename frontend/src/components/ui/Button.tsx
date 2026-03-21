'use client';

import React from 'react';

const variants = {
  primary:
    'bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm',
  secondary:
    'border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium',
  ghost:
    'bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium',
  accent:
    'bg-amber-100 hover:bg-amber-200 text-amber-700 font-medium',
  'accent-solid':
    'bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-medium',
} as const;

const sizes = {
  xs: 'text-xs py-1.5 px-3',
  sm: 'text-sm py-2 px-4',
  md: 'text-sm py-2.5 px-5',
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'sm',
  fullWidth = false,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`rounded-lg transition-colors disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
