import { useEffect, useState } from 'react';
import { useOnline } from '@/lib/network';
import { RoundCard } from './RoundCard';
import { useKitchenRounds, useSetRoundStatus } from './hooks';

export function KitchenPage() {
  const rounds = useKitchenRounds();
  const setStatus = useSetRoundStatus();
  const online = useOnline();

  // Tick para que el "hace X min" avance aunque no haya refetch.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  if (!online) return <div className="boot">La cocina necesita conexión.</div>;
  if (rounds.isLoading) return <div className="boot">Cargando comandas…</div>;
  if (rounds.isError) return <div className="boot">No se pudieron cargar las comandas.</div>;

  const list = rounds.data ?? [];
  const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));

  if (sorted.length === 0) {
    return <div className="kds-empty">No hay comandas pendientes.</div>;
  }

  return (
    <div className="kds">
      {sorted.map((r) => (
        <RoundCard
          key={r.id}
          round={r}
          busy={setStatus.isPending}
          onAdvance={(status) => setStatus.mutate({ roundId: r.id, status })}
        />
      ))}
    </div>
  );
}
