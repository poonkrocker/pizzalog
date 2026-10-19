import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatARS } from '@pizzalog/shared';
import { useCashMovement, useCloseCashSession, useCurrentCashSession, useOpenCashSession } from './hooks';

export function CashPage() {
  const navigate = useNavigate();
  const { data: session, isLoading, isError, error: queryError } = useCurrentCashSession();
  const openCash = useOpenCashSession();
  const addMovement = useCashMovement();
  const closeCash = useCloseCashSession();

  // Estados de apertura
  const [openingAmount, setOpeningAmount] = useState<number>(0);
  const [openNote, setOpenNote] = useState<string>('');
  const [openError, setOpenError] = useState<string | null>(null);

  // Estados de modales
  const [movementOpen, setMovementOpen] = useState(false);
  const [movType, setMovType] = useState<'in' | 'out'>('out');
  const [movAmount, setMovAmount] = useState<string>('');
  const [movReason, setMovReason] = useState<string>('');
  const [movError, setMovError] = useState<string | null>(null);

  const [closeOpen, setCloseOpen] = useState(false);
  const [closingAmount, setClosingAmount] = useState<string>('');
  const [closeNote, setCloseNote] = useState<string>('');
  const [closeError, setCloseError] = useState<string | null>(null);

  const isOpen = Boolean(session && session.status === 'open');

  const expectedAmount = useMemo(() => {
    if (!session) return 0;
    return session.expected_amount ?? session.opening_amount ?? 0;
  }, [session]);

  const countedAmount = parseFloat(closingAmount) || 0;
  const difference = closingAmount.trim() === '' ? 0 : countedAmount - expectedAmount;

  async function handleOpen() {
    setOpenError(null);
    try {
      await openCash.mutateAsync({ openingAmount: Math.max(0, openingAmount), note: openNote.trim() || undefined });
      setOpenNote('');
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : 'No se pudo abrir la caja');
    }
  }

  async function handleMovement() {
    setMovError(null);
    const amt = parseFloat(movAmount);
    if (!amt || amt <= 0) {
      setMovError('Ingresá un monto válido mayor a 0');
      return;
    }
    try {
      await addMovement.mutateAsync({ type: movType, amount: amt, reason: movReason.trim() || undefined });
      setMovementOpen(false);
      setMovAmount('');
      setMovReason('');
    } catch (err) {
      setMovError(err instanceof Error ? err.message : 'No se pudo registrar el movimiento');
    }
  }

  async function handleClose() {
    setCloseError(null);
    const amt = parseFloat(closingAmount);
    if (isNaN(amt) || amt < 0) {
      setCloseError('Ingresá el monto contado en el cajón');
      return;
    }
    if (!confirm(`¿Confirmás el cierre de turno?\nEfectivo contado: ${formatARS(amt)}\nDiferencia: ${formatARS(difference)}`)) {
      return;
    }
    try {
      await closeCash.mutateAsync({ closingAmount: amt, note: closeNote.trim() || undefined });
      setCloseOpen(false);
      setClosingAmount('');
      setCloseNote('');
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : 'No se pudo cerrar la caja');
    }
  }

  if (isLoading) return <div className="boot">Cargando estado de caja…</div>;

  return (
    <div className="cash-module" style={{ padding: '16px', maxWidth: '640px', margin: '0 auto' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <button
          className="back-btn"
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', color: 'var(--ocre)', fontSize: '18px', cursor: 'pointer', padding: 0 }}
        >
          ‹ Inicio
        </button>
        <span
          style={{
            padding: '4px 10px',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: 700,
            background: isOpen ? 'rgba(108, 192, 112, 0.2)' : 'rgba(168, 159, 149, 0.2)',
            color: isOpen ? 'var(--success)' : 'var(--muted)',
          }}
        >
          {isOpen ? `🟢 Turno Abierto #${session?.id}` : '⚪ Caja Cerrada'}
        </span>
      </div>

      <h1 className="page-title" style={{ fontSize: '24px', margin: '0 0 16px 0', color: 'var(--text)' }}>
        Control de Turno & Caja
      </h1>

      {queryError && (
        <div style={{ background: '#3b2220', border: '1px solid #732a24', color: '#f0a59b', padding: '12px', borderRadius: '10px', marginBottom: '16px' }}>
          {(queryError as Error).message}
        </div>
      )}

      {/* CASO 1: NO HAY CAJA ABIERTA -> FORMULARIO DE APERTURA */}
      {!isOpen && (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: '16px',
            padding: '20px',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <span style={{ fontSize: '42px', display: 'block', marginBottom: '8px' }}>💵</span>
            <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--text)' }}>Apertura de Turno</h2>
            <p style={{ margin: '6px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
              Ingresá el efectivo inicial que hay en el cajón de cambio para comenzar a operar.
            </p>
          </div>

          <label className="t-field">
            <span>Monto Inicial en Efectivo ($):</span>
            <input
              type="number"
              min="0"
              step="100"
              value={openingAmount || ''}
              placeholder="0"
              onChange={(e) => setOpeningAmount(parseFloat(e.target.value) || 0)}
              style={{ fontSize: '22px', fontWeight: 700, textAlign: 'center' }}
            />
          </label>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {[5000, 10000, 20000, 50000].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setOpeningAmount((prev) => prev + val)}
                className="t-btn"
                style={{ flex: 1, minHeight: '38px', padding: '0 10px', fontSize: '13px', background: 'var(--surface-2)', color: 'var(--text)' }}
              >
                +{formatARS(val)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setOpeningAmount(0)}
              className="t-btn"
              style={{ minHeight: '38px', padding: '0 12px', fontSize: '13px', background: 'var(--line)', color: 'var(--muted)' }}
            >
              $0
            </button>
          </div>

          <label className="t-field">
            <span>Observaciones / Turno (opcional):</span>
            <input
              type="text"
              placeholder="Ej: Turno Tarde / Juan"
              value={openNote}
              onChange={(e) => setOpenNote(e.target.value)}
            />
          </label>

          {openError && <p className="t-error">{openError}</p>}

          <button
            type="button"
            className="t-btn t-btn--primary t-btn--block"
            disabled={openCash.isPending}
            onClick={() => void handleOpen()}
            style={{ minHeight: '52px', fontSize: '18px', marginTop: '10px' }}
          >
            {openCash.isPending ? 'Abriendo turno…' : 'Abrir Turno de Caja'}
          </button>
        </div>
      )}

      {/* CASO 2: CAJA ABIERTA -> ESTADÍSTICAS Y ACCIONES */}
      {isOpen && session && (
        <div>
          {/* Card principal de Efectivo Esperado */}
          <div
            style={{
              background: 'linear-gradient(135deg, #2b221f 0%, #1c1918 100%)',
              border: '1px solid var(--ocre)',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '16px',
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: '13px', color: 'var(--ocre)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
              Efectivo Esperado en Cajón
            </span>
            <div style={{ fontSize: '36px', fontWeight: 800, color: '#fff', margin: '6px 0' }}>
              {formatARS(expectedAmount)}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
              Abierto por {session.opened_by_name ?? 'Cajero'} a las {new Date(session.opened_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>

          {/* Grilla de totales en efectivo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Monto Inicial</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>
                {formatARS(session.opening_amount)}
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Ventas Efectivo</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--success)' }}>
                +{formatARS(session.cash_sales ?? 0)}
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Ingresos de Caja</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--sky)' }}>
                +{formatARS(session.movements_in ?? 0)}
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Egresos / Retiros</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#f0a59b' }}>
                -{formatARS(session.movements_out ?? 0)}
              </div>
            </div>
          </div>

          {/* Ventas por otros medios de pago (no van al cajón físico) */}
          {session.sales_by_method && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
                Ventas por Medios Digitales
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                <div style={{ fontSize: '13px' }}>
                  <span style={{ color: 'var(--muted)' }}>💳 Tarjeta: </span>
                  <strong>{formatARS(session.sales_by_method['card'] ?? 0)}</strong>
                </div>
                <div style={{ fontSize: '13px' }}>
                  <span style={{ color: 'var(--muted)' }}>🏦 Transfer.: </span>
                  <strong>{formatARS(session.sales_by_method['transfer'] ?? 0)}</strong>
                </div>
                <div style={{ fontSize: '13px' }}>
                  <span style={{ color: 'var(--muted)' }}>📱 MP / Otros: </span>
                  <strong>{formatARS((session.sales_by_method['mp'] ?? 0) + (session.sales_by_method['other'] ?? 0))}</strong>
                </div>
              </div>
            </div>
          )}

          {/* Botones de acción del turno */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
            <button
              type="button"
              className="t-btn"
              onClick={() => {
                setMovError(null);
                setMovementOpen(true);
              }}
              style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--line)' }}
            >
              💸 Retiro / Ingreso
            </button>

            <button
              type="button"
              className="t-btn t-btn--primary"
              onClick={() => {
                setCloseError(null);
                setClosingAmount(String(expectedAmount));
                setCloseOpen(true);
              }}
            >
              🔒 Cerrar Turno
            </button>
          </div>

          {/* Movimientos de caja recientes */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '14px', padding: '16px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', color: 'var(--text)' }}>
              Movimientos del Turno ({session.movements?.length ?? 0})
            </h3>
            {(!session.movements || session.movements.length === 0) ? (
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: '13px', fontStyle: 'italic' }}>
                Sin retiros ni ingresos manuales en este turno.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {session.movements.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      background: 'var(--surface-2)',
                      borderRadius: '8px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: m.type === 'in' ? 'var(--sky)' : '#f0a59b' }}>
                        {m.type === 'in' ? '▲ Ingreso' : '▼ Retiro'}: {formatARS(m.amount)}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        {m.reason || 'Sin motivo'} · {new Date(m.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL REGISTRAR MOVIMIENTO (INGRESO / RETIRO) */}
      {movementOpen && (
        <div className="overlay" onClick={() => !addMovement.isPending && setMovementOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="sheet__title">Registrar Movimiento de Caja</h2>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button
                type="button"
                className={`t-btn ${movType === 'out' ? 't-btn--primary' : ''}`}
                style={{ flex: 1, minHeight: '44px' }}
                onClick={() => setMovType('out')}
              >
                ▼ Egreso / Retiro
              </button>
              <button
                type="button"
                className={`t-btn ${movType === 'in' ? 't-btn--primary' : ''}`}
                style={{ flex: 1, minHeight: '44px' }}
                onClick={() => setMovType('in')}
              >
                ▲ Ingreso de Cambio
              </button>
            </div>

            <label className="t-field">
              <span>Monto ($):</span>
              <input
                type="number"
                min="1"
                step="50"
                placeholder="0"
                value={movAmount}
                onChange={(e) => setMovAmount(e.target.value)}
                style={{ fontSize: '20px', fontWeight: 700 }}
              />
            </label>

            <label className="t-field">
              <span>Motivo:</span>
              <input
                type="text"
                placeholder={movType === 'out' ? 'Ej: Pago a verdulería / Retiro caja chica' : 'Ej: Ingreso de cambio / Billetes chicos'}
                value={movReason}
                onChange={(e) => setMovReason(e.target.value)}
              />
            </label>

            {movError && <p className="t-error">{movError}</p>}

            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button
                type="button"
                className="t-btn"
                style={{ flex: 1 }}
                disabled={addMovement.isPending}
                onClick={() => setMovementOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="t-btn t-btn--primary"
                style={{ flex: 1 }}
                disabled={addMovement.isPending}
                onClick={() => void handleMovement()}
              >
                {addMovement.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CIERRE DE TURNO / ARQUEO */}
      {closeOpen && (
        <div className="overlay" onClick={() => !closeCash.isPending && setCloseOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="sheet__title">Cierre de Turno & Arqueo</h2>

            <div style={{ background: 'var(--surface-2)', padding: '12px', borderRadius: '10px', marginBottom: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: 'var(--muted)' }}>Efectivo calculado por sistema:</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)' }}>
                {formatARS(expectedAmount)}
              </div>
            </div>

            <label className="t-field">
              <span>Efectivo Contado en el Cajón ($):</span>
              <input
                type="number"
                min="0"
                step="100"
                placeholder="0"
                value={closingAmount}
                onChange={(e) => setClosingAmount(e.target.value)}
                style={{ fontSize: '24px', fontWeight: 800, textAlign: 'center' }}
              />
            </label>

            {/* Indicador de Diferencia en tiempo real */}
            {closingAmount.trim() !== '' && (
              <div
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  marginBottom: '16px',
                  textAlign: 'center',
                  background: difference === 0 ? 'rgba(108, 192, 112, 0.15)' : difference < 0 ? 'rgba(215, 56, 40, 0.15)' : 'rgba(88, 166, 207, 0.15)',
                  border: `1px solid ${difference === 0 ? 'var(--success)' : difference < 0 ? 'var(--red)' : 'var(--sky)'}`,
                }}
              >
                <div style={{ fontSize: '12px', textTransform: 'uppercase', fontWeight: 700 }}>
                  {difference === 0 ? '✅ Caja Exacta' : difference < 0 ? '⚠️ Faltante de Caja' : 'ℹ️ Sobrante de Caja'}
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: difference === 0 ? 'var(--success)' : difference < 0 ? 'var(--red)' : 'var(--sky)' }}>
                  {difference === 0 ? 'Sin diferencias ($0)' : formatARS(difference)}
                </div>
              </div>
            )}

            <label className="t-field">
              <span>Observaciones de Cierre (opcional):</span>
              <input
                type="text"
                placeholder="Ej: Dejo $10.000 de cambio para el turno mañana"
                value={closeNote}
                onChange={(e) => setCloseNote(e.target.value)}
              />
            </label>

            {closeError && <p className="t-error">{closeError}</p>}

            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button
                type="button"
                className="t-btn"
                style={{ flex: 1 }}
                disabled={closeCash.isPending}
                onClick={() => setCloseOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="t-btn t-btn--primary"
                style={{ flex: 1 }}
                disabled={closeCash.isPending}
                onClick={() => void handleClose()}
              >
                {closeCash.isPending ? 'Cerrando…' : 'Cerrar Turno'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
