import { useEffect, useMemo, useState } from 'react';
import { formatARS, type CostMarginProduct, type DoughCalculation, type DoughProfile } from '@pizzalog/shared';
import { Button, Field, Input, Loading, PageHeader, Select } from '@/ui';
import { useCostMargins, useDoughCalculate, useDoughProfiles, useSimulate } from './hooks';
import { DoughProfileModal } from './DoughProfileModal';
import { RecipeModal } from './RecipeModal';

type Tab = 'masas' | 'escandallos' | 'simulador';

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
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<CostMarginProduct | null>(null);

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

  // --- TAB 2: ESCANDALLOS & MÁRGENES ---
  const marginsQuery = useCostMargins();
  const marginsData = marginsQuery.data;
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'ok' | 'review' | 'no_price'>('all');
  const [expandedPid, setExpandedPid] = useState<number | null>(null);

  const filteredProducts = useMemo(() => {
    let list = marginsData?.products ?? [];
    if (filterStatus !== 'all') {
      list = list.filter((p) => p.status === filterStatus);
    }
    if (searchTerm.trim() !== '') {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q),
      );
    }
    return list;
  }, [marginsData, filterStatus, searchTerm]);

  // --- TAB 3: SIMULADOR ---
  const [costDelta, setCostDelta] = useState<number>(10);
  const [priceDelta, setPriceDelta] = useState<number>(15);
  const simMutation = useSimulate();

  useEffect(() => {
    if (activeTab === 'simulador') {
      simMutation.mutate({ cost_delta_pct: costDelta, price_delta_pct: priceDelta });
    }
  }, [activeTab, costDelta, priceDelta]);

  const simData = simMutation.data;

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
          onClick={() => setActiveTab('escandallos')}
          style={{
            padding: '0.6rem 1.2rem',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'escandallos' ? '3px solid var(--c-accent, #e63946)' : '3px solid transparent',
            color: activeTab === 'escandallos' ? 'var(--c-accent, #e63946)' : '#666',
            fontWeight: activeTab === 'escandallos' ? 800 : 500,
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          📊 Escandallos & Food Cost
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('simulador')}
          style={{
            padding: '0.6rem 1.2rem',
            border: 'none',
            background: 'none',
            borderBottom: activeTab === 'simulador' ? '3px solid var(--c-accent, #e63946)' : '3px solid transparent',
            color: activeTab === 'simulador' ? 'var(--c-accent, #e63946)' : '#666',
            fontWeight: activeTab === 'simulador' ? 800 : 500,
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          📈 Simulador de Precios
        </button>
      </div>

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

      {/* ========================================================================= */}
      {/* TAB 2: ESCANDALLOS & MÁRGENES */}
      {/* ========================================================================= */}
      {activeTab === 'escandallos' && (
        <div>
          {marginsQuery.isLoading && <Loading message="Cargando escandallos..." />}

          {marginsData && (
            <>
              {/* Tarjetas KPI de Food Cost General */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1rem',
                  marginBottom: '1.5rem',
                }}
              >
                <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase' }}>Food Cost Promedio</div>
                  <div
                    style={{
                      fontSize: '1.6rem',
                      fontWeight: 800,
                      color: marginsData.summary.avg_food_cost_pct <= 30 ? '#2a9d8f' : '#e63946',
                    }}
                  >
                    {marginsData.summary.avg_food_cost_pct}%
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#888' }}>
                    {marginsData.summary.avg_food_cost_pct <= 30 ? '✅ Objetivo alcanzado (≤30%)' : '⚠️ Superior al target 30%'}
                  </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase' }}>Margen Bruto Promedio</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#2b2d42' }}>
                    {marginsData.summary.avg_margin_pct}%
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#888' }}>
                    Rentabilidad s/ facturación
                  </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase' }}>A Revisar (Cost &gt; 30%)</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: marginsData.summary.review_count > 0 ? '#e63946' : '#2a9d8f' }}>
                    {marginsData.summary.review_count}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#888' }}>
                    Productos con margen bajo
                  </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase' }}>Total de Productos</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#333' }}>
                    {marginsData.summary.total_products}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#888' }}>
                    {marginsData.summary.no_price_count} sin precio de venta
                  </div>
                </div>
              </div>

              {/* Filtros de Tabla */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#fff',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  padding: '0.75rem 1rem',
                  marginBottom: '1rem',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('all')}
                    style={{
                      padding: '0.35rem 0.8rem',
                      borderRadius: '6px',
                      border: 'none',
                      background: filterStatus === 'all' ? '#333' : '#f0f0f0',
                      color: filterStatus === 'all' ? '#fff' : '#333',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                    }}
                  >
                    Todos ({marginsData.products.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('ok')}
                    style={{
                      padding: '0.35rem 0.8rem',
                      borderRadius: '6px',
                      border: 'none',
                      background: filterStatus === 'ok' ? '#2a9d8f' : '#f0f0f0',
                      color: filterStatus === 'ok' ? '#fff' : '#333',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                    }}
                  >
                    🟢 Saludables (≤30%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('review')}
                    style={{
                      padding: '0.35rem 0.8rem',
                      borderRadius: '6px',
                      border: 'none',
                      background: filterStatus === 'review' ? '#e63946' : '#f0f0f0',
                      color: filterStatus === 'review' ? '#fff' : '#333',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                    }}
                  >
                    🔴 Revisar Margen ({marginsData.summary.review_count})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('no_price')}
                    style={{
                      padding: '0.35rem 0.8rem',
                      borderRadius: '6px',
                      border: 'none',
                      background: filterStatus === 'no_price' ? '#eab308' : '#f0f0f0',
                      color: filterStatus === 'no_price' ? '#fff' : '#333',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                    }}
                  >
                    ⚠️ Sin Precio ({marginsData.summary.no_price_count})
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                  <div style={{ width: '220px' }}>
                    <Input
                      placeholder="Buscar producto o categoría..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRecipe(null);
                      setRecipeModalOpen(true);
                    }}
                    style={{
                      padding: '0.55rem 0.95rem',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'var(--c-accent, #e63946)',
                      color: '#fff',
                      fontWeight: 750,
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    + Nueva Receta / Pizza
                  </button>
                </div>
              </div>

              {/* Tabla de Productos y Escandallos */}
              <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '8px', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ background: '#f9f9f9', borderBottom: '2px solid #eee', fontSize: '0.8rem', textTransform: 'uppercase', color: '#555' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>Producto</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Costo Insumos</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Precio Venta</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Margen $</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Food Cost %</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Precio Mín. Sugerido</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Receta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p) => {
                      const isExpanded = expandedPid === p.id;
                      const badgeBg = p.status === 'ok' ? '#dcfce7' : p.status === 'review' ? '#fee2e2' : '#fef9c3';
                      const badgeColor = p.status === 'ok' ? '#166534' : p.status === 'review' ? '#991b1b' : '#854d0e';
                      const badgeText = p.status === 'ok' ? `${p.food_cost_pct}% OK` : p.status === 'review' ? `${p.food_cost_pct}% Alto` : 'Sin precio';

                      return (
                        <>
                          <tr
                            key={p.id}
                            style={{
                              borderBottom: isExpanded ? 'none' : '1px solid #eee',
                              background: isExpanded ? '#f8fafc' : 'transparent',
                            }}
                          >
                            <td style={{ padding: '0.75rem 1rem' }}>
                              <strong style={{ fontSize: '0.92rem' }}>{p.name}</strong>
                              <div style={{ fontSize: '0.75rem', color: '#888' }}>{p.category}</div>
                            </td>
                            <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                              {formatARS(p.cost)}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>
                              {p.price > 0 ? formatARS(p.price) : <span style={{ color: '#888', fontStyle: 'italic' }}>Sin fijar</span>}
                            </td>
                            <td style={{ padding: '0.75rem 1rem' }}>
                              {p.price > 0 ? (
                                <div>
                                  <strong style={{ color: p.margin > 0 ? '#166534' : '#991b1b' }}>
                                    {formatARS(p.margin)}
                                  </strong>
                                  <span style={{ fontSize: '0.75rem', color: '#666', marginLeft: '0.3rem' }}>
                                    ({p.margin_pct}%)
                                  </span>
                                </div>
                              ) : '-'}
                            </td>
                            <td style={{ padding: '0.75rem 1rem' }}>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '4px',
                                  fontSize: '0.75rem',
                                  fontWeight: 800,
                                  background: badgeBg,
                                  color: badgeColor,
                                }}
                              >
                                {badgeText}
                              </span>
                            </td>
                            <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--c-accent, #e63946)' }}>
                              {formatARS(p.suggested_price)}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => setExpandedPid(isExpanded ? null : p.id)}
                                  style={{
                                    padding: '0.3rem 0.6rem',
                                    border: '1px solid #ccc',
                                    borderRadius: '4px',
                                    background: '#fff',
                                    cursor: 'pointer',
                                    fontSize: '0.78rem',
                                  }}
                                >
                                  {isExpanded ? '▲ Cerrar' : `▼ Ver (${p.ingredients.length})`}
                                </button>
                                <button
                                  type="button"
                                  title="Editar receta, ingredientes y precio"
                                  onClick={() => {
                                    setEditingRecipe(p);
                                    setRecipeModalOpen(true);
                                  }}
                                  style={{
                                    padding: '0.3rem 0.55rem',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '4px',
                                    background: '#f8fafc',
                                    cursor: 'pointer',
                                    fontSize: '0.78rem',
                                    fontWeight: 600,
                                  }}
                                >
                                  ✏️ Editar
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Fila expandible con el desglose de insumos de la receta */}
                          {isExpanded && (
                            <tr key={`${p.id}-details`} style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                              <td colSpan={7} style={{ padding: '0.75rem 1.5rem 1.25rem 1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                  <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>
                                    Composición & Costos de Receta para: {p.name}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingRecipe(p);
                                      setRecipeModalOpen(true);
                                    }}
                                    style={{
                                      padding: '0.25rem 0.65rem',
                                      border: '1px solid #cbd5e1',
                                      borderRadius: '4px',
                                      background: '#fff',
                                      cursor: 'pointer',
                                      fontSize: '0.75rem',
                                      fontWeight: 600,
                                      color: '#1e293b',
                                    }}
                                  >
                                    ✏️ Modificar Ingredientes / Gramajes
                                  </button>
                                </div>
                                {p.ingredients.length === 0 ? (
                                  <p style={{ fontStyle: 'italic', color: '#888', fontSize: '0.85rem' }}>
                                    Sin ingredientes desglosados en el sistema.
                                  </p>
                                ) : (
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.5rem' }}>
                                    {p.ingredients.map((ing, iIdx) => (
                                      <div
                                        key={iIdx}
                                        style={{
                                          background: '#fff',
                                          border: '1px solid #e2e8f0',
                                          borderRadius: '6px',
                                          padding: '0.5rem 0.75rem',
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          alignItems: 'center',
                                        }}
                                      >
                                        <div>
                                          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{ing.name}</div>
                                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                            {ing.quantity} {ing.unit} @ {formatARS(ing.unit_cost)}/{ing.unit}
                                          </div>
                                        </div>
                                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>
                                          {formatARS(ing.total_cost)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: SIMULADOR DE RENTABILIDAD */}
      {/* ========================================================================= */}
      {activeTab === 'simulador' && (
        <div>
          {/* Parámetros de Simulación */}
          <div
            style={{
              background: '#fff',
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '1.25rem',
              marginBottom: '1.5rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '1.5rem',
              alignItems: 'center',
            }}
          >
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Inflación en Insumos / Costos: <span style={{ color: '#e63946', fontWeight: 800 }}>+{costDelta}%</span>
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={costDelta}
                onChange={(e) => setCostDelta(Number(e.target.value))}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.4rem' }}>
                {[5, 10, 15, 20, 30].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setCostDelta(v)}
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #ccc', background: '#f8f8f8', cursor: 'pointer' }}
                  >
                    +{v}%
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Aumento en Precios de Venta: <span style={{ color: '#2a9d8f', fontWeight: 800 }}>+{priceDelta}%</span>
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={priceDelta}
                onChange={(e) => setPriceDelta(Number(e.target.value))}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.4rem' }}>
                {[5, 10, 15, 20, 25].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setPriceDelta(v)}
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #ccc', background: '#f8f8f8', cursor: 'pointer' }}
                  >
                    +{v}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          {simData && (
            <>
              {/* Tarjetas Comparativas de Simulación */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '1rem',
                  marginBottom: '1.5rem',
                }}
              >
                <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase' }}>Food Cost Actual</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#333' }}>
                    {simData.simulation.orig_avg_food_cost}%
                  </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase' }}>Food Cost Simulado</div>
                  <div
                    style={{
                      fontSize: '1.6rem',
                      fontWeight: 800,
                      color: simData.simulation.sim_avg_food_cost <= 30 ? '#2a9d8f' : '#e63946',
                    }}
                  >
                    {simData.simulation.sim_avg_food_cost}%
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#888' }}>
                    Impacto neto: {simData.simulation.delta_food_cost > 0 ? `+${simData.simulation.delta_food_cost}%` : `${simData.simulation.delta_food_cost}%`}
                  </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase' }}>Margen Saludable</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#2a9d8f' }}>
                    {100 - simData.simulation.sim_avg_food_cost}%
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#888' }}>
                    Margen bruto simulado
                  </div>
                </div>
              </div>

              {/* Tabla de Productos Simulados */}
              <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '8px', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ background: '#f9f9f9', borderBottom: '2px solid #eee', fontSize: '0.8rem', textTransform: 'uppercase', color: '#555' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>Producto</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Precio Hoy</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Precio Simulado</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Costo Simulado</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Margen Simulado $</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Food Cost Simulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simData.products.map((p) => {
                      const fc = p.simulated_food_cost;
                      const badgeBg = fc <= 25 ? '#dcfce7' : fc <= 30 ? '#fef9c3' : '#fee2e2';
                      const badgeColor = fc <= 25 ? '#166534' : fc <= 30 ? '#854d0e' : '#991b1b';

                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <strong>{p.name}</strong>
                            <div style={{ fontSize: '0.75rem', color: '#888' }}>{p.category}</div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#666' }}>
                            {formatARS(p.current_price)}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#2a9d8f' }}>
                            {formatARS(p.simulated_price)}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#666' }}>
                            {formatARS(p.simulated_cost)}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>
                            {formatARS(p.simulated_margin)}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                background: badgeBg,
                                color: badgeColor,
                              }}
                            >
                              {fc}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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

      {/* Modal para Crear / Editar Recetas & Escandallos */}
      <RecipeModal
        open={recipeModalOpen}
        onClose={() => setRecipeModalOpen(false)}
        product={editingRecipe}
        supplies={marginsData?.supplies ?? []}
        onSaved={() => {
          marginsQuery.refetch();
        }}
      />
    </section>
  );
}
