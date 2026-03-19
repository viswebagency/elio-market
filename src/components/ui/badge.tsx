/**
 * Badge component for status indicators and tags.
 */

import { ReactNode } from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'prediction' | 'betting' | 'stocks' | 'forex' | 'crypto';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-gray-700 text-gray-200',
  success: 'bg-emerald-900/50 text-emerald-400 border-emerald-800',
  warning: 'bg-amber-900/50 text-amber-400 border-amber-800',
  danger: 'bg-red-900/50 text-red-400 border-red-800',
  info: 'bg-blue-900/50 text-blue-400 border-blue-800',
  prediction: 'bg-violet-900/50 text-violet-400 border-violet-800',
  betting: 'bg-amber-900/50 text-amber-400 border-amber-800',
  stocks: 'bg-emerald-900/50 text-emerald-400 border-emerald-800',
  forex: 'bg-blue-900/50 text-blue-400 border-blue-800',
  crypto: 'bg-orange-900/50 text-orange-400 border-orange-800',
};

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium
        ${variantStyles[variant]} ${className}
      `}
    >
      {children}
    </span>
  );
}
