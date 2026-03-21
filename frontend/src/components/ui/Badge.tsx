'use client';

import React from 'react';

const colorMap = {
  emerald: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
  violet: 'bg-violet-100 text-violet-700',
  slate: 'bg-slate-100 text-slate-600',
  sky: 'bg-sky-100 text-sky-700',
} as const;

export type BadgeColor = keyof typeof colorMap;

interface BadgeProps {
  children: React.ReactNode;
  color?: BadgeColor;
  className?: string;
}

export function Badge({ children, color = 'slate', className = '' }: BadgeProps) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colorMap[color]} ${className}`}>
      {children}
    </span>
  );
}
