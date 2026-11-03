import { useEffect, useMemo, useState } from 'react';
import { formatARS, type DoughCalculation, type DoughProfile } from '@pizzalog/shared';
import { Button, Field, Input, Loading, PageHeader, Select } from '@/ui';
import { useDoughCalculate, useDoughProfiles } from './hooks';
import { DoughProfileModal } from './DoughProfileModal';
import { RecipeStudioPage } from './RecipeStudioPage';

type Tab = 'masas' | 'costeo';

export function ProductionPage() {
  const [activeTab, setActiveTab] = useState<Tab>('masas');

  // --- TAB 1: MASAS ---
  const profilesQuery = useDoughProfiles();
  const profiles = profilesQuery.data ?? [];

  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [units, setUnits] = useState<number>(150);
  const [batches, setBatches] = useState<number>(1);
  const [calculation, setCalculation] = useState<DoughCalculation | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Modales de Masa y Receta
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<DoughProfile | null>(null);

  const calcMutation = useDoughCalculate();

  // Seleccionar primer perfil cuando cargue
  useEffect(() => {
    if (profiles.length > 0 && selectedProfileId === null && profiles[0]) {
      setSelectedProfileId(profiles[0].id);
    }
  }, [profiles, selectedProfileId]);

  // Recalcular cuando cambien perfil, unidades o tandas
  useEffect(() => {
    if (selectedProfileId !== null) {
      calcMutation.mutate(
        { profile_id: selectedProfileId, units, batches },
        {
          onSuccess: (data) => setCalculation(data.calculation),
        },
      );
    }
  }, [selectedProfileId, units, batches]);

  const activeProfile = useMemo(() => {
    return profiles.find((p) => p.id === selectedProfileId) ?? profiles[0] ?? null;
  }, [profiles, selectedProfileId]);

  const handleCopyWhatsApp = () => {
    if (!calculation?.whatsapp_text) return;
    navigator.clipboard.writeText(calculation.whatsapp_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <section>
      <PageHeader
        eyebrow="Operaciones & Costeo"
        title="Calculadora de Masas & Costos"
        description="Fórmulas exactas de amasado, costeo de insumos, escandallos de Food Cost y simulación de rentabilidad."
      />

      {/* Selector de pestañas */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          borderBottom: '2px solid var(--c-border, #ddd)',
          marginBottom: '1.5rem',
          paddingBottom: '0.2rem',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('masas')}
          style={{
            padding: '0.6rem 1.2rem',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'masas' ? '3px solid var(--c-accent, #e63946)' : '3px solid transparent',
            color: activeTab === 'masas' ? 'var(--c-accent, #e63946)' : '#666',
            fontWeight: activeTab === 'masas' ? 800 : 500,
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          🥣 Amasado del Día
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('costeo')}
          style={{
            padding: '0.6rem 1.2rem',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'costeo' ? '3px solid var(--c-accent, #e63946)' : '3px solid transparent',
            color: activeTab === 'costeo' ? 'var(--c-accent, #e63946)' : '#666',
            fontWeight: activeTab === 'costeo' ? 800 : 500,
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          📊 Escandallos & Food Cost
        </button>
      </div>

      {activeTab === 'costeo' && <RecipeStudioPage />}

      {/* ========================================================================= */}
      {/* TAB 1: AMASADO DEL DÍA */}
      {/* ========================================================================= */}
      {activeTab === 'masas' && (
        <div>
          {/* Panel de Configuración de la Tanda */}
          <div
            style={{
              background: 'var(--c-surface, #fff)',
              border: '1px solid var(--c-border, #ddd)',
              borderRadius: '8px',
              padding: '1.25rem',
              marginBottom: '1.5rem',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1.25rem',
              alignItems: 'flex-end',
            }}
          >
            <div style={{ flex: '2 1 360px', minWidth: '280px' }}>
              <Field label="Tipo de Masa / Perfil">
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Select
                    value={selectedProfileId ?? ''}
                    onChange={(e) => setSelectedProfileId(Number(e.target.value))}
                    style={{ flex: '1 1 220px', minWidth: '200px' }}
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                  <button
                    type="button"
                    title="Editar receta de esta masa"
                    onClick={() => {
                      setEditingProfile(activeProfile);
                      setProfileModalOpen(true);
                    }}
                    style={{
                      padding: '0.45rem 0.7rem',
                      borderRadius: '6px',
                      border: '1px solid #ccc',
                      background: '#f8f8f8',
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ✏️ Editar
                  </button>
                  <button
                    type="button"
                    title="Crear un nuevo perfil de masa"
                    onClick={() => {
                      setEditingProfile(null);
                      setProfileModalOpen(true);
                    }}
                    style={{
                      padding: '0.45rem 0.7rem',
                      borderRadius: '6px',
                      border: '1px solid #2a9d8f',
                      background: '#2a9d8f',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    + Nueva Masa
                  </button>
                </div>
              </Field>
            </div>

            <div style={{ flex: '1 1 160px', minWidth: '150px' }}>
              <Field label="Cantidad de Pizzas / Unidades">
                <Input
                  type="number"
                  min="1"
                  max="2000"
                  value={units}
                  onChange={(e) => setUnits(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </Field>
            </div>

            <div style={{ flex: '1 1 140px', minWidth: '130px' }}>
              <Field label="Dividir en tandas">
                <Input
                  type="number"
                  min="1"
                  max="50"
                  value={batches}
                  onChange={(e) => setBatches(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </Field>
            </div>

            <div style={{ flex: '1 1 200px', minWidth: '180px' }}>
              <Button
                variant={copied ? 'primary' : 'secondary'}
                onClick={handleCopyWhatsApp}
                style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
              >
                {copied ? '✅ ¡Copiado p/ WhatsApp!' : '📲 Copiar Receta p/ Cocina'}
              </Button>
            </div>
          </div>

          {/* Tarjetas KPI de Rendimiento y Costo */}
          {calculation && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1rem',
                  marginBottom: '1.5rem',
                }}
              >
                <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase' }}>Peso Total de Masa</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#2a9d8f' }}>
                    {calculation.total_weight_kg} kg
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#888' }}>
                    {calculation.units} bollos de {calculation.weight_per_unit_g}g
                  </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase' }}>Costo Total Tanda</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--c-accent, #e63946)' }}>
                    {formatARS(calculation.cost.total)}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#888' }}>
                    {formatARS(calculation.cost.per_kg)} / kg de masa
                  </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase' }}>Costo por Bollo</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#333' }}>
                    {formatARS(calculation.cost.per_unit)}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#888' }}>
                    Impacto en costo de pizza
                  </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase' }}>Hidratación & Fórmula</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#457b9d' }}>
                    {activeProfile?.hydration_pct}%
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#888' }}>
                    {activeProfile?.biga_pct ? `Biga ${activeProfile.biga_pct}%` : activeProfile?.poolish_pct ? `Poolish ${activeProfile.poolish_pct}%` : 'Masa directa'}
                  </div>
                </div>
              </div>

              {/* Detalle Operativo de Amasado: Paso 1 y Paso 2 */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: '1.5rem',
                  marginBottom: '1.5rem',
                }}
              >
                {/* Paso 1: Prefermento (Biga o Poolish) */}
                {calculation.type === 'pizza' && calculation.biga?.active && (
                  <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                      <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#1d3557' }}>
                        🥣 Paso 1: Biga ({calculation.biga.pct}%)
                      </h4>
                      <span style={{ fontSize: '0.75rem', background: '#e0f2fe', color: '#0369a1', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 700 }}>
                        Prefermento
                      </span>
                    </div>

                    <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '0.5rem 0' }}>🌾 Harina Biga:</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{calculation.biga.flour_kg} kg</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '0.5rem 0' }}>💧 Agua Biga (50%):</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{calculation.biga.water_kg} L</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '0.5rem 0' }}>🧫 Levadura (0.5%):</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{calculation.biga.yeast_g} g</td>
                        </tr>
                        <tr style={{ background: '#fafafa', fontWeight: 800 }}>
                          <td style={{ padding: '0.6rem 0' }}>Total Biga Armada:</td>
                          <td style={{ textAlign: 'right', color: '#1d3557' }}>{calculation.biga.total_kg} kg</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Paso 2: Empaste / Masa Final */}
                {calculation.type === 'pizza' && (
                  <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                      <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#1d3557' }}>
                        💧 Paso 2: Empaste / Masa Final
                      </h4>
                      <span style={{ fontSize: '0.75rem', background: '#fef3c7', color: '#92400e', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 700 }}>
                        Amasado
                      </span>
                    </div>

                    <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '0.5rem 0' }}>🌾 Harina Restante:</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{calculation.empaste?.flour_kg} kg</td>
                        </tr>
                        {calculation.flour_blend && calculation.flour_blend.semola_kg > 0 && (
                          <tr style={{ borderBottom: '1px solid #f0f0f0', color: '#666', fontSize: '0.82rem' }}>
                            <td style={{ padding: '0.2rem 0 0.2rem 1rem' }}>↳ Sémola rimacinata:</td>
                            <td style={{ textAlign: 'right' }}>{calculation.flour_blend.semola_kg} kg</td>
                          </tr>
                        )}
                        {calculation.flour_blend && calculation.flour_blend.integral_kg > 0 && (
                          <tr style={{ borderBottom: '1px solid #f0f0f0', color: '#666', fontSize: '0.82rem' }}>
                            <td style={{ padding: '0.2rem 0 0.2rem 1rem' }}>↳ Harina integral:</td>
                            <td style={{ textAlign: 'right' }}>{calculation.flour_blend.integral_kg} kg</td>
                          </tr>
                        )}
                        <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '0.5rem 0' }}>💧 Agua Restante:</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{calculation.empaste?.water_kg} L</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '0.5rem 0' }}>🧂 Sal Fina:</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{calculation.empaste?.salt_g} g</td>
                        </tr>
                        {calculation.empaste && calculation.empaste.direct_yeast_g > 0 && (
                          <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                            <td style={{ padding: '0.5rem 0' }}>🧫 Levadura directa:</td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{calculation.empaste.direct_yeast_g} g</td>
                          </tr>
                        )}
                        {calculation.empaste && calculation.empaste.sugar_g > 0 && (
                          <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                            <td style={{ padding: '0.5rem 0' }}>🍬 Azúcar:</td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{calculation.empaste.sugar_g} g</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Caso Fainá */}
                {calculation.type === 'faina' && (
                  <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1.25rem' }}>
                    <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '1.05rem', color: '#1d3557' }}>
                      🥣 Batido de Fainá ({calculation.units} moldes)
                    </h4>
                    <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '0.5rem 0' }}>Harina de Garbanzo:</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{calculation.total?.chickpea_flour_kg} kg</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '0.5rem 0' }}>Agua:</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{calculation.total?.water_liters} L</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '0.5rem 0' }}>Sal fina:</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{calculation.total?.salt_grams} g</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '0.5rem 0' }}>Aceite de oliva:</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>
                            {Math.round((calculation.total?.oil_liters ?? 0) * 1000)} cc
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* División por Amasada si batches > 1 */}
                {batches > 1 && (
                  <div style={{ background: '#fffdf0', border: '1px solid #fef08a', borderRadius: '8px', padding: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                      <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#854d0e' }}>
                        ⚖️ Por Amasada ({batches} tandas)
                      </h4>
                      <span style={{ fontSize: '0.75rem', background: '#fef9c3', color: '#713f12', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 700 }}>
                        Producción
                      </span>
                    </div>

                    <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
                      <tbody>
                        {calculation.per_batch.biga_kg !== undefined && calculation.per_batch.biga_kg > 0 && (
                          <tr style={{ borderBottom: '1px solid #fef9c3' }}>
                            <td style={{ padding: '0.5rem 0' }}>🥣 Biga por tanda:</td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{calculation.per_batch.biga_kg} kg</td>
                          </tr>
                        )}
                        <tr style={{ borderBottom: '1px solid #fef9c3' }}>
                          <td style={{ padding: '0.5rem 0' }}>🌾 Harina por tanda:</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{calculation.per_batch.flour_kg} kg</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #fef9c3' }}>
                          <td style={{ padding: '0.5rem 0' }}>💧 Agua por tanda:</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{calculation.per_batch.water_kg} L</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #fef9c3' }}>
                          <td style={{ padding: '0.5rem 0' }}>🧂 Sal por tanda:</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{calculation.per_batch.salt_g} g</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal para Crear / Editar Perfil de Masa */}
      <DoughProfileModal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        profile={editingProfile}
        onSaved={(saved) => {
          profilesQuery.refetch();
          setSelectedProfileId(saved.id);
        }}
      />


    </section>
  );
}
