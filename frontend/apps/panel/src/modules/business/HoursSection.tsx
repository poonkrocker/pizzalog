import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type BusinessHour } from '@pizzalog/shared';
import { Button, Field, Input, Loading } from '@/ui';
import { useApi } from '@/lib/auth';

/** day_of_week: 0 = domingo … 6 = sábado (igual que el back). */
const DAYS = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
];

/**
 * Horarios de atención: 0, 1 o varias franjas por día (mediodía y noche por
 * separado, como en Arrabbiata). El horario gatea el PEDIDO online, no la
 * carta: con el local cerrado la carta se sigue viendo.
 */
export function HoursSection() {
  const api = useApi();
  const qc = useQueryClient();

  const hours = useQuery({
    queryKey: ['business-hours'],
    queryFn: () => api.business.hours(),
  });

  const save = useMutation({
    mutationFn: (slots: BusinessHour[]) => api.business.updateHours(slots),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['business-hours'] }),
  });

  const [slots, setSlots] = useState<BusinessHour[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (hours.data && slots === null) setSlots(hours.data.hours);
  }, [hours.data, slots]);

  if (hours.isLoading || slots === null) return <Loading />;

  const patch = (i: number, changes: Partial<BusinessHour>) =>
    setSlots((s) => (s ?? []).map((slot, idx) => (idx === i ? { ...slot, ...changes } : slot)));

  async function onSave() {
    setError(null);
    setSaved(false);
    for (const s of slots ?? []) {
      if (!s.opens_at || !s.closes_at) return setError('Completá las dos horas de cada franja.');
      if (s.opens_at === s.closes_at) {
        return setError('Una franja no puede abrir y cerrar a la misma hora.');
      }
    }
    try {
      await save.mutateAsync(slots ?? []);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron guardar los horarios');
    }
  }

  return (
    <div className="hours-block">
      <h2 className="theme-block__title">Horarios de atención</h2>
      <p className="field__hint">
        Fuera de estas franjas la carta se sigue viendo, pero el pedido online queda
        deshabilitado y el servidor lo rechaza. Sin ninguna franja cargada, manda solo el
        switch de «Acepto pedidos online».{' '}
        {hours.data && (
          <b>{hours.data.is_open_for_orders ? 'Ahora estás abierto.' : 'Ahora estás cerrado.'}</b>
        )}
      </p>

      {DAYS.map((d) => {
        const dayIdx = (slots ?? [])
          .map((s, i) => ({ s, i }))
          .filter(({ s }) => s.day_of_week === d.value);

        return (
          <div key={d.value} className="hours-day">
            <span className="hours-day__name">{d.label}</span>

            <div className="hours-day__slots">
              {dayIdx.length === 0 && <span className="field__hint">Cerrado</span>}

              {dayIdx.map(({ s, i }) => (
                <div key={i} className="hours-slot">
                  <Field label="Abre">
                    <Input
                      type="time"
                      value={s.opens_at}
                      onChange={(e) => patch(i, { opens_at: e.target.value })}
                    />
                  </Field>
                  <Field label="Cierra">
                    <Input
                      type="time"
                      value={s.closes_at}
                      onChange={(e) => patch(i, { closes_at: e.target.value })}
                    />
                  </Field>
                  <button
                    type="button"
                    className="link link--danger"
                    onClick={() => setSlots((all) => (all ?? []).filter((_, idx) => idx !== i))}
                  >
                    Quitar
                  </button>
                </div>
              ))}

              <button
                type="button"
                className="link"
                onClick={() =>
                  setSlots((all) => [
                    ...(all ?? []),
                    { day_of_week: d.value, opens_at: '20:00', closes_at: '23:59' },
                  ])
                }
              >
                + Agregar franja
              </button>
            </div>
          </div>
        );
      })}

      {error && (
        <p className="login__error" role="alert">
          {error}
        </p>
      )}
      {saved && <p className="business-form__ok">Horarios guardados.</p>}

      <div className="form-actions">
        <Button type="button" onClick={() => void onSave()} disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar horarios'}
        </Button>
      </div>
    </div>
  );
}
