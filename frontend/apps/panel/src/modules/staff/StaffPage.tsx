import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { formatARS, type Role } from '@pizzalog/shared';
import { useApi } from '@/lib/auth';
import { Button, Loading, Modal, PageHeader } from '@/ui';
import {
  formatDateAR,
  HOUR_TYPE_LABELS,
  type StaffHour,
  type StaffOverviewResponse,
  type StaffPersonSummary,
  type StaffSettlement,
  type StaffSettlementPreview,
  type StaffWithdrawal,
} from './api';

type StaffTab = 'overview' | 'users' | 'hours' | 'withdrawals' | 'settlements' | 'config';

interface AppUserRow {
  id: number;
  name: string;
  username: string | null;
  email: string;
  role: Role;
  active: number;
  can_use_pos: number;
  allowed_modules: string[] | null;
  staff_person_id: number | null;
  staff_person_code: string | null;
  staff_person_name: string | null;
}

const PANEL_MODULE_OPTIONS: { id: string; label: string }[] = [
  { id: 'dashboard', label: '📊 Resumen / Inicio' },
  { id: 'orders', label: '🛎️ Pedidos' },
  { id: 'drivers', label: '🛵 Cadetes' },
  { id: 'production', label: '🥣 Calculadora & Costos' },
  { id: 'products', label: '🍕 Productos' },
  { id: 'categories', label: '🗂️ Categorías' },
  { id: 'supplies', label: '🧀 Insumos' },
  { id: 'suppliers', label: '🚚 Proveedores' },
  { id: 'sales', label: '🧾 Ventas' },
  { id: 'cash', label: '💵 Caja' },
  { id: 'salon', label: '🍽️ Salón' },
  { id: 'customers', label: '👥 Clientes' },
  { id: 'staff', label: '🪪 Personal & Sueldos' },
  { id: 'business', label: '🏪 Mi local' },
];

export function StaffPage() {
  const { client } = useApi();

  const [tab, setTab] = useState<StaffTab>('overview');
  const [overview, setOverview] = useState<StaffOverviewResponse | null>(null);
  const [hours, setHours] = useState<StaffHour[]>([]);
  const [withdrawals, setWithdrawals] = useState<StaffWithdrawal[]>([]);
  const [settlements, setSettlements] = useState<StaffSettlement[]>([]);
  const [users, setUsers] = useState<AppUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Filtros
  const [filterPerson, setFilterPerson] = useState<string>('');
  const [filterWStatus, setFilterWStatus] = useState<string>('');
  const [showInactivePeople, setShowInactivePeople] = useState(false);

  // Modal: Turnos de Atención (carga múltiple como el botón del Excel)
  const [openShiftModal, setOpenShiftModal] = useState(false);
  const [shiftDate, setShiftDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shiftName, setShiftName] = useState<'Mañana' | 'Noche'>('Noche');
  const [shiftHoliday, setShiftHoliday] = useState(false);
  const [shiftChecks, setShiftChecks] = useState<Record<number, { checked: boolean; extra: number }>>({});

  // Modal: Horas de Producción / Manual
  const [openHourModal, setOpenHourModal] = useState(false);
  const [hPersonId, setHPersonId] = useState<string>('');
  const [hDate, setHDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hType, setHType] = useState('produccion');
  const [hShift, setHShift] = useState('Producción');
  const [hStart, setHStart] = useState('08:00');
  const [hEnd, setHEnd] = useState('11:30');
  const [hRaw, setHRaw] = useState('');
  const [hTasks, setHTasks] = useState('');

  // Modal: Cargar Retiro a Cuenta
  const [openWithdrawalModal, setOpenWithdrawalModal] = useState(false);
  const [wPersonId, setWPersonId] = useState<string>('');
  const [wDate, setWDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [wConcept, setWConcept] = useState('');
  const [wQty, setWQty] = useState('1');
  const [wUnit, setWUnit] = useState('kg');
  const [wPrice, setWPrice] = useState('');
  const [wNotes, setWNotes] = useState('');

  // Modal: Calcular Liquidación / SAC
  const [openSettlementModal, setOpenSettlementModal] = useState(false);
  const [sPersonId, setSPersonId] = useState<string>('');
  const [sType, setSType] = useState<'Semanal' | 'Mensual' | 'Aguinaldo' | 'Vacaciones'>('Semanal');
  const [sStart, setSStart] = useState('');
  const [sEnd, setSEnd] = useState('');
  const [sAdic, setSAdic] = useState('0');
  const [sNotes, setSNotes] = useState('');
  const [sStatus, setSStatus] = useState<'Pagado' | 'Borrador'>('Pagado');
  const [sPreview, setSPreview] = useState<StaffSettlementPreview | null>(null);
  const [calculatingPreview, setCalculatingPreview] = useState(false);

  // Modal: Crear / Editar Persona y Tarifa
  const [editingPerson, setEditingPerson] = useState<StaffPersonSummary | null>(null);
  const [creatingPerson, setCreatingPerson] = useState(false);
  const [pName, setPName] = useState('');
  const [pRole, setPRole] = useState('Empleado');
  const [pType, setPType] = useState<'Semanal' | 'Mensual'>('Semanal');
  const [pRate, setPRate] = useState('');
  const [pRateFrom, setPRateFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [pActive, setPActive] = useState(true);
  const [pNotes, setPNotes] = useState('');

  // Modal: Crear / Editar Usuario y Permisos
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUserRow | null>(null);
  const [uName, setUName] = useState('');
  const [uUsername, setUUsername] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uPassword, setUPassword] = useState('');
  const [uRole, setURole] = useState<Role>('cashier');
  const [uPersonId, setUPersonId] = useState<string>('');
  const [uCanPos, setUCanPos] = useState(true);
  const [uActive, setUActive] = useState(true);
  const [uModules, setUModules] = useState<string[]>([]);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function loadAll() {
    setLoading(true);
    try {
      const [ov, hrs, wds, setts, usrs] = await Promise.all([
        client.get<StaffOverviewResponse>('/staff/overview'),
        client.get<{ hours: StaffHour[] }>('/staff/hours'),
        client.get<{ withdrawals: StaffWithdrawal[] }>('/staff/withdrawals'),
        client.get<{ settlements: StaffSettlement[] }>('/staff/settlements'),
        client.get<{ users: AppUserRow[] }>('/users').catch(() => ({ users: [] as AppUserRow[] })),
      ]);
      setOverview(ov);
      setHours(hrs.hours);
      setWithdrawals(wds.withdrawals);
      setSettlements(setts.settlements);
      setUsers(usrs.users);

      if (!sStart && ov.week_start) setSStart(ov.week_start);
      if (!sEnd && ov.week_end) setSEnd(ov.week_end);
      const firstActive = ov.people.find((p) => p.is_active === 1);
      if (firstActive) {
        if (!hPersonId) setHPersonId(String(firstActive.id));
        if (!wPersonId) setWPersonId(String(firstActive.id));
        if (!sPersonId) setSPersonId(String(firstActive.id));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const activePeople = useMemo(
    () => (overview?.people ?? []).filter((p) => p.is_active === 1),
    [overview],
  );

  const visiblePeople = useMemo(
    () => (showInactivePeople ? (overview?.people ?? []) : activePeople),
    [overview, showInactivePeople, activePeople],
  );

  const filteredHours = useMemo(() => {
    if (!filterPerson) return hours;
    return hours.filter((h) => String(h.person_id) === filterPerson);
  }, [hours, filterPerson]);

  const filteredWithdrawals = useMemo(() => {
    return withdrawals.filter((w) => {
      if (filterPerson && String(w.person_id) !== filterPerson) return false;
      if (filterWStatus && w.status !== filterWStatus) return false;
      return true;
    });
  }, [withdrawals, filterPerson, filterWStatus]);

  const filteredSettlements = useMemo(() => {
    if (!filterPerson) return settlements;
    return settlements.filter((s) => String(s.person_id) === filterPerson);
  }, [settlements, filterPerson]);

  function openUserEditor(u: AppUserRow | null, prefillPerson?: StaffPersonSummary) {
    if (u) {
      setEditingUser(u);
      setUName(u.name);
      setUUsername(u.username ?? '');
      setUEmail(u.email ?? '');
      setUPassword('');
      setURole(u.role);
      setUPersonId(u.staff_person_id ? String(u.staff_person_id) : '');
      setUCanPos(u.can_use_pos === 1);
      setUActive(u.active === 1);
      setUModules(
        u.role === 'admin'
          ? PANEL_MODULE_OPTIONS.map((m) => m.id)
          : Array.isArray(u.allowed_modules)
            ? u.allowed_modules
            : u.role === 'manager'
              ? PANEL_MODULE_OPTIONS.filter((m) => m.id !== 'business').map((m) => m.id)
              : [],
      );
    } else {
      setEditingUser(null);
      setUName(prefillPerson?.name ?? '');
      setUUsername(prefillPerson?.code ?? '');
      setUEmail('');
      setUPassword(prefillPerson?.code ? `${prefillPerson.code}123` : '');
      setURole('cashier');
      setUPersonId(prefillPerson ? String(prefillPerson.id) : '');
      setUCanPos(true);
      setUActive(true);
      setUModules([]);
    }
    setUserModalOpen(true);
  }

  function toggleModule(modId: string) {
    setUModules((prev) =>
      prev.includes(modId) ? prev.filter((x) => x !== modId) : [...prev, modId],
    );
  }

  async function submitUser(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name: uName.trim(),
      username: uUsername.trim().toLowerCase(),
      email: uEmail.trim() || undefined,
      ...(uPassword.trim() ? { password: uPassword.trim() } : {}),
      role: uRole,
      staff_person_id: uPersonId ? Number(uPersonId) : null,
      can_use_pos: uCanPos ? 1 : 0,
      active: uActive ? 1 : 0,
      allowed_modules: uRole === 'admin' ? null : uModules,
    };
    if (editingUser) {
      await client.put(`/users/${editingUser.id}`, payload);
      notify(`Usuario @${payload.username} actualizado`);
    } else {
      await client.post('/users', payload);
      notify(`Usuario @${payload.username} creado`);
    }
    setUserModalOpen(false);
    setEditingUser(null);
    await loadAll();
  }

  function openShiftBatchModal() {
    const initial: Record<number, { checked: boolean; extra: number }> = {};
    for (const p of activePeople) {
      initial[p.id] = { checked: false, extra: 0 };
    }
    setShiftChecks(initial);
    setOpenShiftModal(true);
  }

  async function submitShiftBatch(e: FormEvent) {
    e.preventDefault();
    const entries = Object.entries(shiftChecks)
      .filter(([, val]) => val.checked)
      .map(([pid, val]) => ({
        person_id: Number(pid),
        extra_minutes: val.extra,
      }));
    if (entries.length === 0) {
      alert('Tildá al menos una persona que haya trabajado en el turno');
      return;
    }
    await client.post('/staff/hours/shift-batch', {
      work_date: shiftDate,
      shift: shiftName,
      is_holiday: shiftHoliday,
      entries,
    });
    setOpenShiftModal(false);
    notify(`Turno ${shiftName} registrado para ${entries.length} persona(s)`);
    await loadAll();
  }

  async function submitHour(e: FormEvent) {
    e.preventDefault();
    await client.post('/staff/hours', {
      person_id: Number(hPersonId),
      work_date: hDate,
      hour_type: hType,
      shift: hShift,
      start_time: hStart || null,
      end_time: hEnd || null,
      raw_hours: hRaw !== '' ? Number(hRaw) : 0,
      tasks: hTasks.trim() || null,
    });
    setOpenHourModal(false);
    setHRaw('');
    setHTasks('');
    notify('Horas registradas correctamente');
    await loadAll();
  }

  function handleSelectSupply(val: string) {
    setWConcept(val);
    const found = overview?.supplies.find(
      (s) => s.name.toLowerCase() === val.toLowerCase(),
    );
    if (found) {
      setWUnit(found.unit || 'unidad');
      if (found.cost > 0) setWPrice(String(found.cost));
    }
  }

  async function submitWithdrawal(e: FormEvent) {
    e.preventDefault();
    await client.post('/staff/withdrawals', {
      person_id: Number(wPersonId),
      withdrawal_date: wDate,
      concept: wConcept.trim(),
      quantity: Number(wQty) || 1,
      unit: wUnit,
      unit_price: wPrice !== '' ? Number(wPrice) : null,
      notes: wNotes.trim() || null,
    });
    setOpenWithdrawalModal(false);
    setWConcept('');
    setWQty('1');
    setWPrice('');
    setWNotes('');
    notify('Retiro a cuenta cargado');
    await loadAll();
  }

  async function handleQuickPriceWithdrawal(w: StaffWithdrawal) {
    const raw = prompt(
      `Ingresá el precio unitario para "${w.concept}" (${w.quantity} ${w.unit}):`,
      w.unit_price != null ? String(w.unit_price) : '',
    );
    if (raw === null) return;
    const num = Number(raw);
    if (isNaN(num) || num < 0) return;
    await client.put(`/staff/withdrawals/${w.id}`, {
      unit_price: num,
    });
    notify('Precio del retiro actualizado');
    await loadAll();
  }

  async function calculateSettlementPreview() {
    if (!sPersonId || !sStart || !sEnd) return;
    setCalculatingPreview(true);
    try {
      const res = await client.post<{ preview: StaffSettlementPreview }>(
        '/staff/settlements/preview',
        {
          person_id: Number(sPersonId),
          period_start: sStart,
          period_end: sEnd,
          settlement_type: sType,
          conceptos_adic: Number(sAdic) || 0,
        },
      );
      setSPreview(res.preview);
    } finally {
      setCalculatingPreview(false);
    }
  }

  async function confirmSettlement() {
    if (!sPreview) return;
    await client.post('/staff/settlements', {
      person_id: sPreview.person_id,
      period_start: sPreview.period_start,
      period_end: sPreview.period_end,
      settlement_type: sPreview.settlement_type,
      hs_atencion: sPreview.hs_atencion,
      monto_atencion: sPreview.monto_atencion,
      hs_produccion: sPreview.hs_produccion,
      monto_produccion: sPreview.monto_produccion,
      hs_fer_trab: sPreview.hs_fer_trab,
      monto_fer_trab: sPreview.monto_fer_trab,
      hs_fer_no_trab: sPreview.hs_fer_no_trab,
      monto_fer_no_trab: sPreview.monto_fer_no_trab,
      hs_licencia: sPreview.hs_licencia,
      monto_licencia: sPreview.monto_licencia,
      monto_aguinaldo: sPreview.monto_aguinaldo,
      subtotal_horas: sPreview.subtotal_horas,
      conceptos_adic: sPreview.conceptos_adic,
      total_bruto: sPreview.total_bruto,
      retiros_aplicados: sPreview.retiros_aplicados,
      total_neto: sPreview.total_neto,
      status: sStatus,
      notes: sNotes.trim() || null,
      impute_withdrawals: true,
    });
    setOpenSettlementModal(false);
    setSPreview(null);
    notify('Liquidación confirmada y retiros pendientes imputados');
    await loadAll();
  }

  function startEditPerson(p: StaffPersonSummary | null) {
    if (p) {
      setEditingPerson(p);
      setCreatingPerson(false);
      setPName(p.name);
      setPRole(p.role);
      setPType((p.settlement_type as 'Semanal' | 'Mensual') || 'Semanal');
      setPRate(String(p.current_rate));
      setPActive(p.is_active === 1);
      setPNotes(p.notes ?? '');
    } else {
      setEditingPerson(null);
      setCreatingPerson(true);
      setPName('');
      setPRole('Empleado');
      setPType('Semanal');
      setPRate('7500');
      setPActive(true);
      setPNotes('');
    }
  }

  async function submitPerson(e: FormEvent) {
    e.preventDefault();
    if (editingPerson) {
      await client.put(`/staff/people/${editingPerson.id}`, {
        name: pName.trim(),
        role: pRole.trim(),
        settlement_type: pType,
        is_active: pActive ? 1 : 0,
        hourly_rate: Number(pRate) || 0,
        rate_valid_from: pRateFrom,
        notes: pNotes.trim() || null,
      });
      notify(`Datos de ${pName} actualizados`);
    } else {
      await client.post('/staff/people', {
        name: pName.trim(),
        role: pRole.trim(),
        settlement_type: pType,
        hourly_rate: Number(pRate) || 0,
        notes: pNotes.trim() || null,
      });
      notify(`Persona ${pName} agregada`);
    }
    setEditingPerson(null);
    setCreatingPerson(false);
    await loadAll();
  }

  function copyPortalLink(code: string, name: string) {
    const url = `${window.location.origin}/empleado/${code}`;
    void navigator.clipboard?.writeText(url);
    notify(`Link del perfil online de ${name} copiado: ${url}`);
  }

  if (loading && !overview) return <Loading />;

  return (
    <section>
      <PageHeader
        eyebrow="Arrabbiata · Gestión de Equipo"
        title="Personal, Horas, Retiros & Liquidaciones"
        actions={
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button variant="ghost" onClick={openShiftBatchModal}>
              ⏱ Turno Atención
            </Button>
            <Button variant="ghost" onClick={() => setOpenHourModal(true)}>
              🥣 + Horas Producción
            </Button>
            <Button variant="ghost" onClick={() => setOpenWithdrawalModal(true)}>
              📦 + Retiro a Cuenta
            </Button>
            <Button
              onClick={() => {
                setSPreview(null);
                setOpenSettlementModal(true);
              }}
            >
              💰 Calcular Liquidación
            </Button>
          </div>
        }
      />

      {toast && (
        <div
          style={{
            background: 'rgba(46, 160, 67, 0.18)',
            border: '1px solid #2ea043',
            color: '#2ea043',
            padding: '10px 14px',
            borderRadius: 10,
            marginBottom: 16,
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          ✓ {toast}
        </div>
      )}

      {/* Pestañas del Sistema de Personal */}
      <div className="cat-filter" role="tablist" style={{ marginBottom: 18 }}>
        <button
          className={`cat-filter__chip${tab === 'overview' ? ' cat-filter__chip--on' : ''}`}
          onClick={() => setTab('overview')}
        >
          👥 Equipo & Perfiles Online ({activePeople.length})
        </button>
        <button
          className={`cat-filter__chip${tab === 'users' ? ' cat-filter__chip--on' : ''}`}
          onClick={() => setTab('users')}
        >
          🔐 Usuarios, Contraseñas y Permisos ({users.length})
        </button>
        <button
          className={`cat-filter__chip${tab === 'hours' ? ' cat-filter__chip--on' : ''}`}
          onClick={() => setTab('hours')}
        >
          ⏱ Registro de Horas ({hours.length})
        </button>
        <button
          className={`cat-filter__chip${tab === 'withdrawals' ? ' cat-filter__chip--on' : ''}`}
          onClick={() => setTab('withdrawals')}
        >
          📦 Retiros a Cuenta ({withdrawals.filter((w) => w.status === 'Pendiente').length} pend.)
        </button>
        <button
          className={`cat-filter__chip${tab === 'settlements' ? ' cat-filter__chip--on' : ''}`}
          onClick={() => setTab('settlements')}
        >
          💰 Liquidaciones & SAC ({settlements.length})
        </button>
        <button
          className={`cat-filter__chip${tab === 'config' ? ' cat-filter__chip--on' : ''}`}
          onClick={() => setTab('config')}
        >
          ⚙️ Tarifas, Horarios y Feriados
        </button>
      </div>

      {/* PESTAÑA 1: EQUIPO & PERFILES ONLINE */}
      {tab === 'overview' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Semana en curso: <strong>{formatDateAR(overview?.week_start)} al {formatDateAR(overview?.week_end)}</strong> · Como administrador podés ver todos los perfiles directamente; cada empleado accede al suyo con su usuario y contraseña.
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <label style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showInactivePeople}
                  onChange={(e) => setShowInactivePeople(e.target.checked)}
                />
                Mostrar inactivos / históricos
              </label>
              <Button variant="ghost" onClick={() => startEditPerson(null)}>
                + Nueva Persona
              </Button>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 16,
            }}
          >
            {visiblePeople.map((p) => {
              const linkedUser = users.find((u) => u.staff_person_id === p.id);
              return (
                <div
                  key={p.id}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: 14,
                    padding: 18,
                    opacity: p.is_active === 1 ? 1 : 0.65,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                          {p.name}{' '}
                          {p.is_active !== 1 && (
                            <span className="badge" style={{ fontSize: 11 }}>inactivo</span>
                          )}
                        </h3>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                          {p.role} · Liq. {p.settlement_type}
                          {linkedUser?.username ? ` · Usuario: @${linkedUser.username}` : ''}
                        </div>
                      </div>
                      <span className="badge badge--accent" style={{ fontSize: 13, fontWeight: 700 }}>
                        {formatARS(p.current_rate)}/h
                      </span>
                    </div>

                    {p.notes && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, fontStyle: 'italic' }}>
                        {p.notes}
                      </div>
                    )}

                    <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10, fontSize: 13, display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--muted)' }}>📅 Semana en curso:</span>
                        <strong>{p.week_effective_hours} hs efectivas</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--muted)' }}>📦 Retiros pendientes:</span>
                        <strong style={{ color: p.pending_withdrawals_sum > 0 ? '#d73828' : 'inherit' }}>
                          {p.pending_withdrawals_cnt} ({formatARS(p.pending_withdrawals_sum)})
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--muted)' }}>💰 Última liquidación:</span>
                        {p.last_settlement ? (
                          <strong>
                            {formatARS(p.last_settlement.total_neto)}{' '}
                            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)' }}>
                              ({formatDateAR(p.last_settlement.period_end)})
                            </span>
                          </strong>
                        ) : (
                          <span>—</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                    <a
                      href={`/empleado/${p.code}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn--primary btn--sm"
                      style={{ textDecoration: 'none', flex: 1, textAlign: 'center' }}
                    >
                      👁 Perfil Online
                    </a>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => copyPortalLink(p.code, p.name)}
                      title="Copiar link del Perfil Online para enviar por WhatsApp"
                    >
                      🔗 Link
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => openUserEditor(linkedUser ?? null, p)}
                      title="Configurar usuario, contraseña y permisos del empleado"
                    >
                      🔐 Accesos
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => startEditPerson(p)}
                    >
                      Editar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* PESTAÑA: USUARIOS, CONTRASEÑAS Y PERMISOS */}
      {tab === 'users' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>🔐 Gestión de Usuarios y Permisos Individuales</h3>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
                Creá usuarios con nombre de usuario para cada empleado, asigná qué herramientas del Panel o si pueden usar la app TPV, y gestioná sus contraseñas.
              </p>
            </div>
            <Button onClick={() => openUserEditor(null)}>
              + Nuevo Usuario
            </Button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Usuario</th>
                  <th>Perfil Empleado</th>
                  <th>Rol Base</th>
                  <th>App TPV</th>
                  <th>Herramientas del Panel</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 700 }}>{u.name}</td>
                    <td>
                      <code style={{ fontWeight: 700, fontSize: 13 }}>
                        @{u.username || u.email}
                      </code>
                    </td>
                    <td>
                      {u.staff_person_name ? (
                        <a href={`/empleado/${u.staff_person_code}`} target="_blank" rel="noreferrer" className="link">
                          🪪 {u.staff_person_name}
                        </a>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      {u.role === 'admin' ? 'Administrador' : u.role === 'manager' ? 'Encargado' : 'Empleado / Cajero'}
                    </td>
                    <td>
                      <span className={`badge ${u.can_use_pos === 1 ? 'badge--accent' : ''}`}>
                        {u.can_use_pos === 1 ? '✓ Habilitado' : 'Sin acceso'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {u.role === 'admin' ? (
                        <strong>Acceso total</strong>
                      ) : Array.isArray(u.allowed_modules) && u.allowed_modules.length > 0 ? (
                        <span>
                          {u.allowed_modules
                            .map((id) => PANEL_MODULE_OPTIONS.find((m) => m.id === id)?.label ?? id)
                            .join(', ')}
                        </span>
                      ) : u.role === 'manager' && u.allowed_modules === null ? (
                        <span>Todos los módulos operativos</span>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>Solo Perfil Personal</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${u.active === 1 ? 'badge--accent' : 'badge--warn'}`}>
                        {u.active === 1 ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="link" onClick={() => openUserEditor(u)}>
                        Editar / Contraseña / Permisos
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PESTAÑA 2: REGISTRO DE HORAS */}
      {tab === 'hours' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 18 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Filtrar por persona:</span>
              <select
                className="input"
                style={{ width: 'auto', minWidth: 180, minHeight: 36 }}
                value={filterPerson}
                onChange={(e) => setFilterPerson(e.target.value)}
              >
                <option value="">Todas las personas</option>
                {(overview?.people ?? []).map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name} ({p.role})
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" onClick={openShiftBatchModal}>
                ⏱ Cargar Turno de Atención
              </Button>
              <Button onClick={() => setOpenHourModal(true)}>
                + Cargar Horas Producción / Manual
              </Button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Persona</th>
                  <th>Tipo de Hora</th>
                  <th>Turno / Horario</th>
                  <th style={{ textAlign: 'right' }}>Hs Reloj</th>
                  <th style={{ textAlign: 'right' }}>Factor</th>
                  <th style={{ textAlign: 'right' }}>Hs Efectivas</th>
                  <th>Tareas / Notas</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredHours.map((h) => (
                  <tr key={h.id}>
                    <td>{formatDateAR(h.work_date)}</td>
                    <td style={{ fontWeight: 700 }}>{h.person_name}</td>
                    <td>{HOUR_TYPE_LABELS[h.hour_type] ?? h.hour_type}</td>
                    <td>
                      {h.shift ?? '—'}
                      {h.start_time && h.end_time ? ` (${h.start_time}–${h.end_time})` : ''}
                    </td>
                    <td style={{ textAlign: 'right' }}>{h.raw_hours} hs</td>
                    <td style={{ textAlign: 'right' }}>{h.factor}x</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{h.effective_hours} hs</td>
                    <td>{h.tasks ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="link link--danger"
                        onClick={async () => {
                          if (!confirm('¿Eliminar este registro de horas?')) return;
                          await client.delete(`/staff/hours/${h.id}`);
                          await loadAll();
                        }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PESTAÑA 3: RETIROS A CUENTA */}
      {tab === 'withdrawals' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 18 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <select
                className="input"
                style={{ width: 'auto', minWidth: 170, minHeight: 36 }}
                value={filterPerson}
                onChange={(e) => setFilterPerson(e.target.value)}
              >
                <option value="">Todas las personas</option>
                {(overview?.people ?? []).map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}
                  </option>
                ))}
              </select>

              <select
                className="input"
                style={{ width: 'auto', minWidth: 160, minHeight: 36 }}
                value={filterWStatus}
                onChange={(e) => setFilterWStatus(e.target.value)}
              >
                <option value="">Todos los estados</option>
                <option value="Pendiente">Pendientes de descontar</option>
                <option value="Imputado">Imputados en liquidación</option>
              </select>
            </div>
            <Button onClick={() => setOpenWithdrawalModal(true)}>
              📦 + Cargar Retiro a Cuenta
            </Button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Persona</th>
                  <th>Producto / Concepto</th>
                  <th style={{ textAlign: 'right' }}>Cantidad</th>
                  <th style={{ textAlign: 'right' }}>Precio Unit.</th>
                  <th style={{ textAlign: 'right' }}>Subtotal</th>
                  <th>Estado</th>
                  <th>Notas</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredWithdrawals.map((w) => (
                  <tr key={w.id}>
                    <td>{formatDateAR(w.withdrawal_date)}</td>
                    <td style={{ fontWeight: 700 }}>{w.person_name}</td>
                    <td>{w.concept}</td>
                    <td style={{ textAlign: 'right' }}>
                      {w.quantity} {w.unit}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {w.unit_price !== null ? (
                        <span
                          onClick={() => void handleQuickPriceWithdrawal(w)}
                          style={{ cursor: 'pointer', borderBottom: '1px dashed rgba(0,0,0,0.3)' }}
                          title="Clic para editar precio unitario"
                        >
                          {formatARS(w.unit_price)}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="link"
                          onClick={() => void handleQuickPriceWithdrawal(w)}
                        >
                          ⚠️ Completar precio
                        </button>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      {w.subtotal !== null ? formatARS(w.subtotal) : '⚠️ Sin precio'}
                    </td>
                    <td>
                      <span className={`badge ${w.status === 'Pendiente' ? 'badge--warn' : 'badge--accent'}`}>
                        {w.status}
                      </span>
                    </td>
                    <td>{w.notes ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="link link--danger"
                        onClick={async () => {
                          if (!confirm('¿Eliminar este retiro a cuenta?')) return;
                          await client.delete(`/staff/withdrawals/${w.id}`);
                          await loadAll();
                        }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PESTAÑA 4: LIQUIDACIONES & AGUINALDO */}
      {tab === 'settlements' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 18 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Filtrar por persona:</span>
              <select
                className="input"
                style={{ width: 'auto', minWidth: 180, minHeight: 36 }}
                value={filterPerson}
                onChange={(e) => setFilterPerson(e.target.value)}
              >
                <option value="">Todas las personas</option>
                {(overview?.people ?? []).map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              onClick={() => {
                setSPreview(null);
                setOpenSettlementModal(true);
              }}
            >
              💰 Nueva Liquidación / Aguinaldo
            </Button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Persona</th>
                  <th>Tipo</th>
                  <th style={{ textAlign: 'right' }}>Atención</th>
                  <th style={{ textAlign: 'right' }}>Producción</th>
                  <th style={{ textAlign: 'right' }}>Feriados / Lic.</th>
                  <th style={{ textAlign: 'right' }}>Adicionales</th>
                  <th style={{ textAlign: 'right' }}>Total Bruto</th>
                  <th style={{ textAlign: 'right' }}>Retiros Desc.</th>
                  <th style={{ textAlign: 'right' }}>TOTAL NETO</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredSettlements.map((s) => {
                  const ferLicMonto = s.monto_fer_trab + s.monto_fer_no_trab + s.monto_licencia + s.monto_aguinaldo;
                  return (
                    <tr key={s.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {formatDateAR(s.period_start)} al {formatDateAR(s.period_end)}
                      </td>
                      <td style={{ fontWeight: 700 }}>{s.person_name}</td>
                      <td>{s.settlement_type}</td>
                      <td style={{ textAlign: 'right' }}>
                        {s.hs_atencion > 0 ? `${s.hs_atencion}h (${formatARS(s.monto_atencion)})` : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {s.hs_produccion > 0 ? `${s.hs_produccion}h (${formatARS(s.monto_produccion)})` : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {ferLicMonto > 0 ? formatARS(ferLicMonto) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {s.conceptos_adic > 0 ? formatARS(s.conceptos_adic) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>{formatARS(s.total_bruto)}</td>
                      <td style={{ textAlign: 'right', color: '#d73828' }}>
                        {s.retiros_aplicados > 0 ? `−${formatARS(s.retiros_aplicados)}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>
                        {formatARS(s.total_neto)}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`badge ${s.status === 'Pagado' ? 'badge--accent' : 'badge--warn'}`}
                          style={{ cursor: 'pointer', border: 'none' }}
                          title="Clic para alternar entre Borrador y Pagado"
                          onClick={async () => {
                            const next = s.status === 'Pagado' ? 'Borrador' : 'Pagado';
                            await client.put(`/staff/settlements/${s.id}/status`, { status: next });
                            await loadAll();
                          }}
                        >
                          {s.status} {s.payment_date ? `(${formatDateAR(s.payment_date)})` : ''}
                        </button>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="link link--danger"
                          onClick={async () => {
                            if (!confirm('¿Eliminar esta liquidación? Los retiros imputados volverán a estado Pendiente.')) return;
                            await client.delete(`/staff/settlements/${s.id}`);
                            await loadAll();
                          }}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PESTAÑA 5: CONFIGURACIÓN (TARIFAS, HORARIOS REGULARES, FERIADOS) */}
      {tab === 'config' && (
        <div style={{ display: 'grid', gap: 20 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 18 }}>
            <h3 style={{ margin: '0 0 12px' }}>💲 Tarifas por Hora (Vigentes e Históricas)</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th style={{ textAlign: 'right' }}>Tarifa / Hora</th>
                  <th>Vigente Desde</th>
                  <th>Vigente Hasta</th>
                  <th>Motivo / Notas</th>
                </tr>
              </thead>
              <tbody>
                {(overview?.rates ?? []).map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 700 }}>{r.person_name}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatARS(r.hourly_rate)}</td>
                    <td>{formatDateAR(r.valid_from)}</td>
                    <td>{r.valid_to ? formatDateAR(r.valid_to) : <span className="badge badge--accent">Vigente actual</span>}</td>
                    <td>{r.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 18 }}>
            <h3 style={{ margin: '0 0 12px' }}>🕒 Horarios Regulares Asignados</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Día</th>
                  <th>Turno</th>
                  <th>Horario</th>
                  <th style={{ textAlign: 'right' }}>Horas Base</th>
                </tr>
              </thead>
              <tbody>
                {(overview?.schedules ?? []).map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 700 }}>{s.person_name}</td>
                    <td>{s.day_of_week}</td>
                    <td>{s.shift}</td>
                    <td>{s.start_time} a {s.end_time}</td>
                    <td style={{ textAlign: 'right' }}>{s.base_hours} hs</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 18 }}>
            <h3 style={{ margin: '0 0 12px' }}>📅 Calendario de Feriados</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Feriado</th>
                  <th>Estado del Local</th>
                </tr>
              </thead>
              <tbody>
                {(overview?.holidays ?? []).map((h) => (
                  <tr key={h.id}>
                    <td>{formatDateAR(h.holiday_date)}</td>
                    <td style={{ fontWeight: 600 }}>{h.description}</td>
                    <td>{h.local_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL USUARIO Y PERMISOS */}
      <Modal
        open={userModalOpen}
        onClose={() => {
          setUserModalOpen(false);
          setEditingUser(null);
        }}
        title={editingUser ? `🔐 Editar Usuario · ${editingUser.name}` : '🔐 Crear Nuevo Usuario'}
      >
        <form onSubmit={submitUser}>
          <div className="form-row">
            <label style={{ fontSize: 13 }}>
              <span>Nombre completo</span>
              <input
                type="text"
                className="input"
                value={uName}
                onChange={(e) => setUName(e.target.value)}
                required
              />
            </label>
            <label style={{ fontSize: 13 }}>
              <span>Nombre de usuario (login)</span>
              <input
                type="text"
                className="input"
                placeholder="Ej: ivan, lulu, bruno"
                value={uUsername}
                onChange={(e) => setUUsername(e.target.value.toLowerCase())}
                required
              />
            </label>
          </div>

          <div className="form-row" style={{ marginTop: 10 }}>
            <label style={{ fontSize: 13 }}>
              <span>{editingUser ? 'Nueva Contraseña (vacío = mantener actual)' : 'Contraseña inicial'}</span>
              <input
                type="text"
                className="input"
                placeholder={editingUser ? 'Escribir solo si querés cambiarla' : 'Mínimo 4 caracteres'}
                value={uPassword}
                onChange={(e) => setUPassword(e.target.value)}
                required={!editingUser}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              <span>Vincular con Perfil de Empleado</span>
              <select
                className="input"
                value={uPersonId}
                onChange={(e) => setUPersonId(e.target.value)}
              >
                <option value="">— Sin perfil de empleado —</option>
                {(overview?.people ?? []).map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name} ({p.role})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-row" style={{ marginTop: 10 }}>
            <label style={{ fontSize: 13 }}>
              <span>Rol Base</span>
              <select
                className="input"
                value={uRole}
                onChange={(e) => setURole(e.target.value as Role)}
              >
                <option value="cashier">Empleado / Cajero</option>
                <option value="manager">Encargado</option>
                <option value="admin">Administrador (Acceso Total)</option>
              </select>
            </label>
            <label style={{ fontSize: 13 }}>
              <span>Email (opcional)</span>
              <input
                type="text"
                className="input"
                placeholder="Se autogenera si queda vacío"
                value={uEmail}
                onChange={(e) => setUEmail(e.target.value)}
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 18, margin: '14px 0', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={uCanPos}
                onChange={(e) => setUCanPos(e.target.checked)}
              />
              <span>📱 Habilitar acceso a la App TPV (Caja, Mesas y Ventas)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={uActive}
                onChange={(e) => setUActive(e.target.checked)}
              />
              <span>Usuario activo</span>
            </label>
          </div>

          {uRole !== 'admin' && (
            <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                  Herramientas del Panel Web habilitadas para este usuario:
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="link"
                    style={{ fontSize: 11 }}
                    onClick={() => setUModules(PANEL_MODULE_OPTIONS.map((m) => m.id))}
                  >
                    Marcar todas
                  </button>
                  <button
                    type="button"
                    className="link"
                    style={{ fontSize: 11 }}
                    onClick={() => setUModules([])}
                  >
                    Ninguna (solo Perfil Personal)
                  </button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 8 }}>
                {PANEL_MODULE_OPTIONS.map((m) => (
                  <label
                    key={m.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={uModules.includes(m.id)}
                      onChange={() => toggleModule(m.id)}
                    />
                    <span>{m.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="form-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setUserModalOpen(false);
                setEditingUser(null);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit">Guardar Usuario y Permisos</Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 1: CARGAR TURNO DE ATENCIÓN (BATCH) */}
      <Modal
        open={openShiftModal}
        onClose={() => setOpenShiftModal(false)}
        title="⏱ Registrar Turno de Atención"
      >
        <form onSubmit={submitShiftBatch}>
          <div className="form-row">
            <label style={{ fontSize: 13 }}>
              <span>Fecha del Turno</span>
              <input
                type="date"
                className="input"
                value={shiftDate}
                onChange={(e) => setShiftDate(e.target.value)}
                required
              />
            </label>
            <label style={{ fontSize: 13 }}>
              <span>Turno</span>
              <select
                className="input"
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value as 'Mañana' | 'Noche')}
              >
                <option value="Mañana">Mañana (11:30 a 15:30 · 4 hs)</option>
                <option value="Noche">Noche (19:00 a 01:00 · 6 hs)</option>
              </select>
            </label>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={shiftHoliday}
              onChange={(e) => setShiftHoliday(e.target.checked)}
            />
            <span>🎉 Es Feriado Trabajado (se liquida al doble: factor 2x)</span>
          </label>

          <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--muted)' }}>
              Tildá quiénes asistieron y si hicieron minutos extra:
            </div>
            {activePeople.map((p) => {
              const st = shiftChecks[p.id] ?? { checked: false, extra: 0 };
              return (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 0',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={st.checked}
                      onChange={(e) =>
                        setShiftChecks((prev) => ({
                          ...prev,
                          [p.id]: { ...st, checked: e.target.checked },
                        }))
                      }
                    />
                    <span>{p.name}</span>
                  </label>
                  <select
                    className="input"
                    style={{ width: 'auto', minHeight: 30, padding: '2px 8px', fontSize: 12 }}
                    disabled={!st.checked}
                    value={st.extra}
                    onChange={(e) =>
                      setShiftChecks((prev) => ({
                        ...prev,
                        [p.id]: { ...st, extra: Number(e.target.value) },
                      }))
                    }
                  >
                    <option value={0}>Sin extra</option>
                    <option value={15}>+15 min (+0.25h)</option>
                    <option value={30}>+30 min (+0.5h)</option>
                    <option value={45}>+45 min (+0.75h)</option>
                    <option value={60}>+60 min (+1h)</option>
                    <option value={90}>+90 min (+1.5h)</option>
                  </select>
                </div>
              );
            })}
          </div>

          <div className="form-actions">
            <Button type="button" variant="ghost" onClick={() => setOpenShiftModal(false)}>
              Cancelar
            </Button>
            <Button type="submit">Guardar Turno</Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: HORAS DE PRODUCCIÓN / MANUAL */}
      <Modal
        open={openHourModal}
        onClose={() => setOpenHourModal(false)}
        title="🥣 Registrar Horas de Producción / Manual"
      >
        <form onSubmit={submitHour}>
          <div className="form-row">
            <label style={{ fontSize: 13 }}>
              <span>Persona</span>
              <select
                className="input"
                value={hPersonId}
                onChange={(e) => setHPersonId(e.target.value)}
                required
              >
                {activePeople.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 13 }}>
              <span>Fecha</span>
              <input
                type="date"
                className="input"
                value={hDate}
                onChange={(e) => setHDate(e.target.value)}
                required
              />
            </label>
          </div>

          <div className="form-row" style={{ marginTop: 10 }}>
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
              >
                {Object.entries(HOUR_TYPE_LABELS).map(([k, lbl]) => (
                  <option key={k} value={k}>
                    {lbl}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 13 }}>
              <span>Turno / Etiqueta</span>
              <input
                type="text"
                className="input"
                value={hShift}
                onChange={(e) => setHShift(e.target.value)}
              />
            </label>
          </div>

          <div className="form-row" style={{ marginTop: 10 }}>
            <label style={{ fontSize: 13 }}>
              <span>Hora Inicio</span>
              <input
                type="time"
                className="input"
                value={hStart}
                onChange={(e) => setHStart(e.target.value)}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              <span>Hora Fin</span>
              <input
                type="time"
                className="input"
                value={hEnd}
                onChange={(e) => setHEnd(e.target.value)}
              />
            </label>
          </div>

          <label style={{ display: 'block', marginTop: 10, fontSize: 13 }}>
            <span>O cantidad de horas directas (opcional)</span>
            <input
              type="number"
              step="0.25"
              min="0"
              className="input"
              placeholder="Ej: 3.5 (si se deja vacío se calcula con Inicio y Fin)"
              value={hRaw}
              onChange={(e) => setHRaw(e.target.value)}
            />
          </label>

          <label style={{ display: 'block', marginTop: 10, marginBottom: 16, fontSize: 13 }}>
            <span>Tareas realizadas / Notas</span>
            <input
              type="text"
              className="input"
              placeholder="Ej: Biga, amasado, bollado, salsa…"
              value={hTasks}
              onChange={(e) => setHTasks(e.target.value)}
            />
          </label>

          <div className="form-actions">
            <Button type="button" variant="ghost" onClick={() => setOpenHourModal(false)}>
              Cancelar
            </Button>
            <Button type="submit">Guardar Horas</Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 3: CARGAR RETIRO A CUENTA */}
      <Modal
        open={openWithdrawalModal}
        onClose={() => setOpenWithdrawalModal(false)}
        title="📦 Cargar Retiro a Cuenta de Mercadería"
      >
        <form onSubmit={submitWithdrawal}>
          <div className="form-row">
            <label style={{ fontSize: 13 }}>
              <span>Persona</span>
              <select
                className="input"
                value={wPersonId}
                onChange={(e) => setWPersonId(e.target.value)}
                required
              >
                {activePeople.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 13 }}>
              <span>Fecha</span>
              <input
                type="date"
                className="input"
                value={wDate}
                onChange={(e) => setWDate(e.target.value)}
                required
              />
            </label>
          </div>

          <label style={{ display: 'block', marginTop: 10, fontSize: 13 }}>
            <span>Producto / Insumo / Concepto</span>
            <input
              type="text"
              list="staff-supplies-list"
              className="input"
              placeholder="Elegí un insumo o escribí el concepto…"
              value={wConcept}
              onChange={(e) => handleSelectSupply(e.target.value)}
              required
            />
            <datalist id="staff-supplies-list">
              {(overview?.supplies ?? []).map((s) => (
                <option key={s.id} value={s.name}>
                  {s.unit} · {formatARS(s.cost)}
                </option>
              ))}
            </datalist>
          </label>

          <div className="form-row" style={{ marginTop: 10 }}>
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
              />
            </label>
            <label style={{ fontSize: 13 }}>
              <span>Unidad</span>
              <select
                className="input"
                value={wUnit}
                onChange={(e) => setWUnit(e.target.value)}
              >
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="unidad">unidad</option>
                <option value="L">L</option>
              </select>
            </label>
          </div>

          <div className="form-row" style={{ marginTop: 10, marginBottom: 14 }}>
            <label style={{ fontSize: 13 }}>
              <span>Precio Unitario (opcional)</span>
              <input
                type="number"
                step="any"
                min="0"
                className="input"
                placeholder="Vacío = completar antes de liquidar"
                value={wPrice}
                onChange={(e) => setWPrice(e.target.value)}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              <span>Notas</span>
              <input
                type="text"
                className="input"
                value={wNotes}
                onChange={(e) => setWNotes(e.target.value)}
              />
            </label>
          </div>

          <div className="form-actions">
            <Button type="button" variant="ghost" onClick={() => setOpenWithdrawalModal(false)}>
              Cancelar
            </Button>
            <Button type="submit">Guardar Retiro</Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 4: CALCULAR Y CONFIRMAR LIQUIDACIÓN / SAC */}
      <Modal
        open={openSettlementModal}
        onClose={() => setOpenSettlementModal(false)}
        title="💰 Calcular Liquidación / Aguinaldo (SAC)"
      >
        <div>
          <div className="form-row">
            <label style={{ fontSize: 13 }}>
              <span>Persona</span>
              <select
                className="input"
                value={sPersonId}
                onChange={(e) => {
                  const pid = e.target.value;
                  setSPersonId(pid);
                  const found = overview?.people.find((p) => String(p.id) === pid);
                  if (found && (found.settlement_type === 'Semanal' || found.settlement_type === 'Mensual')) {
                    setSType(found.settlement_type);
                  }
                  setSPreview(null);
                }}
              >
                {(overview?.people ?? []).map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name} ({p.settlement_type} · {formatARS(p.current_rate)}/h)
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 13 }}>
              <span>Tipo de Liquidación</span>
              <select
                className="input"
                value={sType}
                onChange={(e) => {
                  setSType(e.target.value as 'Semanal' | 'Mensual' | 'Aguinaldo' | 'Vacaciones');
                  setSPreview(null);
                }}
              >
                <option value="Semanal">Semanal</option>
                <option value="Mensual">Mensual</option>
                <option value="Aguinaldo">Aguinaldo (SAC 50% mejor mes)</option>
                <option value="Vacaciones">Vacaciones</option>
              </select>
            </label>
          </div>

          <div className="form-row" style={{ marginTop: 10 }}>
            <label style={{ fontSize: 13 }}>
              <span>Inicio Período</span>
              <input
                type="date"
                className="input"
                value={sStart}
                onChange={(e) => {
                  setSStart(e.target.value);
                  setSPreview(null);
                }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              <span>Fin Período</span>
              <input
                type="date"
                className="input"
                value={sEnd}
                onChange={(e) => {
                  setSEnd(e.target.value);
                  setSPreview(null);
                }}
              />
            </label>
          </div>

          <div className="form-row" style={{ marginTop: 10 }}>
            <label style={{ fontSize: 13 }}>
              <span>Conceptos Adicionales ($)</span>
              <input
                type="number"
                step="any"
                className="input"
                value={sAdic}
                onChange={(e) => {
                  setSAdic(e.target.value);
                  setSPreview(null);
                }}
                placeholder="Ej: Control arqueos Lulú ($18.000)"
              />
            </label>
            <label style={{ fontSize: 13 }}>
              <span>Estado al guardar</span>
              <select
                className="input"
                value={sStatus}
                onChange={(e) => setSStatus(e.target.value as 'Pagado' | 'Borrador')}
              >
                <option value="Pagado">Pagado</option>
                <option value="Borrador">Borrador</option>
              </select>
            </label>
          </div>

          <div style={{ marginTop: 12, marginBottom: 14 }}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void calculateSettlementPreview()}
              disabled={calculatingPreview}
            >
              {calculatingPreview ? 'Calculando…' : '🔄 Pre-calcular Horas y Retiros del Período'}
            </Button>
          </div>

          {sPreview && (
            <div
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                borderRadius: 12,
                padding: 14,
                marginBottom: 14,
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                Resumen de Liquidación · {sPreview.person_name} ({formatARS(sPreview.current_rate)}/h)
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Horas Atención ({sPreview.hs_atencion} hs):</span>
                  <strong>{formatARS(sPreview.monto_atencion)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Horas Producción ({sPreview.hs_produccion} hs):</span>
                  <strong>{formatARS(sPreview.monto_produccion)}</strong>
                </div>
                {sPreview.hs_fer_trab > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Feriado Trabajado 2x ({sPreview.hs_fer_trab} hs):</span>
                    <strong>{formatARS(sPreview.monto_fer_trab)}</strong>
                  </div>
                )}
                {sPreview.hs_fer_no_trab > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Feriado No Trabajado ({sPreview.hs_fer_no_trab} hs):</span>
                    <strong>{formatARS(sPreview.monto_fer_no_trab)}</strong>
                  </div>
                )}
                {sPreview.monto_aguinaldo > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Aguinaldo (SAC 50% mejor mes):</span>
                    <strong>{formatARS(sPreview.monto_aguinaldo)}</strong>
                  </div>
                )}
                {sPreview.conceptos_adic > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Conceptos adicionales:</span>
                    <strong>{formatARS(sPreview.conceptos_adic)}</strong>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 6, marginTop: 4 }}>
                  <span>Total Bruto:</span>
                  <strong>{formatARS(sPreview.total_bruto)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#d73828' }}>
                  <span>Retiros pendientes a descontar ({sPreview.pending_withdrawals.length}):</span>
                  <strong>− {formatARS(sPreview.retiros_aplicados)}</strong>
                </div>
                {sPreview.withdrawals_missing_price > 0 && (
                  <div style={{ color: '#b45309', fontWeight: 700, fontSize: 12 }}>
                    ⚠️ Hay {sPreview.withdrawals_missing_price} retiro(s) pendiente(s) sin precio unitario cargado.
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 6, marginTop: 4, fontSize: 16 }}>
                  <strong>TOTAL NETO A PAGAR:</strong>
                  <strong style={{ color: '#2ea043' }}>{formatARS(sPreview.total_neto)}</strong>
                </div>
              </div>
            </div>
          )}

          <div className="form-actions">
            <Button type="button" variant="ghost" onClick={() => setOpenSettlementModal(false)}>
              Cancelar
            </Button>
            {sPreview && (
              <Button type="button" onClick={() => void confirmSettlement()}>
                Confirmar y Guardar Liquidación
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* MODAL 5: CREAR / EDITAR PERSONA Y TARIFA */}
      <Modal
        open={creatingPerson || editingPerson !== null}
        onClose={() => {
          setCreatingPerson(false);
          setEditingPerson(null);
        }}
        title={editingPerson ? `Editar · ${editingPerson.name}` : 'Nueva Persona'}
      >
        <form onSubmit={submitPerson}>
          <div className="form-row">
            <label style={{ fontSize: 13 }}>
              <span>Nombre</span>
              <input
                type="text"
                className="input"
                value={pName}
                onChange={(e) => setPName(e.target.value)}
                required
              />
            </label>
            <label style={{ fontSize: 13 }}>
              <span>Rol</span>
              <input
                type="text"
                className="input"
                value={pRole}
                onChange={(e) => setPRole(e.target.value)}
                required
              />
            </label>
          </div>

          <div className="form-row" style={{ marginTop: 10 }}>
            <label style={{ fontSize: 13 }}>
              <span>Tipo de Liquidación</span>
              <select
                className="input"
                value={pType}
                onChange={(e) => setPType(e.target.value as 'Semanal' | 'Mensual')}
              >
                <option value="Semanal">Semanal</option>
                <option value="Mensual">Mensual</option>
              </select>
            </label>
            <label style={{ fontSize: 13 }}>
              <span>Valor Hora Vigente ($/h)</span>
              <input
                type="number"
                step="any"
                min="0"
                className="input"
                value={pRate}
                onChange={(e) => setPRate(e.target.value)}
                required
              />
            </label>
          </div>

          {editingPerson && (
            <div className="form-row" style={{ marginTop: 10 }}>
              <label style={{ fontSize: 13 }}>
                <span>Vigencia desde (si cambiás la tarifa)</span>
                <input
                  type="date"
                  className="input"
                  value={pRateFrom}
                  onChange={(e) => setPRateFrom(e.target.value)}
                />
              </label>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, paddingTop: 22 }}>
                <input
                  type="checkbox"
                  checked={pActive}
                  onChange={(e) => setPActive(e.target.checked)}
                />
                <span>Persona Activa</span>
              </label>
            </div>
          )}

          <label style={{ display: 'block', marginTop: 10, marginBottom: 16, fontSize: 13 }}>
            <span>Notas (ej. Control de arqueos, Solo atención…)</span>
            <input
              type="text"
              className="input"
              value={pNotes}
              onChange={(e) => setPNotes(e.target.value)}
            />
          </label>

          <div className="form-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setCreatingPerson(false);
                setEditingPerson(null);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit">Guardar</Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
