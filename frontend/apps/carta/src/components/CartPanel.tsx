import { useMemo, useState } from 'react';
import { CartaError, createOrder, money } from '../lib/api';
import type { CartLine } from '../lib/cart';
import {
  PAYMENT_LABELS,
  type BusinessProfile,
  type CreateOrderResponse,
  type Fulfillment,
  type PaymentMethod,
} from '../types';

interface Props {
  slug: string;
  business: BusinessProfile;
  lines: CartLine[];
  total: number;
  isOpen: boolean;
  onSetQty: (key: string, qty: number) => void;
  onClear: () => void;
  onClose: () => void;
}

const ORDER: PaymentMethod[] = ['cash', 'card', 'transfer', 'mp'];

/**
 * Carrito + checkout en UNA vista, al estilo de la web de Arrabbiata:
 *   - botones Retiro en local / Envío a domicilio (la dirección aparece
 *     solo con envío)
 *   - las formas de pago se filtran por lo que el negocio acepta en esa
 *     modalidad (pay_methods_pickup / pay_methods_delivery, del panel)
 *   - Transferencia muestra el alias/instrucciones del negocio
 *   - Tarjeta suma el recargo % y lo avisa (informativo por ahora)
 *
 * El WhatsApp se abre DESPUÉS de guardar: el link lo arma el servidor, así
 * que aunque el cliente no mande el mensaje el pedido ya quedó registrado.
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
  const [fulfillment, setFulfillment] = useState<Fulfillment>('pickup');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [payment, setPayment] = useState<PaymentMethod | ''>('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<CreateOrderResponse | null>(null);

  // Métodos válidos para la modalidad activa. Si el elegido deja de valer al
  // cambiar de modalidad, se limpia para forzar reelección.
  const methods = useMemo(() => {
    const allowed =
      fulfillment === 'delivery' ? business.pay_methods_delivery : business.pay_methods_pickup;
    const set = new Set(allowed);
    return ORDER.filter((m) => set.has(m));
  }, [fulfillment, business]);

  const paymentValid = payment !== '' && methods.includes(payment);
  const effectivePayment = paymentValid ? payment : '';

  const surchargePct = business.card_surcharge_pct ?? 0;
  const surcharge =
    effectivePayment === 'card' ? Math.round((total * surchargePct) / 100) : 0;
  const finalTotal = total + surcharge;

  function switchFulfillment(f: Fulfillment) {
    setFulfillment(f);
    setError(null);
    // Si el pago actual no existe en la nueva modalidad, lo reseteamos.
    const allowed = f === 'delivery' ? business.pay_methods_delivery : business.pay_methods_pickup;
    if (payment && !allowed.includes(payment)) setPayment('');
  }

  async function submit() {
    setError(null);
    if (!name.trim() || !phone.trim()) {
      setError('Necesitamos tu nombre y un teléfono para confirmarte el pedido.');
      return;
    }
    if (fulfillment === 'delivery' && !address.trim()) {
      setError('Para envío a domicilio, cargá la dirección.');
      return;
    }

    setSending(true);
    try {
      const res = await createOrder(slug, {
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        fulfillment,
        address: fulfillment === 'delivery' ? address.trim() : null,
        payment_method: effectivePayment || null,
        notes: notes.trim() || null,
        items: lines.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
          ...(l.variant_id !== undefined ? { variant_id: l.variant_id } : {}),
          ...(l.combo_selections ? { combo_selections: l.combo_selections } : {}),
        })),
      });
      setDone(res);
      onClear();
    } catch (err) {
      setError(
        err instanceof CartaError ? err.message : 'No pudimos enviar el pedido. Probá de nuevo.',
      );
    } finally {
      setSending(false);
    }
  }

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
              Ya le llegó al local. Total: <b>{money(done.order.total)}</b>
              {fulfillment === 'delivery' && ' (sin el envío, que te confirman ellos)'}.
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

                {/* Retiro / Envío */}
                <div className="ful-toggle" role="group" aria-label="Modalidad de entrega">
                  <button
                    type="button"
                    className={`ful-btn${fulfillment === 'pickup' ? ' ful-btn--on' : ''}`}
                    onClick={() => switchFulfillment('pickup')}
                  >
                    🏪 Retiro en local
                  </button>
                  <button
                    type="button"
                    className={`ful-btn${fulfillment === 'delivery' ? ' ful-btn--on' : ''}`}
                    onClick={() => switchFulfillment('delivery')}
                  >
                    🛵 Envío a domicilio
                  </button>
                </div>

                {fulfillment === 'delivery' && (
                  <label className="fld">
                    <span>Dirección de entrega</span>
                    <input value={address} onChange={(e) => setAddress(e.target.value)} />
                  </label>
                )}

                <label className="fld">
                  <span>Forma de pago</span>
                  <select
                    value={effectivePayment}
                    onChange={(e) => setPayment(e.target.value as PaymentMethod | '')}
                  >
                    <option value="">Elegí una opción</option>
                    {methods.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </label>

                {effectivePayment === 'transfer' && business.transfer_alias && (
                  <p className="pay-note pay-note--transfer">{business.transfer_alias}</p>
                )}

                {effectivePayment === 'card' && surchargePct > 0 && (
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
              {fulfillment === 'delivery' && (
                <p className="cart__hint">El envío lo confirma el local al aceptar el pedido.</p>
              )}

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
