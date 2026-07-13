import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { formatARS } from '@pizzalog/shared';
import { AddRoundSheet } from './AddRoundSheet';
import { useCancelSession, useCloseSession, useRequestBill, useSession } from './hooks';

const METHODS: { value: string; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'otro', label: 'Otro' },
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
  const [error, setError] = useState<string | null>(null);

  if (sessionId === null) return <div className="boot">Mesa inválida.</div>;
  if (session.isLoading) return <div className="boot">Cargando cuenta…</div>;
  if (session.isError || !session.data) return <div className="boot">No se pudo cargar la cuenta.</div>;

  const s = session.data;
  const tablesLabel = s.tables?.map((t) => t.label).join(' + ') ?? '';
  const total = s.totals?.subtotal ?? 0;
  const rounds = s.rounds ?? [];
  const sid = sessionId; // ya validado != null arriba

  async function pay(method: string) {
    setError(null);
    try {
      await closeSession.mutateAsync({ sessionId: sid, payment_method: method });
      navigate('/salon');
    } catch {
      setError('No se pudo cobrar la cuenta');
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
            <h2 className="sheet__title">¿Cómo paga?</h2>
            <p className="sheet__total">
              Total: <strong>{formatARS(total)}</strong>
            </p>
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
