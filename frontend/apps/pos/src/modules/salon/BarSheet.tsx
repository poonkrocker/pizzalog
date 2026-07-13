import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatARS, type FloorTable } from '@pizzalog/shared';
import { useOpenSession, useOpenSessions } from './hooks';

/**
 * Al tocar una barra se abre este panel: muestra las cuentas abiertas en esa
 * barra (cada una con su nombre y su total) y permite abrir una cuenta nueva.
 */
export function BarSheet({ table, onClose }: { table: FloorTable; onClose: () => void }) {
  const sessions = useOpenSessions();
  const open = useOpenSession();
  const navigate = useNavigate();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [pax, setPax] = useState('');
  const [error, setError] = useState<string | null>(null);

  const barSessions = (sessions.data ?? []).filter((s) =>
    (s.table_ids ?? []).includes(table.id),
  );

  async function openAccount() {
    setError(null);
    try {
      const r = await open.mutateAsync({
        tableIds: [table.id],
        label: name.trim() || undefined,
        partySize: pax !== '' ? Number(pax) : undefined,
      });
      navigate(`/salon/${r.session.id}`);
    } catch {
      setError('No se pudo abrir la cuenta');
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet sheet--tall" onClick={(e) => e.stopPropagation()}>
        <h2 className="sheet__title">{table.label}</h2>

        {sessions.isLoading ? (
          <p className="muted-text">Cargando cuentas…</p>
        ) : barSessions.length === 0 ? (
          <p className="muted-text">No hay cuentas abiertas en esta barra.</p>
        ) : (
          <div className="bar-accounts">
            {barSessions.map((s, i) => (
              <button
                key={s.id}
                className="bar-account"
                onClick={() => navigate(`/salon/${s.id}`)}
              >
                <span className="bar-account__name">
                  {s.label || `Cuenta ${i + 1}`}
                  {s.party_size ? (
                    <em> · {s.party_size} pers.</em>
                  ) : null}
                </span>
                <span className="bar-account__total">{formatARS(s.subtotal ?? 0)}</span>
              </button>
            ))}
          </div>
        )}

        {creating ? (
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
            {error && <p className="t-error">{error}</p>}
            <button
              className="t-btn t-btn--primary t-btn--block"
              disabled={open.isPending}
              onClick={() => void openAccount()}
            >
              {open.isPending ? 'Abriendo…' : 'Abrir cuenta'}
            </button>
          </div>
        ) : (
          <button
            className="t-btn t-btn--primary t-btn--block"
            onClick={() => setCreating(true)}
          >
            + Nueva cuenta
          </button>
        )}

        <button className="sheet__cancel" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
