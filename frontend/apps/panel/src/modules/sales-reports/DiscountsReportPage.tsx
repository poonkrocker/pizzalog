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

export function DiscountsReportPage() {
  const api = useApi();
  const [from, setFrom] = useState(dateDaysAgo(29));
  const [to, setTo] = useState(dateNow());
  const [hourFrom, setHourFrom] = useState<number | undefined>(undefined);
  const [hourTo, setHourTo] = useState<number | undefined>(undefined);

  const query = { from, to, hour_from: hourFrom, hour_to: hourTo };

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', 'sales-discounts', query],
    queryFn: () => api.reports.discounts(query),
  });

  const summary = data?.summary;
  const sales = data?.sales ?? [];

  const handleExport = () => {
    if (!sales.length) return;
    const headers = ['Fecha y hora', 'Ticket #', 'Subtotal', 'Descuento', 'Total cobrado', '% Descuento', 'Medio de pago', 'Empleado / Cajero', 'Nota / Motivo'];
    const rows = sales.map((s) => [
      s.created_at,
      s.sale_number ?? s.id,
      s.subtotal,
      s.discount,
      s.total,
      `${s.discount_pct}%`,
      s.payment_method,
      s.user_name,
      s.note,
    ]);
    downloadCsv(`descuentos_aplicados_${from}_${to}`, headers, rows);
  };

  return (
    <section>
      <PageHeader
        eyebrow="Ventas"
        title="Descuentos aplicados"
        description="Listado de bonificaciones, cortesías y descuentos otorgados en tickets de venta."
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
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>Tickets con descuento</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>
              {summary.discounted_sales_count.toLocaleString('es-AR')}
            </div>
          </div>
          <div style={card}>
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>Total descontado / bonificado</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#dc2626' }}>
              {formatARS(summary.total_discounts)}
            </div>
          </div>
          <div style={card}>
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>Total cobrado en esos tickets</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>
              {formatARS(summary.total_net_discounted)}
            </div>
          </div>
          <div style={card}>
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>% Promedio de descuento</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>
              {summary.avg_discount_pct}%
            </div>
          </div>
        </div>
      )}

      {isLoading && <Loading message="Calculando descuentos aplicados..." />}
      {error && (
        <div role="alert" style={{ ...card, color: '#b91c1c', marginBottom: '1rem' }}>
          No se pudieron cargar los datos del reporte.
        </div>
      )}

      <div style={card}>
        <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Tickets con descuento otorgado</h3>
        {sales.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', color: '#64748b' }}>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Fecha</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Ticket</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Subtotal</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Descuento</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>% Desc.</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Total</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Atendido por</th>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Motivo / Nota</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.65rem 0.5rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {s.created_at.replace(' ', ' · ')}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', fontWeight: 700 }}>
                      #{s.sale_number ?? s.id}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right' }}>
                      {formatARS(s.subtotal)}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>
                      -{formatARS(s.discount)}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>
                      {s.discount_pct}%
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: 700 }}>
                      {formatARS(s.total)}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', color: '#475569' }}>
                      {s.user_name}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', color: '#64748b', fontSize: '.84rem' }}>
                      {s.note || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !isLoading && <p style={{ color: '#777' }}>No se registraron descuentos en este período.</p>
        )}
      </div>
    </section>
  );
}
