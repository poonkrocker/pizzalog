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

export function PaymentsReportPage() {
  const api = useApi();
  const [from, setFrom] = useState(dateDaysAgo(29));
  const [to, setTo] = useState(dateNow());
  const [hourFrom, setHourFrom] = useState<number | undefined>(undefined);
  const [hourTo, setHourTo] = useState<number | undefined>(undefined);

  const query = { from, to, hour_from: hourFrom, hour_to: hourTo };

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', 'sales-by-payment', query],
    queryFn: () => api.reports.salesByPayment(query),
  });

  const summary = data?.summary;
  const payments = data?.payments ?? [];

  const handleExport = () => {
    if (!payments.length) return;
    const headers = ['Método de pago', 'Transacciones', 'Monto total', '% del total'];
    const rows = payments.map((p) => [p.method_label, p.transactions_count, p.total_amount, `${p.share_pct}%`]);
    downloadCsv(`ventas_por_tipo_de_pago_${from}_${to}`, headers, rows);
  };

  return (
    <section>
      <PageHeader
        eyebrow="Ventas"
        title="Ventas por tipo de pago"
        description="Recaudación separada por Efectivo, Tarjeta, Transferencia y Mercado Pago (estilo Loyverse)."
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
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>Total transacciones cobradas</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>
              {summary.total_transactions.toLocaleString('es-AR')}
            </div>
          </div>
          <div style={card}>
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>Recaudación total</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--c-accent, #c7101b)' }}>
              {formatARS(summary.total_amount)}
            </div>
          </div>
        </div>
      )}

      {isLoading && <Loading message="Calculando cobros por método de pago..." />}
      {error && (
        <div role="alert" style={{ ...card, color: '#b91c1c', marginBottom: '1rem' }}>
          No se pudieron cargar los datos del reporte.
        </div>
      )}

      <div style={card}>
        <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Desglose por método de pago</h3>
        {payments.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', color: '#64748b' }}>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Método de pago</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Transacciones</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Monto recaudado</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>% del total</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.payment_method} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.65rem 0.5rem', fontWeight: 600 }}>{p.method_label}</td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: 700 }}>
                      {p.transactions_count.toLocaleString('es-AR')}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: 700 }}>
                      {formatARS(p.total_amount)}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', color: '#64748b' }}>
                      {p.share_pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !isLoading && <p style={{ color: '#777' }}>No hay transacciones registradas para este período y filtro.</p>
        )}
      </div>
    </section>
  );
}
