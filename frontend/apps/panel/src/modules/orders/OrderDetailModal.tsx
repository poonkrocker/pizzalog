import { useState } from 'react';
import { formatARS, formatDateTime, type OrderStatus } from '@pizzalog/shared';
import { Badge, Button, Modal, Select } from '@/ui';
import { useCancelOrder, useCompleteOrder, useOrder, useUpdateOrderStatus } from './hooks';

const STATUS_LABELS: Record<OrderStatus, { label: string; tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' }> = {
  received: { label: 'Recibido', tone: 'warning' },
  confirmed: { label: 'Confirmado', tone: 'accent' },
  preparing: { label: 'En Horno', tone: 'accent' },
  on_the_way: { label: 'En Camino', tone: 'accent' },
  delivered: { label: 'Entregado', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
};

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'mp', label: 'Mercado Pago' },
  { value: 'other', label: 'Otro' },
];

export function OrderDetailModal({
  orderId,
  onClose,
}: {
  orderId: number;
  onClose: () => void;
}) {
  const { data: order, isLoading } = useOrder(orderId);
  const updateStatus = useUpdateOrderStatus();
  const completeOrder = useCompleteOrder();
  const cancelOrder = useCancelOrder();

  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [isCompleting, setIsCompleting] = useState(false);

  if (isLoading || !order) {
    return (
      <Modal open onClose={onClose} title="Cargando pedido...">
        <p className="hint">Obteniendo detalles del pedido...</p>
      </Modal>
    );
  }

  const statusInfo = STATUS_LABELS[order.status] ?? { label: order.status, tone: 'neutral' };
  const canAdvance = order.status === 'received' || order.status === 'confirmed' || order.status === 'preparing';
  const canComplete = order.status !== 'delivered' && order.status !== 'cancelled' && !order.sale_id;
  const canCancel = order.status !== 'delivered' && order.status !== 'cancelled';

  const nextStatus: OrderStatus | null =
    order.status === 'received'
      ? 'confirmed'
      : order.status === 'confirmed'
      ? 'preparing'
      : order.status === 'preparing'
      ? 'on_the_way'
      : null;

  const nextLabel =
    order.status === 'received'
      ? 'Confirmar pedido'
      : order.status === 'confirmed'
      ? 'Mandar a horno / cocina'
      : order.status === 'preparing'
      ? 'Despachar (en camino)'
      : null;

  const handleAdvance = () => {
    if (nextStatus) {
      updateStatus.mutate({ id: order.id, status: nextStatus });
    }
  };

  const handleComplete = () => {
    completeOrder.mutate(
      { id: order.id, paymentMethod: paymentMethod || order.payment_method || 'cash' },
      {
        onSuccess: () => {
          setIsCompleting(false);
          onClose();
        },
      },
    );
  };

  const handleCancel = () => {
    if (confirm(`¿Seguro que deseás cancelar el pedido #${order.order_number}?`)) {
      cancelOrder.mutate(order.id, {
        onSuccess: () => onClose(),
      });
    }
  };

  // Enlace a WhatsApp formateado
  const cleanPhone = order.customer_phone?.replace(/\D/g, '') ?? '';
  const waPhone = cleanPhone.startsWith('549')
    ? cleanPhone
    : cleanPhone.startsWith('54')
    ? '549' + cleanPhone.slice(2)
    : cleanPhone.length === 10
    ? '549' + cleanPhone
    : cleanPhone;

  const waMsg = encodeURIComponent(
    `¡Hola ${order.customer_name ?? ''}! Te escribimos de Pizzería Arrabbiata sobre tu pedido #${order.order_number}.`,
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Pedido #${order.order_number}`}
      footer={
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', width: '100%' }}>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>

          {canCancel && (
            <Button
              variant="danger"
              onClick={handleCancel}
              disabled={cancelOrder.isPending}
            >
              Cancelar Pedido
            </Button>
          )}

          {canAdvance && nextStatus && (
            <Button
              variant="secondary"
              onClick={handleAdvance}
              disabled={updateStatus.isPending}
            >
              {nextLabel}
            </Button>
          )}

          {canComplete && (
            <Button
              variant="primary"
              onClick={() => setIsCompleting(true)}
              disabled={completeOrder.isPending}
            >
              Entregar y Cobrar
            </Button>
          )}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Cabecera / Estado */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--c-border, #eee)', paddingBottom: '0.75rem' }}>
          <div>
            <span style={{ fontSize: '0.875rem', color: '#666' }}>Canal: <strong>{order.channel}</strong></span>
            <div style={{ fontSize: '0.8rem', color: '#888' }}>{formatDateTime(order.created_at)}</div>
          </div>
          <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
        </div>

        {/* Datos del Cliente */}
        <div style={{ background: 'var(--c-surface, #f9f9f9)', padding: '0.75rem 1rem', borderRadius: '6px' }}>
          <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#444' }}>Datos del Cliente</h4>
          <p style={{ margin: '0.2rem 0' }}><strong>Nombre:</strong> {order.customer_name || 'Sin especificar'}</p>
          {order.customer_phone && (
            <p style={{ margin: '0.2rem 0' }}>
              <strong>Teléfono:</strong> {order.customer_phone}{' '}
              <a
                href={`https://wa.me/${waPhone}?text=${waMsg}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#25D366', fontWeight: 600, marginLeft: '0.5rem', textDecoration: 'none' }}
              >
                💬 Abrir WhatsApp
              </a>
            </p>
          )}
          {order.address && (
            <p style={{ margin: '0.2rem 0' }}>
              <strong>Dirección:</strong> {order.address}{' '}
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(order.address + ', Córdoba')}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--c-accent, #e63946)', fontSize: '0.85rem', marginLeft: '0.5rem' }}
              >
                📍 Ver Mapa
              </a>
            </p>
          )}
          {order.notes && (
            <p style={{ margin: '0.4rem 0 0.2rem 0', background: '#fff3cd', padding: '0.4rem 0.6rem', borderRadius: '4px', fontSize: '0.85rem' }}>
              <strong>Nota del cliente:</strong> {order.notes}
            </p>
          )}
        </div>

        {/* Detalle de ítems */}
        <div>
          <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#444' }}>Ítems del Pedido</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ddd', textAlign: 'left' }}>
                <th style={{ padding: '0.4rem' }}>Cant</th>
                <th style={{ padding: '0.4rem' }}>Producto</th>
                <th style={{ padding: '0.4rem', textAlign: 'right' }}>Precio</th>
                <th style={{ padding: '0.4rem', textAlign: 'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {(order.items ?? []).map((it) => (
                <tr key={it.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '0.4rem', fontWeight: 600 }}>{it.quantity}x</td>
                  <td style={{ padding: '0.4rem' }}>
                    <div>{it.product_name}</div>
                    {it.notes && <small style={{ color: '#666', fontStyle: 'italic' }}>{it.notes}</small>}
                  </td>
                  <td style={{ padding: '0.4rem', textAlign: 'right' }}>{formatARS(it.unit_price)}</td>
                  <td style={{ padding: '0.4rem', textAlign: 'right', fontWeight: 600 }}>{formatARS(it.line_total)}</td>
                </tr>
              ))}
              {order.delivery_fee > 0 && (
                <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '0.4rem' }}>1x</td>
                  <td style={{ padding: '0.4rem', fontStyle: 'italic' }}>Costo de envío</td>
                  <td style={{ padding: '0.4rem', textAlign: 'right' }}>{formatARS(order.delivery_fee)}</td>
                  <td style={{ padding: '0.4rem', textAlign: 'right', fontWeight: 600 }}>{formatARS(order.delivery_fee)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ padding: '0.6rem 0.4rem', textAlign: 'right', fontWeight: 700, fontSize: '1rem' }}>
                  Total:
                </td>
                <td style={{ padding: '0.6rem 0.4rem', textAlign: 'right', fontWeight: 700, fontSize: '1.1rem', color: 'var(--c-accent, #e63946)' }}>
                  {formatARS(order.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Modal interno para cobrar */}
        {isCompleting && (
          <div style={{ background: '#eef6ff', border: '1px solid #b6d4fe', padding: '1rem', borderRadius: '6px' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#084298' }}>Completar pedido y registrar cobro</h4>
            <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', color: '#444' }}>
              Al completar, el pedido se marca como <strong>Entregado</strong>, descuenta stock del catálogo y se vincula a la caja diaria en efectivo si corresponde.
            </p>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Medio de Pago:
              </label>
              <Select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setIsCompleting(false)}>
                Atrás
              </Button>
              <Button
                variant="primary"
                onClick={handleComplete}
                disabled={completeOrder.isPending}
              >
                {completeOrder.isPending ? 'Procesando...' : `Confirmar Cobro ${formatARS(order.total)}`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
