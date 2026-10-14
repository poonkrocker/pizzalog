import { useMemo, useState } from 'react';
import { formatARS, formatDateTime, type Order, type OrderStatus, type SaleChannel } from '@pizzalog/shared';
import {
  Badge,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  PageHeader,
  Select,
} from '@/ui';
import type { Column } from '@/ui';
import { useOrders, useUpdateOrderStatus } from './hooks';
import { OrderDetailModal } from './OrderDetailModal';

const STATUS_TABS: Array<{ id: OrderStatus | 'all'; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'received', label: 'Recibidos' },
  { id: 'confirmed', label: 'Confirmados' },
  { id: 'preparing', label: 'En Horno' },
  { id: 'on_the_way', label: 'En Camino' },
  { id: 'delivered', label: 'Entregados' },
  { id: 'cancelled', label: 'Cancelados' },
];

const STATUS_LABELS: Record<OrderStatus, { label: string; tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' }> = {
  received: { label: 'Recibido', tone: 'warning' },
  confirmed: { label: 'Confirmado', tone: 'accent' },
  preparing: { label: 'En Horno', tone: 'accent' },
  on_the_way: { label: 'En Camino', tone: 'accent' },
  delivered: { label: 'Entregado', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
};

const CHANNELS: Array<{ value: SaleChannel | ''; label: string }> = [
  { value: '', label: 'Todos los canales' },
  { value: 'web', label: 'Web (Carta Online)' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'pedidosya', label: 'PedidosYa' },
  { value: 'rappi', label: 'Rappi' },
  { value: 'phone', label: 'Teléfono' },
  { value: 'counter', label: 'Mostrador' },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function OrdersPage() {
  const [selectedTab, setSelectedTab] = useState<OrderStatus | 'all'>('all');
  const [channel, setChannel] = useState<SaleChannel | ''>('');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  const query = useMemo(
    () => ({
      from,
      to,
      ...(selectedTab !== 'all' ? { status: selectedTab } : {}),
      ...(channel ? { channel } : {}),
      limit: 150,
    }),
    [from, to, selectedTab, channel],
  );

  const orders = useOrders(query);
  const updateStatus = useUpdateOrderStatus();

  // Métricas rápidas calculadas
  const orderList = orders.data ?? [];
  const activeCount = orderList.filter(
    (o) => o.status === 'received' || o.status === 'confirmed' || o.status === 'preparing' || o.status === 'on_the_way',
  ).length;
  const completedTotal = orderList
    .filter((o) => o.status === 'delivered')
    .reduce((sum, o) => sum + o.total, 0);

  const columns: Column<Order>[] = [
    {
      key: 'order_number',
      header: 'N°',
      render: (o) => (
        <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>#{o.order_number}</span>
      ),
    },
    {
      key: 'created_at',
      header: 'Hora',
      render: (o) => {
        const time = new Date(o.created_at).toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
        });
        return <span>{time}</span>;
      },
    },
    {
      key: 'channel',
      header: 'Canal',
      render: (o) => <Badge>{o.channel}</Badge>,
    },
    {
      key: 'customer_name',
      header: 'Cliente',
      render: (o) => (
        <div>
          <div style={{ fontWeight: 600 }}>{o.customer_name || 'Sin nombre'}</div>
          {o.customer_phone && (
            <small style={{ color: '#666' }}>{o.customer_phone}</small>
          )}
        </div>
      ),
    },
    {
      key: 'address',
      header: 'Dirección / Destino',
      render: (o) => (
        <div style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {o.address || <span style={{ color: '#999' }}>Retiro por local</span>}
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (o) => (
        <span style={{ fontWeight: 700, color: 'var(--c-text, #111)' }}>
          {formatARS(o.total)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (o) => {
        const s = STATUS_LABELS[o.status] ?? { label: o.status, tone: 'neutral' };
        return <Badge tone={s.tone}>{s.label}</Badge>;
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (o) => (
        <div className="row-actions" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          {o.status === 'received' && (
            <button
              className="btn btn--secondary"
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
              onClick={() => updateStatus.mutate({ id: o.id, status: 'confirmed' })}
            >
              Confirmar
            </button>
          )}
          {o.status === 'confirmed' && (
            <button
              className="btn btn--secondary"
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
              onClick={() => updateStatus.mutate({ id: o.id, status: 'preparing' })}
            >
              A Horno
            </button>
          )}
          {o.status === 'preparing' && (
            <button
              className="btn btn--secondary"
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
              onClick={() => updateStatus.mutate({ id: o.id, status: 'on_the_way' })}
            >
              Despachar
            </button>
          )}
          <button
            className="link"
            onClick={() => setSelectedOrderId(o.id)}
            style={{ fontWeight: 600 }}
          >
            Ver
          </button>
        </div>
      ),
    },
  ];

  return (
    <section>
      <PageHeader
        eyebrow="Delivery & Takeaway"
        title="Pedidos"
        description="Recepción, confirmación y despacho de pedidos online, WhatsApp y telefónicos."
      />

      {/* Tarjetas resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: 'var(--c-surface, #fff)', border: '1px solid var(--c-border, #e5e5e5)', padding: '1rem', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.8rem', color: '#666', textTransform: 'uppercase' }}>Pedidos Activos</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--c-accent, #e63946)' }}>{activeCount}</div>
        </div>
        <div style={{ background: 'var(--c-surface, #fff)', border: '1px solid var(--c-border, #e5e5e5)', padding: '1rem', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.8rem', color: '#666', textTransform: 'uppercase' }}>Total Pedidos Hoy</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{orderList.length}</div>
        </div>
        <div style={{ background: 'var(--c-surface, #fff)', border: '1px solid var(--c-border, #e5e5e5)', padding: '1rem', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.8rem', color: '#666', textTransform: 'uppercase' }}>Entregado Hoy</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#2a9d8f' }}>{formatARS(completedTotal)}</div>
        </div>
      </div>

      {/* Pestañas de estado */}
      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', borderBottom: '1px solid var(--c-border, #ddd)', marginBottom: '1rem', paddingBottom: '0.5rem' }}>
        {STATUS_TABS.map((tab) => {
          const isActive = selectedTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id)}
              style={{
                background: isActive ? 'var(--c-accent, #e63946)' : 'transparent',
                color: isActive ? '#fff' : 'inherit',
                border: 'none',
                borderRadius: '6px',
                padding: '0.4rem 0.8rem',
                fontSize: '0.9rem',
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="filters-bar" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <Field label="Canal">
          <Select value={channel} onChange={(e) => setChannel(e.target.value as SaleChannel | '')}>
            {CHANNELS.map((ch) => (
              <option key={ch.value} value={ch.value}>
                {ch.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Desde">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>

      {/* Contenido */}
      {orders.isLoading && <Loading message="Cargando pedidos..." />}
      {orders.isError && <ErrorState error={orders.error} onRetry={() => orders.refetch()} />}
      {orders.isSuccess && orderList.length === 0 && (
        <EmptyState
          title="No hay pedidos"
          description="No se encontraron pedidos para los filtros y fechas seleccionadas."
        />
      )}
      {orders.isSuccess && orderList.length > 0 && (
        <DataTable
          columns={columns}
          data={orderList}
          keyExtractor={(o) => o.id}
          onRowClick={(o) => setSelectedOrderId(o.id)}
        />
      )}

      {/* Modal de Detalle */}
      {selectedOrderId !== null && (
        <OrderDetailModal
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
        />
      )}
    </section>
  );
}
