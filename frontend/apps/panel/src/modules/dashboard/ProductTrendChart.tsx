import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatARS, type ProductListItem, type ProductTrendsResponse } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';
import { Loading } from '@/ui';

const COLORS = ['#d73828', '#2563eb', '#16a34a', '#d97706'];

export function ProductTrendChart({ from, to }: { from: string; to: string }) {
  const api = useApi();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [granularity, setGranularity] = useState<'day' | 'week'>('day');
  const [hoveredPoint, setHoveredPoint] = useState<{ label: string; prodName: string; units: number; color: string; x: number; y: number } | null>(null);

  const productsQ = useQuery({
    queryKey: ['analytics', 'products-list'],
    queryFn: () => api.analytics.productsList().then((r) => r.products),
  });

  const trendsQ = useQuery({
    queryKey: ['analytics', 'product-trends', from, to, selectedIds, granularity],
    queryFn: () =>
      api.analytics.productTrends({
        from,
        to,
        product_ids: selectedIds.length ? selectedIds : undefined,
        granularity,
      }),
  });

  const trends = trendsQ.data;
  const series = trends?.series ?? [];
  const labels = trends?.labels ?? [];
  const allProducts = productsQ.data ?? [];

  // Si aún no se seleccionó ningún ID pero el backend devolvió los top 3, sincronizamos
  const activeSeries = series;

  const handleAddProduct = (id: number) => {
    if (!id || selectedIds.includes(id) || selectedIds.length >= 4) return;
    const next = selectedIds.length === 0 && series.length > 0
      ? [...series.map((s) => s.product_id), id].slice(0, 4)
      : [...selectedIds, id];
    setSelectedIds(next);
  };

  const handleRemoveProduct = (id: number) => {
    if (selectedIds.length === 0 && series.length > 0) {
      setSelectedIds(series.map((s) => s.product_id).filter((pid) => pid !== id));
    } else {
      setSelectedIds((prev) => prev.filter((pid) => pid !== id));
    }
  };

  // Cálculo de máximos y coordenadas para SVG
  const maxUnits = Math.max(1, ...activeSeries.flatMap((s) => s.data));
  const svgWidth = 800;
  const svgHeight = 240;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 35;
  const plotWidth = svgWidth - paddingLeft - paddingRight;
  const plotHeight = svgHeight - paddingTop - paddingBottom;

  const getX = (index: number) => {
    if (labels.length <= 1) return paddingLeft + plotWidth / 2;
    return paddingLeft + (index / (labels.length - 1)) * plotWidth;
  };

  const getY = (val: number) => {
    return paddingTop + plotHeight - (val / maxUnits) * plotHeight;
  };

  const availableToAdd = allProducts.filter(
    (p) => !activeSeries.some((s) => s.product_id === p.id),
  );

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.6rem',
          marginBottom: '0.85rem',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#64748b' }}>
            Comparando ({activeSeries.length}/4):
          </span>
          {activeSeries.map((s, idx) => {
            const color = COLORS[idx % COLORS.length] ?? '#d73828';
            return (
              <span
                key={s.product_id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0.3rem 0.6rem',
                  borderRadius: 16,
                  background: '#f1f5f9',
                  border: `1.5px solid ${color}`,
                  fontSize: '0.82rem',
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: color,
                    display: 'inline-block',
                  }}
                />
                {s.name}
                <button
                  type="button"
                  onClick={() => handleRemoveProduct(s.product_id)}
                  aria-label={`Quitar ${s.name}`}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#94a3b8',
                    fontWeight: 700,
                    padding: '0 2px',
                    fontSize: '0.9rem',
                    lineHeight: 1,
                  }}
                >
                  &times;
                </button>
              </span>
            );
          })}

          {activeSeries.length < 4 && (
            <select
              value=""
              onChange={(e) => {
                const id = Number(e.target.value);
                if (id) handleAddProduct(id);
              }}
              style={{
                padding: '0.35rem 0.6rem',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: '0.82rem',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              <option value="">+ Agregar producto a comparar...</option>
              {availableToAdd.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.category_name}) · {p.total_units_sold} u. vendidas
                </option>
              ))}
            </select>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.3rem' }}>
          <button
            type="button"
            onClick={() => setGranularity('day')}
            style={{
              padding: '0.35rem 0.65rem',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              background: granularity === 'day' ? '#334155' : '#fff',
              color: granularity === 'day' ? '#fff' : '#334155',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Día
          </button>
          <button
            type="button"
            onClick={() => setGranularity('week')}
            style={{
              padding: '0.35rem 0.65rem',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              background: granularity === 'week' ? '#334155' : '#fff',
              color: granularity === 'week' ? '#fff' : '#334155',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Semana
          </button>
        </div>
      </div>

      {trendsQ.isLoading && <Loading message="Graficando tendencia de productos..." />}
      {trendsQ.isError && (
        <p role="alert" style={{ color: '#b91c1c', fontSize: '0.85rem' }}>
          No se pudo cargar la tendencia de productos.
        </p>
      )}

      {labels.length > 0 && activeSeries.length > 0 ? (
        <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ width: '100%', minWidth: 500, height: 'auto', display: 'block' }}
          >
            {/* Gridlines horizontales */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const val = Math.round(maxUnits * ratio);
              const y = getY(maxUnits * ratio);
              return (
                <g key={ratio}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={svgWidth - paddingRight}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeDasharray={ratio > 0 && ratio < 1 ? '4 4' : undefined}
                  />
                  <text
                    x={paddingLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    fontSize="10"
                    fill="#94a3b8"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Labels de fechas eje X */}
            {labels.map((lbl, idx) => {
              const step = Math.max(1, Math.ceil(labels.length / 8));
              if (idx % step !== 0 && idx !== labels.length - 1) return null;
              const x = getX(idx);
              const shortLabel = lbl.slice(5); // MM-DD
              return (
                <text
                  key={lbl}
                  x={x}
                  y={svgHeight - 12}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#94a3b8"
                >
                  {shortLabel}
                </text>
              );
            })}

            {/* Líneas y puntos de cada producto */}
            {activeSeries.map((s, sIdx) => {
              const color = COLORS[sIdx % COLORS.length] ?? '#d73828';
              const pointsStr = s.data
                .map((val, idx) => `${getX(idx)},${getY(val)}`)
                .join(' ');

              return (
                <g key={s.product_id}>
                  <polyline
                    fill="none"
                    stroke={color}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={pointsStr}
                  />
                  {s.data.map((val, idx) => {
                    const x = getX(idx);
                    const y = getY(val);
                    return (
                      <circle
                        key={idx}
                        cx={x}
                        cy={y}
                        r="3.5"
                        fill="#fff"
                        stroke={color}
                        strokeWidth="2"
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() =>
                          setHoveredPoint({
                            label: labels[idx] ?? '',
                            prodName: s.name,
                            units: val,
                            color,
                            x,
                            y,
                          })
                        }
                        onMouseLeave={() => setHoveredPoint(null)}
                      />
                    );
                  })}
                </g>
              );
            })}
          </svg>

          {/* Tooltip interactivo flotante */}
          {hoveredPoint && (
            <div
              style={{
                position: 'absolute',
                left: `${(hoveredPoint.x / svgWidth) * 100}%`,
                top: `${(hoveredPoint.y / svgHeight) * 100}%`,
                transform: 'translate(-50%, -125%)',
                background: '#1e293b',
                color: '#fff',
                padding: '0.4rem 0.65rem',
                borderRadius: 6,
                fontSize: '0.78rem',
                pointerEvents: 'none',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.2)',
                whiteSpace: 'nowrap',
                zIndex: 10,
              }}
            >
              <div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{hoveredPoint.label}</div>
              <div style={{ fontWeight: 700, color: hoveredPoint.color }}>
                {hoveredPoint.prodName}
              </div>
              <div>{hoveredPoint.units} unidades vendidas</div>
            </div>
          )}
        </div>
      ) : (
        !trendsQ.isLoading && (
          <p style={{ color: '#777', fontSize: '0.86rem' }}>
            No hay unidades vendidas de los productos seleccionados en este período.
          </p>
        )
      )}

      {/* Resumen inferior por producto */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.6rem',
          marginTop: '0.85rem',
        }}
      >
        {activeSeries.map((s, idx) => {
          const color = COLORS[idx % COLORS.length] ?? '#d73828';
          return (
            <div
              key={s.product_id}
              style={{
                background: '#f8fafc',
                border: `1px solid ${color}`,
                borderRadius: 8,
                padding: '0.65rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: color,
                  }}
                />
                <strong style={{ fontSize: '0.88rem' }}>{s.name}</strong>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: 4 }}>
                {s.total_units.toLocaleString('es-AR')} u.
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Facturación: {formatARS(s.total_revenue)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
