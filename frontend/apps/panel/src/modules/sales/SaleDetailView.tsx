import { formatARS, formatDateTime } from '@pizzalog/shared';
import { Badge, DataTable, ErrorState, Loading } from '@/ui';
import type { Column } from '@/ui';
import type { SaleItem } from '@pizzalog/shared';
import { useSale } from './hooks';
import { channelLabel, paymentLabel } from './labels';

const itemColumns: Column<SaleItem>[] = [
  { key: 'product_name', header: 'Producto' },
  { key: 'quantity', header: 'Cant.', align: 'right' },
  {
    key: 'unit_price',
    header: 'Unitario',
    align: 'right',
    render: (i) => formatARS(i.unit_price),
  },
  {
    key: 'line_total',
    header: 'Subtotal',
    align: 'right',
    render: (i) => formatARS(i.line_total),
  },
];

export function SaleDetailView({ saleId }: { saleId: number }) {
  const sale = useSale(saleId);

  if (sale.isLoading) return <Loading />;
  if (sale.isError || !sale.data) {
    return <ErrorState message="No se pudo cargar la venta." />;
  }

  const s = sale.data;

  return (
    <div className="sale-detail">
      <div className="sale-detail__meta">
        <span>
          <strong>#{s.sale_number}</strong> · {formatDateTime(s.created_at)}
        </span>
        <span className="sale-detail__tags">
          <Badge>{channelLabel(s.channel)}</Badge>
          <Badge tone={s.status === 'completed' ? 'success' : 'danger'}>
            {s.status === 'completed' ? 'Completada' : 'Anulada'}
          </Badge>
        </span>
      </div>

      <DataTable columns={itemColumns} rows={s.items} />

      <dl className="totals">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatARS(s.subtotal)}</dd>
        </div>
        {s.discount > 0 && (
          <div>
            <dt>Descuento</dt>
            <dd>-{formatARS(s.discount)}</dd>
          </div>
        )}
        <div className="totals__grand">
          <dt>Total</dt>
          <dd>{formatARS(s.total)}</dd>
        </div>
        <div className="totals__pay">
          <dt>Pago</dt>
          <dd>{paymentLabel(s.payment_method)}</dd>
        </div>
      </dl>

      {s.note && <p className="sale-detail__note">Nota: {s.note}</p>}
    </div>
  );
}
