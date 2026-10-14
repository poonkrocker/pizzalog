import { useState } from 'react';
import { formatARS, type DeliveryDriver } from '@pizzalog/shared';
import { Badge, Button, EmptyState, ErrorState, Field, Input, Loading, PageHeader, Select } from '@/ui';
import { useDeleteDriver, useDrivers, useDriverSettlement, useUpdateDriver } from './hooks';
import { DriverFormModal } from './DriverFormModal';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DriversPage() {
  const [activeTab, setActiveTab] = useState<'settlement' | 'team'>('settlement');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [modalDriver, setModalDriver] = useState<DeliveryDriver | null | undefined>(undefined);

  const driversQuery = useDrivers(true);
  const settlementQuery = useDriverSettlement({
    from,
    to,
    ...(selectedDriverId ? { driver_id: parseInt(selectedDriverId, 10) } : {}),
  });

  const updateDriver = useUpdateDriver();
  const deleteDriver = useDeleteDriver();

  const drivers = driversQuery.data ?? [];
  const activeDrivers = drivers.filter((d) => d.is_active === 1);
  const settlements = settlementQuery.data?.settlements ?? [];

  // Totales acumulados de liquidación
  const totalOrders = settlements.reduce((sum, s) => sum + s.total_orders, 0);
  const totalCashCollected = settlements.reduce((sum, s) => sum + s.cash_collected, 0);
  const totalDigitalCollected = settlements.reduce((sum, s) => sum + s.other_payments_total, 0);
  const totalFeesEarned = settlements.reduce((sum, s) => sum + s.total_earned_fees, 0);
  const totalNetCashBalance = settlements.reduce((sum, s) => sum + s.net_cash_balance, 0);

  const handleShareWhatsApp = (s: (typeof settlements)[0]) => {
    const cleanPhone = s.driver_phone?.replace(/\D/g, '') ?? '';
    const waPhone = cleanPhone.startsWith('549')
      ? cleanPhone
      : cleanPhone.startsWith('54')
      ? '549' + cleanPhone.slice(2)
      : cleanPhone.length === 10
      ? '549' + cleanPhone
      : cleanPhone;

    const lines = [
      `🛵 *Liquidación de Turno - ${s.driver_name}*`,
      `📅 Período: ${from === to ? from : `${from} al ${to}`}`,
      `📦 Pedidos entregados: ${s.total_orders}`,
      `💵 Efectivo cobrado en mano: ${formatARS(s.cash_collected)}`,
      `💳 Pagos digitales (MP/transf/tarjeta): ${formatARS(s.other_payments_total)}`,
      `🛵 Ganancia por viajes (${s.total_orders} x ${formatARS(s.fee_per_trip)}): ${formatARS(s.total_earned_fees)}`,
      `----------------------------`,
      s.net_cash_balance >= 0
        ? `👉 *Efectivo a rendir en caja: ${formatARS(s.net_cash_balance)}*`
        : `👉 *La pizzería te abona en caja: ${formatARS(Math.abs(s.net_cash_balance))}*`,
    ];

    const waUrl = waPhone
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(lines.join('\n'))}`
      : `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;

    window.open(waUrl, '_blank');
  };

  return (
    <section>
      <PageHeader
        eyebrow="Logística & Repartos"
        title="Cadetes & Liquidación"
        description="Control de repartidores, cálculo de viajes y rendición de efectivo por turno."
        actions={
          <Button variant="primary" onClick={() => setModalDriver(null)}>
            + Nuevo Cadete
          </Button>
        }
      />

      {/* Pestañas principales */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--c-border, #ddd)', marginBottom: '1.5rem', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setActiveTab('settlement')}
          style={{
            background: activeTab === 'settlement' ? 'var(--c-accent, #e63946)' : 'transparent',
            color: activeTab === 'settlement' ? '#fff' : 'inherit',
            border: 'none',
            borderRadius: '6px',
            padding: '0.5rem 1rem',
            fontSize: '0.95rem',
            fontWeight: activeTab === 'settlement' ? 600 : 400,
            cursor: 'pointer',
          }}
        >
          📊 Liquidación de Turno
        </button>
        <button
          onClick={() => setActiveTab('team')}
          style={{
            background: activeTab === 'team' ? 'var(--c-accent, #e63946)' : 'transparent',
            color: activeTab === 'team' ? '#fff' : 'inherit',
            border: 'none',
            borderRadius: '6px',
            padding: '0.5rem 1rem',
            fontSize: '0.95rem',
            fontWeight: activeTab === 'team' ? 600 : 400,
            cursor: 'pointer',
          }}
        >
          🛵 Equipo de Cadetes ({activeDrivers.length})
        </button>
      </div>

      {activeTab === 'settlement' && (
        <>
          {/* Filtros de Liquidación */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            <Field label="Cadete">
              <Select
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value)}
              >
                <option value="">Todos los cadetes</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} {!d.is_active ? '(Inactivo)' : ''}
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

          {/* Tarjetas KPI de resumen */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ background: 'var(--c-surface, #fff)', border: '1px solid var(--c-border, #e5e5e5)', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.8rem', color: '#666', textTransform: 'uppercase' }}>Viajes Entregados</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{totalOrders}</div>
            </div>
            <div style={{ background: 'var(--c-surface, #fff)', border: '1px solid var(--c-border, #e5e5e5)', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.8rem', color: '#666', textTransform: 'uppercase' }}>Efectivo Cobrado en Mano</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#e63946' }}>{formatARS(totalCashCollected)}</div>
            </div>
            <div style={{ background: 'var(--c-surface, #fff)', border: '1px solid var(--c-border, #e5e5e5)', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.8rem', color: '#666', textTransform: 'uppercase' }}>Cobrado Digital (MP/Transf)</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#2a9d8f' }}>{formatARS(totalDigitalCollected)}</div>
            </div>
            <div style={{ background: 'var(--c-surface, #fff)', border: '1px solid var(--c-border, #e5e5e5)', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.8rem', color: '#666', textTransform: 'uppercase' }}>Honorarios Viajes a Pagar</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#457b9d' }}>{formatARS(totalFeesEarned)}</div>
            </div>
            <div style={{ background: '#eef6ff', border: '2px solid #b6d4fe', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.8rem', color: '#084298', fontWeight: 700, textTransform: 'uppercase' }}>
                Neto a Rendir en Caja
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: totalNetCashBalance >= 0 ? '#0d6efd' : '#e63946' }}>
                {formatARS(totalNetCashBalance)}
              </div>
              <small style={{ color: '#555', fontSize: '0.75rem' }}>
                {totalNetCashBalance >= 0 ? 'Cadetes ingresan efectivo' : 'Caja debe pagar a cadetes'}
              </small>
            </div>
          </div>

          {/* Listado de liquidaciones por cadete */}
          {settlementQuery.isLoading && <Loading message="Calculando liquidaciones..." />}
          {settlementQuery.isError && (
            <ErrorState error={settlementQuery.error} onRetry={() => settlementQuery.refetch()} />
          )}
          {settlementQuery.isSuccess && settlements.length === 0 && (
            <EmptyState
              title="No hay viajes registrados"
              description="No se registraron pedidos entregados por cadetes en las fechas seleccionadas."
            />
          )}

          {settlementQuery.isSuccess && settlements.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {settlements.map((s) => (
                <div
                  key={s.driver_id}
                  style={{
                    background: 'var(--c-surface, #fff)',
                    border: '1px solid var(--c-border, #e5e5e5)',
                    borderRadius: '8px',
                    padding: '1.25rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '0.75rem' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.2rem' }}>
                        🛵 {s.driver_name}
                      </h3>
                      <div style={{ fontSize: '0.85rem', color: '#666' }}>
                        {s.driver_phone ? `Tel: ${s.driver_phone} · ` : ''}
                        Tarifa: <strong>{formatARS(s.fee_per_trip)}</strong> / viaje
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <Button
                        variant="secondary"
                        onClick={() => handleShareWhatsApp(s)}
                      >
                        💬 Enviar Liquidación a WhatsApp
                      </Button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1rem', background: '#fafafa', padding: '0.75rem', borderRadius: '6px' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase' }}>Viajes:</span>
                      <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{s.total_orders}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase' }}>Efectivo Cobrado:</span>
                      <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#e63946' }}>{formatARS(s.cash_collected)}</div>
                      <small style={{ color: '#888', fontSize: '0.75rem' }}>({s.cash_orders_count} pedidos)</small>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase' }}>Pagos Digitales:</span>
                      <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#2a9d8f' }}>{formatARS(s.other_payments_total)}</div>
                      <small style={{ color: '#888', fontSize: '0.75rem' }}>({s.other_payments_count} pedidos)</small>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase' }}>Viajes a pagar:</span>
                      <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#457b9d' }}>{formatARS(s.total_earned_fees)}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#084298', fontWeight: 600, textTransform: 'uppercase' }}>A rendir en caja:</span>
                      <div style={{ fontWeight: 800, fontSize: '1.2rem', color: s.net_cash_balance >= 0 ? '#0d6efd' : '#e63946' }}>
                        {formatARS(s.net_cash_balance)}
                      </div>
                    </div>
                  </div>

                  {/* Tabla de pedidos del cadete */}
                  {s.orders.length > 0 && (
                    <details>
                      <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', color: '#555', padding: '0.3rem 0' }}>
                        Ver detalle de los {s.orders.length} pedidos entregados
                      </summary>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #ddd', textAlign: 'left', color: '#666' }}>
                            <th style={{ padding: '0.4rem' }}>N°</th>
                            <th style={{ padding: '0.4rem' }}>Hora</th>
                            <th style={{ padding: '0.4rem' }}>Cliente</th>
                            <th style={{ padding: '0.4rem' }}>Dirección</th>
                            <th style={{ padding: '0.4rem' }}>Medio Pago</th>
                            <th style={{ padding: '0.4rem', textAlign: 'right' }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.orders.map((o) => (
                            <tr key={o.id} style={{ borderBottom: '1px solid #eee' }}>
                              <td style={{ padding: '0.4rem', fontWeight: 700, fontFamily: 'monospace' }}>#{o.order_number}</td>
                              <td style={{ padding: '0.4rem' }}>
                                {new Date(o.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td style={{ padding: '0.4rem' }}>{o.customer_name || 'Sin nombre'}</td>
                              <td style={{ padding: '0.4rem' }}>{o.address || 'Retiro local'}</td>
                              <td style={{ padding: '0.4rem' }}>
                                <Badge tone={o.payment_method === 'cash' ? 'warning' : 'neutral'}>
                                  {o.payment_method === 'cash' ? 'Efectivo' : o.payment_method ?? 'Otro'}
                                </Badge>
                              </td>
                              <td style={{ padding: '0.4rem', textAlign: 'right', fontWeight: 600 }}>{formatARS(o.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'team' && (
        <>
          <div style={{ background: 'var(--c-surface, #fff)', border: '1px solid var(--c-border, #e5e5e5)', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#fafafa', borderBottom: '1px solid #e5e5e5', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Nombre</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Teléfono</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Vehículo</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Patente</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Tarifa / Viaje</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Estado</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr key={d.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{d.name}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>{d.phone || '-'}</td>
                    <td style={{ padding: '0.75rem 1rem', textTransform: 'capitalize' }}>
                      {d.vehicle_type === 'moto'
                        ? '🛵 Moto'
                        : d.vehicle_type === 'bici'
                        ? '🚲 Bici'
                        : d.vehicle_type === 'auto'
                        ? '🚗 Auto'
                        : 'Otro'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace' }}>{d.vehicle_plate || '-'}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                      {formatARS(d.fee_per_trip)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <Badge tone={d.is_active ? 'success' : 'neutral'}>
                        {d.is_active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <Button
                          variant="ghost"
                          onClick={() => setModalDriver(d)}
                        >
                          Editar
                        </Button>
                        {d.is_active ? (
                          <Button
                            variant="danger"
                            onClick={() => {
                              if (confirm(`¿Desactivar al cadete "${d.name}"?`)) {
                                deleteDriver.mutate(d.id);
                              }
                            }}
                          >
                            Desactivar
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              updateDriver.mutate({ id: d.id, data: { is_active: 1 } });
                            }}
                          >
                            Reactivar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {drivers.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
                      No tenés cadetes cargados. Hacé clic en "+ Nuevo Cadete" para sumar al primer repartidor.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal Alta/Edición */}
      {modalDriver !== undefined && (
        <DriverFormModal
          driver={modalDriver}
          onClose={() => setModalDriver(undefined)}
        />
      )}
    </section>
  );
}
