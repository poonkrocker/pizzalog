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

export function CategoriesReportPage() {
  const api = useApi();
  const [from, setFrom] = useState(dateDaysAgo(29));
  const [to, setTo] = useState(dateNow());
  const [hourFrom, setHourFrom] = useState<number | undefined>(undefined);
  const [hourTo, setHourTo] = useState<number | undefined>(undefined);

  const query = { from, to, hour_from: hourFrom, hour_to: hourTo };

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', 'sales-by-category', query],
    queryFn: () => api.reports.salesByCategory(query),
  });

  const summary = data?.summary;
  const categories = data?.categories ?? [];

  const handleExport = () => {
    if (!categories.length) return;
    const headers = ['Categoría', 'Unidades vendidas', 'Ventas brutas', '% del total'];
    const rows = categories.map((c) => [c.category_name, c.units, c.gross_sales, `${c.share_pct}%`]);
    downloadCsv(`ventas_por_categoria_${from}_${to}`, headers, rows);
  };

  return (
    <section>
      <PageHeader
        eyebrow="Ventas"
        title="Ventas por categoría"
        description="Distribución de ventas por familias de productos y rubros."
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
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div style={card}>
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>Categorías con ventas</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{summary.categories_count}</div>
          </div>
          <div style={card}>
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>Total unidades vendidas</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{summary.total_units.toLocaleString('es-AR')}</div>
          </div>
          <div style={card}>
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>Ventas brutas totales</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--c-accent, #c7101b)' }}>
              {formatARS(summary.total_gross)}
            </div>
          </div>
        </div>
      )}

      {isLoading && <Loading message="Calculando ventas por categoría..." />}
      {error && (
        <div role="alert" style={{ ...card, color: '#b91c1c', marginBottom: '1rem' }}>
          No se pudieron cargar los datos del reporte.
        </div>
      )}

      <div style={card}>
        <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Desglose por categoría</h3>
        {categories.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', color: '#64748b' }}>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Categoría</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Unidades vendidas</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Ventas brutas</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>% del total</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.category_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.65rem 0.5rem', fontWeight: 600 }}>{c.category_name}</td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: 700 }}>
                      {c.units.toLocaleString('es-AR')}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: 700 }}>
                      {formatARS(c.gross_sales)}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', color: '#64748b' }}>
                      {c.share_pct}%
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
