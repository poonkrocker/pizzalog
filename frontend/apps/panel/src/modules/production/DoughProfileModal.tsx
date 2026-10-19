import { useEffect, useState } from 'react';
import type { DoughProfile, DoughProfileInput } from '@pizzalog/shared';
import { Button, Field, Input, Modal, Select, Textarea } from '@/ui';
import { useCreateDoughProfile, useDeleteDoughProfile, useUpdateDoughProfile } from './hooks';

export function DoughProfileModal({
  open,
  onClose,
  profile,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  profile?: DoughProfile | null;
  onSaved?: (saved: DoughProfile) => void;
}) {
  const isEditing = Boolean(profile);
  const createMutation = useCreateDoughProfile();
  const updateMutation = useUpdateDoughProfile();
  const deleteMutation = useDeleteDoughProfile();

  const [name, setName] = useState('');
  const [unitWeightGrams, setUnitWeightGrams] = useState<number>(220);
  const [hydrationPct, setHydrationPct] = useState<number>(67.9);
  const [method, setMethod] = useState<'direct' | 'biga' | 'poolish'>('biga');

  // Prefermentos
  const [bigaPct, setBigaPct] = useState<number>(25);
  const [bigaWaterPct, setBigaWaterPct] = useState<number>(50);
  const [bigaYeastPct, setBigaYeastPct] = useState<number>(0.5);

  const [poolishPct, setPoolishPct] = useState<number>(20);
  const [poolishWaterPct, setPoolishWaterPct] = useState<number>(100);
  const [poolishYeastPct, setPoolishYeastPct] = useState<number>(10);

  const [directYeastPct, setDirectYeastPct] = useState<number>(0.35);
  const [saltPct, setSaltPct] = useState<number>(2.7);
  const [sugarPct, setSugarPct] = useState<number>(0);
  const [oilPct, setOilPct] = useState<number>(0);

  // Mezcla de harinas
  const [flourWhitePct, setFlourWhitePct] = useState<number>(81.75);
  const [flourSemolaPct, setFlourSemolaPct] = useState<number>(6.08);
  const [flourIntegralPct, setFlourIntegralPct] = useState<number>(12.17);

  const [costPerKg, setCostPerKg] = useState<number>(932.3);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setUnitWeightGrams(profile.unit_weight_grams);
      setHydrationPct(profile.hydration_pct);

      if (profile.biga_pct > 0) {
        setMethod('biga');
      } else if (profile.poolish_pct > 0) {
        setMethod('poolish');
      } else {
        setMethod('direct');
      }

      setBigaPct(profile.biga_pct);
      setBigaWaterPct(profile.biga_water_pct);
      setBigaYeastPct(profile.biga_yeast_pct);

      setPoolishPct(profile.poolish_pct);
      setPoolishWaterPct(profile.poolish_water_pct);
      setPoolishYeastPct(profile.poolish_yeast_pct);

      setDirectYeastPct(profile.direct_yeast_pct || 0.35);
      setSaltPct(profile.salt_pct);
      setSugarPct(profile.sugar_pct);
      setOilPct(profile.oil_pct);

      setFlourWhitePct(profile.flour_white_pct);
      setFlourSemolaPct(profile.flour_semola_pct);
      setFlourIntegralPct(profile.flour_integral_pct);

      setCostPerKg(profile.cost_per_kg);
      setNotes(profile.notes ?? '');
    } else {
      // Defaults para nueva masa (directo por defecto o editable)
      setName('');
      setUnitWeightGrams(220);
      setHydrationPct(66);
      setMethod('direct');
      setBigaPct(0);
      setBigaWaterPct(50);
      setBigaYeastPct(0.5);
      setPoolishPct(0);
      setPoolishWaterPct(100);
      setPoolishYeastPct(10);
      setDirectYeastPct(0.35);
      setSaltPct(2.7);
      setSugarPct(0);
      setOilPct(0);
      setFlourWhitePct(100);
      setFlourSemolaPct(0);
      setFlourIntegralPct(0);
      setCostPerKg(920);
      setNotes('');
    }
    setError(null);
  }, [profile, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Por favor ingresá un nombre para la masa (ej: Amasado Directo o Pizza Detroit).');
      return;
    }

    const flourSum = flourWhitePct + flourSemolaPct + flourIntegralPct;
    if (Math.abs(flourSum - 100) > 1.0) {
      setError(`La suma de harinas debe ser 100%. Actualmente suma ${flourSum.toFixed(1)}%.`);
      return;
    }

    const payload: DoughProfileInput = {
      name: name.trim(),
      unit_weight_grams: Number(unitWeightGrams),
      hydration_pct: Number(hydrationPct),
      biga_pct: method === 'biga' ? Number(bigaPct) : 0,
      biga_water_pct: method === 'biga' ? Number(bigaWaterPct) : 0,
      biga_yeast_pct: method === 'biga' ? Number(bigaYeastPct) : 0,
      poolish_pct: method === 'poolish' ? Number(poolishPct) : 0,
      poolish_water_pct: method === 'poolish' ? Number(poolishWaterPct) : 0,
      poolish_yeast_pct: method === 'poolish' ? Number(poolishYeastPct) : 0,
      direct_yeast_pct: method === 'direct' ? Number(directYeastPct) : 0,
      salt_pct: Number(saltPct),
      sugar_pct: Number(sugarPct),
      oil_pct: Number(oilPct),
      flour_white_pct: Number(flourWhitePct),
      flour_integral_pct: Number(flourIntegralPct),
      flour_semola_pct: Number(flourSemolaPct),
      cost_per_kg: Number(costPerKg) || 932.3,
      notes: notes.trim() || null,
    };

    try {
      if (isEditing && profile) {
        const res = await updateMutation.mutateAsync({ id: profile.id, body: payload });
        if (onSaved) onSaved(res.profile);
      } else {
        const res = await createMutation.mutateAsync(payload);
        if (onSaved) onSaved(res.profile);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error al guardar el perfil de masa.');
    }
  };

  const handleDelete = async () => {
    if (!profile) return;
    if (!confirm(`¿Eliminar el perfil de masa "${profile.name}"?`)) return;
    try {
      await deleteMutation.mutateAsync(profile.id);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error al eliminar el perfil.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? `Editar Perfil de Masa: ${profile?.name}` : '🥣 Crear Nuevo Tipo de Masa'}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <div>
            {isEditing && (
              <Button type="button" variant="danger" onClick={handleDelete} disabled={deleteMutation.isPending}>
                Eliminar Masa
              </Button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? 'Guardando...' : '💾 Guardar Masa'}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {error && (
          <div style={{ padding: '0.6rem 0.8rem', background: '#fee2e2', color: '#991b1b', borderRadius: '6px', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.75rem' }}>
          <Field label="Nombre de la Masa">
            <Input
              placeholder="ej: Amasado Directo sin Biga, Detroit Style..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>

          <Field label="Peso Bollo / Unidad (g)">
            <Input
              type="number"
              step="1"
              min="10"
              max="2000"
              value={unitWeightGrams}
              onChange={(e) => setUnitWeightGrams(Number(e.target.value))}
              required
            />
          </Field>

          <Field label="Hidratación Total (%)">
            <Input
              type="number"
              step="0.1"
              min="20"
              max="150"
              value={hydrationPct}
              onChange={(e) => setHydrationPct(Number(e.target.value))}
              required
            />
          </Field>
        </div>

        {/* Método de Amasado */}
        <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem', color: '#1e293b' }}>
            Método de Fermentación
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem' }}>
              <input
                type="radio"
                name="method"
                value="direct"
                checked={method === 'direct'}
                onChange={() => setMethod('direct')}
              />
              ⚡ <strong>Amasado Directo</strong> (sin prefermento)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem' }}>
              <input
                type="radio"
                name="method"
                value="biga"
                checked={method === 'biga'}
                onChange={() => setMethod('biga')}
              />
              🥣 <strong>Con Biga</strong>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem' }}>
              <input
                type="radio"
                name="method"
                value="poolish"
                checked={method === 'poolish'}
                onChange={() => setMethod('poolish')}
              />
              💧 <strong>Con Poolish</strong>
            </label>
          </div>

          {method === 'direct' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
              <Field label="Levadura Directa (% de la harina total)" hint="Ej: 0.35% para seca, o ~1% para fresca">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                  value={directYeastPct}
                  onChange={(e) => setDirectYeastPct(Number(e.target.value))}
                />
              </Field>
            </div>
          )}

          {method === 'biga' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
              <Field label="% Biga de la harina total" hint="Ej: 25%">
                <Input
                  type="number"
                  step="1"
                  min="1"
                  max="100"
                  value={bigaPct}
                  onChange={(e) => setBigaPct(Number(e.target.value))}
                />
              </Field>
              <Field label="Agua de la Biga (%)" hint="Estándar 50%">
                <Input
                  type="number"
                  step="1"
                  min="40"
                  max="70"
                  value={bigaWaterPct}
                  onChange={(e) => setBigaWaterPct(Number(e.target.value))}
                />
              </Field>
              <Field label="Levadura en Biga (%)" hint="Estándar 0.5%">
                <Input
                  type="number"
                  step="0.05"
                  min="0.01"
                  max="5"
                  value={bigaYeastPct}
                  onChange={(e) => setBigaYeastPct(Number(e.target.value))}
                />
              </Field>
            </div>
          )}

          {method === 'poolish' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
              <Field label="% Poolish de la harina" hint="Ej: 20%">
                <Input
                  type="number"
                  step="1"
                  min="1"
                  max="100"
                  value={poolishPct}
                  onChange={(e) => setPoolishPct(Number(e.target.value))}
                />
              </Field>
              <Field label="Agua Poolish (%)" hint="Estándar 100%">
                <Input
                  type="number"
                  step="1"
                  min="80"
                  max="120"
                  value={poolishWaterPct}
                  onChange={(e) => setPoolishWaterPct(Number(e.target.value))}
                />
              </Field>
              <Field label="Levadura Poolish (%)" hint="Estándar 10%">
                <Input
                  type="number"
                  step="0.5"
                  min="0.1"
                  max="20"
                  value={poolishYeastPct}
                  onChange={(e) => setPoolishYeastPct(Number(e.target.value))}
                />
              </Field>
            </div>
          )}
        </div>

        {/* Sal, Azúcar, Aceite */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          <Field label="Sal (% de la harina)">
            <Input
              type="number"
              step="0.1"
              min="0"
              max="10"
              value={saltPct}
              onChange={(e) => setSaltPct(Number(e.target.value))}
            />
          </Field>
          <Field label="Azúcar (% de la harina)">
            <Input
              type="number"
              step="0.1"
              min="0"
              max="15"
              value={sugarPct}
              onChange={(e) => setSugarPct(Number(e.target.value))}
            />
          </Field>
          <Field label="Aceite de Oliva (% de harina)">
            <Input
              type="number"
              step="0.1"
              min="0"
              max="20"
              value={oilPct}
              onChange={(e) => setOilPct(Number(e.target.value))}
            />
          </Field>
        </div>

        {/* Mezcla de Harinas */}
        <div style={{ background: '#fafafa', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid #eee' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.4rem', color: '#333' }}>
            Mezcla de Harinas (debe sumar 100%)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
            <Field label="0000 / Blanca (%)">
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={flourWhitePct}
                onChange={(e) => setFlourWhitePct(Number(e.target.value))}
              />
            </Field>
            <Field label="Sémola Rimacinata (%)">
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={flourSemolaPct}
                onChange={(e) => setFlourSemolaPct(Number(e.target.value))}
              />
            </Field>
            <Field label="Harina Integral (%)">
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={flourIntegralPct}
                onChange={(e) => setFlourIntegralPct(Number(e.target.value))}
              />
            </Field>
          </div>
        </div>

        <Field label="Notas / Instrucciones de Amasado">
          <Textarea
            rows={2}
            placeholder="ej: Fermentación 24hs en frío, hidratar en 2 pasos..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}
