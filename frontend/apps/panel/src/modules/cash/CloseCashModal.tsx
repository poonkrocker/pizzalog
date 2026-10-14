import { useState } from 'react';
import { formatARS, type CashSession } from '@pizzalog/shared';
import { Button, Field, Input, Modal } from '@/ui';
import { useCloseCashSession } from './hooks';

export function CloseCashModal({
  session,
  onClose,
}: {
  session: CashSession;
  onClose: () => void;
}) {
  const [closingAmount, setClosingAmount] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const closeSession = useCloseCashSession();

  const counted = parseFloat(closingAmount);
  const expected = session.expected_amount ?? 0;
  const hasCounted = !isNaN(counted);
  const diff = hasCounted ? counted - expected : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasCounted || counted < 0) {
      setError('Ingresá el monto real contado en el cajón');
      return;
    }

    if (diff !== null && Math.abs(diff) > 500) {
      if (!confirm(`Hay una diferencia de ${formatARS(diff)} con respecto al esperado (${formatARS(expected)}). ¿Deseás cerrar la caja de todos modos?`)) {
        return;
      }
    }

    closeSession.mutate(
      { closingAmount: counted, note: note.trim() || undefined },
      {
        onSuccess: () => onClose(),
        onError: (err: any) => setError(err.message ?? 'Error al cerrar la caja'),
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Arqueo y Cierre de Caja"
      footer={
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', width: '100%' }}>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={handleSubmit}
            disabled={closeSession.isPending}
          >
            {closeSession.isPending ? 'Cerrando caja...' : 'Confirmar Cierre'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {error && (
          <div style={{ background: '#f8d7da', color: '#721c24', padding: '0.6rem', borderRadius: '4px', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <div style={{ background: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '6px', padding: '0.8rem 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.9rem' }}>
            <span>Efectivo Inicial:</span>
            <strong>{formatARS(session.opening_amount)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.9rem' }}>
            <span>Ventas en Efectivo:</span>
            <strong>+{formatARS(session.cash_sales ?? 0)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.9rem' }}>
            <span>Ingresos manuales:</span>
            <strong>+{formatARS(session.movements_in ?? 0)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
            <span>Egresos manuales:</span>
            <strong style={{ color: '#dc3545' }}>-{formatARS(session.movements_out ?? 0)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px dashed #ccc', paddingTop: '0.5rem', fontSize: '1rem', fontWeight: 700 }}>
            <span>Total Esperado en Cajón:</span>
            <span style={{ color: 'var(--c-accent, #e63946)' }}>{formatARS(expected)}</span>
          </div>
        </div>

        <Field label="Total Contado Físicamente en Cajón ($)">
          <Input
            type="number"
            step="0.01"
            placeholder="Monto contado..."
            value={closingAmount}
            onChange={(e) => setClosingAmount(e.target.value)}
            required
            autoFocus
          />
        </Field>

        {diff !== null && (
          <div
            style={{
              padding: '0.75rem',
              borderRadius: '6px',
              fontSize: '0.9rem',
              background: diff === 0 ? '#d1e7dd' : diff > 0 ? '#cfe2ff' : '#f8d7da',
              color: diff === 0 ? '#0f5132' : diff > 0 ? '#084298' : '#842029',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>
              {diff === 0 ? '✓ Arqueo exacto' : diff > 0 ? '▲ Sobrante de dinero' : '▼ Faltante de dinero'}:
            </span>
            <strong style={{ fontSize: '1.1rem' }}>{formatARS(diff)}</strong>
          </div>
        )}

        <Field label="Observaciones del cierre (opcional)">
          <Input
            type="text"
            placeholder="Ej: Turno noche cerrado sin novedades..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}
