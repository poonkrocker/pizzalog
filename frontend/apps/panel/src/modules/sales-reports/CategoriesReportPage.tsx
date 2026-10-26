import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatARS } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';
import { Loading, PageHeader, Select } from '@/ui';
import { useCategories } from '../categories/hooks';
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
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>(undefined);

  const { data: catList = [] } = useCategories();

  const query = {
    from,
    to,
    hour_from: hourFrom,
    hour_to: hourTo,
    category_id: selectedCategoryId,
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', 'sales-by-category', query],
    queryFn: () => api.reports.salesByCategory(query),
  });

  const summary = data?.summary;
  const categories = data?.categories ?? [];
  const categoryItems = data?.items ?? [];

  const handleExport = () => {
    if (selectedCategoryId !== undefined && categoryItems.length > 0) {
      const selectedCatName = catList.find((c) => c.id === selectedCategoryId)?.name || 'categoria';
      const headers = ['Artículo', 'Unidades vendidas', 'Ventas brutas', '% de la categoría'];
      const rows = categoryItems.map((it) => [it.product_name, it.units, it.gross_sales, `${it.share_pct}%`]);
      downloadCsv(`ventas_${selectedCatName}_${from}_${to}`, headers, rows);
      return;
    }

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

      {/* Selector de categoría */}
      <div
        style={{
          ...card,
          marginBottom: '1rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'flex-end',
        }}
      >
        <div style={{ flex: '1 1 260px', minWidth: 220 }}>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#475569', marginBottom: '0.35rem' }}>
            Filtrar por categoría
          </label>
          <Select
            value={selectedCategoryId !== undefined ? String(selectedCategoryId) : ''}
            onChange={(e) => {
              const val = e.target.value ? Number(e.target.value) : undefined;
              setSelectedCategoryId(val);
            }}
          >
            <option value="">Todas las categorías</option>
            {catList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        {selectedCategoryId !== undefined && (
          <button
            type="button"
            onClick={() => setSelectedCategoryId(undefined)}
            style={{
              padding: '0.5rem 0.85rem',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#475569',
              fontSize: '0.84rem',
              cursor: 'pointer',
              height: '38px',
            }}
          >
            Ver todas las categorías
          </button>
        )}
      </div>

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
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>
              {selectedCategoryId !== undefined ? 'Categoría' : 'Categorías con ventas'}
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>
              {selectedCategoryId !== undefined
                ? categories[0]?.category_name ?? 'Seleccionada'
                : summary.categories_count}
            </div>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>
            {selectedCategoryId !== undefined
              ? `Detalle de la categoría: ${categories[0]?.category_name ?? ''}`
              : 'Desglose por categoría'}
          </h3>
          {selectedCategoryId !== undefined && (
            <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
              Mostrando productos de la categoría seleccionada
            </span>
          )}
        </div>

        {selectedCategoryId === undefined ? (
          categories.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', color: '#64748b' }}>
                    <th style={{ padding: '0.6rem 0.5rem' }}>Categoría</th>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Unidades vendidas</th>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Ventas brutas</th>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>% del total</th>
                    <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr
                      key={c.category_id}
                      style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                      onClick={() => c.category_id > 0 && setSelectedCategoryId(c.category_id)}
                      title="Click para ver artículos de esta categoría"
                    >
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
                      <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center' }}>
                        {c.category_id > 0 ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCategoryId(c.category_id);
                            }}
                            style={{
                              padding: '0.25rem 0.55rem',
                              borderRadius: 4,
                              border: '1px solid #cbd5e1',
                              background: '#f8fafc',
                              fontSize: '0.78rem',
                              cursor: 'pointer',
                            }}
                          >
                            Ver artículos &rarr;
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !isLoading && <p style={{ color: '#777' }}>No hay ventas registradas para este período y filtro.</p>
          )
        ) : (
          <div>
            {categoryItems.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', color: '#64748b' }}>
                      <th style={{ padding: '0.6rem 0.5rem' }}>Artículo</th>
                      <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Unidades vendidas</th>
                      <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Ventas brutas</th>
                      <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>% de la categoría</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryItems.map((it) => (
                      <tr key={it.product_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.6rem 0.5rem', fontWeight: 600 }}>{it.product_name}</td>
                        <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: 700 }}>
                          {it.units.toLocaleString('es-AR')}
                        </td>
                        <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: 700 }}>
                          {formatARS(it.gross_sales)}
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
              !isLoading && <p style={{ color: '#777' }}>No hay artículos vendidos en esta categoría durante el período.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
