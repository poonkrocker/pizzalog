import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { formatARS } from '@pizzalog/shared';
import { AddRoundSheet } from './AddRoundSheet';
import { useCancelSession, useCloseSession, useRequestBill, useSession } from './hooks';

const METHODS: { value: string; label: string }[] = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'other', label: 'Otro' },
];

export function SessionPage() {
  const { id } = useParams();
  const sessionId = id ? Number(id) : null;
  const session = useSession(sessionId);
  const requestBill = useRequestBill();
  const closeSession = useCloseSession();
  const cancelSession = useCancelSession();
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [discountPct, setDiscountPct] = useState<number>(0);
  const [customDiscount, setCustomDiscount] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  if (sessionId === null) return <div className="boot">Mesa inválida.</div>;
  if (session.isLoading) return <div className="boot">Cargando cuenta…</div>;
  if (session.isError || !session.data) return <div className="boot">No se pudo cargar la cuenta.</div>;

  const s = session.data;
  const tablesLabel = s.tables?.map((t) => t.label).join(' + ') ?? '';
  const total = s.totals?.subtotal ?? 0;
  const rounds = s.rounds ?? [];
  const sid = sessionId; // ya validado != null arriba

  const discountAmount = customDiscount.trim() !== ''
    ? Math.min(total, parseFloat(customDiscount) || 0)
    : discountPct > 0
      ? Math.round((total * discountPct) / 100)
      : 0;

  const finalTotal = Math.max(0, total - discountAmount);

  async function pay(method: string) {
    setError(null);
    try {
      await closeSession.mutateAsync({
        sessionId: sid,
        payment_method: method,
        discount: discountAmount,
      });
      navigate('/salon');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cobrar la cuenta');
    }
  }

  async function doCancel() {
    if (!confirm('¿Cancelar la mesa? Se descarta la cuenta sin cobrar.')) return;
    await cancelSession.mutateAsync(sid);
    navigate('/salon');
  }

  return (
    <div className="session">
      <div className="session__head">
        <button className="back-btn" onClick={() => navigate('/salon')}>
          ‹ Salón
        </button>
        <div className="session__title-wrap">
          <h1 className="session__table">Mesa {tablesLabel}</h1>
          <span className={`session__status session__status--${s.status}`}>
            {s.status === 'bill_requested'
              ? 'Cuenta pedida'
              : s.status === 'open'
                ? 'Abierta'
                : s.status}
          </span>
        </div>
      </div>

      <div className="session__rounds">
        {rounds.length === 0 ? (
          <p className="cart__empty">Todavía no hay comandas.</p>
        ) : (
          rounds.map((r) => (
            <div key={r.id} className="round-card">
              <div className="round-card__head">Comanda {r.number}</div>
              {r.items.map((it) => (
                <div
                  key={it.id}
                  className={`round-item${it.status === 'cancelled' ? ' is-cancelled' : ''}`}
                >
                  <span>
                    {it.qty}× {it.name}
                  </span>
                  <span>{formatARS(it.line_total ?? it.unit_price * it.qty)}</span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      <div className="session__foot">
        <div className="cart__total">
          <span>Total</span>
          <strong>{formatARS(total)}</strong>
        </div>
        {error && <p className="t-error">{error}</p>}
        <div className="session__actions">
          <button className="t-btn method-btn" onClick={() => setAddOpen(true)}>
            + Comanda
          </button>
          {s.status === 'open' && (
            <button
              className="t-btn method-btn"
              disabled={requestBill.isPending}
              onClick={() => requestBill.mutate(sid)}
            >
              Pedir cuenta
            </button>
          )}
          <button className="t-btn method-btn method-btn--danger" onClick={() => void doCancel()}>
            Cancelar mesa
          </button>
          <button
            className="t-btn t-btn--primary"
            disabled={total <= 0}
            onClick={() => setPayOpen(true)}
          >
            Cobrar
          </button>
        </div>
      </div>

      {addOpen && (
        <AddRoundSheet
          sessionId={sid}
          placeLabel={tablesLabel || undefined}
          accountLabel={s.label ?? undefined}
          onClose={() => setAddOpen(false)}
        />
      )}

      {payOpen && (
        <div className="overlay" onClick={() => !closeSession.isPending && setPayOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="sheet__title">Cobrar mesa {tablesLabel}</h2>
            <div style={{ marginBottom: '16px', background: 'rgba(0,0,0,0.04)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Subtotal consumos:</span>
                <span>{formatARS(total)}</span>
              </div>
              {discountAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#d73828', marginBottom: '4px', fontWeight: 600 }}>
                  <span>Descuento aplicado:</span>
                  <span>−{formatARS(discountAmount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 700, borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: '6px' }}>
                <span>Total a cobrar:</span>
                <strong style={{ color: 'var(--ocre, #d73828)' }}>{formatARS(finalTotal)}</strong>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                Descuento a la mesa:
              </span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                {[0, 10, 15, 20, 30, 50].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    className="t-btn"
                    style={{
                      padding: '4px 10px',
                      fontSize: '12px',
                      background: discountPct === pct && customDiscount === '' ? 'var(--ocre, #d73828)' : 'rgba(0,0,0,0.08)',
                      color: discountPct === pct && customDiscount === '' ? '#fff' : 'inherit',
                    }}
                    onClick={() => {
                      setDiscountPct(pct);
                      setCustomDiscount('');
                    }}
                  >
                    {pct === 0 ? 'Sin desc.' : `${pct}%`}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px' }}>O monto $:</span>
                <input
                  type="number"
                  min="0"
                  max={total}
                  placeholder="$ Monto"
                  value={customDiscount}
                  onChange={(e) => {
                    setCustomDiscount(e.target.value);
                    setDiscountPct(0);
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid rgba(0,0,0,0.2)',
                    width: '120px',
                    fontSize: '14px',
                    background: 'var(--c-surface, #fff)',
                    color: 'inherit',
                  }}
                />
              </div>
            </div>

            {error && <p className="t-error">{error}</p>}
            <div className="method-grid">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  className="t-btn method-btn"
                  disabled={closeSession.isPending}
                  onClick={() => void pay(m.value)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <button
              className="sheet__cancel"
              onClick={() => setPayOpen(false)}
              disabled={closeSession.isPending}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
