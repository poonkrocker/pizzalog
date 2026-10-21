import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { formatARS, type RoundItem } from '@pizzalog/shared';
import { useCurrentCashSession } from '@/modules/cash/hooks';
import { AddRoundSheet } from './AddRoundSheet';
import {
  useCancelSession,
  useCloseSession,
  useDiscountSessionItem,
  useRequestBill,
  useSession,
} from './hooks';

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
  const discountItemMut = useDiscountSessionItem();
  const cashQuery = useCurrentCashSession();
  const isCashOpen = cashQuery.isLoading ? true : cashQuery.data !== null && cashQuery.data !== undefined;
  const navigate = useNavigate();

  const [addOpen, setAddOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [showGlobalDiscount, setShowGlobalDiscount] = useState(false);
  const [discountPct, setDiscountPct] = useState<number>(0);
  const [customDiscount, setCustomDiscount] = useState<string>('');
  const [itemForDiscount, setItemForDiscount] = useState<RoundItem | null>(null);
  const [customItemDiscount, setCustomItemDiscount] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  if (sessionId === null) return <div className="boot">Mesa inválida.</div>;
  if (session.isLoading) return <div className="boot">Cargando cuenta…</div>;
  if (session.isError || !session.data) return <div className="boot">No se pudo cargar la cuenta.</div>;

  const s = session.data;
  const tablesLabel = s.tables?.map((t) => t.label).join(' + ') ?? '';
  const accountTitle = tablesLabel
    ? s.label
      ? `${tablesLabel} · ${s.label}`
      : `Mesa ${tablesLabel}`
    : s.label || `Cuenta #${s.id}`;
  const total = s.totals?.subtotal ?? 0;
  const rounds = s.rounds ?? [];
  const sid = sessionId;

  const discountAmount =
    customDiscount.trim() !== ''
      ? Math.min(total, parseFloat(customDiscount) || 0)
      : discountPct > 0
        ? Math.round((total * discountPct) / 100)
        : 0;

  const finalTotal = Math.max(0, total - discountAmount);

  async function applyItemDiscountPct(pct: number) {
    if (!itemForDiscount) return;
    try {
      await discountItemMut.mutateAsync({
        sessionId: sid,
        itemId: itemForDiscount.id,
        discount_pct: pct,
      });
      setItemForDiscount(null);
      setCustomItemDiscount('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo aplicar el descuento al producto');
    }
  }

  async function applyItemDiscountCustom() {
    if (!itemForDiscount) return;
    const val = parseFloat(customItemDiscount);
    if (isNaN(val) || val < 0) return;
    try {
      await discountItemMut.mutateAsync({
        sessionId: sid,
        itemId: itemForDiscount.id,
        discount_amount: val,
      });
      setItemForDiscount(null);
      setCustomItemDiscount('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo aplicar el descuento al producto');
    }
  }

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
    if (!confirm('¿Cancelar la cuenta? Se descarta sin cobrar.')) return;
    await cancelSession.mutateAsync(sid);
    navigate('/salon');
  }

  const allActiveItems = rounds.flatMap((r) =>
    r.items.filter((it) => it.status === 'ordered'),
  );

  return (
    <div className="session">
      <div className="session__head">
        <button className="back-btn" onClick={() => navigate('/salon')}>
          ‹ Salón
        </button>
        <div className="session__title-wrap">
          <h1 className="session__table">{accountTitle}</h1>
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
              {r.items.map((it) => {
                const hasDisc = Boolean(it.discount_pct && it.discount_pct > 0);
                const origTotal =
                  it.original_unit_price && it.original_unit_price > it.unit_price
                    ? it.original_unit_price * it.qty
                    : null;
                return (
                  <div
                    key={it.id}
                    className={`round-item${it.status === 'cancelled' ? ' is-cancelled' : ''}`}
                    style={{ alignItems: 'center', gap: '8px' }}
                  >
                    <span style={{ flex: 1 }}>
                      {it.qty}× {it.name}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {it.status === 'ordered' && (
                        <button
                          type="button"
                          style={{
                            background: hasDisc ? 'rgba(253, 183, 64, 0.14)' : 'transparent',
                            border: hasDisc ? '1px solid rgba(253, 183, 64, 0.45)' : '1px solid transparent',
                            borderRadius: '4px',
                            color: hasDisc ? 'var(--ocre)' : 'var(--muted)',
                            fontSize: '11px',
                            fontWeight: hasDisc ? 700 : 500,
                            padding: '1px 5px',
                            cursor: 'pointer',
                            opacity: hasDisc ? 1 : 0.65,
                          }}
                          onClick={() => {
                            setCustomItemDiscount('');
                            setItemForDiscount(it);
                          }}
                          title="Descuento en este producto"
                        >
                          {hasDisc ? `-${it.discount_pct}%` : '%'}
                        </button>
                      )}
                      <span style={{ whiteSpace: 'nowrap' }}>
                        {origTotal ? (
                          <>
                            <s style={{ opacity: 0.55, marginRight: '5px', fontSize: '13px' }}>
                              {formatARS(origTotal)}
                            </s>
                            <b style={{ color: 'var(--ocre)' }}>
                              {formatARS(it.line_total ?? it.unit_price * it.qty)}
                            </b>
                          </>
                        ) : (
                          <b style={{ color: 'var(--ocre)' }}>
                            {formatARS(it.line_total ?? it.unit_price * it.qty)}
                          </b>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="session__foot">
        <div className="cart__total">
          <span>Total</span>
          <strong style={{ color: 'var(--ocre)' }}>{formatARS(total)}</strong>
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
            Cancelar cuenta
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

      {/* Modal Descuento en producto específico de la cuenta */}
      {itemForDiscount && (
        <div
          className="overlay"
          style={{ zIndex: 70 }}
          onClick={() => !discountItemMut.isPending && setItemForDiscount(null)}
        >
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3 className="sheet__title">Descuento en producto</h3>
            <p style={{ margin: '0 0 12px', fontSize: '15px', color: 'var(--cream)' }}>
              {itemForDiscount.qty}× {itemForDiscount.name} (
              <b style={{ color: 'var(--ocre)' }}>
                {formatARS(itemForDiscount.original_unit_price ?? itemForDiscount.unit_price)} c/u
              </b>
              )
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                marginBottom: '14px',
              }}
            >
              {[0, 10, 15, 20, 30, 50].map((pct) => {
                const active = Math.round(itemForDiscount.discount_pct ?? 0) === pct;
                return (
                  <button
                    key={pct}
                    type="button"
                    className="t-btn"
                    disabled={discountItemMut.isPending}
                    style={{
                      background: active ? 'rgba(253, 183, 64, 0.22)' : 'var(--surface-2)',
                      border: active ? '2px solid var(--ocre)' : '1px solid var(--line)',
                      color: 'var(--ocre)',
                      fontSize: '15px',
                      fontWeight: 700,
                    }}
                    onClick={() => void applyItemDiscountPct(pct)}
                  >
                    {pct === 0 ? 'Sin desc.' : `${pct}%`}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                type="number"
                min="0"
                max={itemForDiscount.original_unit_price ?? itemForDiscount.unit_price}
                placeholder="Descontar monto $ por unidad"
                className="t-input"
                value={customItemDiscount}
                onChange={(e) => setCustomItemDiscount(e.target.value)}
              />
              <button
                type="button"
                className="t-btn"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--ocre)',
                  color: 'var(--ocre)',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
                disabled={
                  discountItemMut.isPending ||
                  !customItemDiscount ||
                  parseFloat(customItemDiscount) <= 0
                }
                onClick={() => void applyItemDiscountCustom()}
              >
                Aplicar $
              </button>
            </div>
            <button
              className="sheet__cancel"
              disabled={discountItemMut.isPending}
              onClick={() => setItemForDiscount(null)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {payOpen && (
        <div className="overlay" onClick={() => !closeSession.isPending && setPayOpen(false)}>
          <div className="sheet sheet--tall" onClick={(e) => e.stopPropagation()}>
            <h2 className="sheet__title">Cobrar {accountTitle}</h2>

            {!isCashOpen && (
              <div
                style={{
                  background: 'rgba(253, 183, 64, 0.14)',
                  border: '1px solid var(--ocre)',
                  color: 'var(--ocre)',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  marginBottom: '10px',
                }}
              >
                ⚠️ Atención: La caja está cerrada. Este cobro se registrará igualmente bajo «Ventas sin caja abierta».
              </div>
            )}

            <div
              style={{
                marginBottom: '12px',
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                padding: '12px',
                borderRadius: '10px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Subtotal consumos:</span>
                <span style={{ color: 'var(--ocre)', fontWeight: 600 }}>{formatARS(total)}</span>
              </div>
              {discountAmount > 0 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: 'var(--ocre)',
                    marginBottom: '4px',
                    fontWeight: 600,
                  }}
                >
                  <span>Descuento general cuenta:</span>
                  <span>−{formatARS(discountAmount)}</span>
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '18px',
                  fontWeight: 700,
                  borderTop: '1px solid var(--line)',
                  paddingTop: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Total a cobrar:</span>
                  <button
                    type="button"
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--line)',
                      borderRadius: '4px',
                      color: discountAmount > 0 ? 'var(--ocre)' : 'var(--muted)',
                      fontSize: '11px',
                      padding: '2px 6px',
                      cursor: 'pointer',
                    }}
                    onClick={() => setShowGlobalDiscount((v) => !v)}
                  >
                    {discountAmount > 0 ? 'Editar desc.' : '+ desc.'}
                  </button>
                </div>
                <strong style={{ color: 'var(--ocre)' }}>{formatARS(finalTotal)}</strong>
              </div>
            </div>

            {(showGlobalDiscount || discountAmount > 0) && (
              <div
                style={{
                  marginBottom: '12px',
                  padding: '10px',
                  background: 'var(--bg)',
                  border: '1px solid var(--line)',
                  borderRadius: '8px',
                }}
              >
                {allActiveItems.length > 0 && (
                  <div style={{ marginBottom: '10px', maxHeight: '18vh', overflowY: 'auto' }}>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
                      Descuento por ítem:
                    </div>
                    {allActiveItems.map((it) => {
                      const hasDisc = Boolean(it.discount_pct && it.discount_pct > 0);
                      return (
                        <div
                          key={it.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '3px 0',
                            fontSize: '13px',
                            gap: '6px',
                          }}
                        >
                          <span style={{ flex: 1 }}>
                            {it.qty}× {it.name}
                          </span>
                          <button
                            type="button"
                            style={{
                              background: hasDisc ? 'rgba(253, 183, 64, 0.16)' : 'var(--surface-2)',
                              border: '1px solid var(--line)',
                              borderRadius: '4px',
                              color: hasDisc ? 'var(--ocre)' : 'var(--muted)',
                              fontSize: '11px',
                              padding: '1px 6px',
                              cursor: 'pointer',
                            }}
                            onClick={() => {
                              setCustomItemDiscount('');
                              setItemForDiscount(it);
                            }}
                          >
                            {hasDisc ? `-${it.discount_pct}%` : '%'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(6, 1fr)',
                    gap: '6px',
                    marginBottom: '8px',
                  }}
                >
                  {[0, 10, 15, 20, 30, 50].map((pct) => {
                    const active = discountPct === pct && customDiscount === '';
                    return (
                      <button
                        key={pct}
                        type="button"
                        className="t-btn"
                        style={{
                          minHeight: '34px',
                          padding: '4px 6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: active ? 'rgba(253, 183, 64, 0.22)' : 'var(--surface-2)',
                          border: active ? '1px solid var(--ocre)' : '1px solid var(--line)',
                          color: 'var(--ocre)',
                        }}
                        onClick={() => {
                          setDiscountPct(pct);
                          setCustomDiscount('');
                        }}
                      >
                        {pct === 0 ? '0%' : `${pct}%`}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    Monto $:
                  </span>
                  <input
                    type="number"
                    min="0"
                    max={total}
                    placeholder="$ Monto a descontar"
                    className="t-input"
                    style={{ minHeight: '34px', fontSize: '13px' }}
                    value={customDiscount}
                    onChange={(e) => {
                      setCustomDiscount(e.target.value);
                      setDiscountPct(0);
                    }}
                  />
                </div>
              </div>
            )}

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
