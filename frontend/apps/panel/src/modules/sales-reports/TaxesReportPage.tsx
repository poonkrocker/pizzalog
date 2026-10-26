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

export function TaxesReportPage() {
  const api = useApi();
  const [from, setFrom] = useState(dateDaysAgo(29));
  const [to, setTo] = useState(dateNow());

  const query = { from, to };

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', 'sales-taxes', query],
    queryFn: () => api.reports.taxes(query),
  });

  const summary = data?.summary;
  const invoices = data?.invoices_by_type ?? [];

  const handleExport = () => {
    if (!invoices.length) return;
    const headers = ['Tipo de comprobante', 'Cantidad emitida', 'Neto gravado', 'IVA / Impuestos', 'Total facturado'];
    const rows = invoices.map((i) => [
      `Factura ${i.invoice_type}`,
      i.invoices_count,
      i.net_amount,
      i.vat_amount,
      i.total_amount,
    ]);
    downloadCsv(`impuestos_facturacion_${from}_${to}`, headers, rows);
  };

  return (
    <section>
      <PageHeader
        eyebrow="Ventas"
        title="Impuestos y facturación fiscal"
        description="Resumen de comprobantes fiscales emitidos (Factura A, B, C) ante ARCA y discriminación de IVA."
      />

      <ReportFilterBar
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        onExportCsv={invoices.length > 0 ? handleExport : undefined}
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
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>Total ventas registradas</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>
              {summary.total_sales_count.toLocaleString('es-AR')}
            </div>
            <div style={{ color: '#64748b', fontSize: '.78rem' }}>Monto total: {formatARS(summary.total_revenue)}</div>
          </div>
          <div style={card}>
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>Total facturado fiscalmente</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--c-accent, #c7101b)' }}>
              {formatARS(summary.total_invoiced)}
            </div>
            <div style={{ color: '#64748b', fontSize: '.78rem' }}>
              {summary.total_revenue > 0
                ? `${((summary.total_invoiced / summary.total_revenue) * 100).toFixed(1)}% del total`
                : '—'}
            </div>
          </div>
          <div style={card}>
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>Neto gravado</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>
              {formatARS(summary.total_taxed_net)}
            </div>
          </div>
          <div style={card}>
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>IVA / Impuestos declarados</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>
              {formatARS(summary.total_vat)}
            </div>
          </div>
        </div>
      )}

      {isLoading && <Loading message="Cargando datos impositivos..." />}
      {error && (
        <div role="alert" style={{ ...card, color: '#b91c1c', marginBottom: '1rem' }}>
          No se pudieron cargar los datos del reporte fiscal.
        </div>
      )}

      <div style={card}>
        <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Comprobantes emitidos por tipo</h3>
        {invoices.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', color: '#64748b' }}>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Tipo comprobante</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Cantidad emitida</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Neto gravado</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>IVA discriminado</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Total facturado</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.invoice_type} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.65rem 0.5rem', fontWeight: 700 }}>
                      Factura {inv.invoice_type}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: 700 }}>
                      {inv.invoices_count.toLocaleString('es-AR')}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right' }}>
                      {formatARS(inv.net_amount)}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right' }}>
                      {formatARS(inv.vat_amount)}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: 700 }}>
                      {formatARS(inv.total_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !isLoading && (
            <div style={{ padding: '1rem 0', color: '#64748b' }}>
              <p style={{ margin: '0 0 0.5rem 0' }}>
                No se registraron comprobantes electrónicos emitidos en este período.
              </p>
              <p style={{ margin: 0, fontSize: '.84rem' }}>
                Si el negocio opera bajo el régimen de Monotributo o la facturación electrónica ARCA no está activa para todas las operaciones, las ventas se totalizan en el resumen superior sin desglose impositivo de IVA.
              </p>
            </div>
          )
        )}
      </div>
    </section>
  );
}
