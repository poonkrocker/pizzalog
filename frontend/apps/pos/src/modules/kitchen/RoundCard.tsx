import type { KitchenRound, RoundStatus } from '@pizzalog/shared';

const NEXT: Partial<Record<RoundStatus, { status: RoundStatus; label: string }>> = {
  pending: { status: 'preparing', label: 'Empezar' },
  preparing: { status: 'ready', label: 'Lista' },
  ready: { status: 'served', label: 'Entregada' },
};

const STATUS_LABEL: Partial<Record<RoundStatus, string>> = {
  pending: 'Nueva',
  preparing: 'En preparación',
  ready: 'Lista',
};

// Parseo robusto: admite ISO o "YYYY-MM-DD HH:MM:SS" (formato MySQL).
function parseTs(s: string): number {
  const iso = s.includes('T') ? s : s.replace(' ', 'T');
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? Date.now() : t;
}

function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - parseTs(iso)) / 60000));
}

interface Props {
  round: KitchenRound;
  busy: boolean;
  onAdvance: (status: RoundStatus) => void;
}

export function RoundCard({ round, busy, onAdvance }: Props) {
  const mins = minutesSince(round.created_at);
  const urgent = round.status !== 'ready' && mins >= 15;
  const next = NEXT[round.status];

  return (
    <div className={`kds-card kds-card--${round.status}${urgent ? ' is-urgent' : ''}`}>
      <div className="kds-card__head">
        <span className="kds-card__table">{round.tables_label ?? 'Mostrador'}</span>
        <span className="kds-card__time">{mins === 0 ? 'recién' : `hace ${mins}′`}</span>
      </div>
      <div className="kds-card__sub">
        Comanda {round.number} · {STATUS_LABEL[round.status] ?? round.status}
      </div>

      <ul className="kds-items">
        {round.items.map((it) => (
          <li key={it.id}>
            <span className="kds-qty">{it.qty}×</span> {it.name}
            {it.note && <span className="kds-note">{it.note}</span>}
          </li>
        ))}
      </ul>

      {round.note && <p className="kds-roundnote">{round.note}</p>}

      {next && (
        <button className="t-btn kds-btn" disabled={busy} onClick={() => onAdvance(next.status)}>
          {next.label}
        </button>
      )}
    </div>
  );
}
