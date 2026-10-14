import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return createPortal(
    <div className="modal__overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <h2 className="modal__title">{title}</h2>
          <button className="modal__close" onClick={onClose} aria-label="Cerrar">
            &times;
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
