import { useState } from 'react';
import { Input } from '@/ui';

export interface ReportFilterProps {
  from: string;
  to: string;
  onFromChange: (val: string) => void;
  onToChange: (val: string) => void;
  hourFrom?: number;
  hourTo?: number;
  onHourChange?: (from?: number, to?: number) => void;
  onExportCsv?: () => void;
  isLoading?: boolean;
}

export function dateNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dateDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const escapeCell = (c: string | number | null | undefined) => {
    if (c === null || c === undefined) return '""';
    const s = String(c).replace(/"/g, '""');
    return `"${s}"`;
  };
  const csvContent =
    '\uFEFF' +
    [headers.map(escapeCell).join(';'), ...rows.map((r) => r.map(escapeCell).join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ReportFilterBar({
  from,
  to,
  onFromChange,
  onToChange,
  hourFrom,
  hourTo,
  onHourChange,
  onExportCsv,
  isLoading,
}: ReportFilterProps) {
  const [showHours, setShowHours] = useState(hourFrom !== undefined && hourTo !== undefined);

  const setPreset = (preset: 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'this_month' | 'prev_month') => {
    const today = dateNow();
    const d = new Date();
    if (preset === 'today') {
      onFromChange(today);
      onToChange(today);
    } else if (preset === 'yesterday') {
      const y = dateDaysAgo(1);
      onFromChange(y);
      onToChange(y);
    } else if (preset === '7d') {
      onFromChange(dateDaysAgo(6));
      onToChange(today);
    } else if (preset === '30d') {
      onFromChange(dateDaysAgo(29));
      onToChange(today);
    } else if (preset === '90d') {
      onFromChange(dateDaysAgo(89));
      onToChange(today);
    } else if (preset === 'this_month') {
      onFromChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
      onToChange(today);
    } else if (preset === 'prev_month') {
      const prevM = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const lastDayPrevM = new Date(d.getFullYear(), d.getMonth(), 0);
      onFromChange(
        `${prevM.getFullYear()}-${String(prevM.getMonth() + 1).padStart(2, '0')}-01`,
      );
      onToChange(
        `${lastDayPrevM.getFullYear()}-${String(lastDayPrevM.getMonth() + 1).padStart(2, '0')}-${String(lastDayPrevM.getDate()).padStart(2, '0')}`,
      );
    }
  };

  const btnStyle: React.CSSProperties = {
    padding: '0.45rem 0.75rem',
    borderRadius: 6,
    border: '1px solid var(--c-border, #ddd)',
    background: 'var(--c-surface, #fff)',
    color: 'var(--c-text, #222)',
    fontSize: '0.82rem',
    fontWeight: 500,
    cursor: 'pointer',
  };

  return (
    <div
      style={{
        background: 'var(--c-surface, #fff)',
        border: '1px solid var(--c-border, #ddd)',
        borderRadius: 10,
        padding: '0.85rem 1rem',
        marginBottom: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600, marginRight: 2 }}>Período:</span>
          <button type="button" style={btnStyle} onClick={() => setPreset('today')}>Hoy</button>
          <button type="button" style={btnStyle} onClick={() => setPreset('yesterday')}>Ayer</button>
          <button type="button" style={btnStyle} onClick={() => setPreset('7d')}>7 días</button>
          <button type="button" style={btnStyle} onClick={() => setPreset('30d')}>30 días</button>
          <button type="button" style={btnStyle} onClick={() => setPreset('90d')}>90 días</button>
          <button type="button" style={btnStyle} onClick={() => setPreset('this_month')}>Este mes</button>
          <button type="button" style={btnStyle} onClick={() => setPreset('prev_month')}>Mes anterior</button>
        </div>

        {onExportCsv && (
          <button
            type="button"
            onClick={onExportCsv}
            disabled={isLoading}
            style={{
              ...btnStyle,
              background: 'var(--c-accent, #c7101b)',
              color: '#fff',
              border: 0,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>📥</span> Exportar CSV
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
        <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.82rem', fontWeight: 600 }}>
          Desde
          <Input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} />
        </label>
        <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.82rem', fontWeight: 600 }}>
          Hasta
          <Input type="date" value={to} onChange={(e) => onToChange(e.target.value)} />
        </label>

        {onHourChange && (
          <>
            <button
              type="button"
              style={{ ...btnStyle, alignSelf: 'flex-end', height: 38 }}
              onClick={() => {
                if (showHours) {
                  setShowHours(false);
                  onHourChange(undefined, undefined);
                } else {
                  setShowHours(true);
                  onHourChange(11, 16);
                }
              }}
            >
              🕒 {showHours ? 'Quitar filtro horario' : 'Filtrar por horario'}
            </button>

            {showHours && (
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.82rem', fontWeight: 600 }}>
                  Hora inicio
                  <select
                    value={hourFrom ?? 11}
                    onChange={(e) => onHourChange(Number(e.target.value), hourTo ?? 16)}
                    style={{ padding: '0.45rem', borderRadius: 6, border: '1px solid #ccc' }}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, '0')}:00 hs</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.82rem', fontWeight: 600 }}>
                  Hora fin
                  <select
                    value={hourTo ?? 16}
                    onChange={(e) => onHourChange(hourFrom ?? 11, Number(e.target.value))}
                    style={{ padding: '0.45rem', borderRadius: 6, border: '1px solid #ccc' }}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, '0')}:00 hs</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
