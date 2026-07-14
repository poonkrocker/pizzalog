import { useState } from 'react';
import { CartaError, createOrder, money } from '../lib/api';
import type { CartLine } from '../lib/cart';
import {
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  type CreateOrderResponse,
  type PaymentMethod,
} from '../types';

interface Props {
  slug: string;
  lines: CartLine[];
  total: number;
  /** false = el local está cerrado o dejó de aceptar pedidos online. */
  isOpen: boolean;
  onSetQty: (key: string, qty: number) => void;
  onClear: () => void;
  onClose: () => void;
}

/**
 * Carrito + checkout en un solo panel, en dos pasos.
 *
 * El WhatsApp se manda DESPUÉS de que el pedido quedó guardado: el link viene
 * del servidor (whatsapp_url), así que si el mensaje nunca se envía el local
 * igual ve el pedido en el panel. Al revés se perdían pedidos.
 */
export function CartPanel({
  slug,
  lines,
  total,
  isOpen,
  onSetQty,
  onClear,
  onClose,
}: Props) {
  const [step, setStep] = useState<'cart' | 'form'>('cart');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [payment, setPayment] = useState<PaymentMethod | ''>('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<CreateOrderResponse | null>(null);

  async function submit() {
    setError(null);
    if (!name.trim() || !phone.trim()) {
      setError('Necesitamos tu nombre y un teléfono para confirmarte el pedido.');
      return;
    }

    setSending(true);
    try {
      const res = await createOrder(slug, {
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        address: address.trim() || null,
        payment_method: payment || null,
        notes: notes.trim() || null,
        items: lines.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
          ...(l.variant_id !== undefined ? { variant_id: l.variant_id } : {}),
          ...(l.combo_selections ? { combo_selections: l.combo_selections } : {}),
        })),
      });
      setDone(res);
      onClear(); // el pedido ya está guardado en el local
    } catch (err) {
      setError(
        err instanceof CartaError ? err.message : 'No pudimos enviar el pedido. Probá de nuevo.',
      );
    } finally {
      setSending(false);
    }
  }

  // --- Pedido confirmado ---
  if (done) {
    return (
      <div className="veil" onClick={onClose} role="dialog" aria-modal="true">
        <article className="entry" onClick={(e) => e.stopPropagation()}>
          <header className="entry__bar">
            <span className="entry__bar-title">¡listo!</span>
            <button className="entry__close" onClick={onClose} aria-label="Cerrar">
              ✕
            </button>
          </header>
          <div className="entry__body">
            <p className="entry__price">pedido #{done.order.order_number}</p>
            <p className="entry__desc">
              Ya le llegó al local. Total: <b>{money(done.order.total)}</b> (sin el envío, que te
              confirman ellos).
            </p>
            {done.whatsapp_url && (
              <a
                className="addbar__btn addbar__btn--wa"
                href={done.whatsapp_url}
                target="_blank"
                rel="noreferrer"
              >
                avisar por WhatsApp
              </a>
            )}
            <button className="cart__clear" onClick={onClose}>
              volver a la carta
            </button>
          </div>
        </article>
      </div>
    );
  }

  return (
    <div className="veil" onClick={onClose} role="dialog" aria-modal="true">
      <article className="entry" onClick={(e) => e.stopPropagation()}>
        <header className="entry__bar">
          <span className="entry__bar-title">
            {step === 'cart' ? 'tu pedido' : 'tus datos'}
          </span>
          <button className="entry__close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div className="entry__body">
          {step === 'cart' && (
            <>
              {lines.length === 0 && <p className="entry__desc">Todavía no agregaste nada.</p>}

              {lines.map((l) => (
                <div key={l.key} className="cart__line">
                  <div className="cart__info">
                    <span className="cart__name">{l.name}</span>
                    {l.combo_labels && l.combo_labels.length > 0 && (
                      <span className="cart__combo">{l.combo_labels.join(' · ')}</span>
                    )}
                    <span className="cart__unit">{money(l.unit_price)} c/u</span>
                  </div>

                  <div className="stepper" role="group" aria-label={`Cantidad de ${l.name}`}>
                    <button onClick={() => onSetQty(l.key, l.quantity - 1)} aria-label="Menos">
                      −
                    </button>
                    <span className="stepper__n">{l.quantity}</span>
                    <button onClick={() => onSetQty(l.key, l.quantity + 1)} aria-label="Más">
                      +
                    </button>
                  </div>

                  <span className="cart__sum">{money(l.unit_price * l.quantity)}</span>
                </div>
              ))}

              {lines.length > 0 && (
                <>
                  <p className="cart__total">
                    total <b>{money(total)}</b>
                  </p>
                  <p className="cart__hint">El envío lo confirma el local al aceptar el pedido.</p>

                  {!isOpen && (
                    <p className="entry__unavailable">
                      Ahora está cerrado: no se puede pedir online. Mirá la carta tranquilo, tu
                      pedido queda guardado.
                    </p>
                  )}

                  <button
                    className="addbar__btn"
                    disabled={!isOpen}
                    onClick={() => setStep('form')}
                  >
                    continuar
                  </button>
                  <button className="cart__clear" onClick={onClear}>
                    vaciar carrito
                  </button>
                </>
              )}
            </>
          )}

          {step === 'form' && (
            <>
              <label className="fld">
                <span>Nombre</span>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>

              <label className="fld">
                <span>Teléfono</span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>

              <label className="fld">
                <span>Dirección (dejala vacía si retirás)</span>
                <input value={address} onChange={(e) => setAddress(e.target.value)} />
              </label>

              <label className="fld">
                <span>¿Cómo pagás?</span>
                <select
                  value={payment}
                  onChange={(e) => setPayment(e.target.value as PaymentMethod | '')}
                >
                  <option value="">Lo defino después</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_LABELS[m]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="fld">
                <span>Aclaraciones</span>
                <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>

              <p className="cart__total">
                total <b>{money(total)}</b>
              </p>

              {error && (
                <p className="entry__unavailable" role="alert">
                  {error}
                </p>
              )}

              <button className="addbar__btn" onClick={() => void submit()} disabled={sending}>
                {sending ? 'enviando…' : 'confirmar pedido'}
              </button>
              <button className="cart__clear" onClick={() => setStep('cart')}>
                volver
              </button>
            </>
          )}
        </div>
      </article>
    </div>
  );
}
