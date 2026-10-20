import { config } from '@/lib/config';

export interface StaffSettlement {
  id: number;
  person_id: number;
  person_name: string;
  period_start: string;
  period_end: string;
  settlement_type: 'Semanal' | 'Mensual' | 'Aguinaldo' | 'Vacaciones' | string;
  hs_atencion: number;
  monto_atencion: number;
  hs_produccion: number;
  monto_produccion: number;
  hs_fer_trab: number;
  monto_fer_trab: number;
  hs_fer_no_trab: number;
  monto_fer_no_trab: number;
  hs_licencia: number;
  monto_licencia: number;
  monto_aguinaldo: number;
  subtotal_horas: number;
  conceptos_adic: number;
  total_bruto: number;
  retiros_aplicados: number;
  total_neto: number;
  status: 'Borrador' | 'Pagado' | string;
  payment_date: string | null;
  notes: string | null;
}

export interface StaffPersonSummary {
  id: number;
  code: string;
  name: string;
  role: string;
  settlement_type: 'Semanal' | 'Mensual' | string;
  is_active: number;
  notes: string | null;
  current_rate: number;
  week_start: string;
  week_end: string;
  week_effective_hours: number;
  pending_withdrawals_cnt: number;
  pending_withdrawals_sum: number;
  last_settlement: StaffSettlement | null;
}

export interface StaffRate {
  id: number;
  person_id: number;
  person_name: string;
  hourly_rate: number;
  valid_from: string;
  valid_to: string | null;
  reason: string | null;
}

export interface StaffSchedule {
  id: number;
  person_id?: number;
  person_name?: string;
  day_of_week: string;
  shift: string;
  start_time: string;
  end_time: string;
  base_hours: number;
  valid_from?: string;
  valid_to?: string | null;
}

export interface StaffHoliday {
  id: number;
  holiday_date: string;
  description: string;
  local_status: string;
}

export interface StaffSupplyOption {
  id: number;
  name: string;
  unit: string;
  cost: number;
}

export interface StaffOverviewResponse {
  week_start: string;
  week_end: string;
  people: StaffPersonSummary[];
  rates: StaffRate[];
  schedules: StaffSchedule[];
  holidays: StaffHoliday[];
  supplies: StaffSupplyOption[];
}

export interface StaffHour {
  id: number;
  person_id: number;
  person_name: string;
  work_date: string;
  hour_type: string;
  shift: string | null;
  start_time: string | null;
  end_time: string | null;
  raw_hours: number;
  factor: number;
  effective_hours: number;
  tasks: string | null;
  settlement_id: number | null;
}

export interface StaffWithdrawal {
  id: number;
  person_id: number;
  person_name: string;
  withdrawal_date: string;
  concept: string;
  quantity: number;
  unit: string;
  unit_price: number | null;
  subtotal: number | null;
  status: 'Pendiente' | 'Imputado' | string;
  settlement_id: number | null;
  notes: string | null;
}

export interface StaffSettlementPreview extends Omit<StaffSettlement, 'id' | 'status' | 'payment_date' | 'notes'> {
  current_rate: number;
  pending_withdrawals: StaffWithdrawal[];
  withdrawals_missing_price: number;
}

export interface EmployeePortalData {
  person: {
    id: number;
    code: string;
    name: string;
    role: string;
    settlement_type: string;
    notes: string | null;
    business_name: string;
    current_rate: number;
  };
  current_week: {
    period_start: string;
    period_end: string;
    effective_hours: number;
    estimated_amount: number;
  };
  pending_withdrawals: {
    count: number;
    total: number;
    items: StaffWithdrawal[];
  };
  last_settlement: StaffSettlement | null;
  schedules: StaffSchedule[];
  hours: StaffHour[];
  withdrawals: StaffWithdrawal[];
  settlements: StaffSettlement[];
  supplies: StaffSupplyOption[];
}

export const HOUR_TYPE_LABELS: Record<string, string> = {
  atencion: 'Atención (1x)',
  produccion: 'Producción (1x)',
  feriado_trabajado: 'Feriado Trabajado (2x)',
  feriado_no_trab: 'Feriado No Trabajado (1x)',
  licencia_enf: 'Licencia Enfermedad (1x)',
  vacacion: 'Vacación (1x)',
  intercambio_dia: 'Intercambio de Día (0x)',
};

export function formatDateAR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const parts = iso.slice(0, 10).split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

async function publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const base = config.apiUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(json?.error?.message ?? 'Error al comunicarse con el servidor');
  }
  return json.data as T;
}

export const publicStaffPortalApi = {
  getPortal: (code: string) =>
    publicRequest<EmployeePortalData>(`/public/staff-portal/${encodeURIComponent(code)}`),
  createWithdrawal: (
    code: string,
    data: {
      withdrawal_date: string;
      concept: string;
      quantity: number;
      unit: string;
      unit_price?: number | null;
      notes?: string;
    },
  ) =>
    publicRequest<{ id: number }>(
      `/public/staff-portal/${encodeURIComponent(code)}/withdrawals`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    ),
  createHour: (
    code: string,
    data: {
      work_date: string;
      hour_type: string;
      shift?: string;
      start_time?: string;
      end_time?: string;
      raw_hours?: number;
      tasks?: string;
    },
  ) =>
    publicRequest<{ id: number }>(
      `/public/staff-portal/${encodeURIComponent(code)}/hours`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    ),
};
