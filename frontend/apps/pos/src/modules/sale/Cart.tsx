import { formatARS } from '@pizzalog/shared';
import type { CartLine } from './hooks';

interface Props {
  lines: CartLine[];
  total: number;
  onInc: (key: string) => void;
  onDec: (key: string) => void;
  onClear: () => void;
  checkoutLabel?: string;
  onCheckout: () => void;
}

export function Cart({ lines, total, onInc, onDec, onClear, checkoutLabel = 'Cobrar', onCheckout }: Props) {
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
                <span className="cart-line__sub">
                  {formatARS(l.unitPrice)} · {formatARS(l.unitPrice * l.quantity)}
                </span>
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
        <div className="cart__total">
          <span>Total</span>
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
    </div>
  );
}
