import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatARS, type FloorTable } from '@pizzalog/shared';
import { useOnline } from '@/lib/network';
import { BarSheet } from './BarSheet';
import { useFloor, useOpenSession, useOpenSessions } from './hooks';

// Base del croquis (igual que el editor del panel). Las mesas se posicionan en
// porcentajes sobre esta base, así el plano escala fluido con el ancho.
const BASE_W = 960;
const BASE_H = 600;

export function SalonPage() {
  const floor = useFloor();
  const open = useOpenSession();
  const openSessions = useOpenSessions();
  const online = useOnline();
  const navigate = useNavigate();

  const [activeArea, setActiveArea] = useState<number | null>(null);
  const [barFor, setBarFor] = useState<FloorTable | null>(null);
  const [filterQuery, setFilterQuery] = useState('');

  const areas = floor.data ?? [];
  const allAccounts = openSessions.data ?? [];

  useEffect(() => {
    if (activeArea === null && areas.length > 0) {
      const first = areas[0];
      if (first) setActiveArea(first.id);
    }
  }, [areas, activeArea]);

  const area = areas.find((a) => a.id === activeArea) ?? null;

  async function tapTable(t: FloorTable) {
    if (t.kind === 'bar') {
      // Una barra tiene varias cuentas: se elige o se abre desde su panel.
      setBarFor(t);
      return;
    }
    if (t.status === 'occupied' && t.session_id) {
      navigate(`/salon/${t.session_id}`);
      return;
    }
    const r = await open.mutateAsync({ tableIds: [t.id] });
    navigate(`/salon/${r.session.id}`);
  }

  if (!online) return <div className="boot">El salón necesita conexión.</div>;
  if (floor.isLoading && openSessions.isLoading) return <div className="boot">Cargando cuentas…</div>;

  const filteredAccounts = filterQuery.trim()
    ? allAccounts.filter((s) => {
        const q = filterQuery.toLowerCase();
        const label = (s.label || '').toLowerCase();
        const tables = (s.tables_label || '').toLowerCase();
        const idStr = String(s.id);
        return label.includes(q) || tables.includes(q) || idStr.includes(q);
      })
    : allAccounts;

  const totalOpenSum = allAccounts.reduce((sum, s) => sum + (s.subtotal ?? 0), 0);

  return (
    <div className="salon" style={{ overflowY: 'auto' }}>
      {/* SECCIÓN SUPERIOR: LISTA DE CUENTAS ABIERTAS */}
      <section
        style={{
          padding: '16px 18px',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 800,
                margin: 0,
                color: 'var(--cream, #fff)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>📋 Cuentas Abiertas</span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: 'rgba(253, 183, 64, 0.18)',
                  color: 'var(--ocre, #fdb740)',
                }}
              >
                {allAccounts.length}
              </span>
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--muted)' }}>
              Total abierto en curso: <strong style={{ color: 'var(--ocre)' }}>{formatARS(totalOpenSum)}</strong>
            </p>
          </div>

          {allAccounts.length > 4 && (
            <input
              type="text"
              placeholder="Buscar cuenta..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 13,
                color: 'var(--text)',
                width: '140px',
              }}
            />
          )}
        </div>

        {allAccounts.length === 0 ? (
          <div
            style={{
              padding: '20px',
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: 14,
              background: 'var(--surface-2)',
              borderRadius: 12,
              border: '1px dashed var(--line)',
            }}
          >
            No hay cuentas abiertas en este momento. Tocá una mesa abajo para abrir la primera.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
              gap: 10,
              maxHeight: '260px',
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {filteredAccounts.map((s) => {
              const accountName = s.label
                ? s.label
                : s.tables_label
                  ? `Mesa ${s.tables_label}`
                  : `Cuenta #${s.id}`;
              const isBillReq = s.status === 'bill_requested';

              return (
                <div
                  key={s.id}
                  onClick={() => navigate(`/salon/${s.id}`)}
                  style={{
                    cursor: 'pointer',
                    background: isBillReq ? 'rgba(253, 183, 64, 0.14)' : 'var(--surface-2)',
                    border: `1px solid ${isBillReq ? 'var(--ocre)' : 'var(--line)'}`,
                    borderRadius: 12,
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 8,
                    transition: 'transform 0.1s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <strong
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          color: 'var(--text)',
                          display: 'block',
                          wordBreak: 'break-word',
                        }}
                      >
                        {accountName}
                      </strong>
                      <small style={{ color: 'var(--muted)', fontSize: 12 }}>
                        {s.tables_label && s.label ? `Mesa ${s.tables_label} · ` : ''}
                        {s.opened_at
                          ? new Date(s.opened_at.replace(' ', 'T')).toLocaleTimeString('es-AR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </small>
                    </div>

                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 6,
                        textTransform: 'uppercase',
                        background: isBillReq ? 'var(--ocre)' : 'rgba(108, 192, 112, 0.2)',
                        color: isBillReq ? '#000' : 'var(--success)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isBillReq ? 'Pedida' : 'Abierta'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Subtotal:</span>
                    <strong style={{ fontSize: 17, color: 'var(--ocre)' }}>
                      {formatARS(s.subtotal ?? 0)}
                    </strong>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECCIÓN INFERIOR: CROQUIS DEL SALÓN Y MESAS */}
      <section style={{ padding: '14px 16px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <h2
            style={{
              fontSize: 15,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: 'var(--muted)',
              letterSpacing: '0.5px',
              margin: 0,
            }}
          >
            Croquis del Salón y Mesas
          </h2>
        </div>

        <div className="cat-tabs" style={{ marginBottom: 12 }}>
          {areas.map((a) => (
            <button
              key={a.id}
              className={`cat-tab${a.id === activeArea ? ' cat-tab--active' : ''}`}
              onClick={() => setActiveArea(a.id)}
            >
              {a.name}
            </button>
          ))}
        </div>

        {area && (
          <div className="floor-view">
            {area.tables.map((t) => (
              <button
                key={t.id}
                className={`floor-table floor-table--${t.status}${t.shape === 'round' ? ' is-round' : ''}`}
                style={{
                  left: `${(t.pos_x / BASE_W) * 100}%`,
                  top: `${(t.pos_y / BASE_H) * 100}%`,
                  width: `${(t.width / BASE_W) * 100}%`,
                  height: `${(t.height / BASE_H) * 100}%`,
                }}
                disabled={open.isPending}
                onClick={() => void tapTable(t)}
              >
                <span className="floor-table__label">{t.label}</span>
                {t.kind === 'bar' && t.open_count > 0 && (
                  <span className="floor-table__count">{t.open_count}</span>
                )}
              </button>
            ))}
            {area.tables.length === 0 && (
              <p className="grid-empty">Este sector no tiene lugares cargados.</p>
            )}
          </div>
        )}

        <div className="floor-legend" style={{ marginTop: 12 }}>
          <span>
            <i className="dot dot--free" />
            Libre
          </span>
          <span>
            <i className="dot dot--occupied" />
            Ocupada
          </span>
          <span>
            <i className="dot dot--bar" />
            Barra
          </span>
        </div>
      </section>

      {barFor && <BarSheet table={barFor} onClose={() => setBarFor(null)} />}
    </div>
  );
}
