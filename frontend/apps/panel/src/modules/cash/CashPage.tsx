import { useState } from 'react';
import { formatARS, formatDateTime, type CashMovement, type CashSession } from '@pizzalog/shared';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  PageHeader,
} from '@/ui';
import type { Column } from '@/ui';
import { useCashSessions, useCurrentCashSession, useOpenCashSession } from './hooks';
import { CashMovementModal } from './CashMovementModal';
import { CloseCashModal } from './CloseCashModal';

export function CashPage() {
  const current = useCurrentCashSession();
  const history = useCashSessions();
  const openSession = useOpenCashSession();

  const [openingAmount, setOpeningAmount] = useState<string>('0');
  const [openingNote, setOpeningNote] = useState<string>('');
  const [openError, setOpenError] = useState<string | null>(null);

  const [showMovementModal, setShowMovementModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);

  const handleOpenCash = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(openingAmount);
    if (isNaN(val) || val < 0) {
      setOpenError('El monto inicial debe ser un número válido igual o mayor a cero');
      return;
    }

    openSession.mutate(
      { openingAmount: val, note: openingNote.trim() || undefined },
      {
        onSuccess: () => {
          setOpeningAmount('0');
          setOpeningNote('');
          setOpenError(null);
        },
        onError: (err: any) => setOpenError(err.message ?? 'Error al abrir la caja'),
      },
    );
  };

  const movementColumns: Column<CashMovement>[] = [
    {
      key: 'created_at',
      header: 'Hora',
      render: (m) =>
        new Date(m.created_at).toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (m) => (
        <Badge tone={m.type === 'in' ? 'success' : 'danger'}>
          {m.type === 'in' ? 'Ingreso' : 'Egreso'}
        </Badge>
      ),
    },
    {
      key: 'amount',
      header: 'Monto',
      align: 'right',
      render: (m) => (
        <strong style={{ color: m.type === 'in' ? '#2a9d8f' : '#e63946' }}>
          {m.type === 'in' ? '+' : '-'}{formatARS(m.amount)}
        </strong>
      ),
    },
    {
      key: 'reason',
      header: 'Motivo',
      render: (m) => m.reason || <span style={{ color: '#999' }}>—</span>,
    },
  ];

  const sessionColumns: Column<CashSession>[] = [
    {
      key: 'opened_at',
      header: 'Apertura',
      render: (s) => formatDateTime(s.opened_at),
    },
    {
      key: 'closed_at',
      header: 'Cierre',
      render: (s) => (s.closed_at ? formatDateTime(s.closed_at) : 'En curso'),
    },
    {
      key: 'opened_by_name',
      header: 'Responsable',
      render: (s) => s.opened_by_name || '—',
    },
    {
      key: 'opening_amount',
      header: 'Inicial',
      align: 'right',
      render: (s) => formatARS(s.opening_amount),
    },
    {
      key: 'expected_amount',
      header: 'Esperado',
      align: 'right',
      render: (s) => (s.expected_amount !== null ? formatARS(s.expected_amount) : '—'),
    },
    {
      key: 'closing_amount',
      header: 'Contado',
      align: 'right',
      render: (s) => (s.closing_amount !== null ? formatARS(s.closing_amount) : '—'),
    },
    {
      key: 'difference',
      header: 'Diferencia',
      align: 'right',
      render: (s) => {
        if (s.difference === null) return '—';
        const isOk = s.difference === 0;
        const isPos = s.difference > 0;
        return (
          <span style={{ color: isOk ? '#2a9d8f' : isPos ? '#084298' : '#e63946', fontWeight: 700 }}>
            {isPos ? '+' : ''}{formatARS(s.difference)}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Estado',
      render: (s) => (
        <Badge tone={s.status === 'open' ? 'accent' : 'neutral'}>
          {s.status === 'open' ? 'Abierta' : 'Cerrada'}
        </Badge>
      ),
    },
  ];

  const currentSession = current.data;

  return (
    <section>
      <PageHeader
        eyebrow="Operación Diaria"
        title="Caja y Arqueo"
        description="Apertura de turno, movimientos de efectivo, cobros y cierre ciego de caja."
      />

      {current.isLoading && <Loading message="Consultando estado de caja..." />}
      {current.isError && <ErrorState error={current.error} onRetry={() => current.refetch()} />}

      {/* Si NO hay caja abierta */}
      {current.isSuccess && !currentSession && (
        <div style={{ background: 'var(--c-surface, #fff)', border: '1px solid var(--c-border, #ddd)', borderRadius: '8px', padding: '1.5rem', maxWidth: '500px', marginBottom: '2rem' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem' }}>No hay una caja abierta</h3>
          <p style={{ margin: '0 0 1rem 0', color: '#666', fontSize: '0.9rem' }}>
            Abrí un turno de caja para registrar las ventas en efectivo, gastos del local y realizar el arqueo al cierre.
          </p>

          {openError && (
            <div style={{ background: '#f8d7da', color: '#721c24', padding: '0.6rem', borderRadius: '4px', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {openError}
            </div>
          )}

          <form onSubmit={handleOpenCash} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Field label="Monto inicial en efectivo ($)">
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
                required
              />
            </Field>

            <Field label="Nota de apertura (opcional)">
              <Input
                type="text"
                placeholder="Ej: Turno mediodía / Turno noche"
                value={openingNote}
                onChange={(e) => setOpeningNote(e.target.value)}
              />
            </Field>

            <Button variant="primary" onClick={handleOpenCash} disabled={openSession.isPending}>
              {openSession.isPending ? 'Abriendo caja...' : 'Abrir Turno de Caja'}
            </Button>
          </form>
        </div>
      )}

      {/* Si HAY caja abierta */}
      {current.isSuccess && currentSession && (
        <div style={{ marginBottom: '2.5rem' }}>
          {/* Barra superior de sesión */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#d1e7dd', color: '#0f5132', padding: '0.75rem 1.25rem', borderRadius: '8px', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <strong>● Caja en curso:</strong> Abierta por{' '}
              <strong>{currentSession.opened_by_name || 'Usuario'}</strong> desde{' '}
              {formatDateTime(currentSession.opened_at)}
              {currentSession.note && <span> · <em>{currentSession.note}</em></span>}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button variant="secondary" onClick={() => setShowMovementModal(true)}>
                + Movimiento de Efectivo
              </Button>
              <Button variant="danger" onClick={() => setShowCloseModal(true)}>
                Arqueo y Cierre de Caja
              </Button>
            </div>
          </div>

          {/* Tarjetas de efectivo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ background: 'var(--c-surface, #fff)', border: '1px solid var(--c-border, #ddd)', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase' }}>Fondo Inicial</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{formatARS(currentSession.opening_amount)}</div>
            </div>

            <div style={{ background: 'var(--c-surface, #fff)', border: '1px solid var(--c-border, #ddd)', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase' }}>Ventas Efectivo</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2a9d8f' }}>+{formatARS(currentSession.cash_sales ?? 0)}</div>
            </div>

            <div style={{ background: 'var(--c-surface, #fff)', border: '1px solid var(--c-border, #ddd)', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase' }}>Ingresos Varios</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2a9d8f' }}>+{formatARS(currentSession.movements_in ?? 0)}</div>
            </div>

            <div style={{ background: 'var(--c-surface, #fff)', border: '1px solid var(--c-border, #ddd)', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase' }}>Egresos Varios</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e63946' }}>-{formatARS(currentSession.movements_out ?? 0)}</div>
            </div>

            <div style={{ background: '#fff3cd', border: '1px solid #ffeeba', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#856404', textTransform: 'uppercase', fontWeight: 700 }}>Total Esperado en Cajón</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#856404' }}>{formatARS(currentSession.expected_amount ?? 0)}</div>
            </div>
          </div>

          {/* Desglose de otros métodos de pago */}
          {currentSession.sales_by_method && Object.keys(currentSession.sales_by_method).length > 0 && (
            <div style={{ background: 'var(--c-surface, #fbfbfb)', border: '1px solid var(--c-border, #eee)', padding: '0.8rem 1.2rem', borderRadius: '6px', marginBottom: '1.5rem' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#555', textTransform: 'uppercase' }}>
                Ventas registradas por otros medios (no van al cajón físico):
              </h4>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                {Object.entries(currentSession.sales_by_method).map(([method, amount]) => (
                  <div key={method} style={{ fontSize: '0.9rem' }}>
                    <span style={{ color: '#666', textTransform: 'capitalize' }}>{method}: </span>
                    <strong>{formatARS(amount)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Movimientos de la caja actual */}
          <div style={{ marginTop: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', margin: '0 0 0.75rem 0' }}>Movimientos del Turno Actual</h3>
            {(currentSession.movements ?? []).length === 0 ? (
              <p style={{ color: '#888', fontStyle: 'italic', fontSize: '0.9rem' }}>
                No se registraron ingresos ni egresos manuales en esta sesión.
              </p>
            ) : (
              <DataTable
                columns={movementColumns}
                data={currentSession.movements ?? []}
                keyExtractor={(m) => m.id}
              />
            )}
          </div>
        </div>
      )}

      {/* Historial de cajas pasadas */}
      <div style={{ marginTop: '3rem', borderTop: '2px solid var(--c-border, #eee)', paddingTop: '1.5rem' }}>
        <h3 style={{ fontSize: '1.2rem', margin: '0 0 1rem 0' }}>Historial de Sesiones de Caja</h3>
        {history.isLoading && <Loading message="Cargando historial..." />}
        {history.isSuccess && (history.data ?? []).length === 0 && (
          <EmptyState title="Sin sesiones pasadas" description="Aún no hay turnos de caja cerrados registrados." />
        )}
        {history.isSuccess && (history.data ?? []).length > 0 && (
          <DataTable
            columns={sessionColumns}
            data={history.data ?? []}
            keyExtractor={(s) => s.id}
          />
        )}
      </div>

      {/* Modales */}
      {showMovementModal && (
        <CashMovementModal onClose={() => setShowMovementModal(false)} />
      )}

      {showCloseModal && currentSession && (
        <CloseCashModal
          session={currentSession}
          onClose={() => setShowCloseModal(false)}
        />
      )}
    </section>
  );
}
