import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'success' | 'danger' | 'info' | 'warn' | 'warning' | 'accent';

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: BadgeTone }) {
  const t = tone === 'warning' ? 'warn' : tone;
  return <span className={`badge badge--${t}`}>{children}</span>;
}
