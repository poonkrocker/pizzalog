import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatARS } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';
import { Loading, PageHeader } from '@/ui';
import {
  ReportFilterBar,
  dateDaysAgo,
  dateNow,
  downloadCsv,
} from './ReportFilterBar';

const card: React.CSSProperties = {
  background: 'var(--c-surface, #fff)',
  border: '1px solid var(--c-border, #ddd)',
  borderRadius: 10,
  padding: '1rem',
  minWidth: 0,
};

export function ItemsReportPage() {
  const api = useApi();
  const [from, setFrom] = useState(dateDaysAgo(29));
  const [to, setTo] = useState(dateNow());
  const [hourFrom, setHourFrom] = useState<number | undefined>(undefined);
  const [hourTo, setHourTo] = useState<number | undefined>(undefined);
  const [search, setSearch] = useState('');

  const query = {
    from,
    to,
    hour_from: hourFrom,
    hour_to: hourTo,
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', 'sales-by-item', query],
    queryFn: () => api.reports.salesByItem(query),
  });

  const summary = data?.summary;
  const allItems = data?.items ?? [];
  const filtered = search.trim()
    ? allItems.filter(
        (it) =>
          it.product_name.toLowerCase().includes(search.toLowerCase()) ||
          it.category_name.toLowerCase().includes(search.toLowerCase()),
      )
    : allItems;

  const handleExport = () => {
    if (!filtered.length) return;
    const headers = ['Artículo', 'Categoría', 'Unidades', 'Ventas brutas', 'Costo estimado', 'Margen %', '% del total'];
    const rows = filtered.map((it) => [
      it.product_name,
      it.category_name,
      it.units,
      it.gross_sales,
      it.cost,
      it.margin_pct !== null ? `${it.margin_pct}%` : '',
      `${it.share_pct}%`,
    ]);
    downloadCsv(`ventas_por_articulo_${from}_${to}`, headers, rows);
  };

  return (
    <section>
      <PageHeader
        eyebrow="Ventas"
        title="Ventas por artículo"
        description="Rendimiento detallado de cada producto vendido en el período (estilo Loyverse)."
      />

      <ReportFilterBar
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        hourFrom={hourFrom}
        hourTo={hourTo}
        onHourChange={(hf, ht) => {
          setHourFrom(hf);
          setHourTo(ht);
        }}
        onExportCsv={handleExport}
        isLoading={isLoading}
      />

      {summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div style={card}>
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>Artículos distintos</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{summary.items_count}</div>
          </div>
          <div style={card}>
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>Total unidades vendidas</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{summary.total_units.toLocaleString('es-AR')}</div>
          </div>
          <div style={card}>
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>Ventas netas totales</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--c-accent, #c7101b)' }}>
              {formatARS(summary.total_gross)}
            </div>
          </div>
          <div style={card}>
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>Margen promedio catálogo</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>
              {summary.margin_pct !== null ? `${summary.margin_pct}%` : '—'}
            </div>
          </div>
        </div>
      )}

      {isLoading && <Loading message="Calculando ventas por artículo..." />}
      {error && (
        <div role="alert" style={{ ...card, color: '#b91c1c', marginBottom: '1rem' }}>
          No se pudieron cargar los datos del reporte.
        </div>
      )}

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ margin: 0 }}>Listado de productos</h3>
          <input
            type="search"
            placeholder="Buscar por nombre o categoría..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: '0.45rem 0.65rem',
              borderRadius: 6,
              border: '1px solid #ccc',
              fontSize: '0.86rem',
              minWidth: 240,
            }}
          />
        </div>

        {filtered.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', color: '#64748b' }}>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Artículo</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Categoría</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Unidades</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Ventas brutas</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Costo est.</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Margen %</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>% Total</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 600 }}>{it.product_name}</td>
                    <td style={{ padding: '0.6rem 0.5rem', color: '#64748b' }}>{it.category_name}</td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: 700 }}>
                      {it.units.toLocaleString('es-AR')}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: 700 }}>
                      {formatARS(it.gross_sales)}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', color: '#64748b' }}>
                      {it.cost > 0 ? formatARS(it.cost) : '—'}
                    </td>
                    <td
                      style={{
                        padding: '0.6rem 0.5rem',
                        textAlign: 'right',
                        fontWeight: 600,
                        color:
                          it.margin_pct === null
                            ? '#777'
                            : it.margin_pct >= 60
                            ? '#16a34a'
                            : it.margin_pct >= 40
                            ? '#ca8a04'
                            : '#dc2626',
                      }}
                    >
                      {it.margin_pct !== null ? `${it.margin_pct}%` : '—'}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', color: '#64748b' }}>
                      {it.share_pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !isLoading && <p style={{ color: '#777' }}>No hay ventas registradas para este período y filtro.</p>
        )}
      </div>
    </section>
  );
}
