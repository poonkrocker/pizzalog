import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { formatARS } from '@pizzalog/shared';
import {
  formatDateAR,
  HOUR_TYPE_LABELS,
  publicStaffPortalApi,
  type EmployeePortalData,
} from './api';

const QUICK_PROFILES = [
  { code: 'ivan', label: 'Iván' },
  { code: 'lulu', label: 'Lulú' },
  { code: 'bruno', label: 'Bruno' },
  { code: 'agus', label: 'Agus' },
  { code: 'eze', label: 'Eze' },
  { code: 'tavo', label: 'Tavo' },
];

export function EmployeePortalPage() {
  const { code = 'ivan' } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<EmployeePortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'resumen' | 'horas' | 'retiros' | 'liquidaciones'>('resumen');

  // Modal Retiro a Cuenta
  const [openWithdrawal, setOpenWithdrawal] = useState(false);
  const [wDate, setWDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [wConcept, setWConcept] = useState('');
  const [wQty, setWQty] = useState('1');
  const [wUnit, setWUnit] = useState('kg');
  const [wPrice, setWPrice] = useState('');
  const [wNotes, setWNotes] = useState('');
  const [savingW, setSavingW] = useState(false);

  // Modal Horas
  const [openHour, setOpenHour] = useState(false);
  const [hDate, setHDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hType, setHType] = useState('produccion');
  const [hShift, setHShift] = useState('Producción');
  const [hStart, setHStart] = useState('08:00');
  const [hEnd, setHEnd] = useState('11:30');
  const [hRaw, setHRaw] = useState('');
  const [hTasks, setHTasks] = useState('');
  const [savingH, setSavingH] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  async function loadPortal(targetCode: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await publicStaffPortalApi.getPortal(targetCode);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el perfil');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPortal(code);
  }, [code]);

  function handleSelectSupply(supplyName: string) {
    setWConcept(supplyName);
    const found = data?.supplies.find(
      (s) => s.name.toLowerCase() === supplyName.toLowerCase(),
    );
    if (found) {
      setWUnit(found.unit || 'unidad');
      if (found.cost > 0) {
        setWPrice(String(found.cost));
      }
    }
  }

  async function submitWithdrawal(e: FormEvent) {
    e.preventDefault();
    if (!wConcept.trim()) return;
    setSavingW(true);
    try {
      await publicStaffPortalApi.createWithdrawal(code, {
        withdrawal_date: wDate,
        concept: wConcept.trim(),
        quantity: Number(wQty) || 1,
        unit: wUnit,
        unit_price: wPrice !== '' ? Number(wPrice) : null,
        notes: wNotes.trim() || undefined,
      });
      setOpenWithdrawal(false);
      setWConcept('');
      setWQty('1');
      setWPrice('');
      setWNotes('');
      setToast('Retiro a cuenta registrado correctamente');
      setTimeout(() => setToast(null), 3500);
      await loadPortal(code);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo guardar el retiro');
    } finally {
      setSavingW(false);
    }
  }

  async function submitHour(e: FormEvent) {
    e.preventDefault();
    setSavingH(true);
    try {
      await publicStaffPortalApi.createHour(code, {
        work_date: hDate,
        hour_type: hType,
        shift: hShift,
        start_time: hStart || undefined,
        end_time: hEnd || undefined,
        raw_hours: hRaw !== '' ? Number(hRaw) : undefined,
        tasks: hTasks.trim() || undefined,
      });
      setOpenHour(false);
      setHRaw('');
      setHTasks('');
      setToast('Horas registradas correctamente');
      setTimeout(() => setToast(null), 3500);
      await loadPortal(code);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudieron registrar las horas');
    } finally {
      setSavingH(false);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#181516', color: '#f0e6d0', padding: '32px', textAlign: 'center' }}>
        Cargando perfil personal…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', background: '#181516', color: '#f0e6d0', padding: '32px', maxWidth: 640, margin: '0 auto' }}>
        <h2 style={{ color: '#ffb4ab' }}>Perfil no encontrado</h2>
        <p>{error}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          {QUICK_PROFILES.map((qp) => (
            <button
              key={qp.code}
              className="btn btn--ghost"
              onClick={() => navigate(`/empleado/${qp.code}`)}
            >
              Ver perfil de {qp.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const { person, current_week, pending_withdrawals, last_settlement } = data;
  const computedSub =
    (Number(wQty) || 0) * (wPrice !== '' && !isNaN(Number(wPrice)) ? Number(wPrice) : 0);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#161314',
        color: '#f2ece1',
        padding: '20px 16px 60px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ maxWidth: 1020, margin: '0 auto' }}>
        {/* Header estilo Excel Personal de Arrabbiata */}
        <header
          style={{
            background: 'linear-gradient(135deg, #272223 0%, #1e1a1b 100%)',
            border: '1px solid #383132',
            borderRadius: 16,
            padding: '20px 24px',
            marginBottom: 20,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#fdb740', fontWeight: 700 }}>
              🍕 {person.business_name} · Perfil Online de Personal
            </div>
            <h1 style={{ margin: '4px 0 6px', fontSize: 28, fontWeight: 800, color: '#fff' }}>
              {person.name}
            </h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 13, color: '#c9c0b3' }}>
              <span style={{ background: '#322b2c', padding: '3px 10px', borderRadius: 99 }}>
                👤 {person.role}
              </span>
              <span style={{ background: '#322b2c', padding: '3px 10px', borderRadius: 99 }}>
                📆 Liquidación {person.settlement_type}
              </span>
              <span style={{ background: 'rgba(253, 183, 64, 0.15)', color: '#fdb740', padding: '3px 10px', borderRadius: 99, fontWeight: 700 }}>
                💲 Valor hora vigente: {formatARS(person.current_rate)}/h
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setOpenWithdrawal(true)}
              style={{
                background: '#d73828',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                padding: '10px 16px',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              📦 + Cargar Retiro a Cuenta
            </button>
            <button
              type="button"
              onClick={() => setOpenHour(true)}
              style={{
                background: '#2f292a',
                color: '#fdb740',
                border: '1px solid #fdb740',
                borderRadius: 10,
                padding: '10px 16px',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              ⏱ + Cargar Horas
            </button>
          </div>
        </header>

        {toast && (
          <div
            style={{
              background: 'rgba(46, 160, 67, 0.2)',
              border: '1px solid #2ea043',
              color: '#7ee787',
              padding: '12px 16px',
              borderRadius: 10,
              marginBottom: 16,
              fontWeight: 600,
            }}
          >
            ✓ {toast}
          </div>
        )}

        {/* 3 Tarjetas Principales idénticas al Excel Individual (Semana en curso / Retiros pendientes / Última liquidación) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
            gap: 16,
            marginBottom: 22,
          }}
        >
          {/* Tarjeta 1: Semana en curso */}
          <div
            style={{
              background: '#221e1f',
              border: '1px solid #383132',
              borderRadius: 14,
              padding: 18,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fdb740', marginBottom: 12 }}>
              📅 Semana en curso
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #2f292a', fontSize: 13 }}>
              <span style={{ color: '#a59f97' }}>Período</span>
              <strong>
                {formatDateAR(current_week.period_start)} al {formatDateAR(current_week.period_end)}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 6px', fontSize: 15 }}>
              <span style={{ color: '#a59f97' }}>Horas efectivas cargadas</span>
              <strong style={{ fontSize: 20, color: '#fff' }}>{current_week.effective_hours} hs</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
              <span style={{ color: '#a59f97' }}>Acumulado estimado</span>
              <strong style={{ color: '#7ee787' }}>{formatARS(current_week.estimated_amount)}</strong>
            </div>
          </div>

          {/* Tarjeta 2: Retiros pendientes */}
          <div
            style={{
              background: '#221e1f',
              border: '1px solid #383132',
              borderRadius: 14,
              padding: 18,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fdb740', marginBottom: 12 }}>
              📦 Retiros pendientes
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #2f292a', fontSize: 13 }}>
              <span style={{ color: '#a59f97' }}>Cantidad</span>
              <strong>{pending_withdrawals.count} retiro(s)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 6px', fontSize: 15 }}>
              <span style={{ color: '#a59f97' }}>Total a descontar</span>
              <strong style={{ fontSize: 20, color: pending_withdrawals.total > 0 ? '#ffb4ab' : '#fff' }}>
                {formatARS(pending_withdrawals.total)}
              </strong>
            </div>
            {pending_withdrawals.items.length > 0 && (
              <div style={{ fontSize: 12, color: '#c9c0b3', marginTop: 6 }}>
                Último: {pending_withdrawals.items[0]!.concept} ({pending_withdrawals.items[0]!.quantity}{' '}
                {pending_withdrawals.items[0]!.unit})
              </div>
            )}
          </div>

          {/* Tarjeta 3: Última liquidación */}
          <div
            style={{
              background: '#221e1f',
              border: '1px solid #383132',
              borderRadius: 14,
              padding: 18,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fdb740', marginBottom: 12 }}>
              💰 Última liquidación
            </div>
            {last_settlement ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                  <span style={{ color: '#a59f97' }}>Período</span>
                  <strong>
                    {formatDateAR(last_settlement.period_start)} al {formatDateAR(last_settlement.period_end)}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                  <span style={{ color: '#a59f97' }}>Total Bruto</span>
                  <span>{formatARS(last_settlement.total_bruto)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #2f292a', fontSize: 13 }}>
                  <span style={{ color: '#a59f97' }}>Retiros descontados</span>
                  <span style={{ color: '#ffb4ab' }}>
                    {last_settlement.retiros_aplicados > 0
                      ? `− ${formatARS(last_settlement.retiros_aplicados)}`
                      : formatARS(0)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 4px', fontSize: 16 }}>
                  <strong style={{ color: '#fdb740' }}>TOTAL NETO</strong>
                  <strong style={{ fontSize: 20, color: '#7ee787' }}>
                    {formatARS(last_settlement.total_neto)}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#a59f97' }}>
                  <span>
                    Estado:{' '}
                    <b style={{ color: last_settlement.status === 'Pagado' ? '#7ee787' : '#fdb740' }}>
                      {last_settlement.status}
                    </b>
                  </span>
                  <span>Pago: {formatDateAR(last_settlement.payment_date)}</span>
                </div>
              </>
            ) : (
              <p style={{ color: '#a59f97', fontSize: 13 }}>Sin liquidaciones registradas aún.</p>
            )}
          </div>
        </div>

        {/* Navegación de Hojas igual al Excel Individual */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {(
            [
              { id: 'resumen', label: '🏠 Mi Resumen & Horarios' },
              { id: 'horas', label: `⏱ Mis Horas (${data.hours.length})` },
              { id: 'retiros', label: `📦 Mis Retiros (${data.withdrawals.length})` },
              { id: 'liquidaciones', label: `💰 Mis Liquidaciones (${data.settlements.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                padding: '9px 16px',
                borderRadius: 10,
                border: tab === t.id ? '1px solid #fdb740' : '1px solid #383132',
                background: tab === t.id ? 'rgba(253, 183, 64, 0.16)' : '#221e1f',
                color: tab === t.id ? '#fdb740' : '#dcd3c6',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Contenido de cada pestaña */}
        {tab === 'resumen' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {/* Retiros pendientes detalle */}
            <div style={{ background: '#221e1f', border: '1px solid #383132', borderRadius: 14, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>📦 Retiros Pendientes de Descontar</h3>
                <button
                  type="button"
                  onClick={() => setOpenWithdrawal(true)}
                  style={{ background: 'transparent', border: '1px solid #fdb740', color: '#fdb740', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}
                >
                  + Nuevo retiro
                </button>
              </div>
              {pending_withdrawals.items.length === 0 ? (
                <p style={{ color: '#a59f97', fontSize: 13 }}>No tenés retiros pendientes de descontar.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #383132', textAlign: 'left', color: '#a59f97' }}>
                      <th style={{ padding: '6px 4px' }}>Fecha</th>
                      <th style={{ padding: '6px 4px' }}>Concepto</th>
                      <th style={{ padding: '6px 4px' }}>Cant.</th>
                      <th style={{ padding: '6px 4px', textAlign: 'right' }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending_withdrawals.items.map((w) => (
                      <tr key={w.id} style={{ borderBottom: '1px solid #2b2526' }}>
                        <td style={{ padding: '8px 4px' }}>{formatDateAR(w.withdrawal_date)}</td>
                        <td style={{ padding: '8px 4px', fontWeight: 600 }}>{w.concept}</td>
                        <td style={{ padding: '8px 4px' }}>
                          {w.quantity} {w.unit}
                        </td>
                        <td style={{ padding: '8px 4px', textAlign: 'right', color: '#fdb740', fontWeight: 700 }}>
                          {w.subtotal !== null ? formatARS(w.subtotal) : 'A definir'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Horarios Regulares */}
            <div style={{ background: '#221e1f', border: '1px solid #383132', borderRadius: 14, padding: 18 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>🕒 Mis Turnos Regulares</h3>
              {data.schedules.length === 0 ? (
                <p style={{ color: '#a59f97', fontSize: 13 }}>Sin turnos fijos asignados.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #383132', textAlign: 'left', color: '#a59f97' }}>
                      <th style={{ padding: '6px 4px' }}>Día</th>
                      <th style={{ padding: '6px 4px' }}>Turno</th>
                      <th style={{ padding: '6px 4px' }}>Horario</th>
                      <th style={{ padding: '6px 4px', textAlign: 'right' }}>Horas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.schedules.map((s) => (
                      <tr key={s.id} style={{ borderBottom: '1px solid #2b2526' }}>
                        <td style={{ padding: '8px 4px', fontWeight: 600 }}>{s.day_of_week}</td>
                        <td style={{ padding: '8px 4px' }}>{s.shift}</td>
                        <td style={{ padding: '8px 4px' }}>
                          {s.start_time} a {s.end_time}
                        </td>
                        <td style={{ padding: '8px 4px', textAlign: 'right' }}>{s.base_hours} hs</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {tab === 'horas' && (
          <div style={{ background: '#221e1f', border: '1px solid #383132', borderRadius: 14, padding: 18, overflowX: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>⏱ Historial de Horas Cargadas</h3>
              <button
                type="button"
                onClick={() => setOpenHour(true)}
                style={{ background: '#fdb740', color: '#181516', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                + Cargar Horas
              </button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #383132', textAlign: 'left', color: '#a59f97' }}>
                  <th style={{ padding: '8px 6px' }}>Fecha</th>
                  <th style={{ padding: '8px 6px' }}>Tipo de Hora</th>
                  <th style={{ padding: '8px 6px' }}>Turno / Horario</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Hs Reloj</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Factor</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Hs Efectivas</th>
                  <th style={{ padding: '8px 6px' }}>Tareas / Notas</th>
                </tr>
              </thead>
              <tbody>
                {data.hours.map((h) => (
                  <tr key={h.id} style={{ borderBottom: '1px solid #2b2526' }}>
                    <td style={{ padding: '8px 6px' }}>{formatDateAR(h.work_date)}</td>
                    <td style={{ padding: '8px 6px' }}>{HOUR_TYPE_LABELS[h.hour_type] ?? h.hour_type}</td>
                    <td style={{ padding: '8px 6px' }}>
                      {h.shift ?? '—'}
                      {h.start_time && h.end_time ? ` (${h.start_time}–${h.end_time})` : ''}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>{h.raw_hours} hs</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>{h.factor}x</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: '#fdb740' }}>
                      {h.effective_hours} hs
                    </td>
                    <td style={{ padding: '8px 6px', color: '#c9c0b3' }}>{h.tasks ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'retiros' && (
          <div style={{ background: '#221e1f', border: '1px solid #383132', borderRadius: 14, padding: 18, overflowX: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>📦 Mis Retiros a Cuenta de Mercadería</h3>
              <button
                type="button"
                onClick={() => setOpenWithdrawal(true)}
                style={{ background: '#d73828', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                + Cargar Retiro
              </button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #383132', textAlign: 'left', color: '#a59f97' }}>
                  <th style={{ padding: '8px 6px' }}>Fecha</th>
                  <th style={{ padding: '8px 6px' }}>Producto / Concepto</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Cantidad</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Precio Unit.</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Subtotal</th>
                  <th style={{ padding: '8px 6px' }}>Estado</th>
                  <th style={{ padding: '8px 6px' }}>Notas</th>
                </tr>
              </thead>
              <tbody>
                {data.withdrawals.map((w) => (
                  <tr key={w.id} style={{ borderBottom: '1px solid #2b2526' }}>
                    <td style={{ padding: '8px 6px' }}>{formatDateAR(w.withdrawal_date)}</td>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>{w.concept}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                      {w.quantity} {w.unit}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                      {w.unit_price !== null ? formatARS(w.unit_price) : '—'}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: '#fdb740' }}>
                      {w.subtotal !== null ? formatARS(w.subtotal) : '⚠️ Sin precio'}
                    </td>
                    <td style={{ padding: '8px 6px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 99,
                          fontSize: 11,
                          fontWeight: 700,
                          background: w.status === 'Pendiente' ? 'rgba(253, 183, 64, 0.2)' : 'rgba(126, 231, 135, 0.16)',
                          color: w.status === 'Pendiente' ? '#fdb740' : '#7ee787',
                        }}
                      >
                        {w.status}
                      </span>
                    </td>
                    <td style={{ padding: '8px 6px', color: '#a59f97' }}>{w.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'liquidaciones' && (
          <div style={{ background: '#221e1f', border: '1px solid #383132', borderRadius: 14, padding: 18, overflowX: 'auto' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>💰 Historial de Liquidaciones</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #383132', textAlign: 'left', color: '#a59f97' }}>
                  <th style={{ padding: '8px 6px' }}>Período</th>
                  <th style={{ padding: '8px 6px' }}>Tipo</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Hs Aten.</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Hs Prod.</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Adicionales</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Total Bruto</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>Retiros</th>
                  <th style={{ padding: '8px 6px', textAlign: 'right' }}>TOTAL NETO</th>
                  <th style={{ padding: '8px 6px' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.settlements.map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #2b2526' }}>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>
                      {formatDateAR(s.period_start)} al {formatDateAR(s.period_end)}
                    </td>
                    <td style={{ padding: '8px 6px' }}>{s.settlement_type}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                      {s.hs_atencion > 0 ? `${s.hs_atencion}h (${formatARS(s.monto_atencion)})` : '—'}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                      {s.hs_produccion > 0 ? `${s.hs_produccion}h (${formatARS(s.monto_produccion)})` : '—'}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                      {s.conceptos_adic > 0 ? formatARS(s.conceptos_adic) : '—'}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>{formatARS(s.total_bruto)}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', color: '#ffb4ab' }}>
                      {s.retiros_aplicados > 0 ? `−${formatARS(s.retiros_aplicados)}` : '—'}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 800, color: '#7ee787', fontSize: 14 }}>
                      {formatARS(s.total_neto)}
                    </td>
                    <td style={{ padding: '8px 6px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 99,
                          fontSize: 11,
                          fontWeight: 700,
                          background: s.status === 'Pagado' ? 'rgba(126, 231, 135, 0.16)' : 'rgba(253, 183, 64, 0.2)',
                          color: s.status === 'Pagado' ? '#7ee787' : '#fdb740',
                        }}
                      >
                        {s.status} {s.payment_date ? `(${formatDateAR(s.payment_date)})` : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Cargar Retiro a Cuenta */}
      {openWithdrawal && (
        <div
          onClick={() => !savingW && setOpenWithdrawal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 200,
          }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitWithdrawal}
            style={{
              background: '#221e1f',
              border: '1px solid #3d3536',
              borderRadius: 16,
              padding: 22,
              width: '100%',
              maxWidth: 460,
              color: '#f2ece1',
            }}
          >
            <h3 style={{ margin: '0 0 14px', fontSize: 18, color: '#fdb740' }}>
              📦 Cargar Retiro a Cuenta ({person.name})
            </h3>

            <label style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
              <span>Fecha</span>
              <input
                type="date"
                className="input"
                value={wDate}
                onChange={(e) => setWDate(e.target.value)}
                required
                style={{ width: '100%', marginTop: 4 }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
              <span>Insumo / Mercadería retirada</span>
              <input
                type="text"
                list="portal-supplies-list"
                className="input"
                placeholder="Ej: Muzza, Reggianito, Bondiola, Harina…"
                value={wConcept}
                onChange={(e) => handleSelectSupply(e.target.value)}
                required
                style={{ width: '100%', marginTop: 4 }}
              />
              <datalist id="portal-supplies-list">
                {data.supplies.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.unit} · {formatARS(s.cost)}
                  </option>
                ))}
              </datalist>
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <label style={{ fontSize: 13 }}>
                <span>Cantidad</span>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  className="input"
                  value={wQty}
                  onChange={(e) => setWQty(e.target.value)}
                  required
                  style={{ width: '100%', marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 13 }}>
                <span>Unidad</span>
                <select
                  className="input"
                  value={wUnit}
                  onChange={(e) => setWUnit(e.target.value)}
                  style={{ width: '100%', marginTop: 4 }}
                >
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="unidad">unidad</option>
                  <option value="L">L</option>
                </select>
              </label>
            </div>

            <label style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
              <span>Precio Unitario (opcional si se completa al liquidar)</span>
              <input
                type="number"
                step="any"
                min="0"
                className="input"
                placeholder="Ej: 16500"
                value={wPrice}
                onChange={(e) => setWPrice(e.target.value)}
                style={{ width: '100%', marginTop: 4 }}
              />
            </label>

            {computedSub > 0 && (
              <div style={{ background: '#181516', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
                Subtotal a descontar: <strong style={{ color: '#fdb740' }}>{formatARS(computedSub)}</strong>
              </div>
            )}

            <label style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
              <span>Notas (opcional)</span>
              <input
                type="text"
                className="input"
                value={wNotes}
                onChange={(e) => setWNotes(e.target.value)}
                placeholder="Aclaración opcional"
                style={{ width: '100%', marginTop: 4 }}
              />
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setOpenWithdrawal(false)}
                disabled={savingW}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn--primary" disabled={savingW}>
                {savingW ? 'Guardando…' : 'Registrar Retiro'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Cargar Horas */}
      {openHour && (
        <div
          onClick={() => !savingH && setOpenHour(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 200,
          }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitHour}
            style={{
              background: '#221e1f',
              border: '1px solid #3d3536',
              borderRadius: 16,
              padding: 22,
              width: '100%',
              maxWidth: 460,
              color: '#f2ece1',
            }}
          >
            <h3 style={{ margin: '0 0 14px', fontSize: 18, color: '#fdb740' }}>
              ⏱ Cargar Horas ({person.name})
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <label style={{ fontSize: 13 }}>
                <span>Fecha</span>
                <input
                  type="date"
                  className="input"
                  value={hDate}
                  onChange={(e) => setHDate(e.target.value)}
                  required
                  style={{ width: '100%', marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 13 }}>
                <span>Tipo de Hora</span>
                <select
                  className="input"
                  value={hType}
                  onChange={(e) => {
                    const v = e.target.value;
                    setHType(v);
                    if (v === 'produccion') setHShift('Producción');
                    else if (v === 'atencion') setHShift('Mañana');
                  }}
                  style={{ width: '100%', marginTop: 4 }}
                >
                  <option value="produccion">Producción (1x)</option>
                  <option value="atencion">Atención (1x)</option>
                  <option value="feriado_trabajado">Feriado Trabajado (2x)</option>
                </select>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <label style={{ fontSize: 13 }}>
                <span>Hora Inicio</span>
                <input
                  type="time"
                  className="input"
                  value={hStart}
                  onChange={(e) => setHStart(e.target.value)}
                  style={{ width: '100%', marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 13 }}>
                <span>Hora Fin</span>
                <input
                  type="time"
                  className="input"
                  value={hEnd}
                  onChange={(e) => setHEnd(e.target.value)}
                  style={{ width: '100%', marginTop: 4 }}
                />
              </label>
            </div>

            <label style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
              <span>O indicar cantidad de horas directamente (opcional)</span>
              <input
                type="number"
                step="0.25"
                min="0.25"
                className="input"
                placeholder="Se calcula solo con Inicio y Fin si lo dejás vacío"
                value={hRaw}
                onChange={(e) => setHRaw(e.target.value)}
                style={{ width: '100%', marginTop: 4 }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
              <span>Tareas realizadas / Notas</span>
              <input
                type="text"
                className="input"
                value={hTasks}
                onChange={(e) => setHTasks(e.target.value)}
                placeholder="Ej: Amasado, bollado, rallar muzza…"
                style={{ width: '100%', marginTop: 4 }}
              />
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setOpenHour(false)}
                disabled={savingH}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn--primary" disabled={savingH}>
                {savingH ? 'Guardando…' : 'Guardar Horas'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
