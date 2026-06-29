import { useMemo, useState } from 'react';
import { formatARS, formatDateTime, type Sale, type SaleChannel } from '@pizzalog/shared';
import {
  Badge,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  Select,
} from '@/ui';
import type { Column } from '@/ui';
import { useCancelSale, useSales } from './hooks';
import { CHANNEL_LABELS, channelLabel, paymentLabel } from './labels';
import { SaleDetailView } from './SaleDetailView';

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SalesPage() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [channel, setChannel] = useState<SaleChannel | ''>('');
  const [selected, setSelected] = useState<number | null>(null);

  const query = useMemo(
    () => ({ from, to, ...(channel ? { channel } : {}) }),
    [from, to, channel],
  );
  const sales = useSales(query);
  const cancel = useCancelSale();

  const total = useMemo(
    () =>
      (sales.data ?? [])
        .filter((s) => s.status === 'completed')
        .reduce((acc, s) => acc + s.total, 0),
    [sales.data],
  );

  const columns: Column<Sale>[] = [
    { key: 'sale_number', header: 'N°', render: (s) => `#${s.sale_number}` },
    { key: 'created_at', header: 'Fecha', render: (s) => formatDateTime(s.created_at) },
    { key: 'channel', header: 'Canal', render: (s) => <Badge>{channelLabel(s.channel)}</Badge> },
    { key: 'user_name', header: 'Cajero', render: (s) => s.user_name ?? '—' },
    { key: 'payment_method', header: 'Pago', render: (s) => paymentLabel(s.payment_method) },
    { key: 'total', header: 'Total', align: 'right', render: (s) => formatARS(s.total) },
    {
      key: 'status',
      header: 'Estado',
      render: (s) => (
        <Badge tone={s.status === 'completed' ? 'success' : 'danger'}>
          {s.status === 'completed' ? 'Completada' : 'Anulada'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (s) => (
        <div className="row-actions">
          <button className="link" onClick={() => setSelected(s.id)}>
            Ver
          </button>
          {s.status === 'completed' && (
            <button
              className="link link--danger"
              onClick={() => {
                if (confirm(`¿Anular la venta #${s.sale_number}? Se repone el stock.`)) {
                  cancel.mutate(s.id);
                }
              }}
            >
              Anular
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <section>
      <PageHeader eyebrow="Operación" title="Ventas" />

      <div className="filters">
        <Field label="Desde">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Canal">
          <Select
            value={channel}
            onChange={(e) => setChannel(e.target.value as SaleChannel | '')}
          >
            <option value="">Todos</option>
            {Object.entries(CHANNEL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="filters__summary">
          <span className="filters__summary-label">Facturado</span>
          <span className="filters__summary-value">{formatARS(total)}</span>
        </div>
      </div>

      {sales.isLoading ? (
        <Loading />
      ) : sales.isError ? (
        <ErrorState message="No se pudieron cargar las ventas." />
      ) : (sales.data ?? []).length === 0 ? (
        <EmptyState title="No hay ventas en este período" />
      ) : (
        <DataTable columns={columns} rows={sales.data ?? []} />
      )}

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title="Detalle de venta"
      >
        {selected !== null && <SaleDetailView saleId={selected} />}
      </Modal>
    </section>
  );
}
