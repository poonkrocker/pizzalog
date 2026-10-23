import { useMemo, useState } from 'react';
import { formatARS, type AnalyticsQuery } from '@pizzalog/shared';
import { useAuth } from '@/lib/auth';
import { Field, Input, Loading, PageHeader, Select } from '@/ui';
import {
  useAnalyticsIngredients,
  useAnalyticsSummary,
  useSalesOverTime,
  useTopProducts,
  useTopCategories,
  useWinningCombinations,
} from './hooks';
import { Link } from 'react-router-dom';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function firstOfMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function firstOfYearStr(): string {
  return `${new Date().getFullYear()}-01-01`;
}

type Preset = 'today' | '7days' | 'month' | 'year' | 'all' | 'custom';

function ingredientCategoryLabel(cat: string): { label: string; icon: string; bg: string } {
  switch (cat) {
    case 'queso': return { label: 'Queso', icon: '🧀', bg: '#fef3c7' };
    case 'vegetal': return { label: 'Vegetal', icon: '🥬', bg: '#dcfce7' };
    case 'fiambre': return { label: 'Fiambre', icon: '🥓', bg: '#fee2e2' };
    case 'salsa': return { label: 'Salsa', icon: '🥫', bg: '#ffedd5' };
    case 'fruta': return { label: 'Fruta', icon: '🍐', bg: '#fef9c3' };
    case 'condimento': return { label: 'Condimento', icon: '🌿', bg: '#e0e7ff' };
    case 'masa': return { label: 'Masa', icon: '🌾', bg: '#f3e8ff' };
    default: return { label: 'Insumo', icon: '🍴', bg: '#f3f4f6' };
  }
}

export function DashboardPage() {
  const { user } = useAuth();
  const [preset, setPreset] = useState<Preset>('7days');
  const [from, setFrom] = useState(daysAgoStr(6));
  const [to, setTo] = useState(todayStr());

  const handlePresetChange = (p: Preset) => {
    setPreset(p);
    if (p === 'today') {
      const t = todayStr();
      setFrom(t);
      setTo(t);
    } else if (p === '7days') {
      setFrom(daysAgoStr(6));
      setTo(todayStr());
    } else if (p === 'month') {
      setFrom(firstOfMonthStr());
      setTo(todayStr());
    } else if (p === 'year') {
      setFrom(firstOfYearStr());
      setTo(todayStr());
    } else if (p === 'all') {
      setFrom('2022-09-15');
      setTo(todayStr());
    }
  };

  const query: AnalyticsQuery = useMemo(() => ({ from, to }), [from, to]);

  const summary = useAnalyticsSummary(query);
  const topProducts = useTopProducts({ ...query, limit: 100 });
  const topCategories = useTopCategories({ ...query, limit: 10 });
  const salesOverTime = useSalesOverTime(query);
  const ingredientsQuery = useAnalyticsIngredients(query);
  const combinationsQuery = useWinningCombinations(query);

  const s = summary.data;
  const products = topProducts.data ?? [];
  const displayProducts = products.slice(0, 6);
  const pizzaProducts = products.filter((p) =>
    /pizza|pizzer/i.test(p.category_name ?? '') || /^pizza\s/i.test(p.name),
  ).slice(0, 6);
  const categories = topCategories.data ?? [];
  const points = salesOverTime.data ?? [];
  const ingredients = ingredientsQuery.data?.ingredients ?? [];
  const ingCategories = ingredientsQuery.data?.by_category ?? [];
  const productCombos = combinationsQuery.data?.product_combinations ?? [];

  // Agrupar serie temporal por mes si supera los 45 puntos (ej. año completo o histórico 2022–2026)
  const chartPoints = useMemo(() => {
    if (points.length <= 45) return points;
    const byMonth = new Map<string, { day: string; sales_count: number; revenue: number }>();
    for (const pt of points) {
      const ym = pt.day.slice(0, 7);
      const cur = byMonth.get(ym) ?? { day: ym, sales_count: 0, revenue: 0 };
      cur.sales_count += pt.sales_count;
      cur.revenue += pt.revenue;
      byMonth.set(ym, cur);
    }
    return Array.from(byMonth.values());
  }, [points]);

  // Calcular valor máximo para escalar el gráfico de barras
  const maxRevenue = useMemo(() => {
    return Math.max(...chartPoints.map((p) => p.revenue), 100);
  }, [chartPoints]);

  const maxIngredientUnits = useMemo(() => {
    return Math.max(...ingredients.map((i) => i.units), 1);
  }, [ingredients]);

  return (
    <section>
      <PageHeader
        eyebrow="Panel de Control"
        title={`¡Hola, ${user?.name ?? 'Admin'}!`}
        description={`Resumen operativo y métricas de rendimiento de ${user?.business_id === 1 ? 'Pizzería Arrabbiata' : 'Pizza Test'}.`}
      />

      {/* Accesos rápidos */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <Link
          to="/pedidos"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 1rem',
            background: 'var(--c-surface, #fff)',
            border: '1px solid var(--c-border, #ddd)',
            borderRadius: '6px',
            color: 'inherit',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '0.9rem',
          }}
        >
          🛵 Ver Pedidos Online
        </Link>
        <Link
          to="/caja"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 1rem',
            background: 'var(--c-surface, #fff)',
            border: '1px solid var(--c-border, #ddd)',
            borderRadius: '6px',
            color: 'inherit',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '0.9rem',
          }}
        >
          💰 Control de Caja
        </Link>
        <Link
          to="/productos"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 1rem',
            background: 'var(--c-surface, #fff)',
            border: '1px solid var(--c-border, #ddd)',
            borderRadius: '6px',
            color: 'inherit',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '0.9rem',
          }}
        >
          🍕 Catálogo & Variantes
        </Link>
        <Link
          to="/calculadora"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 1rem',
            background: 'var(--c-surface, #fff)',
            border: '1px solid var(--c-border, #ddd)',
            borderRadius: '6px',
            color: 'inherit',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '0.9rem',
          }}
        >
          🥣 Calculadora de Masas & Costos
        </Link>
      </div>

      {/* Barra de Filtro de Fechas */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--c-surface, #fff)',
          border: '1px solid var(--c-border, #ddd)',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            type="button"
            onClick={() => handlePresetChange('today')}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              border: 'none',
              background: preset === 'today' ? 'var(--c-accent, #e63946)' : '#f0f0f0',
              color: preset === 'today' ? '#fff' : '#333',
              fontWeight: preset === 'today' ? 700 : 400,
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange('7days')}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              border: 'none',
              background: preset === '7days' ? 'var(--c-accent, #e63946)' : '#f0f0f0',
              color: preset === '7days' ? '#fff' : '#333',
              fontWeight: preset === '7days' ? 700 : 400,
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Últimos 7 días
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange('month')}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              border: 'none',
              background: preset === 'month' ? 'var(--c-accent, #e63946)' : '#f0f0f0',
              color: preset === 'month' ? '#fff' : '#333',
              fontWeight: preset === 'month' ? 700 : 400,
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Este mes
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange('year')}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              border: 'none',
              background: preset === 'year' ? 'var(--c-accent, #e63946)' : '#f0f0f0',
              color: preset === 'year' ? '#fff' : '#333',
              fontWeight: preset === 'year' ? 700 : 400,
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Este año
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange('all')}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              border: 'none',
              background: preset === 'all' ? 'var(--c-accent, #e63946)' : '#f0f0f0',
              color: preset === 'all' ? '#fff' : '#333',
              fontWeight: preset === 'all' ? 700 : 400,
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Histórico (desde 2022)
          </button>
          <button
            type="button"
            onClick={() => setPreset('custom')}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              border: 'none',
              background: preset === 'custom' ? 'var(--c-accent, #e63946)' : '#f0f0f0',
              color: preset === 'custom' ? '#fff' : '#333',
              fontWeight: preset === 'custom' ? 700 : 400,
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Personalizado
          </button>
        </div>

        {preset === 'custom' && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span style={{ color: '#888' }}>a</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        )}
      </div>

      {summary.isLoading && <Loading message="Calculando métricas..." />}

      {s && (
        <>
          {/* Tarjetas KPI principales */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            <div
              style={{
                background: 'var(--c-surface, #fff)',
                border: '1px solid var(--c-border, #ddd)',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#666', textTransform: 'uppercase' }}>
                Facturación Neta
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--c-accent, #e63946)' }}>
                {formatARS(s.revenue)}
              </div>
            </div>

            <div
              style={{
                background: 'var(--c-surface, #fff)',
                border: '1px solid var(--c-border, #ddd)',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#666', textTransform: 'uppercase' }}>
                Ventas Concretadas
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{s.sales_count}</div>
            </div>

            <div
              style={{
                background: 'var(--c-surface, #fff)',
                border: '1px solid var(--c-border, #ddd)',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#666', textTransform: 'uppercase' }}>
                Ticket Promedio
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#2a9d8f' }}>
                {formatARS(s.avg_ticket)}
              </div>
            </div>

            <div
              style={{
                background: 'var(--c-surface, #fff)',
                border: '1px solid var(--c-border, #ddd)',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#666', textTransform: 'uppercase' }}>
                Pizzas / Unidades
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{s.units_sold}</div>
            </div>
          </div>

          {/* Gráfico y Distribución Local vs Delivery */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '1.5rem',
              marginBottom: '1.5rem',
            }}
          >
            {/* Gráfico de barras de ventas diarias */}
            <div
              style={{
                background: 'var(--c-surface, #fff)',
                border: '1px solid var(--c-border, #ddd)',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>
                {points.length > 45 ? 'Evolución Mensual de Facturación' : 'Evolución Diaria de Facturación'}
              </h3>

              {chartPoints.length === 0 ? (
                <p style={{ color: '#888', fontStyle: 'italic', fontSize: '0.9rem' }}>
                  Sin ventas registradas en el período.
                </p>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.35rem', height: '180px', paddingTop: '1rem', overflowX: 'auto' }}>
                  {chartPoints.map((pt) => {
                    const pct = Math.round((pt.revenue / maxRevenue) * 100);
                    const dayLabel = pt.day.length === 7 ? pt.day.slice(2) : pt.day.slice(5); // YY-MM o MM-DD
                    return (
                      <div
                        key={pt.day}
                        style={{
                          flex: '1 0 18px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          height: '100%',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <div
                          title={`${pt.day}: ${formatARS(pt.revenue)} (${pt.sales_count} ventas)`}
                          style={{
                            width: '100%',
                            maxWidth: '36px',
                            height: `${Math.max(pct, 4)}%`,
                            background: 'var(--c-accent, #e63946)',
                            borderRadius: '4px 4px 0 0',
                            transition: 'height 0.3s ease',
                          }}
                        />
                        <span style={{ fontSize: '0.7rem', color: '#777', marginTop: '0.4rem', whiteSpace: 'nowrap' }}>
                          {dayLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Comparación Local vs Delivery */}
            <div
              style={{
                background: 'var(--c-surface, #fff)',
                border: '1px solid var(--c-border, #ddd)',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>Canales: Salón vs Delivery</h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.9rem' }}>
                    <span>🍽️ Local / Salón / Mostrador ({s.local.sales_count} ventas)</span>
                    <strong>{formatARS(s.local.revenue)}</strong>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: '#eee', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${s.revenue > 0 ? (s.local.revenue / s.revenue) * 100 : 0}%`,
                        background: '#2a9d8f',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.9rem' }}>
                    <span>🛵 Delivery / Web / WhatsApp ({s.delivery.sales_count} ventas)</span>
                    <strong>{formatARS(s.delivery.revenue)}</strong>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: '#eee', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${s.revenue > 0 ? (s.delivery.revenue / s.revenue) * 100 : 0}%`,
                        background: 'var(--c-accent, #e63946)',
                      }}
                    />
                  </div>
                </div>

                {/* Lista por canal */}
                <div style={{ marginTop: '0.5rem', borderTop: '1px solid #eee', paddingTop: '0.75rem' }}>
                  <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                    Detalle por Canal:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
                    {s.by_channel.map((c) => (
                      <div key={c.channel} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0' }}>
                        <span style={{ textTransform: 'capitalize' }}>{c.channel}:</span>
                        <strong>{formatARS(c.revenue)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Top Pizzas / Productos */}
          <div
            style={{
              background: 'var(--c-surface, #fff)',
              border: '1px solid var(--c-border, #ddd)',
              borderRadius: '8px',
              padding: '1.25rem',
              marginBottom: '2rem',
            }}
          >
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>🏆 Lo Más Vendido en el Período</h3>

            {products.length === 0 ? (
              <p style={{ color: '#888', fontStyle: 'italic', fontSize: '0.9rem' }}>
                Sin productos vendidos en el período.
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                {displayProducts.map((p, idx) => (
                  <div
                    key={p.name + idx}
                    style={{
                      border: '1px solid #eee',
                      borderRadius: '6px',
                      padding: '0.75rem 1rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: idx === 0 ? '#fffdf0' : 'transparent',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.8rem', color: '#888', fontWeight: 700 }}>
                        #{idx + 1}
                      </div>
                      <strong style={{ fontSize: '0.95rem' }}>{p.name}</strong>
                      <div style={{ fontSize: '0.8rem', color: '#666' }}>{p.units} unidades</div>
                    </div>
                    <div style={{ textAlign: 'right', fontWeight: 700, color: 'var(--c-accent, #e63946)' }}>
                      {formatARS(p.revenue)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ranking específico de pizzas */}
          <div
            style={{
              background: 'var(--c-surface, #fff)',
              border: '1px solid var(--c-border, #ddd)',
              borderRadius: '8px',
              padding: '1.25rem',
              marginBottom: '2rem',
            }}
          >
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>🍕 Pizzas más vendidas</h3>
            {topProducts.isLoading ? (
              <p style={{ color: '#888', fontSize: '0.9rem' }}>Calculando ranking…</p>
            ) : pizzaProducts.length === 0 ? (
              <p style={{ color: '#888', fontStyle: 'italic', fontSize: '0.9rem' }}>
                No se identificaron pizzas por categoría o nombre en este período. Revisá que los productos estén asociados a una categoría de pizza.
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                {pizzaProducts.map((p, idx) => (
                  <div key={p.product_id ?? p.name} style={{ border: '1px solid #eee', borderRadius: '6px', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', background: idx === 0 ? '#fffdf0' : 'transparent' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#888', fontWeight: 700 }}>#{idx + 1}</div>
                      <strong style={{ fontSize: '0.9rem' }}>{p.name}</strong>
                      <div style={{ fontSize: '0.8rem', color: '#666' }}>{p.units} unidades</div>
                    </div>
                    <strong style={{ color: 'var(--c-accent, #e63946)', whiteSpace: 'nowrap' }}>{formatARS(p.revenue)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ranking por categoría para identificar, por ejemplo, el tipo de cerveza más vendido */}
          <div
            style={{
              background: 'var(--c-surface, #fff)',
              border: '1px solid var(--c-border, #ddd)',
              borderRadius: '8px',
              padding: '1.25rem',
              marginBottom: '2rem',
            }}
          >
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>🍺 Ventas por categoría</h3>
            {topCategories.isLoading ? (
              <p style={{ color: '#888', fontSize: '0.9rem' }}>Calculando categorías…</p>
            ) : categories.length === 0 ? (
              <p style={{ color: '#888', fontStyle: 'italic', fontSize: '0.9rem' }}>
                No hay categorías con ventas en el período seleccionado.
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                {categories.map((cat, idx) => (
                  <div
                    key={cat.category_id}
                    style={{
                      border: '1px solid #eee',
                      borderRadius: '6px',
                      padding: '0.75rem 1rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: idx === 0 ? '#fffdf0' : 'transparent',
                      gap: '1rem',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#888', fontWeight: 700 }}>#{idx + 1}</div>
                      <strong style={{ fontSize: '0.9rem' }}>{cat.category_name}</strong>
                      <div style={{ fontSize: '0.8rem', color: '#666' }}>{cat.sales_count} tickets</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800 }}>{cat.units} unid.</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--c-accent, #e63946)', fontWeight: 700 }}>
                        {formatARS(cat.revenue)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p style={{ color: '#888', fontSize: '0.78rem', margin: '0.85rem 0 0' }}>
              Los productos históricos sin vincular al catálogo aparecen como “Sin categoría”; así podés detectar qué nombres falta normalizar.
            </p>
          </div>

          {/* Sección de Ingredientes Más Vendidos y Combinaciones de Toppings */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
              gap: '1.5rem',
              marginBottom: '2rem',
            }}
          >
            {/* 1) Ingredientes Más Demandados */}
            <div
              style={{
                background: 'var(--c-surface, #fff)',
                border: '1px solid var(--c-border, #ddd)',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>🌱 Ingredientes Más Demandados</h3>
                <span style={{ fontSize: '0.8rem', color: '#777' }}>Popularidad en recetas</span>
              </div>

              {ingredients.length === 0 ? (
                <p style={{ color: '#888', fontStyle: 'italic', fontSize: '0.9rem' }}>
                  Sin datos de ingredientes registrados para el período seleccionado.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {ingredients.slice(0, 8).map((ing, idx) => {
                    const badge = ingredientCategoryLabel(ing.category);
                    const pct = Math.round((ing.units / maxIngredientUnits) * 100);
                    return (
                      <div key={ing.id || ing.name} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.88rem' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                            <span
                              style={{
                                fontSize: '0.72rem',
                                padding: '0.15rem 0.4rem',
                                borderRadius: '4px',
                                background: badge.bg,
                                fontWeight: 700,
                              }}
                            >
                              {badge.icon} {badge.label}
                            </span>
                            {ing.name}
                          </span>
                          <span style={{ color: '#555', fontWeight: 700 }}>
                            Índice {pct}/100 <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#888' }}>de interés</span>
                          </span>
                        </div>
                        <div style={{ width: '100%', height: '6px', background: '#f0f0f0', borderRadius: '3px', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${pct}%`,
                              background: '#2a9d8f',
                              borderRadius: '3px',
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>


          </div>

          {/* Sección de Combinaciones Ganadoras de Productos (Cross-Selling) */}
          <div
            style={{
              background: 'var(--c-surface, #fff)',
              border: '1px solid var(--c-border, #ddd)',
              borderRadius: '8px',
              padding: '1.25rem',
              marginBottom: '2rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>🤝 Parejas Ganadoras de Productos (Venta Cruzada)</h3>
                <span style={{ fontSize: '0.8rem', color: '#777' }}>
                  Productos que los clientes piden juntos con mayor frecuencia en el mismo ticket
                </span>
              </div>
              <span style={{ fontSize: '0.8rem', background: '#fff3cd', color: '#856404', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                Ideal para armar Promos y Combos
              </span>
            </div>

            {productCombos.length === 0 ? (
              <p style={{ color: '#888', fontStyle: 'italic', fontSize: '0.9rem' }}>
                Sin combinaciones de productos suficientes en el período analizado.
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
                {productCombos.slice(0, 6).map((pc, idx) => (
                  <div
                    key={`${pc.p1_id}-${pc.p2_id}`}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '0.85rem 1rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: idx === 0 ? '#f0fdf4' : '#ffffff',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#888', fontWeight: 700 }}>
                        {idx === 0 ? '⭐ Dúo #1' : `#${idx + 1}`}
                      </div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0.15rem 0' }}>
                        {pc.p1_name}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#4b5563' }}>
                        + {pc.p2_name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#2a9d8f', fontWeight: 600, marginTop: '0.2rem' }}>
                        Juntos en {pc.pair_orders} pedidos
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.75rem', color: '#666' }}>Facturado</div>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--c-accent, #e63946)' }}>
                        {formatARS(pc.total_revenue)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
