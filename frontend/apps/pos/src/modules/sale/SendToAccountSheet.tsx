import { useMemo, useState } from 'react';
import { formatARS, type FloorTable } from '@pizzalog/shared';
import type { CartLine } from '@/modules/sale/hooks';
import { useAddRound, useFloor, useOpenSession, useOpenSessions } from '@/modules/salon/hooks';

/**
 * Envío "A la cuenta" (Diferir pago):
 * Permite mandar la comanda tanto a una cuenta de Salón (barra/mesa) como
 * abrir o sumar a una cuenta diferida de Llevar (🛍️) o Delivery (🛵) para cobrar después.
 */
export function SendToAccountSheet({
  lines,
  channel = 'here',
  isCashOpen = true,
  onDone,
  onClose,
}: {
  lines: CartLine[];
  channel?: 'here' | 'takeaway' | 'delivery';
  isCashOpen?: boolean;
  onDone: (accountName: string, placeLabel: string) => void;
  onClose: () => void;
}) {
  const floor = useFloor();
  const sessions = useOpenSessions();
  const open = useOpenSession();
  const addRound = useAddRound();

  const [newIn, setNewIn] = useState<FloorTable | null>(null);
  const [name, setName] = useState('');
  const [pax, setPax] = useState('');
  const [deferredName, setDeferredName] = useState('');
  const [deferredNote, setDeferredNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const busy = open.isPending || addRound.isPending;

  const places = useMemo(
    () => (floor.data ?? []).flatMap((a) => a.tables),
    [floor.data],
  );
  const bars = places.filter((t) => t.kind === 'bar');
  const allSessions = sessions.data ?? [];

  // Cuentas de Llevar / Delivery que no ocupan mesa física
  const deferredSessions = useMemo(
    () => allSessions.filter((s) => !s.table_ids || s.table_ids.length === 0),
    [allSessions],
  );

  function accountsOf(t: FloorTable) {
    return allSessions.filter((s) => (s.table_ids ?? []).includes(t.id));
  }

  function toRoundItems() {
    return lines.map((l) => ({
      product_id: l.product.id,
      qty: l.quantity,
      ...(l.variant ? { variant_id: l.variant.id } : {}),
      unit_price: l.unitPrice,
      name: l.label,
      ...(l.discountPct ? { discount_pct: l.discountPct } : {}),
    }));
  }

  async function sendToSession(sessionId: number, accountName: string, placeLabel: string) {
    setError(null);
    try {
      await addRound.mutateAsync({ sessionId, items: toRoundItems() });
      onDone(accountName, placeLabel);
    } catch {
      setError('No se pudo enviar la comanda');
    }
  }

  async function openDeferredAndSend(mode: 'takeaway' | 'delivery') {
    setError(null);
    const prefix = mode === 'delivery' ? '🛵 Delivery' : '🛍️ Llevar';
    const custom = deferredName.trim();
    const label = custom ? `${prefix}: ${custom}` : `${prefix} (${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })})`;
    try {
      const r = await open.mutateAsync({
        tableIds: [],
        label,
        note: deferredNote.trim() || undefined,
      });
      await addRound.mutateAsync({
        sessionId: r.session.id,
        items: toRoundItems(),
        note: deferredNote.trim() || undefined,
      });
      onDone(label, prefix);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la cuenta diferida');
    }
  }

  async function openAndSend() {
    if (!newIn) return;
    setError(null);
    try {
      const r = await open.mutateAsync({
        tableIds: [newIn.id],
        label: name.trim() || undefined,
        partySize: pax !== '' ? Number(pax) : undefined,
      });
      await addRound.mutateAsync({ sessionId: r.session.id, items: toRoundItems() });
      onDone(name.trim() || newIn.label, newIn.label);
    } catch {
      setError('No se pudo abrir la cuenta');
    }
  }

  return (
    <div className="overlay" onClick={() => !busy && onClose()}>
      <div className="sheet sheet--tall" onClick={(e) => e.stopPropagation()}>
        <h2 className="sheet__title">¿A qué cuenta va?</h2>

        {!isCashOpen && (
          <div
            style={{
              background: 'rgba(253, 183, 64, 0.14)',
              border: '1px solid var(--ocre)',
              borderRadius: '10px',
              padding: '10px 12px',
              marginBottom: '12px',
              fontSize: '13px',
              color: 'var(--ocre)',
            }}
          >
            ⚠️ <strong>Caja cerrada:</strong> La comanda se registrará igual y al cobrarse figurará como venta sin caja abierta.
          </div>
        )}

        {/* Bloque para diferir pago de Llevar o Delivery */}
        <div
          className="acct-group"
          style={{
            border: channel !== 'here' ? '1px solid var(--ocre)' : '1px solid var(--line)',
            borderRadius: '12px',
            padding: '12px',
            marginBottom: '14px',
            background: channel !== 'here' ? 'rgba(253, 183, 64, 0.06)' : 'var(--surface-2)',
          }}
        >
          <h3 className="acct-group__title" style={{ marginTop: 0 }}>
            {channel === 'delivery'
              ? '🛵 Diferir pago — Delivery'
              : channel === 'takeaway'
                ? '🛍️ Diferir pago — Para Llevar'
                : '🛍️ / 🛵 Cuentas Para Llevar o Delivery'}
          </h3>

          {deferredSessions.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>
                Sumar a un pedido pendiente existente:
              </div>
              {deferredSessions.map((s) => (
                <button
                  key={s.id}
                  className="bar-account"
                  disabled={busy}
                  onClick={() =>
                    void sendToSession(s.id, s.label || `Pedido #${s.id}`, s.label || 'Llevar/Delivery')
                  }
                >
                  <span className="bar-account__name">{s.label || `Pedido #${s.id}`}</span>
                  <span className="bar-account__total">{formatARS(s.subtotal ?? 0)}</span>
                </button>
              ))}
            </div>
          )}

          <div className="bar-new" style={{ marginTop: '6px' }}>
            <input
              className="t-input"
              placeholder={
                channel === 'delivery'
                  ? 'Cliente / Dirección (ej: Juan - Colón 450)'
                  : 'Nombre del cliente (ej: María - retira 21:30)'
              }
              value={deferredName}
              onChange={(e) => setDeferredName(e.target.value)}
            />
            <input
              className="t-input"
              placeholder="Nota / Teléfono (opcional)"
              value={deferredNote}
              onChange={(e) => setDeferredNote(e.target.value)}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                className={`t-btn ${channel === 'takeaway' ? 't-btn--primary' : 'method-btn'}`}
                disabled={busy}
                onClick={() => void openDeferredAndSend('takeaway')}
              >
                🛍️ Guardar Llevar
              </button>
              <button
                className={`t-btn ${channel === 'delivery' ? 't-btn--primary' : 'method-btn'}`}
                disabled={busy}
                onClick={() => void openDeferredAndSend('delivery')}
              >
                🛵 Guardar Delivery
              </button>
            </div>
          </div>
        </div>

        {/* Cuentas de Barras / Salón */}
        {floor.isLoading || sessions.isLoading ? (
          <p className="muted-text">Cargando salón…</p>
        ) : bars.length === 0 ? (
          <p className="muted-text">
            No hay barras cargadas en el salón.
          </p>
        ) : (
          bars.map((bar) => {
            const accounts = accountsOf(bar);
            return (
              <div key={bar.id} className="acct-group">
                <h3 className="acct-group__title">{bar.label}</h3>
                {accounts.map((s, i) => (
                  <button
                    key={s.id}
                    className="bar-account"
                    disabled={busy}
                    onClick={() => void sendToSession(s.id, s.label || `Cuenta ${i + 1}`, bar.label)}
                  >
                    <span className="bar-account__name">
                      {s.label || `Cuenta ${i + 1}`}
                      {s.party_size ? <em> · {s.party_size} pers.</em> : null}
                    </span>
                    <span className="bar-account__total">{formatARS(s.subtotal ?? 0)}</span>
                  </button>
                ))}
                {newIn?.id === bar.id ? (
                  <div className="bar-new">
                    <input
                      className="t-input"
                      placeholder="Nombre de la cuenta («Juan», «Pareja»…)"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoFocus
                    />
                    <input
                      className="t-input"
                      type="number"
                      min="1"
                      placeholder="¿Cuántas personas? (opcional)"
                      value={pax}
                      onChange={(e) => setPax(e.target.value)}
                    />
                    <button
                      className="t-btn t-btn--primary t-btn--block"
                      disabled={busy}
                      onClick={() => void openAndSend()}
                    >
                      {busy ? 'Enviando…' : 'Abrir cuenta y enviar'}
                    </button>
                  </div>
                ) : (
                  <button
                    className="acct-new-link"
                    disabled={busy}
                    onClick={() => {
                      setNewIn(bar);
                      setName('');
                      setPax('');
                    }}
                  >
                    + Nueva cuenta en {bar.label}
                  </button>
                )}
              </div>
            );
          })
        )}

        {error && <p className="t-error">{error}</p>}

        <button className="sheet__cancel" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
