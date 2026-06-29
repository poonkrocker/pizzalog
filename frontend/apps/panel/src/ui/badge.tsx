import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'success' | 'danger' | 'info' | 'warn';

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: BadgeTone }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
