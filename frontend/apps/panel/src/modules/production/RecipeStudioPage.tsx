import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatARS,
  type BusinessCostInput,
  type BusinessCostCategory,
  type CostPeriod,
  type SaveStudioRecipeInput,
  type StudioRecipe,
  type StudioRecipeComponentInput,
} from '@pizzalog/shared';
import { useApi } from '@/lib/auth';
import { Button, Field, Input, Loading } from '@/ui';

type View = 'recipes' | 'costs';
type ComponentRow = StudioRecipeComponentInput;
type CostRow = BusinessCostInput;

const categoryLabels: Record<BusinessCostCategory, string> = {
  employees: 'Empleados y cargas',
  rent: 'Alquiler',
  utilities: 'Servicios (luz, gas, agua)',
  services: 'Servicios profesionales / terceros',
  taxes: 'Impuestos y tasas',
  maintenance: 'Mantenimiento',
  software: 'Software y suscripciones',
  other: 'Otros gastos',
};
const periodLabels: Record<CostPeriod, string> = {
  monthly: 'Mensual',
  weekly: 'Semanal',
  daily: 'Diario',
  yearly: 'Anual',
};
const units = ['kg', 'g', 'L', 'cc', 'u', 'porción', 'bandeja'];

const panelStyle: React.CSSProperties = {
  background: 'var(--c-surface, #fff)', border: '1px solid var(--c-border, #ddd)',
  borderRadius: 10, padding: '1rem', minWidth: 0,
};
const controlStyle: React.CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '0.55rem 0.65rem',
  borderRadius: 6, border: '1px solid var(--c-border, #ccc)', background: 'var(--c-surface, #fff)',
  color: 'var(--c-text, #222)', fontSize: '0.9rem',
};
const primaryButton: React.CSSProperties = {
  padding: '0.65rem 0.9rem', border: 0, borderRadius: 7, background: 'var(--c-accent, #c7101b)',
  color: '#fff', fontWeight: 700, cursor: 'pointer',
};
const secondaryButton: React.CSSProperties = {
  padding: '0.55rem 0.8rem', border: '1px solid var(--c-border, #ccc)', borderRadius: 7,
  background: 'var(--c-surface, #fff)', color: 'var(--c-text, #222)', fontWeight: 600, cursor: 'pointer',
};

function freshComponent(): ComponentRow {
  return { component_type: 'supply', component_id: 0, quantity: 0.1, unit: 'kg' };
}
function freshCost(): CostRow {
  return { name: '', category: 'other', quantity: 1, amount: 0, period: 'monthly' };
}

export function RecipeStudioPage() {
  const api = useApi();
  const qc = useQueryClient();
  const [view, setView] = useState<View>('recipes');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [recipeName, setRecipeName] = useState('');
  const [recipeType, setRecipeType] = useState<'product' | 'subrecipe'>('product');
  const [linkedProductId, setLinkedProductId] = useState<number>(0);
  const [yieldQuantity, setYieldQuantity] = useState(1);
  const [yieldUnit, setYieldUnit] = useState('u');
  const [price, setPrice] = useState(0);
  const [targetPct, setTargetPct] = useState(30);
  const [components, setComponents] = useState<ComponentRow[]>([freshComponent()]);
  const [recipeError, setRecipeError] = useState('');
  const [costItems, setCostItems] = useState<CostRow[]>([freshCost()]);
  const [costError, setCostError] = useState('');
  const [contributionPct, setContributionPct] = useState(70);

  const recipesQuery = useQuery({
    queryKey: ['production', 'recipe-studio'],
    queryFn: () => api.production.recipeStudio(),
  });
  const costsQuery = useQuery({
    queryKey: ['production', 'business-costs'],
    queryFn: () => api.production.businessCosts(),
  });
  const recipes = recipesQuery.data?.recipes ?? [];
  const supplies = recipesQuery.data?.supplies ?? [];
  const products = recipesQuery.data?.products ?? [];
  const currentRecipe = recipes.find((r) => r.id === editingId) ?? null;

  const saveRecipe = useMutation({
    mutationFn: (body: SaveStudioRecipeInput) => api.production.saveStudioRecipe(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production', 'recipe-studio'] });
      setRecipeError('');
      resetRecipe();
    },
    onError: (e: Error) => setRecipeError(e.message || 'No se pudo guardar la receta.'),
  });
  const saveCosts = useMutation({
    mutationFn: (body: { items: CostRow[] }) => api.production.saveBusinessCosts(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production', 'business-costs'] });
      setCostError('');
    },
    onError: (e: Error) => setCostError(e.message || 'No se pudieron guardar los costos.'),
  });

  useEffect(() => {
    if (costsQuery.data) {
      setCostItems(costsQuery.data.items.map((item) => ({
        name: item.name, category: item.category, quantity: item.quantity,
        amount: item.amount, period: item.period, notes: item.notes ?? '',
      })));
    }
  }, [costsQuery.data]);

  function resetRecipe() {
    setEditingId(null); setRecipeName(''); setRecipeType('product'); setLinkedProductId(0);
    setYieldQuantity(1); setYieldUnit('u'); setPrice(0); setTargetPct(30);
    setComponents([freshComponent()]); setRecipeError('');
  }
  function editRecipe(recipe: StudioRecipe) {
    setEditingId(recipe.id); setRecipeName(recipe.name); setRecipeType(recipe.recipe_type);
    setLinkedProductId(recipe.linked_product_id ?? 0); setYieldQuantity(recipe.yield_quantity);
    setYieldUnit(recipe.yield_unit); setPrice(recipe.price); setTargetPct(recipe.target_food_cost_pct);
    setComponents(recipe.components.map((c) => ({
      component_type: c.component_type, component_id: c.component_id, quantity: c.quantity, unit: c.unit,
    })));
    setRecipeError('');
    setView('recipes');
    document.getElementById('recipe-studio-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const componentCostMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of supplies) map.set(`supply:${s.id}`, s.cost);
    for (const r of recipes) map.set(`recipe:${r.id}`, r.unit_cost);
    return map;
  }, [supplies, recipes]);
  const computedBatchCost = components.reduce((sum, c) =>
    sum + Math.max(0, c.quantity || 0) * (componentCostMap.get(`${c.component_type}:${c.component_id}`) ?? 0), 0);
  const computedUnitCost = computedBatchCost / Math.max(0.0001, yieldQuantity);
  const suggestedPrice = recipeType === 'product' && computedUnitCost > 0
    ? Math.ceil((computedUnitCost / (Math.max(1, Math.min(100, targetPct)) / 100)) / 100) * 100 : 0;
  const foodCost = price > 0 ? computedUnitCost / price * 100 : 0;

  const monthlyTotal = costsQuery.data?.monthly_total ?? 0;
  const enteredMonthly = costItems.reduce((sum, item) => {
    const factor: Record<CostPeriod, number> = { monthly: 1, weekly: 52 / 12, daily: 365 / 12, yearly: 1 / 12 };
    return sum + Math.max(0, item.quantity || 0) * Math.max(0, item.amount || 0) * factor[item.period];
  }, 0);
  const monthlyByCategory = (Object.keys(categoryLabels) as BusinessCostCategory[]).map((category) => ({
    category, value: costItems.filter((item) => item.category === category).reduce((sum, item) => {
      const factor: Record<CostPeriod, number> = { monthly: 1, weekly: 52 / 12, daily: 365 / 12, yearly: 1 / 12 };
      return sum + Math.max(0, item.quantity || 0) * Math.max(0, item.amount || 0) * factor[item.period];
    }, 0),
  })).filter((item) => item.value > 0);

  function changeComponent(index: number, patch: Partial<ComponentRow>) {
    setComponents((previous) => previous.map((row, i) => {
      if (index !== i) return row;
      const next = { ...row, ...patch };
      if (patch.component_type && patch.component_type !== row.component_type) {
        const first = patch.component_type === 'supply' ? supplies[0] : recipes.find((r) => r.recipe_type === 'subrecipe');
        next.component_id = first?.id ?? 0;
        next.unit = patch.component_type === 'supply' ? (supplies[0]?.unit || 'kg') : (first?.yield_unit || 'kg');
      }
      return next;
    }));
  }

  function submitRecipe() {
    setRecipeError('');
    if (!recipeName.trim()) { setRecipeError('Ingresá un nombre para la receta.'); return; }
    if (!components.some((c) => c.component_id > 0 && c.quantity > 0)) {
      setRecipeError('Agregá al menos un ingrediente o una subreceta con cantidad mayor que cero.'); return;
    }
    const body: SaveStudioRecipeInput = {
      ...(editingId ? { id: editingId } : {}),
      name: recipeName.trim(), recipe_type: recipeType, linked_product_id: linkedProductId || null,
      yield_quantity: Math.max(0.0001, yieldQuantity), yield_unit: yieldUnit || 'u',
      price: recipeType === 'product' ? Math.max(0, price) : 0,
      target_food_cost_pct: targetPct,
      components: components.filter((c) => c.component_id > 0 && c.quantity > 0),
    };
    saveRecipe.mutate(body);
  }

  function newRecipe(type: 'product' | 'subrecipe') {
    resetRecipe(); setRecipeType(type); setYieldUnit(type === 'product' ? 'u' : 'kg');
    setView('recipes');
    window.setTimeout(() => document.getElementById('recipe-studio-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ ...panelStyle, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' }}>Herramientas independientes</div>
          <h2 style={{ margin: '0.25rem 0', fontSize: '1.3rem' }}>Recetas y costeo operativo</h2>
          <div style={{ color: '#64748b', fontSize: '.9rem' }}>El precio sugerido de recetas usa ingredientes; los gastos generales se calculan aparte.</div>
        </div>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          <button type="button" style={view === 'recipes' ? primaryButton : secondaryButton} onClick={() => setView('recipes')}>🍕 Recetas</button>
          <button type="button" style={view === 'costs' ? primaryButton : secondaryButton} onClick={() => setView('costs')}>🏠 Costeo del negocio</button>
        </div>
      </div>

      {view === 'recipes' && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
            <button type="button" style={primaryButton} onClick={() => newRecipe('product')}>+ Nueva receta de producto</button>
            <button type="button" style={secondaryButton} onClick={() => newRecipe('subrecipe')}>+ Nueva subreceta</button>
          </div>
          {recipesQuery.isLoading ? <Loading message="Cargando recetas e insumos..." /> : null}
          {recipesQuery.error ? <p role="alert" style={{ color: '#b91c1c' }}>No se pudieron cargar las recetas. {(recipesQuery.error as Error).message}</p> : null}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '.75rem' }}>
            {recipes.map((recipe) => (
              <article key={recipe.id} style={{ ...panelStyle, display: 'flex', flexDirection: 'column', gap: '.55rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', alignItems: 'start' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '1rem' }}>{recipe.name}</div>
                    <div style={{ fontSize: '.78rem', color: '#64748b' }}>{recipe.recipe_type === 'subrecipe' ? 'Subreceta reutilizable' : 'Producto final'} · Rinde {recipe.yield_quantity} {recipe.yield_unit}</div>
                  </div>
                  <span style={{ fontSize: '.72rem', padding: '.2rem .45rem', borderRadius: 5, background: recipe.recipe_type === 'subrecipe' ? '#e0f2fe' : '#fef3c7', color: '#334155', whiteSpace: 'nowrap' }}>{recipe.recipe_type === 'subrecipe' ? 'PREPARACIÓN' : 'VENTA'}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
                  <div><div style={{ fontSize: '.75rem', color: '#64748b' }}>Costo total del lote</div><strong>{formatARS(recipe.batch_cost)}</strong></div>
                  <div><div style={{ fontSize: '.75rem', color: '#64748b' }}>Costo por {recipe.yield_unit}</div><strong>{formatARS(recipe.unit_cost)}</strong></div>
                  {recipe.recipe_type === 'product' && <div><div style={{ fontSize: '.75rem', color: '#64748b' }}>Precio sugerido</div><strong style={{ color: 'var(--c-accent, #c7101b)' }}>{formatARS(recipe.suggested_price)}</strong></div>}
                  {recipe.recipe_type === 'product' && <div><div style={{ fontSize: '.75rem', color: '#64748b' }}>Food cost actual</div><strong>{recipe.price > 0 ? `${recipe.food_cost_pct}%` : 'Sin precio cargado'}</strong></div>}
                </div>
                <button type="button" style={{ ...secondaryButton, alignSelf: 'start' }} onClick={() => editRecipe(recipe)}>Editar receta</button>
              </article>
            ))}
          </div>

          <div id="recipe-studio-editor" style={panelStyle}>
            <h3 style={{ marginTop: 0 }}>{editingId ? 'Editar receta' : 'Constructor de recetas'}</h3>
            <p style={{ marginTop: 0, color: '#64748b', fontSize: '.88rem' }}>Los componentes se valorizan con costos del catálogo; una subreceta aporta su costo por unidad de rendimiento.</p>
            {recipeError && <div role="alert" style={{ marginBottom: '.8rem', padding: '.7rem', borderRadius: 6, background: '#fee2e2', color: '#991b1b' }}>{recipeError}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '.75rem' }}>
              <Field label="Nombre">
                <Input value={recipeName} onChange={(e) => setRecipeName(e.target.value)} placeholder="Ej. Salsa de tomate" />
              </Field>
              <Field label="Tipo de receta">
                <select value={recipeType} onChange={(e) => { setRecipeType(e.target.value as 'product' | 'subrecipe'); setYieldUnit(e.target.value === 'product' ? 'u' : 'kg'); }} style={controlStyle}>
                  <option value="product">Producto final</option><option value="subrecipe">Subreceta</option>
                </select>
              </Field>
              <Field label="Rendimiento del lote">
                <Input type="number" min="0.0001" step="0.001" value={yieldQuantity} onChange={(e) => setYieldQuantity(Math.max(.0001, Number(e.target.value) || .0001))} />
              </Field>
              <Field label="Unidad del rendimiento">
                <select value={yieldUnit} onChange={(e) => setYieldUnit(e.target.value)} style={controlStyle}>
                  {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              </Field>
              {recipeType === 'product' && <>
                <Field label="Precio de venta actual ($)">
                  <Input type="number" min="0" step="100" value={price} onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))} />
                </Field>
                <Field label="Food cost objetivo (%)">
                  <Input type="number" min="1" max="100" step="1" value={targetPct} onChange={(e) => setTargetPct(Math.max(1, Math.min(100, Number(e.target.value) || 30)))} />
                </Field>
                <Field label="Vincular a producto del catálogo (opcional)">
                  <select value={linkedProductId} onChange={(e) => { const id = Number(e.target.value); setLinkedProductId(id); const p = products.find((p) => p.id === id); if (p) { setRecipeName(p.name); setPrice(p.price); } }} style={controlStyle}>
                    <option value={0}>Sin vincular</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </Field>
              </>}
            </div>

            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.6rem' }}>
                <h4 style={{ margin: 0 }}>Ingredientes y subrecetas</h4>
                <button type="button" style={secondaryButton} onClick={() => setComponents((prev) => [...prev, freshComponent()])}>+ Agregar componente</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
                {components.map((c, index) => {
                  const componentList = c.component_type === 'supply'
                    ? supplies.map((s) => ({ id: s.id, name: s.name, unit: s.unit, cost: s.cost }))
                    : recipes.filter((r) => r.recipe_type === 'subrecipe' && r.id !== editingId).map((r) => ({ id: r.id, name: r.name, unit: r.yield_unit, cost: r.unit_cost }));
                  const unitCost = componentCostMap.get(`${c.component_type}:${c.component_id}`) ?? 0;
                  return <div key={index} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 145px), 1fr))', gap: '.5rem', alignItems: 'end', padding: '.65rem', border: '1px solid var(--c-border, #ddd)', borderRadius: 7 }}>
                    <Field label="Tipo"><select value={c.component_type} onChange={(e) => changeComponent(index, { component_type: e.target.value as 'supply' | 'recipe' })} style={controlStyle}><option value="supply">Ingrediente / insumo</option><option value="recipe">Subreceta</option></select></Field>
                    <Field label={c.component_type === 'supply' ? 'Ingrediente' : 'Preparación'}>
                      <select value={c.component_id} onChange={(e) => { const id = Number(e.target.value); const found = componentList.find((v) => v.id === id); changeComponent(index, { component_id: id, unit: found?.unit || c.unit }); }} style={controlStyle}>
                        <option value={0}>Seleccionar...</option>
                        {componentList.map((v) => <option key={v.id} value={v.id}>{v.name} · {formatARS(v.cost)}/{v.unit}</option>)}
                      </select>
                    </Field>
                    <Field label="Cantidad"><Input type="number" min="0" step="0.001" value={c.quantity} onChange={(e) => changeComponent(index, { quantity: Math.max(0, Number(e.target.value) || 0) })} /></Field>
                    <Field label="Unidad"><select value={c.unit} onChange={(e) => changeComponent(index, { unit: e.target.value })} style={controlStyle}>{units.map((u) => <option key={u} value={u}>{u}</option>)}</select></Field>
                    <div style={{ padding: '.5rem 0', fontWeight: 700 }}>Subtotal: {formatARS(c.quantity * unitCost)}</div>
                    <button type="button" aria-label="Quitar componente" style={{ ...secondaryButton, color: '#b91c1c' }} onClick={() => setComponents((prev) => prev.filter((_, i) => i !== index))}>Quitar</button>
                  </div>;
                })}
              </div>
            </div>

            <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: 8, background: 'var(--c-muted, #f8fafc)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 155px), 1fr))', gap: '.75rem' }}>
              <div><div style={{ color: '#64748b', fontSize: '.75rem' }}>Costo del lote</div><strong style={{ fontSize: '1.2rem' }}>{formatARS(computedBatchCost)}</strong></div>
              <div><div style={{ color: '#64748b', fontSize: '.75rem' }}>Costo por rendimiento</div><strong style={{ fontSize: '1.2rem' }}>{formatARS(computedUnitCost)} / {yieldUnit}</strong></div>
              {recipeType === 'product' && <>
                <div><div style={{ color: '#64748b', fontSize: '.75rem' }}>Precio sugerido por food cost {targetPct}%</div><strong style={{ fontSize: '1.25rem', color: 'var(--c-accent, #c7101b)' }}>{formatARS(suggestedPrice)}</strong></div>
                <div><div style={{ color: '#64748b', fontSize: '.75rem' }}>Food cost al precio cargado</div><strong style={{ fontSize: '1.2rem' }}>{foodCost.toFixed(1)}%</strong></div>
              </>}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', marginTop: '1rem' }}>
              <button type="button" style={primaryButton} disabled={saveRecipe.isPending} onClick={submitRecipe}>{saveRecipe.isPending ? 'Guardando...' : 'Guardar receta'}</button>
              <button type="button" style={secondaryButton} onClick={resetRecipe}>Limpiar formulario</button>
            </div>
          </div>
        </>
      )}

      {view === 'costs' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '.75rem' }}>
            <div style={panelStyle}><div style={{ fontSize: '.75rem', color: '#64748b', textTransform: 'uppercase' }}>Gastos mensuales cargados</div><strong style={{ display: 'block', fontSize: '1.5rem' }}>{formatARS(enteredMonthly)}</strong><div style={{ color: '#64748b', fontSize: '.78rem' }}>Estimación de las filas en edición</div></div>
            <div style={panelStyle}><div style={{ fontSize: '.75rem', color: '#64748b', textTransform: 'uppercase' }}>Ventas para cubrir gastos</div><strong style={{ display: 'block', fontSize: '1.5rem' }}>{contributionPct > 0 ? formatARS(enteredMonthly / (contributionPct / 100)) : '—'}</strong><div style={{ color: '#64748b', fontSize: '.78rem' }}>Punto de equilibrio según contribución estimada</div></div>
            <div style={panelStyle}><div style={{ fontSize: '.75rem', color: '#64748b', textTransform: 'uppercase' }}>Gastos ya guardados</div><strong style={{ display: 'block', fontSize: '1.5rem' }}>{formatARS(monthlyTotal)}</strong><div style={{ color: '#64748b', fontSize: '.78rem' }}>Última versión guardada</div></div>
          </div>
          <div style={panelStyle}>
            <h3 style={{ marginTop: 0 }}>Costos fijos y operativos del negocio</h3>
            <p style={{ color: '#64748b', fontSize: '.88rem' }}>Cargá cada gasto con una cantidad y un valor por período. Empleados permite cargar varios puestos o personas. Los importes se normalizan a un equivalente mensual y no se mezclan con el costo de receta.</p>
            {costError && <div role="alert" style={{ padding: '.7rem', marginBottom: '.8rem', background: '#fee2e2', borderRadius: 6, color: '#991b1b' }}>{costError}</div>}
            {costsQuery.isLoading ? <Loading message="Cargando costeo del negocio..." /> : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
              {costItems.map((item, index) => {
                const factor: Record<CostPeriod, number> = { monthly: 1, weekly: 52 / 12, daily: 365 / 12, yearly: 1 / 12 };
                const m = item.quantity * item.amount * factor[item.period];
                return <div key={index} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '.5rem', padding: '.7rem', border: '1px solid var(--c-border, #ddd)', borderRadius: 8 }}>
                  <Field label="Concepto"><Input value={item.name} onChange={(e) => setCostItems((prev) => prev.map((v, i) => i === index ? { ...v, name: e.target.value } : v))} placeholder="Ej. Sueldo cocinero" /></Field>
                  <Field label="Categoría"><select value={item.category} onChange={(e) => setCostItems((prev) => prev.map((v, i) => i === index ? { ...v, category: e.target.value as BusinessCostCategory } : v))} style={controlStyle}>{Object.entries(categoryLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
                  <Field label="Cantidad"><Input type="number" min="0" step=".1" value={item.quantity} onChange={(e) => setCostItems((prev) => prev.map((v, i) => i === index ? { ...v, quantity: Math.max(0, Number(e.target.value) || 0) } : v))} /></Field>
                  <Field label="Importe por período ($)"><Input type="number" min="0" step="100" value={item.amount} onChange={(e) => setCostItems((prev) => prev.map((v, i) => i === index ? { ...v, amount: Math.max(0, Number(e.target.value) || 0) } : v))} /></Field>
                  <Field label="Período"><select value={item.period} onChange={(e) => setCostItems((prev) => prev.map((v, i) => i === index ? { ...v, period: e.target.value as CostPeriod } : v))} style={controlStyle}>{Object.entries(periodLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
                  <div style={{ alignSelf: 'end', padding: '.55rem 0', fontWeight: 800 }}>Mensual: {formatARS(m)}</div>
                  <button type="button" style={{ ...secondaryButton, color: '#b91c1c', alignSelf: 'end' }} onClick={() => setCostItems((prev) => prev.filter((_, i) => i !== index))}>Quitar</button>
                </div>;
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', marginTop: '1rem' }}>
              <button type="button" style={secondaryButton} onClick={() => setCostItems((prev) => [...prev, freshCost()])}>+ Agregar costo</button>
              <button type="button" style={primaryButton} disabled={saveCosts.isPending} onClick={() => saveCosts.mutate({ items: costItems.filter((item) => item.name.trim()) })}>{saveCosts.isPending ? 'Guardando...' : 'Guardar costos operativos'}</button>
            </div>
            <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: '.75rem' }}>
              {monthlyByCategory.map((row) => <div key={row.category} style={{ background: 'var(--c-muted, #f8fafc)', padding: '.75rem', borderRadius: 7 }}><div style={{ color: '#64748b', fontSize: '.78rem' }}>{categoryLabels[row.category]}</div><strong>{formatARS(row.value)} / mes</strong></div>)}
            </div>
            <div style={{ marginTop: '1rem', maxWidth: 320 }}>
              <Field label="Margen de contribución esperado (%)"><Input type="number" min="1" max="99" step="1" value={contributionPct} onChange={(e) => setContributionPct(Math.max(1, Math.min(99, Number(e.target.value) || 70)))} /></Field>
              <div style={{ color: '#64748b', fontSize: '.8rem' }}>Usalo como estimación después de ingredientes. No incluye impuestos/comisiones sobre ventas a menos que los contemples en este porcentaje.</div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
