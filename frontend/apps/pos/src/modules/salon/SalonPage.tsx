import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FloorTable } from '@pizzalog/shared';
import { useOnline } from '@/lib/network';
import { BarSheet } from './BarSheet';
import { useFloor, useOpenSession } from './hooks';

// Base del croquis (igual que el editor del panel). Las mesas se posicionan en
// porcentajes sobre esta base, así el plano escala fluido con el ancho.
const BASE_W = 960;
const BASE_H = 600;

export function SalonPage() {
  const floor = useFloor();
  const open = useOpenSession();
  const online = useOnline();
  const navigate = useNavigate();
  const [activeArea, setActiveArea] = useState<number | null>(null);
  const [barFor, setBarFor] = useState<FloorTable | null>(null);

  const areas = floor.data ?? [];

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
  if (floor.isLoading) return <div className="boot">Cargando salón…</div>;
  if (floor.isError) return <div className="boot">No se pudo cargar el salón.</div>;

  return (
    <div className="salon">
      <div className="cat-tabs">
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
          {area.tables.length === 0 && <p className="grid-empty">Este sector no tiene lugares cargados.</p>}
        </div>
      )}

      <div className="floor-legend">
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

      {barFor && <BarSheet table={barFor} onClose={() => setBarFor(null)} />}
    </div>
  );
}
