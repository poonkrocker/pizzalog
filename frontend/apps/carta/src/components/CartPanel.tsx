import { useState } from 'react';
import { CartaError, createOrder, money } from '../lib/api';
import type { CartLine } from '../lib/cart';
import {
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  type BusinessProfile,
  type CreateOrderResponse,
  type PaymentMethod,
} from '../types';

interface Props {
  slug: string;
  business: BusinessProfile;
  lines: CartLine[];
  total: number;
  /** false = el local está cerrado o dejó de aceptar pedidos online. */
  isOpen: boolean;
  onSetQty: (key: string, qty: number) => void;
  onClear: () => void;
  onClose: () => void;
}

/**
 * Carrito + checkout en UNA sola vista (sin paso "continuar"): el cliente ve
 * de un vistazo los ítems, sus datos, la forma de pago y el total final.
 *
 * Dos reglas de pago que salen del panel (business.transfer_alias y
 * card_surcharge_pct):
 *   - Transferencia → muestra el alias/instrucciones debajo del selector.
 *   - Tarjeta       → suma el recargo % al total y lo avisa. Por ahora el
 *     recargo es informativo de cara al cliente: al backend viaja el precio
 *     de los productos, así que el total del panel puede diferir del que ve
 *     el cliente. (Si más adelante querés que quede registrado, se persiste.)
 *
 * El WhatsApp se abre DESPUÉS de guardar el pedido: el link lo arma el
 * servidor, así que aunque el cliente no mande el mensaje el pedido ya quedó.
 */
export function CartPanel({
  slug,
  business,
  lines,
  total,
  isOpen,
  onSetQty,
  onClear,
  onClose,
}: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [payment, setPayment] = useState<PaymentMethod | ''>('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<CreateOrderResponse | null>(null);

  const surchargePct = business.card_surcharge_pct ?? 0;
  const surcharge = payment === 'card' ? Math.round((total * surchargePct) / 100) : 0;
  const finalTotal = total + surcharge;

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

  const empty = lines.length === 0;

  return (
    <div className="veil" onClick={onClose} role="dialog" aria-modal="true">
      <article className="entry" onClick={(e) => e.stopPropagation()}>
        <header className="entry__bar">
          <span className="entry__bar-title">tu pedido</span>
          <button className="entry__close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div className="entry__body">
          {empty && <p className="entry__desc">Todavía no agregaste nada.</p>}

          {!empty && (
            <>
              {/* --- Ítems --- */}
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

              {/* --- Datos del cliente (todo a la vista) --- */}
              <div className="checkout">
                <label className="fld">
                  <span>Nombre para el pedido</span>
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
                  <span>Forma de pago</span>
                  <select
                    value={payment}
                    onChange={(e) => setPayment(e.target.value as PaymentMethod | '')}
                  >
                    <option value="">Elegí una opción</option>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Leyenda de transferencia: sale del panel (transfer_alias). */}
                {payment === 'transfer' && business.transfer_alias && (
                  <p className="pay-note pay-note--transfer">{business.transfer_alias}</p>
                )}

                {/* Aviso de recargo por tarjeta. */}
                {payment === 'card' && surchargePct > 0 && (
                  <p className="pay-note pay-note--card">
                    El pago con tarjeta tiene un recargo del {surchargePct}% ({money(surcharge)}), ya
                    sumado al total.
                  </p>
                )}

                <label className="fld">
                  <span>Aclaraciones</span>
                  <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </label>
              </div>

              {/* --- Totales --- */}
              {surcharge > 0 ? (
                <>
                  <p className="cart__subtotal">
                    subtotal <span>{money(total)}</span>
                  </p>
                  <p className="cart__subtotal">
                    recargo tarjeta ({surchargePct}%) <span>{money(surcharge)}</span>
                  </p>
                  <p className="cart__total">
                    total <b>{money(finalTotal)}</b>
                  </p>
                </>
              ) : (
                <p className="cart__total">
                  total <b>{money(total)}</b>
                </p>
              )}
              <p className="cart__hint">El envío lo confirma el local al aceptar el pedido.</p>

              {!isOpen && (
                <p className="entry__unavailable">
                  Ahora está cerrado: no se puede pedir online. Mirá la carta tranquilo, tu pedido
                  queda guardado.
                </p>
              )}

              {error && (
                <p className="entry__unavailable" role="alert">
                  {error}
                </p>
              )}

              <button
                className="addbar__btn"
                disabled={!isOpen || sending}
                onClick={() => void submit()}
              >
                {sending ? 'enviando…' : 'confirmar pedido'}
              </button>
              <button className="cart__clear" onClick={onClear}>
                vaciar carrito
              </button>
            </>
          )}
        </div>
      </article>
    </div>
  );
}
