import { useMemo, useState } from 'react';
import { formatARS, type FloorTable } from '@pizzalog/shared';
import type { CartLine } from '@/modules/sale/hooks';
import { useAddRound, useFloor, useOpenSession, useOpenSessions } from '@/modules/salon/hooks';

/**
 * Flujo "Acá": el pedido del mostrador se manda como comanda a una cuenta
 * del salón. Muestra las barras/mesas con sus cuentas abiertas y permite
 * abrir una cuenta nueva en una barra (con nombre y personas).
 */
export function SendToAccountSheet({
  lines,
  onDone,
  onClose,
}: {
  lines: CartLine[];
  onDone: (accountName: string, placeLabel: string) => void;
  onClose: () => void;
}) {
  const floor = useFloor();
  const sessions = useOpenSessions();
  const open = useOpenSession();
  const addRound = useAddRound();

  const [newIn, setNewIn] = useState<FloorTable | null>(null); // barra donde se abre cuenta nueva
  const [name, setName] = useState('');
  const [pax, setPax] = useState('');
  const [error, setError] = useState<string | null>(null);

  const busy = open.isPending || addRound.isPending;

  const places = useMemo(
    () => (floor.data ?? []).flatMap((a) => a.tables),
    [floor.data],
  );
  const bars = places.filter((t) => t.kind === 'bar');
  const allSessions = sessions.data ?? [];

  function accountsOf(t: FloorTable) {
    return allSessions.filter((s) => (s.table_ids ?? []).includes(t.id));
  }

  function toRoundItems() {
    return lines.map((l) => ({
      product_id: l.product.id,
      qty: l.quantity,
      ...(l.variant ? { variant_id: l.variant.id } : {}),
      ...(!l.variant && l.product.is_open_price === 1 ? { unit_price: l.unitPrice } : {}),
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

        {floor.isLoading || sessions.isLoading ? (
          <p className="muted-text">Cargando salón…</p>
        ) : bars.length === 0 ? (
          <p className="muted-text">
            No hay barras cargadas en el salón. Crealas desde el panel.
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
