import type { ReactNode } from 'react';
import { Spinner } from './controls';

export function Loading() {
  return (
    <div className="state">
      <Spinner />
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="state state--error" role="alert">
      <p>{message}</p>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state state--empty">
      <p className="state__title">{title}</p>
      {children}
    </div>
  );
}
