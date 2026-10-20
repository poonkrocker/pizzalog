import { useState } from 'react';
import { formatARS } from '@pizzalog/shared';
import type { CartLine } from './hooks';

interface Props {
  lines: CartLine[];
  subtotal: number;
  discount: number;
  total: number;
  onInc: (key: string) => void;
  onDec: (key: string) => void;
  onSetLineDiscount: (key: string, discountPct: number) => void;
  onSetGlobalDiscount: (discount: number) => void;
  onClear: () => void;
  checkoutLabel?: string;
  onCheckout: () => void;
}

export function Cart({
  lines,
  subtotal,
  discount,
  total,
  onInc,
  onDec,
  onSetLineDiscount,
  onSetGlobalDiscount,
  onClear,
  checkoutLabel = 'Cobrar',
  onCheckout,
}: Props) {
  const [discountLine, setDiscountLine] = useState<CartLine | null>(null);
  const [globalModalOpen, setGlobalModalOpen] = useState(false);
  const [customGlobalAmount, setCustomGlobalAmount] = useState('');

  function applyGlobalPct(pct: number) {
    if (pct === 0) {
      onSetGlobalDiscount(0);
    } else {
      onSetGlobalDiscount(Math.round((subtotal * pct) / 100));
    }
    setGlobalModalOpen(false);
  }

  function applyCustomGlobal() {
    const val = parseFloat(customGlobalAmount);
    if (!isNaN(val) && val >= 0) {
      onSetGlobalDiscount(Math.min(subtotal, val));
    }
    setCustomGlobalAmount('');
    setGlobalModalOpen(false);
  }

  return (
    <div className="cart">
      <div className="cart__head">
        <span>Pedido</span>
        {lines.length > 0 && (
          <button className="cart__clear" onClick={onClear}>
            Vaciar
          </button>
        )}
      </div>

      <div className="cart__lines">
        {lines.length === 0 ? (
          <p className="cart__empty">Tocá un producto para empezar.</p>
        ) : (
          lines.map((l) => (
            <div key={l.key} className="cart-line">
              <div className="cart-line__info">
                <span className="cart-line__name">{l.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="cart-line__sub">
                    {l.originalPrice && l.originalPrice !== l.unitPrice ? (
                      <>
                        <s style={{ opacity: 0.6 }}>{formatARS(l.originalPrice)}</s>{' '}
                        <b style={{ color: 'var(--ocre)' }}>{formatARS(l.unitPrice)}</b>
                      </>
                    ) : (
                      formatARS(l.unitPrice)
                    )}{' '}
                    · {formatARS(l.unitPrice * l.quantity)}
                  </span>
                  <button
                    type="button"
                    style={{
                      background: l.discountPct ? 'var(--red)' : 'var(--surface-2)',
                      border: '1px solid var(--line)',
                      borderRadius: '4px',
                      color: l.discountPct ? '#fff' : 'var(--muted)',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      cursor: 'pointer',
                    }}
                    onClick={() => setDiscountLine(l)}
                    title="Descuento en este ítem"
                  >
                    {l.discountPct ? `-${l.discountPct}%` : '%'}
                  </button>
                </div>
              </div>
              <div className="qty">
                <button className="qty__btn" onClick={() => onDec(l.key)} aria-label="Quitar uno">
                  −
                </button>
                <span className="qty__n">{l.quantity}</span>
                <button className="qty__btn" onClick={() => onInc(l.key)} aria-label="Agregar uno">
                  +
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="cart__foot">
        {discount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--muted)', marginBottom: '4px' }}>
            <span>Subtotal:</span>
            <span>{formatARS(subtotal)}</span>
          </div>
        )}
        {discount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#f0a59b', marginBottom: '6px' }}>
            <span>Descuento general:</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              −{formatARS(discount)}
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: '#f0a59b', cursor: 'pointer', fontSize: '14px', padding: 0 }}
                onClick={() => onSetGlobalDiscount(0)}
                title="Quitar descuento general"
              >
                ✕
              </button>
            </span>
          </div>
        )}

        <div className="cart__total">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Total</span>
            {lines.length > 0 && (
              <button
                type="button"
                style={{
                  background: discount > 0 ? 'var(--red)' : 'var(--surface-2)',
                  color: discount > 0 ? '#fff' : 'var(--muted)',
                  border: '1px solid var(--line)',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  cursor: 'pointer',
                }}
                onClick={() => setGlobalModalOpen(true)}
              >
                🏷️ Desc. general
              </button>
            )}
          </div>
          <strong>{formatARS(total)}</strong>
        </div>

        <button
          className="t-btn t-btn--primary t-btn--block cart__pay"
          disabled={lines.length === 0}
          onClick={onCheckout}
        >
          {checkoutLabel}
        </button>
      </div>

      {/* Modal Descuento por Ítem */}
      {discountLine && (
        <div className="overlay" onClick={() => setDiscountLine(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3 className="sheet__title">Descuento en ítem</h3>
            <p style={{ margin: '0 0 12px', fontSize: '15px', color: 'var(--cream)' }}>
              {discountLine.label} ({formatARS(discountLine.originalPrice ?? discountLine.unitPrice)})
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
              {[0, 10, 15, 20, 30, 50].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className="t-btn"
                  style={{
                    background: (discountLine.discountPct ?? 0) === pct ? 'var(--red)' : 'var(--surface-2)',
                    color: (discountLine.discountPct ?? 0) === pct ? '#fff' : 'var(--text)',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                  onClick={() => {
                    onSetLineDiscount(discountLine.key, pct);
                    setDiscountLine(null);
                  }}
                >
                  {pct === 0 ? 'Sin desc.' : `${pct}%`}
                </button>
              ))}
            </div>
            <button className="sheet__cancel" onClick={() => setDiscountLine(null)}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Modal Descuento General */}
      {globalModalOpen && (
        <div className="overlay" onClick={() => setGlobalModalOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3 className="sheet__title">Descuento a la venta</h3>
            <p style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--muted)' }}>
              Subtotal actual: <b>{formatARS(subtotal)}</b>
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
              {[0, 10, 15, 20, 30, 50].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className="t-btn"
                  style={{ fontSize: '14px', fontWeight: 600 }}
                  onClick={() => applyGlobalPct(pct)}
                >
                  {pct === 0 ? 'Quitar desc.' : `${pct}%`}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                type="number"
                min="0"
                max={subtotal}
                placeholder="Monto fijo en $"
                className="t-input"
                value={customGlobalAmount}
                onChange={(e) => setCustomGlobalAmount(e.target.value)}
              />
              <button
                type="button"
                className="t-btn t-btn--primary"
                onClick={applyCustomGlobal}
                disabled={!customGlobalAmount || parseFloat(customGlobalAmount) <= 0}
              >
                Aplicar $
              </button>
            </div>
            <button className="sheet__cancel" onClick={() => setGlobalModalOpen(false)}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
