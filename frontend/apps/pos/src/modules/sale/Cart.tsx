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
  onSetLineDiscount: (key: string, discountPct: number, fixedAmount?: number) => void;
  onSetGlobalDiscount: (discount: number) => void;
  onAddExtra?: (key: string) => void;
  onClear: () => void;
  checkoutLabel?: string;
  onCheckout: () => void;
  deferLabel?: string;
  onDefer?: () => void;
  primaryAction?: 'checkout' | 'defer';
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
  onAddExtra,
  onClear,
  checkoutLabel = 'Cobrar',
  onCheckout,
  deferLabel = 'A la cuenta',
  onDefer,
  primaryAction = 'checkout',
}: Props) {
  const [discountLine, setDiscountLine] = useState<CartLine | null>(null);
  const [customLineAmount, setCustomLineAmount] = useState('');
  const [globalModalOpen, setGlobalModalOpen] = useState(false);
  const [expandedOnMobile, setExpandedOnMobile] = useState(false);
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

  function applyCustomLine() {
    if (!discountLine) return;
    const val = parseFloat(customLineAmount);
    if (!isNaN(val) && val >= 0) {
      onSetLineDiscount(discountLine.key, 0, val);
    }
    setCustomLineAmount('');
    setDiscountLine(null);
  }

  return (
    <div className={`cart${expandedOnMobile ? ' cart--expanded' : ' cart--collapsed'}${lines.length === 0 ? ' cart--empty' : ''}`}>
      <div className="cart__head">
        <span className="cart__desktop-title">Pedido</span>
        <button
          type="button"
          className="cart__toggle"
          aria-expanded={expandedOnMobile}
          onClick={() => setExpandedOnMobile((value) => !value)}
        >
          <span className="cart__toggle-title">Pedido <small>{lines.reduce((count, line) => count + line.quantity, 0)}</small></span>
          <strong className="cart__toggle-total">{formatARS(total)}</strong>
          <span className="cart__toggle-action">{expandedOnMobile ? 'Ocultar' : 'Ver pedido'} <span aria-hidden="true">{expandedOnMobile ? '⌄' : '⌃'}</span></span>
        </button>
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
                      background: l.discountPct ? 'rgba(253, 183, 64, 0.16)' : 'transparent',
                      border: l.discountPct ? '1px solid rgba(253, 183, 64, 0.5)' : 'none',
                      borderRadius: '4px',
                      color: l.discountPct ? 'var(--ocre)' : 'var(--muted)',
                      fontSize: '11px',
                      fontWeight: l.discountPct ? 700 : 500,
                      padding: l.discountPct ? '1px 5px' : '1px 4px',
                      opacity: l.discountPct ? 1 : 0.65,
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      setCustomLineAmount('');
                      setDiscountLine(l);
                    }}
                    title="Descuento en este producto"
                  >
                    {l.discountPct ? `-${l.discountPct}%` : '%'}
                  </button>
                  {onAddExtra && (
                    <button
                      type="button"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        color: 'var(--ocre)',
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '1px 4px',
                        opacity: 0.85,
                        cursor: 'pointer',
                      }}
                      onClick={() => onAddExtra(l.key)}
                      title="Agregar extra a esta pizza"
                    >
                      +extra
                    </button>
                  )}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--ocre)', marginBottom: '6px' }}>
            <span>Descuento general:</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              −{formatARS(discount)}
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--ocre)', cursor: 'pointer', fontSize: '14px', padding: 0 }}
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
                  background: 'none',
                  color: discount > 0 ? 'var(--ocre)' : 'var(--muted)',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 500,
                  padding: '2px 4px',
                  opacity: discount > 0 ? 1 : 0.7,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: '2px',
                }}
                onClick={() => setGlobalModalOpen(true)}
              >
                {discount > 0 ? 'editar desc.' : '+ desc.'}
              </button>
            )}
          </div>
          <strong>{formatARS(total)}</strong>
        </div>

        {onDefer ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              className={`t-btn ${primaryAction === 'defer' ? 't-btn--primary' : 'method-btn'} cart__pay`}
              disabled={lines.length === 0}
              onClick={onDefer}
            >
              {deferLabel}
            </button>
            <button
              className={`t-btn ${primaryAction === 'checkout' ? 't-btn--primary' : 'method-btn'} cart__pay`}
              disabled={lines.length === 0}
              onClick={onCheckout}
            >
              {checkoutLabel}
            </button>
          </div>
        ) : (
          <button
            className="t-btn t-btn--primary t-btn--block cart__pay"
            disabled={lines.length === 0}
            onClick={onCheckout}
          >
            {checkoutLabel}
          </button>
        )}
      </div>

      {/* Modal Descuento por Ítem */}
      {discountLine && (
        <div className="overlay" onClick={() => setDiscountLine(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3 className="sheet__title">Descuento en producto</h3>
            <p style={{ margin: '0 0 12px', fontSize: '15px', color: 'var(--cream)' }}>
              {discountLine.label} (<b style={{ color: 'var(--ocre)' }}>{formatARS(discountLine.originalPrice ?? discountLine.unitPrice)}</b>)
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
              {[0, 10, 15, 20, 30, 50].map((pct) => {
                const active = (discountLine.discountPct ?? 0) === pct;
                return (
                  <button
                    key={pct}
                    type="button"
                    className="t-btn"
                    style={{
                      background: active ? 'rgba(253, 183, 64, 0.22)' : 'var(--surface-2)',
                      border: active ? '2px solid var(--ocre)' : '1px solid var(--line)',
                      color: 'var(--ocre)',
                      fontSize: '15px',
                      fontWeight: 700,
                    }}
                    onClick={() => {
                      onSetLineDiscount(discountLine.key, pct);
                      setDiscountLine(null);
                    }}
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
                max={discountLine.originalPrice ?? discountLine.unitPrice}
                placeholder="O descontar monto $ por unidad"
                className="t-input"
                value={customLineAmount}
                onChange={(e) => setCustomLineAmount(e.target.value)}
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
                onClick={applyCustomLine}
                disabled={!customLineAmount || parseFloat(customLineAmount) <= 0}
              >
                Aplicar $
              </button>
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
              Subtotal actual: <b style={{ color: 'var(--ocre)' }}>{formatARS(subtotal)}</b>
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
              {[0, 10, 15, 20, 30, 50].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className="t-btn"
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--line)',
                    color: 'var(--ocre)',
                    fontSize: '15px',
                    fontWeight: 700,
                  }}
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
                className="t-btn"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--ocre)',
                  color: 'var(--ocre)',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
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
