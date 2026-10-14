import type { ReactNode } from 'react';
import { Spinner } from './controls';

export function Loading({ message }: { message?: string } = {}) {
  return (
    <div className="state">
      <Spinner />
      {message && <p className="muted" style={{ marginTop: 8 }}>{message}</p>}
    </div>
  );
}

export function ErrorState({
  message,
  error,
  onRetry,
}: {
  message?: string;
  error?: Error;
  onRetry?: () => void;
}) {
  const text = message || error?.message || 'Ocurrió un error inesperado';
  return (
    <div className="state state--error" role="alert">
      <p>{text}</p>
      {onRetry && (
        <button
          className="btn btn--ghost"
          style={{ marginTop: 10 }}
          onClick={onRetry}
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="state state--empty">
      <p className="state__title">{title}</p>
      {description && <p className="muted" style={{ margin: '4px 0 0' }}>{description}</p>}
      {children}
    </div>
  );
}
