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

export function EmployeesReportPage() {
  const api = useApi();
  const [from, setFrom] = useState(dateDaysAgo(29));
  const [to, setTo] = useState(dateNow());
  const [hourFrom, setHourFrom] = useState<number | undefined>(undefined);
  const [hourTo, setHourTo] = useState<number | undefined>(undefined);

  const query = { from, to, hour_from: hourFrom, hour_to: hourTo };

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', 'sales-by-employee', query],
    queryFn: () => api.reports.salesByEmployee(query),
  });

  const summary = data?.summary;
  const employees = data?.employees ?? [];

  const handleExport = () => {
    if (!employees.length) return;
    const headers = ['Empleado / Cajero', 'Tickets', 'Ventas brutas', 'Descuentos', 'Ventas netas', 'Ticket promedio', '% del total'];
    const rows = employees.map((e) => [
      e.employee_name,
      e.tickets_count,
      e.gross_sales,
      e.discounts,
      e.net_sales,
      e.avg_ticket,
      `${e.share_pct}%`,
    ]);
    downloadCsv(`ventas_por_empleado_${from}_${to}`, headers, rows);
  };

  return (
    <section>
      <PageHeader
        eyebrow="Ventas"
        title="Ventas por empleado"
        description="Monto cobrado, cantidad de tickets y ticket promedio por persona."
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
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>Total de tickets</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{summary.total_tickets.toLocaleString('es-AR')}</div>
          </div>
          <div style={card}>
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>Total facturado neto</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--c-accent, #c7101b)' }}>
              {formatARS(summary.total_net)}
            </div>
          </div>
          <div style={card}>
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>Descuentos otorgados</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#dc2626' }}>
              {formatARS(summary.total_discounts)}
            </div>
          </div>
          <div style={card}>
            <div style={{ color: '#64748b', fontSize: '.82rem' }}>Ticket promedio general</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{formatARS(summary.avg_ticket)}</div>
          </div>
        </div>
      )}

      {isLoading && <Loading message="Calculando ventas por empleado..." />}
      {error && (
        <div role="alert" style={{ ...card, color: '#b91c1c', marginBottom: '1rem' }}>
          No se pudieron cargar los datos del reporte.
        </div>
      )}

      <div style={card}>
        <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Desglose por personal</h3>
        {employees.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', color: '#64748b' }}>
                  <th style={{ padding: '0.6rem 0.5rem' }}>Empleado / Cajero</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Tickets</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Ventas brutas</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Descuentos</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Ventas netas</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>Ticket promedio</th>
                  <th style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>% del total</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.user_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.65rem 0.5rem', fontWeight: 600 }}>{e.employee_name}</td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: 700 }}>
                      {e.tickets_count.toLocaleString('es-AR')}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right' }}>{formatARS(e.gross_sales)}</td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', color: '#dc2626' }}>
                      {e.discounts > 0 ? `-${formatARS(e.discounts)}` : '—'}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: 700 }}>
                      {formatARS(e.net_sales)}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>
                      {formatARS(e.avg_ticket)}
                    </td>
                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', color: '#64748b' }}>
                      {e.share_pct}%
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
