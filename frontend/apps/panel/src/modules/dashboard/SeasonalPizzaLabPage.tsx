import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatARS } from '@pizzalog/shared';
import {
  calculatePricingScenario,
  CostEngine,
  type CostCatalog,
  type Recipe as EngineRecipe,
  type UnitCode,
} from '@pizzalog/cost-engine';
import { useApi } from '@/lib/auth';
import { Loading, PageHeader } from '@/ui';

type LabTab = 'ranking' | 'ingredientes' | 'armador' | 'simulador';
type SortKey =
  | 'units'
  | 'units_per_sale_day'
  | 'units_per_available_day'
  | 'revenue'
  | 'profit'
  | 'margin_pct'
  | 'tickets'
  | 'night_share';

interface DraftComponent {
  component_type: 'supply' | 'recipe';
  component_id: number;
  quantity: number;
  unit: string;
}

interface ResolvedIngredientLine {
  supplyId: number;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  cost: number | null;
  source: 'recipe' | 'inferred';
}

const today = () => new Date().toISOString().slice(0, 10);
const yearsAgo = (n: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
};
const monthsAgo = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
};

const aliases: Record<string, UnitCode> = {
  kilo: 'kg',
  kilos: 'kg',
  gr: 'g',
  gramo: 'g',
  gramos: 'g',
  lt: 'L',
  litro: 'L',
  litros: 'L',
  cc: 'cc',
  ml: 'ml',
  u: 'unit',
  un: 'unit',
  unidad: 'unit',
  unidades: 'unit',
  porcion: 'unit',
  'porción': 'unit',
  docena: 'dozen',
};
const supported = new Set<UnitCode>([
  'kg',
  'g',
  'mg',
  'lb',
  'oz',
  'L',
  'l',
  'ml',
  'cc',
  'fl_oz_us',
  'gal_us',
  'unit',
  'u',
  'dozen',
  'docena',
]);

function engineUnit(value: string): UnitCode | null {
  const n = value.trim().toLowerCase();
  return aliases[n] ?? (supported.has(value.trim() as UnitCode) ? (value.trim() as UnitCode) : null);
}

function dimension(unit: UnitCode): 'mass' | 'volume' | 'count' {
  if (['kg', 'g', 'mg', 'lb', 'oz'].includes(unit)) return 'mass';
  if (['L', 'l', 'ml', 'cc', 'fl_oz_us', 'gal_us'].includes(unit)) return 'volume';
  return 'count';
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function isBasicPizzaIngredient(name: string, category = ''): boolean {
  const n = normalizeText(name);
  const c = normalizeText(category);
  if (c === 'masa' || c === 'salsa' || c === 'packaging' || c === 'descartables') return true;
  return (
    n.includes('masa') ||
    n.includes('bollo') ||
    n.includes('harina') ||
    n.includes('levadura') ||
    n.includes('salsa') ||
    n.includes('pomodoro') ||
    n.includes('tomate triturado') ||
    n.includes('muzza') ||
    n.includes('mozzarella') ||
    n.includes('caja') ||
    n.includes('faja') ||
    n.includes('separador')
  );
}

const panel: CSSProperties = {
  background: 'var(--c-surface,#fff)',
  border: '1px solid var(--c-border,#ddd)',
  borderRadius: 10,
  padding: '1rem',
  minWidth: 0,
};
const muted: CSSProperties = { color: '#64748b', fontSize: '.82rem' };
const control: CSSProperties = {
  padding: '.5rem .65rem',
  border: '1px solid var(--c-border,#cbd5e1)',
  borderRadius: 6,
  background: 'var(--c-surface,#fff)',
  color: 'var(--c-text,#1e293b)',
  fontSize: '.86rem',
};
const btnPrimary: CSSProperties = {
  padding: '.55rem .9rem',
  border: 0,
  borderRadius: 7,
  background: 'var(--c-accent,#c7101b)',
  color: '#fff',
  fontWeight: 700,
  fontSize: '.85rem',
  cursor: 'pointer',
};
const btnSecondary: CSSProperties = {
  padding: '.5rem .75rem',
  border: '1px solid var(--c-border,#cbd5e1)',
  borderRadius: 7,
  background: 'var(--c-surface,#fff)',
  color: 'var(--c-text,#1e293b)',
  fontWeight: 600,
  fontSize: '.83rem',
  cursor: 'pointer',
};
const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '.25rem',
  padding: '.18rem .5rem',
  borderRadius: 999,
  fontSize: '.74rem',
  fontWeight: 600,
  background: '#f1f5f9',
  color: '#334155',
  border: '1px solid #e2e8f0',
};

export function SeasonalPizzaLabPage() {
  const api = useApi();
  const qc = useQueryClient();

  const [tab, setTab] = useState<LabTab>('ranking');
  const [from, setFrom] = useState(yearsAgo(4));
  const [to, setTo] = useState(today());

  // Filtros de Ranking
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'with_recipe' | 'without_recipe' | 'verified'>('all');
  const [sortBy, setSortBy] = useState<SortKey>('units');
  const [expandedVariantId, setExpandedVariantId] = useState<number | null>(null);
  const [recipeChoice, setRecipeChoice] = useState<Record<number, string>>({});
  const [periodChoice, setPeriodChoice] = useState<Record<number, { start: string; end: string }>>({});

  // Filtros de Inteligencia de Ingredientes
  const [excludeBasics, setExcludeBasics] = useState(true);
  const [includeInferredByName, setIncludeInferredByName] = useState(true);
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [selectedIngredientFilter, setSelectedIngredientFilter] = useState<string | null>(null);

  // Estado del Armador Rápido de Recetas de Temporada
  const [builderVariantId, setBuilderVariantId] = useState<number>(0);
  const [builderOnlyMissing, setBuilderOnlyMissing] = useState(false);
  const [builderRecipeName, setBuilderRecipeName] = useState('');
  const [builderPrice, setBuilderPrice] = useState<number>(0);
  const [builderTargetFoodCost, setBuilderTargetFoodCost] = useState<number>(30);
  const [builderComponents, setBuilderComponents] = useState<DraftComponent[]>([
    { component_type: 'supply', component_id: 0, quantity: 0.15, unit: 'kg' },
  ]);
  const [builderFeedback, setBuilderFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Estado del Simulador de Próxima Pizza de la Semana
  const [simName, setSimName] = useState('Nueva Pizza de la Semana');
  const [simPrice, setSimPrice] = useState<number>(18000);
  const [simTargetFoodCost, setSimTargetFoodCost] = useState<number>(28);
  const [simExpectedDays, setSimExpectedDays] = useState<number>(7);
  const [simCustomUnitsPerDay, setSimCustomUnitsPerDay] = useState<string>('');
  const [simComponents, setSimComponents] = useState<DraftComponent[]>([
    { component_type: 'supply', component_id: 0, quantity: 0.15, unit: 'kg' },
  ]);
  const [simFeedback, setSimFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Consultas
  const report = useQuery({
    queryKey: ['analytics', 'seasonal-pizzas', from, to],
    queryFn: () => api.analytics.seasonalPizzas({ from, to }),
  });
  const studio = useQuery({
    queryKey: ['production', 'recipe-studio'],
    queryFn: () => api.production.recipeStudio(),
  });
  const menuIngredientsQ = useQuery({
    queryKey: ['analytics', 'lab-menu-ingredients', from, to],
    queryFn: () => api.analytics.ingredients({ from, to, limit: 40 }),
  });
  const winningCombosQ = useQuery({
    queryKey: ['analytics', 'lab-winning-combos', from, to],
    queryFn: () => api.analytics.winningCombinations({ from, to }),
  });

  const link = useMutation({
    mutationFn: ({
      variantId,
      payload,
    }: {
      variantId: number;
      payload:
        | number
        | {
            recipe_id?: number;
            name?: string;
            yield_quantity?: number;
            yield_unit?: string;
            price?: number;
            target_food_cost_pct?: number;
            components: DraftComponent[];
          };
    }) => api.analytics.linkSeasonalPizzaRecipe(variantId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['analytics', 'seasonal-pizzas'] });
      qc.invalidateQueries({ queryKey: ['production', 'recipe-studio'] });
    },
  });

  const unlink = useMutation({
    mutationFn: (variantId: number) => api.analytics.unlinkSeasonalPizzaRecipe(variantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['analytics', 'seasonal-pizzas'] });
    },
  });

  const availability = useMutation({
    mutationFn: ({ variantId, start, end }: { variantId: number; start: string; end: string }) =>
      api.analytics.addSeasonalPizzaAvailability(variantId, start, end),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['analytics', 'seasonal-pizzas'] });
    },
  });

  const importLegacy = useMutation({
    mutationFn: () => api.production.importLegacyRecipes(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production', 'recipe-studio'] });
      qc.invalidateQueries({ queryKey: ['analytics', 'seasonal-pizzas'] });
    },
  });

  const supplies = studio.data?.supplies ?? [];
  const rawRecipes = studio.data?.recipes ?? [];
  const variants = report.data?.variants ?? [];
  const selectableRecipes = report.data?.recipes ?? [];

  // Construcción del catálogo y motor de costos compartido (@pizzalog/cost-engine)
  const costEngineData = useMemo(() => {
    const ingredients = supplies.flatMap((s) => {
      const u = engineUnit(s.unit);
      return u
        ? [
            {
              id: `supply_${s.id}`,
              name: s.name,
              base_dimension: dimension(u),
              base_unit: u,
              is_active: true,
            },
          ]
        : [];
    });
    const purchase_prices = supplies.flatMap((s) => {
      const u = engineUnit(s.unit);
      return u && s.cost !== null && Number.isFinite(s.cost) && s.cost > 0
        ? [
            {
              ingredient_id: `supply_${s.id}`,
              purchase_price: s.cost,
              currency: 'ARS',
              pack_quantity: 1,
              pack_unit: u,
              yield_pct: 100,
            },
          ]
        : [];
    });
    const engineRecipes: EngineRecipe[] = [];
    for (const r of rawRecipes) {
      const yu = engineUnit(r.yield_unit);
      if (!yu) continue;
      const components = [];
      let valid = true;
      for (const c of r.components) {
        const u = engineUnit(c.unit);
        if (!u || !Number.isFinite(c.quantity) || c.quantity <= 0) {
          valid = false;
          break;
        }
        if (c.component_type === 'supply') {
          const supply = supplies.find((s) => s.id === c.component_id);
          if (!supply || !engineUnit(supply.unit)) {
            valid = false;
            break;
          }
          components.push({
            component_type: 'ingredient' as const,
            ingredient_id: `supply_${c.component_id}`,
            quantity: c.quantity,
            unit: u,
          });
        } else {
          components.push({
            component_type: 'subrecipe' as const,
            recipe_id: String(c.component_id),
            quantity: c.quantity,
            unit: u,
          });
        }
      }
      if (valid) {
        engineRecipes.push({
          id: String(r.id),
          name: r.name,
          recipe_type: r.recipe_type,
          yield_quantity: r.yield_quantity,
          yield_unit: yu,
          currency: 'ARS',
          components,
        });
      }
    }
    const catalog: CostCatalog = { ingredients, purchase_prices, recipes: engineRecipes };
    const engine = new CostEngine(catalog);
    const supplyById = new Map(supplies.map((s) => [s.id, s]));
    const recipeById = new Map(rawRecipes.map((r) => [r.id, r]));

    // Función auxiliar para desglosar los ingredientes de una receta (expandiendo subrecetas de 1er nivel)
    const resolveRecipeIngredients = (recipeId: number): ResolvedIngredientLine[] => {
      const rec = recipeById.get(recipeId);
      if (!rec) return [];
      let calcResult = null;
      try {
        calcResult = engine.calculateRecipeCost(String(recipeId));
      } catch {
        calcResult = null;
      }
      const lines: ResolvedIngredientLine[] = [];
      rec.components.forEach((comp, idx) => {
        const lineCost =
          calcResult?.components && calcResult.components[idx]?.status === 'complete'
            ? calcResult.components[idx]?.raw_total_cost ?? null
            : null;
        if (comp.component_type === 'supply') {
          const sup = supplyById.get(comp.component_id);
          lines.push({
            supplyId: comp.component_id,
            name: sup?.name ?? comp.name,
            category: sup?.category ?? 'Insumo',
            quantity: comp.quantity,
            unit: comp.unit,
            cost: lineCost,
            source: 'recipe',
          });
        } else {
          const sub = recipeById.get(comp.component_id);
          lines.push({
            supplyId: -comp.component_id,
            name: sub ? `Subreceta: ${sub.name}` : comp.name,
            category: 'Subreceta',
            quantity: comp.quantity,
            unit: comp.unit,
            cost: lineCost,
            source: 'recipe',
          });
          // Además expandimos los insumos no básicos de la subreceta para el análisis de ingredientes
          if (sub) {
            const subYield = Math.max(0.0001, sub.yield_quantity || 1);
            const ratio = comp.quantity / subYield;
            sub.components.forEach((subComp) => {
              if (subComp.component_type === 'supply') {
                const sup = supplyById.get(subComp.component_id);
                if (sup && !isBasicPizzaIngredient(sup.name, sup.category)) {
                  lines.push({
                    supplyId: sup.id,
                    name: sup.name,
                    category: sup.category ?? 'Insumo',
                    quantity: subComp.quantity * ratio,
                    unit: subComp.unit,
                    cost: null,
                    source: 'recipe',
                  });
                }
              }
            });
          }
        }
      });
      return lines;
    };

    const costs = new Map<
      number,
      {
        unitCost: number | null;
        recipePrice: number;
        recipeName: string;
        targetFoodCostPct: number;
        suggestedPrice: number | null;
        ingredients: ResolvedIngredientLine[];
      }
    >();

    for (const r of rawRecipes) {
      try {
        const result = engine.calculateRecipeCost(String(r.id));
        const unitCost =
          result.status === 'complete' && result.raw_unit_cost !== null ? result.raw_unit_cost : null;
        const pricing =
          unitCost !== null && r.recipe_type === 'product'
            ? calculatePricingScenario({
                unit_cost: unitCost,
                status: result.status,
                currency: 'ARS',
                target_food_cost_pct: Math.max(1, Math.min(99, r.target_food_cost_pct || 30)),
                rounding_increment: 100,
                rounding_mode: 'ceil',
              })
            : null;
        costs.set(r.id, {
          unitCost,
          recipePrice: r.price,
          recipeName: r.name,
          targetFoodCostPct: r.target_food_cost_pct || 30,
          suggestedPrice: pricing?.raw_suggested_price ?? null,
          ingredients: resolveRecipeIngredients(r.id),
        });
      } catch {
        costs.set(r.id, {
          unitCost: null,
          recipePrice: r.price,
          recipeName: r.name,
          targetFoodCostPct: r.target_food_cost_pct || 30,
          suggestedPrice: null,
          ingredients: resolveRecipeIngredients(r.id),
        });
      }
    }

    return { catalog, engine, costs, supplyById, recipeById };
  }, [supplies, rawRecipes]);

  // Detector de ingredientes sugeridos cuando el nombre de la variante menciona insumos del catálogo
  const inferredIngredientsByVariant = useMemo(() => {
    const map = new Map<number, ResolvedIngredientLine[]>();
    const candidateSupplies = supplies.filter((s) => normalizeText(s.name).length >= 3);
    for (const v of variants) {
      const normLabel = normalizeText(v.label);
      const matched: ResolvedIngredientLine[] = [];
      for (const s of candidateSupplies) {
        const normSupply = normalizeText(s.name);
        // Coincidencia por nombre completo o palabra clave significativa (>= 4 letras)
        const tokens = normSupply.split(/\s+/).filter((t) => t.length >= 4 && !['para', 'tipo', 'con', 'sin', 'pizza'].includes(t));
        const directMatch = normLabel.includes(normSupply);
        const tokenMatch = tokens.length > 0 && tokens.every((t) => normLabel.includes(t));
        if (directMatch || tokenMatch) {
          matched.push({
            supplyId: s.id,
            name: s.name,
            category: s.category ?? 'Insumo',
            quantity: engineUnit(s.unit) === 'unit' ? 1 : 0.08,
            unit: s.unit || 'kg',
            cost: s.cost !== null ? s.cost * (engineUnit(s.unit) === 'unit' ? 1 : 0.08) : null,
            source: 'inferred',
          });
        }
      }
      map.set(v.variant_id, matched);
    }
    return map;
  }, [variants, supplies]);

  // Enriquecimiento de cada variante con métricas operativas, velocidad diaria e ingredientes
  const enrichedVariants = useMemo(() => {
    const withSales = variants.filter((v) => v.units > 0);
    const totalSaleDaysSum = withSales.reduce((acc, v) => acc + (v.sale_days ?? 0), 0);
    const globalAvgUnitsPerSaleDay =
      totalSaleDaysSum > 0
        ? withSales.reduce((acc, v) => acc + v.units, 0) / totalSaleDaysSum
        : 0;

    return variants.map((v) => {
      const c = v.recipe_id !== null ? costEngineData.costs.get(v.recipe_id) : undefined;
      const unitCost = c?.unitCost ?? null;
      const avgHistoricalPrice = v.units > 0 ? v.revenue / v.units : v.price;
      const effectiveSellingPrice = v.price > 0 ? v.price : avgHistoricalPrice;
      const profit = unitCost !== null ? v.revenue - v.units * unitCost : null;
      const marginPct = profit !== null && v.revenue > 0 ? (profit / v.revenue) * 100 : null;
      const currentUnitMarginPct =
        unitCost !== null && effectiveSellingPrice > 0
          ? ((effectiveSellingPrice - unitCost) / effectiveSellingPrice) * 100
          : null;
      const saleDays = v.sale_days ?? 0;
      const spanDays = v.span_days ?? 0;
      const unitsPerSaleDay =
        v.units_per_sale_day !== undefined && v.units_per_sale_day !== null
          ? v.units_per_sale_day
          : saleDays > 0
            ? v.units / saleDays
            : null;
      const velocityLiftPct =
        unitsPerSaleDay !== null && globalAvgUnitsPerSaleDay > 0
          ? ((unitsPerSaleDay - globalAvgUnitsPerSaleDay) / globalAvgUnitsPerSaleDay) * 100
          : null;
      const middayUnits = v.midday_units ?? 0;
      const nightUnits = v.night_units ?? 0;
      const shiftTotal = Math.max(1, middayUnits + nightUnits);
      const nightSharePct = v.units > 0 ? (nightUnits / shiftTotal) * 100 : 0;
      const deliveryUnits = v.delivery_units ?? 0;
      const localUnits = v.local_units ?? 0;
      const channelTotal = Math.max(1, deliveryUnits + localUnits);
      const deliverySharePct = v.units > 0 ? (deliveryUnits / channelTotal) * 100 : 0;

      const recipeIngredients = c?.ingredients ?? [];
      const inferredIngredients = inferredIngredientsByVariant.get(v.variant_id) ?? [];
      const activeIngredients =
        recipeIngredients.length > 0 ? recipeIngredients : inferredIngredients;

      return {
        ...v,
        saleDays,
        spanDays,
        unitsPerSaleDay,
        velocityLiftPct,
        unitCost,
        profit,
        marginPct,
        currentUnitMarginPct,
        suggestedPrice: c?.suggestedPrice ?? null,
        avgHistoricalPrice,
        middayUnits,
        nightUnits,
        nightSharePct,
        deliveryUnits,
        localUnits,
        deliverySharePct,
        recipeIngredients,
        inferredIngredients,
        activeIngredients,
      };
    });
  }, [variants, costEngineData.costs, inferredIngredientsByVariant]);

  // Inicializar variante seleccionada en el Armador cuando cargan los datos
  useEffect(() => {
    if (builderVariantId === 0 && enrichedVariants.length > 0) {
      const firstMissing = enrichedVariants.find((v) => v.recipe_id === null) ?? enrichedVariants[0];
      if (firstMissing) {
        loadVariantIntoBuilder(firstMissing.variant_id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrichedVariants.length]);

  function loadVariantIntoBuilder(variantId: number) {
    setBuilderVariantId(variantId);
    setBuilderFeedback(null);
    const target = enrichedVariants.find((v) => v.variant_id === variantId);
    if (!target) return;
    setBuilderRecipeName(target.recipe_name || `Pizza de la semana · ${target.label}`);
    setBuilderPrice(target.price > 0 ? target.price : Math.round(target.avgHistoricalPrice || 0));
    if (target.recipe_id !== null) {
      const existingRec = costEngineData.recipeById.get(target.recipe_id);
      if (existingRec && existingRec.components.length > 0) {
        setBuilderTargetFoodCost(existingRec.target_food_cost_pct || 30);
        setBuilderComponents(
          existingRec.components.map((c) => ({
            component_type: c.component_type,
            component_id: c.component_id,
            quantity: c.quantity,
            unit: c.unit,
          })),
        );
        return;
      }
    }
    // Si no tiene receta aún, precargar ingredientes detectados por nombre (si existen)
    if (target.inferredIngredients.length > 0) {
      setBuilderComponents(
        target.inferredIngredients.map((ing) => ({
          component_type: 'supply' as const,
          component_id: ing.supplyId,
          quantity: ing.quantity,
          unit: ing.unit,
        })),
      );
    } else {
      setBuilderComponents([{ component_type: 'supply', component_id: 0, quantity: 0.1, unit: 'kg' }]);
    }
  }

  // Aplicar plantilla base de pizza (Masa + Salsa + Muzzarella) en 1 click
  function applyStandardPizzaBase(
    targetSetter: React.Dispatch<React.SetStateAction<DraftComponent[]>>,
  ) {
    const baseItems: DraftComponent[] = [];
    // Buscar subreceta de masa o insumo de bollo/masa
    const doughSub = rawRecipes.find(
      (r) =>
        r.recipe_type === 'subrecipe' &&
        (normalizeText(r.name).includes('masa') || normalizeText(r.name).includes('bollo')),
    );
    if (doughSub) {
      baseItems.push({
        component_type: 'recipe',
        component_id: doughSub.id,
        quantity: 1,
        unit: doughSub.yield_unit || 'u',
      });
    } else {
      const doughSupply = supplies.find(
        (s) => normalizeText(s.name).includes('bollo') || normalizeText(s.name).includes('masa'),
      );
      if (doughSupply) {
        baseItems.push({
          component_type: 'supply',
          component_id: doughSupply.id,
          quantity: engineUnit(doughSupply.unit) === 'unit' ? 1 : 0.35,
          unit: doughSupply.unit || 'u',
        });
      }
    }

    // Buscar salsa o pomodoro
    const sauceSub = rawRecipes.find(
      (r) =>
        r.recipe_type === 'subrecipe' &&
        (normalizeText(r.name).includes('salsa') || normalizeText(r.name).includes('pomodoro')),
    );
    if (sauceSub) {
      baseItems.push({
        component_type: 'recipe',
        component_id: sauceSub.id,
        quantity: engineUnit(sauceSub.yield_unit) === 'g' ? 90 : 0.09,
        unit: sauceSub.yield_unit || 'kg',
      });
    } else {
      const sauceSupply = supplies.find(
        (s) =>
          normalizeText(s.name).includes('salsa') ||
          normalizeText(s.name).includes('pomodoro') ||
          normalizeText(s.name).includes('tomate'),
      );
      if (sauceSupply) {
        baseItems.push({
          component_type: 'supply',
          component_id: sauceSupply.id,
          quantity: engineUnit(sauceSupply.unit) === 'g' ? 90 : 0.09,
          unit: sauceSupply.unit || 'kg',
        });
      }
    }

    // Buscar muzzarella
    const muzzaSupply = supplies.find(
      (s) => normalizeText(s.name).includes('muzza') || normalizeText(s.name).includes('mozzarella'),
    );
    if (muzzaSupply) {
      baseItems.push({
        component_type: 'supply',
        component_id: muzzaSupply.id,
        quantity: engineUnit(muzzaSupply.unit) === 'g' ? 220 : 0.22,
        unit: muzzaSupply.unit || 'kg',
      });
    }

    targetSetter((prev) => {
      const validExisting = prev.filter((c) => c.component_id > 0);
      const existingKeys = new Set(validExisting.map((c) => `${c.component_type}:${c.component_id}`));
      const toAdd = baseItems.filter((b) => !existingKeys.has(`${b.component_type}:${b.component_id}`));
      const merged = [...toAdd, ...validExisting];
      return merged.length > 0
        ? merged
        : [{ component_type: 'supply', component_id: 0, quantity: 0.1, unit: 'kg' }];
    });
  }

  // Filtrado y ordenamiento de la tabla de variantes
  const filteredVariants = useMemo(() => {
    const q = normalizeText(search);
    return enrichedVariants
      .filter((v) => {
        if (statusFilter === 'with_recipe' && v.recipe_id === null) return false;
        if (statusFilter === 'without_recipe' && v.recipe_id !== null) return false;
        if (statusFilter === 'verified' && v.verified_days <= 0) return false;
        if (selectedIngredientFilter) {
          const hasIng = v.activeIngredients.some(
            (i) => normalizeText(i.name) === normalizeText(selectedIngredientFilter),
          );
          if (!hasIng) return false;
        }
        if (!q) return true;
        if (normalizeText(v.label).includes(q)) return true;
        return v.activeIngredients.some((i) => normalizeText(i.name).includes(q));
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'units_per_sale_day':
            return (b.unitsPerSaleDay ?? -1) - (a.unitsPerSaleDay ?? -1) || b.units - a.units;
          case 'units_per_available_day':
            return (
              (b.units_per_available_day ?? -1) - (a.units_per_available_day ?? -1) ||
              b.units - a.units
            );
          case 'revenue':
            return b.revenue - a.revenue;
          case 'profit':
            return (b.profit ?? -Infinity) - (a.profit ?? -Infinity);
          case 'margin_pct':
            return (b.marginPct ?? -Infinity) - (a.marginPct ?? -Infinity);
          case 'tickets':
            return b.tickets - a.tickets;
          case 'night_share':
            return b.nightUnits - a.nightUnits;
          case 'units':
          default:
            return b.units - a.units || b.revenue - a.revenue;
        }
      });
  }, [enrichedVariants, search, statusFilter, sortBy, selectedIngredientFilter]);

  // Métricas globales del laboratorio
  const globalStats = useMemo(() => {
    const totalUnits = enrichedVariants.reduce((s, v) => s + v.units, 0);
    const totalRevenue = enrichedVariants.reduce((s, v) => s + v.revenue, 0);
    const totalSaleDays = enrichedVariants.reduce((s, v) => s + v.saleDays, 0);
    const avgUnitsPerSaleDay = totalSaleDays > 0 ? totalUnits / totalSaleDays : 0;
    const costed = enrichedVariants.filter((v) => v.unitCost !== null);
    const estimatedProfit = costed.reduce((s, v) => s + (v.profit ?? 0), 0);
    const avgMarginPct =
      costed.length > 0
        ? costed.reduce((s, v) => s + (v.marginPct ?? v.currentUnitMarginPct ?? 0), 0) /
          costed.length
        : null;
    const bestVelocityVariant =
      [...enrichedVariants]
        .filter((v) => v.saleDays >= 2 && v.unitsPerSaleDay !== null)
        .sort((a, b) => (b.unitsPerSaleDay ?? 0) - (a.unitsPerSaleDay ?? 0))[0] ?? null;

    return {
      totalUnits,
      totalRevenue,
      totalSaleDays,
      avgUnitsPerSaleDay,
      costedCount: costed.length,
      estimatedProfit,
      avgMarginPct,
      bestVelocityVariant,
    };
  }, [enrichedVariants]);

  // ============================================================================
  // INTELIGENCIA DE INGREDIENTES Y COMBINACIONES EN PIZZAS DE LA SEMANA
  // ============================================================================
  const ingredientAnalytics = useMemo(() => {
    const byIngredient = new Map<
      string,
      {
        key: string;
        supplyId: number;
        name: string;
        category: string;
        variantCount: number;
        confirmedCount: number;
        inferredCount: number;
        variantLabels: string[];
        totalUnits: number;
        totalRevenue: number;
        totalTickets: number;
        totalSaleDays: number;
        totalVerifiedDays: number;
        costSamples: number[];
        costShareSamples: number[];
        marginSamples: number[];
      }
    >();

    const pairMap = new Map<
      string,
      {
        key: string;
        ingA: string;
        ingB: string;
        variantCount: number;
        variantLabels: string[];
        totalUnits: number;
        totalRevenue: number;
        totalSaleDays: number;
      }
    >();

    for (const v of enrichedVariants) {
      const sourceList =
        v.recipeIngredients.length > 0
          ? v.recipeIngredients.filter((i) => i.supplyId > 0)
          : includeInferredByName
            ? v.inferredIngredients
            : [];

      const filteredList = excludeBasics
        ? sourceList.filter((i) => !isBasicPizzaIngredient(i.name, i.category))
        : sourceList;

      // Deduplicar por ingrediente dentro de la misma variante
      const uniqueInVariant = new Map<string, ResolvedIngredientLine>();
      for (const item of filteredList) {
        const k = normalizeText(item.name);
        if (!uniqueInVariant.has(k)) uniqueInVariant.set(k, item);
      }

      const items = Array.from(uniqueInVariant.values());
      for (const item of items) {
        const k = normalizeText(item.name);
        const existing = byIngredient.get(k) ?? {
          key: k,
          supplyId: item.supplyId,
          name: item.name,
          category: item.category || 'Insumo',
          variantCount: 0,
          confirmedCount: 0,
          inferredCount: 0,
          variantLabels: [],
          totalUnits: 0,
          totalRevenue: 0,
          totalTickets: 0,
          totalSaleDays: 0,
          totalVerifiedDays: 0,
          costSamples: [],
          costShareSamples: [],
          marginSamples: [],
        };
        existing.variantCount += 1;
        if (item.source === 'recipe') existing.confirmedCount += 1;
        else existing.inferredCount += 1;
        existing.variantLabels.push(v.label);
        existing.totalUnits += v.units;
        existing.totalRevenue += v.revenue;
        existing.totalTickets += v.tickets;
        existing.totalSaleDays += v.saleDays;
        existing.totalVerifiedDays += v.verified_days;
        if (item.cost !== null && item.cost > 0) {
          existing.costSamples.push(item.cost);
          if (v.unitCost && v.unitCost > 0) {
            existing.costShareSamples.push((item.cost / v.unitCost) * 100);
          }
        }
        if (v.marginPct !== null) {
          existing.marginSamples.push(v.marginPct);
        } else if (v.currentUnitMarginPct !== null) {
          existing.marginSamples.push(v.currentUnitMarginPct);
        }
        byIngredient.set(k, existing);
      }

      // Pares de ingredientes dentro de la misma pizza de temporada
      const nonBasicItems = sourceList.filter((i) => !isBasicPizzaIngredient(i.name, i.category));
      const uniqueNonBasic = Array.from(
        new Map(nonBasicItems.map((i) => [normalizeText(i.name), i])).values(),
      );
      for (let i = 0; i < uniqueNonBasic.length; i++) {
        for (let j = i + 1; j < uniqueNonBasic.length; j++) {
          const itemA = uniqueNonBasic[i];
          const itemB = uniqueNonBasic[j];
          if (!itemA || !itemB) continue;
          const [first, second] = itemA.name.localeCompare(itemB.name) <= 0 ? [itemA, itemB] : [itemB, itemA];
          const pk = `${normalizeText(first.name)}__${normalizeText(second.name)}`;
          const pair = pairMap.get(pk) ?? {
            key: pk,
            ingA: first.name,
            ingB: second.name,
            variantCount: 0,
            variantLabels: [],
            totalUnits: 0,
            totalRevenue: 0,
            totalSaleDays: 0,
          };
          pair.variantCount += 1;
          pair.variantLabels.push(v.label);
          pair.totalUnits += v.units;
          pair.totalRevenue += v.revenue;
          pair.totalSaleDays += v.saleDays;
          pairMap.set(pk, pair);
        }
      }
    }

    const q = normalizeText(ingredientSearch);
    const rows = Array.from(byIngredient.values())
      .filter((r) => !q || normalizeText(r.name).includes(q) || normalizeText(r.category).includes(q))
      .map((r) => {
        const avgUnitsPerSaleDay = r.totalSaleDays > 0 ? r.totalUnits / r.totalSaleDays : null;
        const avgUnitsPerVariant = r.variantCount > 0 ? r.totalUnits / r.variantCount : 0;
        const liftPct =
          avgUnitsPerSaleDay !== null && globalStats.avgUnitsPerSaleDay > 0
            ? ((avgUnitsPerSaleDay - globalStats.avgUnitsPerSaleDay) /
                globalStats.avgUnitsPerSaleDay) *
              100
            : null;
        const avgIngredientCost =
          r.costSamples.length > 0
            ? r.costSamples.reduce((a, b) => a + b, 0) / r.costSamples.length
            : null;
        const avgCostSharePct =
          r.costShareSamples.length > 0
            ? r.costShareSamples.reduce((a, b) => a + b, 0) / r.costShareSamples.length
            : null;
        const avgMarginPct =
          r.marginSamples.length > 0
            ? r.marginSamples.reduce((a, b) => a + b, 0) / r.marginSamples.length
            : null;

        return {
          ...r,
          avgUnitsPerSaleDay,
          avgUnitsPerVariant,
          liftPct,
          avgIngredientCost,
          avgCostSharePct,
          avgMarginPct,
        };
      })
      .sort((a, b) => (b.avgUnitsPerSaleDay ?? 0) - (a.avgUnitsPerSaleDay ?? 0) || b.totalUnits - a.totalUnits);

    const pairs = Array.from(pairMap.values())
      .map((p) => ({
        ...p,
        avgUnitsPerSaleDay: p.totalSaleDays > 0 ? p.totalUnits / p.totalSaleDays : null,
      }))
      .sort((a, b) => (b.avgUnitsPerSaleDay ?? 0) - (a.avgUnitsPerSaleDay ?? 0) || b.totalUnits - a.totalUnits);

    return { rows, pairs, byKey: new Map(rows.map((r) => [r.key, r])) };
  }, [enrichedVariants, excludeBasics, includeInferredByName, ingredientSearch, globalStats.avgUnitsPerSaleDay]);

  // ============================================================================
  // EVALUACIÓN EN VIVO DE COMPONENTES (PARA ARMADOR Y SIMULADOR) via CostEngine
  // ============================================================================
  function evaluateDraftRecipe(
    draftComponents: DraftComponent[],
    sellingPrice: number,
    targetFoodCostPct: number,
  ) {
    const validDrafts = draftComponents.filter((c) => c.component_id > 0 && c.quantity > 0);
    if (validDrafts.length === 0) {
      return {
        unitCost: null as number | null,
        suggestedPrice: null as number | null,
        foodCostPct: null as number | null,
        marginArs: null as number | null,
        marginPct: null as number | null,
        lines: [] as Array<{
          index: number;
          name: string;
          quantity: number;
          unit: string;
          lineCost: number | null;
          sharePct: number | null;
          warning?: string;
        }>,
        warnings: [] as string[],
      };
    }

    const mapped = [];
    for (const c of validDrafts) {
      const u = engineUnit(c.unit);
      if (!u) continue;
      if (c.component_type === 'supply') {
        mapped.push({
          component_type: 'ingredient' as const,
          ingredient_id: `supply_${c.component_id}`,
          quantity: c.quantity,
          unit: u,
        });
      } else {
        mapped.push({
          component_type: 'subrecipe' as const,
          recipe_id: String(c.component_id),
          quantity: c.quantity,
          unit: u,
        });
      }
    }

    const draftId = '__seasonal_draft__';
    const tempCatalog: CostCatalog = {
      ingredients: costEngineData.catalog.ingredients,
      purchase_prices: costEngineData.catalog.purchase_prices,
      recipes: [
        ...costEngineData.catalog.recipes.filter((r) => r.id !== draftId),
        {
          id: draftId,
          name: 'Borrador Laboratorio',
          recipe_type: 'product',
          yield_quantity: 1,
          yield_unit: 'unit',
          currency: 'ARS',
          components: mapped,
        },
      ],
    };

    try {
      const tempEngine = new CostEngine(tempCatalog);
      const res = tempEngine.calculateRecipeCost(draftId);
      const unitCost = res.status === 'complete' ? res.raw_unit_cost : null;
      const pricing =
        unitCost !== null
          ? calculatePricingScenario({
              unit_cost: unitCost,
              status: res.status,
              currency: 'ARS',
              target_food_cost_pct: Math.max(1, Math.min(99, targetFoodCostPct || 30)),
              rounding_increment: 100,
              rounding_mode: 'ceil',
              ...(sellingPrice > 0 ? { selling_price: sellingPrice } : {}),
            })
          : null;

      const lines = validDrafts.map((c, idx) => {
        const li = res.components[idx];
        const lineCost = li && li.status === 'complete' ? li.raw_total_cost : null;
        const sharePct =
          lineCost !== null && unitCost !== null && unitCost > 0
            ? (lineCost / unitCost) * 100
            : null;
        const name =
          c.component_type === 'supply'
            ? costEngineData.supplyById.get(c.component_id)?.name ?? 'Insumo'
            : costEngineData.recipeById.get(c.component_id)?.name ?? 'Subreceta';
        return {
          index: idx,
          name,
          quantity: c.quantity,
          unit: c.unit,
          lineCost,
          sharePct,
        };
      });

      const marginArs = unitCost !== null && sellingPrice > 0 ? sellingPrice - unitCost : null;
      const marginPct =
        marginArs !== null && sellingPrice > 0 ? (marginArs / sellingPrice) * 100 : null;

      return {
        unitCost,
        suggestedPrice: pricing?.raw_suggested_price ?? null,
        foodCostPct: pricing?.food_cost_pct ?? null,
        marginArs,
        marginPct,
        lines,
        warnings: res.warnings,
      };
    } catch (e) {
      return {
        unitCost: null,
        suggestedPrice: null,
        foodCostPct: null,
        marginArs: null,
        marginPct: null,
        lines: [],
        warnings: [e instanceof Error ? e.message : 'Error de cálculo en Cost Engine'],
      };
    }
  }

  const builderEval = useMemo(
    () => evaluateDraftRecipe(builderComponents, builderPrice, builderTargetFoodCost),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [builderComponents, builderPrice, builderTargetFoodCost, costEngineData],
  );

  const simEval = useMemo(
    () => evaluateDraftRecipe(simComponents, simPrice, simTargetFoodCost),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [simComponents, simPrice, simTargetFoodCost, costEngineData],
  );

  // Predicción histórica de demanda según los ingredientes elegidos en el Simulador
  const simHistoricalPrediction = useMemo(() => {
    const chosenSupplyIds = new Set(
      simComponents.filter((c) => c.component_type === 'supply' && c.component_id > 0).map((c) => c.component_id),
    );
    const chosenNames = Array.from(chosenSupplyIds)
      .flatMap((id) => {
        const s = costEngineData.supplyById.get(id);
        return s && !isBasicPizzaIngredient(s.name, s.category ?? '') ? [s.name] : [];
      });

    const matchedMetrics = chosenNames
      .map((name) => ingredientAnalytics.byKey.get(normalizeText(name)))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));

    const predictedUnitsPerDay =
      matchedMetrics.length > 0
        ? matchedMetrics.reduce((acc, m) => acc + (m.avgUnitsPerSaleDay ?? globalStats.avgUnitsPerSaleDay), 0) /
          matchedMetrics.length
        : globalStats.avgUnitsPerSaleDay;

    // Pizzas históricas que comparten al menos un topping con el prototipo
    const similarVariants = enrichedVariants
      .map((v) => {
        const overlap = v.activeIngredients.filter(
          (ing) =>
            !isBasicPizzaIngredient(ing.name, ing.category) &&
            chosenNames.some((cn) => normalizeText(cn) === normalizeText(ing.name)),
        );
        return { variant: v, overlap };
      })
      .filter((x) => x.overlap.length > 0)
      .sort((a, b) => b.overlap.length - a.overlap.length || b.variant.units - a.variant.units)
      .slice(0, 6);

    return {
      chosenNames,
      matchedMetrics,
      predictedUnitsPerDay,
      similarVariants,
    };
  }, [simComponents, costEngineData.supplyById, ingredientAnalytics.byKey, globalStats.avgUnitsPerSaleDay, enrichedVariants]);

  const topChartVariants = useMemo(() => filteredVariants.slice(0, 12), [filteredVariants]);
  const maxChartValue = useMemo(() => {
    const vals = topChartVariants.map((v) => {
      if (sortBy === 'units_per_sale_day') return v.unitsPerSaleDay ?? 0;
      if (sortBy === 'revenue') return v.revenue;
      if (sortBy === 'margin_pct') return Math.max(0, v.marginPct ?? v.currentUnitMarginPct ?? 0);
      return v.units;
    });
    return Math.max(1, ...vals);
  }, [topChartVariants, sortBy]);

  const selectedBuilderVariant = enrichedVariants.find((v) => v.variant_id === builderVariantId) ?? null;
  const legacyUnimportedCount = studio.data?.legacy_unimported_count ?? 0;

  return (
    <section>
      <PageHeader
        eyebrow="Analítica · I+D de Producto"
        title="Laboratorio de Pizzas de Temporada"
        description="Inteligencia de ingredientes, velocidad de venta diaria, recetario integrado y simulador de nuevas Pizzas de la Semana impulsado por Cost Engine."
      />

      {/* Barra global de período + pestañas de trabajo */}
      <div
        style={{
          ...panel,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'end',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1rem',
        }}
      >
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'end', flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: '.25rem', fontSize: '.78rem', fontWeight: 600 }}>
            Desde
            <input style={control} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: '.25rem', fontSize: '.78rem', fontWeight: 600 }}>
            Hasta
            <input style={control} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button
            style={btnSecondary}
            onClick={() => {
              setFrom(yearsAgo(4));
              setTo(today());
            }}
          >
            Todo el histórico
          </button>
          <button
            style={btnSecondary}
            onClick={() => {
              setFrom(yearsAgo(1));
              setTo(today());
            }}
          >
            Últimos 12 meses
          </button>
          <button
            style={btnSecondary}
            onClick={() => {
              setFrom(monthsAgo(6));
              setTo(today());
            }}
          >
            Últimos 6 meses
          </button>
          {legacyUnimportedCount > 0 && (
            <button
              style={{ ...btnSecondary, borderColor: '#f59e0b', background: '#fffbeb', color: '#92400e' }}
              disabled={importLegacy.isPending}
              onClick={() => importLegacy.mutate()}
            >
              {importLegacy.isPending
                ? 'Importando...'
                : `📥 Importar ${legacyUnimportedCount} recetas del catálogo`}
            </button>
          )}
        </div>

        {/* Navegación por módulos del Laboratorio */}
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
          {(
            [
              { id: 'ranking', label: '📊 Ranking y Desempeño' },
              {
                id: 'ingredientes',
                label: `🧀 Análisis de Ingredientes (${ingredientAnalytics.rows.length})`,
              },
              {
                id: 'armador',
                label: `⚡ Armador de Recetas (${globalStats.costedCount}/${enrichedVariants.length})`,
              },
              { id: 'simulador', label: '🧪 Simulador Nueva Pizza' },
            ] as Array<{ id: LabTab; label: string }>
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                padding: '.55rem .9rem',
                borderRadius: 8,
                border: tab === t.id ? '1px solid var(--c-accent,#c7101b)' : '1px solid #cbd5e1',
                background: tab === t.id ? 'var(--c-accent,#c7101b)' : '#f8fafc',
                color: tab === t.id ? '#fff' : '#1e293b',
                fontWeight: 700,
                fontSize: '.84rem',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {(report.isLoading || studio.isLoading) && (
        <Loading message="Analizando historial de pizzas de temporada, ingredientes y costos..." />
      )}
      {(report.isError || studio.isError) && (
        <div role="alert" style={{ ...panel, color: '#a12622', marginBottom: '1rem' }}>
          No se pudieron cargar los datos del Laboratorio de Pizzas. Verificá la conexión e intentá nuevamente.
        </div>
      )}
      {!report.isLoading && report.data?.parent_product_id === null && (
        <div style={panel}>
          Todavía no existe el producto «Pizza de la semana» en este negocio.
        </div>
      )}

      {report.data?.parent_product_id !== null && (
        <>
          {/* KPIs Ejecutivos siempre visibles */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(185px,1fr))',
              gap: '.75rem',
              marginBottom: '1rem',
            }}
          >
            <div style={panel}>
              <div style={muted}>Variantes de temporada</div>
              <strong style={{ fontSize: '1.55rem' }}>{enrichedVariants.length}</strong>
              <div style={muted}>
                {enrichedVariants.filter((v) => v.units > 0).length} con ventas en el período
              </div>
            </div>
            <div style={panel}>
              <div style={muted}>Unidades vendidas</div>
              <strong style={{ fontSize: '1.55rem' }}>
                {globalStats.totalUnits.toLocaleString('es-AR', { maximumFractionDigits: 1 })}
              </strong>
              <div style={muted}>
                Prom.{' '}
                {(
                  globalStats.totalUnits / Math.max(1, enrichedVariants.filter((v) => v.units > 0).length)
                ).toFixed(1)}{' '}
                unid. por variante
              </div>
            </div>
            <div style={panel}>
              <div style={muted}>Velocidad diaria real</div>
              <strong style={{ fontSize: '1.55rem', color: '#0f766e' }}>
                {globalStats.avgUnitsPerSaleDay.toFixed(2)} u/día
              </strong>
              <div style={muted}>
                {globalStats.bestVelocityVariant
                  ? `Líder: ${globalStats.bestVelocityVariant.label} (${globalStats.bestVelocityVariant.unitsPerSaleDay?.toFixed(1)} u/día)`
                  : 'Sobre días con venta registrada'}
              </div>
            </div>
            <div style={panel}>
              <div style={muted}>Facturación histórica</div>
              <strong style={{ fontSize: '1.55rem' }}>{formatARS(globalStats.totalRevenue)}</strong>
              <div style={muted}>
                Precio prom.{' '}
                {globalStats.totalUnits > 0
                  ? formatARS(globalStats.totalRevenue / globalStats.totalUnits)
                  : '—'}
              </div>
            </div>
            <div style={panel}>
              <div style={muted}>Ganancia estimada (costo actual)</div>
              <strong style={{ fontSize: '1.55rem', color: '#15803d' }}>
                {globalStats.costedCount > 0 ? formatARS(globalStats.estimatedProfit) : 'Sin recetas'}
              </strong>
              <div style={muted}>
                {globalStats.costedCount} de {enrichedVariants.length} variantes con receta costeada
              </div>
            </div>
            <div style={panel}>
              <div style={muted}>Margen bruto promedio</div>
              <strong style={{ fontSize: '1.55rem' }}>
                {globalStats.avgMarginPct !== null ? `${globalStats.avgMarginPct.toFixed(1)}%` : '—'}
              </strong>
              <div style={muted}>
                {globalStats.avgMarginPct !== null
                  ? `Food Cost prom.: ${(100 - globalStats.avgMarginPct).toFixed(1)}%`
                  : 'Cargá recetas en el Armador para ver márgenes'}
              </div>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* PESTAÑA 1: RANKING, VELOCIDAD DIARIA Y RADIOGRAFÍA DE VARIANTES       */}
          {/* ===================================================================== */}
          {tab === 'ranking' && (
            <>
              {/* Gráfico comparativo Top 12 */}
              {topChartVariants.length > 0 && (
                <div style={{ ...panel, marginBottom: '1rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '.5rem',
                      marginBottom: '.75rem',
                    }}
                  >
                    <div>
                      <strong>Comparativa visual · Top {topChartVariants.length} Pizzas de Temporada</strong>
                      <div style={muted}>
                        Hacé click en cualquier ingrediente para filtrar qué pizzas lo contienen, o en «⚡ Receta» para cargar/editar su composición.
                      </div>
                    </div>
                    {selectedIngredientFilter && (
                      <button
                        style={{ ...btnSecondary, background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}
                        onClick={() => setSelectedIngredientFilter(null)}
                      >
                        ✕ Quitar filtro de ingrediente: {selectedIngredientFilter}
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gap: '.45rem' }}>
                    {topChartVariants.map((v, idx) => {
                      const metricVal =
                        sortBy === 'units_per_sale_day'
                          ? v.unitsPerSaleDay ?? 0
                          : sortBy === 'revenue'
                            ? v.revenue
                            : sortBy === 'margin_pct'
                              ? Math.max(0, v.marginPct ?? v.currentUnitMarginPct ?? 0)
                              : v.units;
                      const pct = Math.min(100, Math.max(4, (metricVal / maxChartValue) * 100));
                      const nonBasicChips = v.activeIngredients.filter(
                        (i) => !isBasicPizzaIngredient(i.name, i.category),
                      );
                      return (
                        <div
                          key={v.variant_id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(180px, 240px) 1fr auto',
                            gap: '.75rem',
                            alignItems: 'center',
                            fontSize: '.84rem',
                          }}
                        >
                          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span style={{ color: '#64748b', marginRight: '.35rem' }}>#{idx + 1}</span>
                            {v.label}
                          </div>
                          <div>
                            <div
                              style={{
                                height: 10,
                                background: '#f1f5f9',
                                borderRadius: 999,
                                overflow: 'hidden',
                                marginBottom: '.25rem',
                              }}
                            >
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: '100%',
                                  background:
                                    idx === 0
                                      ? 'var(--c-accent,#c7101b)'
                                      : idx < 3
                                        ? '#ea580c'
                                        : '#0f766e',
                                  borderRadius: 999,
                                }}
                              />
                            </div>
                            <div style={{ display: 'flex', gap: '.25rem', flexWrap: 'wrap' }}>
                              {nonBasicChips.slice(0, 5).map((ing) => (
                                <button
                                  key={`${v.variant_id}-${ing.name}`}
                                  type="button"
                                  onClick={() =>
                                    setSelectedIngredientFilter((cur) =>
                                      cur === ing.name ? null : ing.name,
                                    )
                                  }
                                  style={{
                                    ...chipStyle,
                                    cursor: 'pointer',
                                    background:
                                      ing.source === 'recipe' ? '#ecfdf5' : '#fffbeb',
                                    borderColor:
                                      ing.source === 'recipe' ? '#a7f3d0' : '#fde68a',
                                    color: ing.source === 'recipe' ? '#065f46' : '#92400e',
                                  }}
                                  title={
                                    ing.source === 'recipe'
                                      ? 'Ingrediente confirmado en receta'
                                      : 'Ingrediente detectado en el nombre (confirmá su receta en el Armador)'
                                  }
                                >
                                  {ing.name}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', fontWeight: 700, minWidth: 110 }}>
                            {sortBy === 'units_per_sale_day'
                              ? `${(v.unitsPerSaleDay ?? 0).toFixed(2)} u/día`
                              : sortBy === 'revenue'
                                ? formatARS(v.revenue)
                                : sortBy === 'margin_pct'
                                  ? `${(v.marginPct ?? v.currentUnitMarginPct ?? 0).toFixed(1)}%`
                                  : `${v.units.toLocaleString('es-AR', { maximumFractionDigits: 1 })} u.`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Controles de filtrado y orden de la tabla */}
              <div
                style={{
                  ...panel,
                  display: 'flex',
                  gap: '.65rem',
                  alignItems: 'end',
                  flexWrap: 'wrap',
                  marginBottom: '1rem',
                }}
              >
                <label style={{ display: 'grid', gap: '.25rem', fontSize: '.78rem', fontWeight: 600, flex: '1 1 220px' }}>
                  Buscar pizza o ingrediente
                  <input
                    style={control}
                    placeholder="Ej: burrata, hongos, mortadela, pistacho..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <label style={{ display: 'grid', gap: '.25rem', fontSize: '.78rem', fontWeight: 600 }}>
                  Estado de receta
                  <select
                    style={control}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  >
                    <option value="all">Todas ({enrichedVariants.length})</option>
                    <option value="with_recipe">
                      Con receta ({enrichedVariants.filter((v) => v.recipe_id !== null).length})
                    </option>
                    <option value="without_recipe">
                      Sin receta ({enrichedVariants.filter((v) => v.recipe_id === null).length})
                    </option>
                    <option value="verified">
                      Período verificado ({enrichedVariants.filter((v) => v.verified_days > 0).length})
                    </option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '.25rem', fontSize: '.78rem', fontWeight: 600 }}>
                  Ordenar ranking por
                  <select
                    style={control}
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortKey)}
                  >
                    <option value="units">Unidades totales vendidas</option>
                    <option value="units_per_sale_day">Velocidad: Unidades por día de venta</option>
                    <option value="units_per_available_day">Unidades por día de carta verificado</option>
                    <option value="revenue">Facturación total</option>
                    <option value="profit">Ganancia estimada ($)</option>
                    <option value="margin_pct">Margen bruto (%)</option>
                    <option value="tickets">Tickets / Pedidos</option>
                    <option value="night_share">Demanda en Turno Noche</option>
                  </select>
                </label>
              </div>

              {/* Tabla principal de variantes */}
              <div style={{ ...panel, marginBottom: '1rem' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
                    <thead>
                      <tr>
                        {[
                          'Pizza e Ingredientes',
                          'Unidades',
                          'Velocidad real (u/día venta)',
                          'Ciclo y Turno',
                          'Facturación / Tickets',
                          'Período de carta verificado',
                          'Costo y Rentabilidad',
                          'Receta y Desglose',
                        ].map((x) => (
                          <th
                            key={x}
                            style={{
                              textAlign: 'left',
                              padding: '.65rem .55rem',
                              borderBottom: '2px solid var(--c-border,#cbd5e1)',
                              fontSize: '.78rem',
                              textTransform: 'uppercase',
                              letterSpacing: '.03em',
                              color: '#475569',
                            }}
                          >
                            {x}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVariants.map((v) => {
                        const period = periodChoice[v.variant_id] ?? {
                          start: v.first_sale ?? '',
                          end: v.last_sale ?? '',
                        };
                        const isExpanded = expandedVariantId === v.variant_id;
                        return (
                          <>
                            <tr key={v.variant_id} style={{ background: isExpanded ? '#f8fafc' : undefined }}>
                              {/* Columna 1: Pizza + Ingredientes */}
                              <td style={{ padding: '.65rem .55rem', borderBottom: '1px solid #e2e8f0', minWidth: 220 }}>
                                <div style={{ fontWeight: 700, fontSize: '.92rem', color: '#0f172a' }}>
                                  {v.label}
                                </div>
                                <div style={muted}>Precio lista: {formatARS(v.price)}</div>
                                <div style={{ display: 'flex', gap: '.25rem', flexWrap: 'wrap', marginTop: '.35rem' }}>
                                  {v.activeIngredients.length > 0 ? (
                                    v.activeIngredients.map((ing, i) => (
                                      <span
                                        key={`${v.variant_id}-ing-${i}`}
                                        style={{
                                          ...chipStyle,
                                          background: ing.source === 'recipe' ? '#ecfdf5' : '#fffbeb',
                                          borderColor: ing.source === 'recipe' ? '#a7f3d0' : '#fde68a',
                                          color: ing.source === 'recipe' ? '#065f46' : '#92400e',
                                        }}
                                      >
                                        {ing.name}
                                        {ing.source === 'inferred' ? ' (sug.)' : ''}
                                      </span>
                                    ))
                                  ) : (
                                    <span style={{ ...muted, fontSize: '.75rem' }}>
                                      Sin ingredientes asignados aún
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Columna 2: Unidades */}
                              <td style={{ padding: '.65rem .55rem', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>
                                <div style={{ fontSize: '1rem' }}>
                                  {v.units.toLocaleString('es-AR', { maximumFractionDigits: 1 })}
                                </div>
                                <div style={muted}>
                                  {globalStats.totalUnits > 0
                                    ? `${((v.units / globalStats.totalUnits) * 100).toFixed(1)}% del total`
                                    : '—'}
                                </div>
                              </td>

                              {/* Columna 3: Velocidad real */}
                              <td style={{ padding: '.65rem .55rem', borderBottom: '1px solid #e2e8f0' }}>
                                {v.unitsPerSaleDay !== null ? (
                                  <>
                                    <div style={{ fontWeight: 700, color: '#0f766e', fontSize: '.95rem' }}>
                                      {v.unitsPerSaleDay.toFixed(2)} u/día
                                    </div>
                                    <div style={muted}>{v.saleDays} días con venta</div>
                                    {v.velocityLiftPct !== null && (
                                      <span
                                        style={{
                                          display: 'inline-block',
                                          marginTop: '.2rem',
                                          padding: '.1rem .4rem',
                                          borderRadius: 4,
                                          fontSize: '.72rem',
                                          fontWeight: 700,
                                          background: v.velocityLiftPct >= 0 ? '#dcfce7' : '#fee2e2',
                                          color: v.velocityLiftPct >= 0 ? '#166534' : '#991b1b',
                                        }}
                                      >
                                        {v.velocityLiftPct >= 0 ? '+' : ''}
                                        {v.velocityLiftPct.toFixed(0)}% vs prom.
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span style={muted}>Sin ventas</span>
                                )}
                              </td>

                              {/* Columna 4: Ciclo y Turno */}
                              <td style={{ padding: '.65rem .55rem', borderBottom: '1px solid #e2e8f0', minWidth: 165 }}>
                                <div style={{ fontSize: '.8rem' }}>
                                  <strong>{v.first_sale ?? '—'}</strong> → <strong>{v.last_sale ?? '—'}</strong>
                                </div>
                                {v.spanDays > 0 && (
                                  <div style={muted}>Ciclo total: {v.spanDays} días</div>
                                )}
                                {v.units > 0 && (
                                  <div style={{ fontSize: '.76rem', marginTop: '.25rem', color: '#334155' }}>
                                    🌙 Noche: {v.nightSharePct.toFixed(0)}% · ☀️ Mediodía:{' '}
                                    {(100 - v.nightSharePct).toFixed(0)}%
                                  </div>
                                )}
                              </td>

                              {/* Columna 5: Facturación y Tickets */}
                              <td style={{ padding: '.65rem .55rem', borderBottom: '1px solid #e2e8f0' }}>
                                <div style={{ fontWeight: 700 }}>{formatARS(v.revenue)}</div>
                                <div style={muted}>{v.tickets} tickets</div>
                                {v.units > 0 && (
                                  <div style={muted}>
                                    🛵 {v.deliverySharePct.toFixed(0)}% deliv. / 🍽️{' '}
                                    {(100 - v.deliverySharePct).toFixed(0)}% local
                                  </div>
                                )}
                              </td>

                              {/* Columna 6: Período verificado */}
                              <td style={{ padding: '.65rem .55rem', borderBottom: '1px solid #e2e8f0', minWidth: 215 }}>
                                <div style={{ fontWeight: 600 }}>
                                  {v.units_per_available_day === null
                                    ? 'Período sin verificar'
                                    : `${v.units_per_available_day.toFixed(2)} u/día (${v.verified_days} d)`}
                                </div>
                                <div style={{ display: 'flex', gap: '.25rem', marginTop: '.3rem' }}>
                                  <input
                                    aria-label={'Inicio de disponibilidad ' + v.label}
                                    style={{ ...control, width: 118, padding: '.35rem .45rem', fontSize: '.78rem' }}
                                    type="date"
                                    value={period.start}
                                    onChange={(e) =>
                                      setPeriodChoice((s) => ({
                                        ...s,
                                        [v.variant_id]: { ...period, start: e.target.value },
                                      }))
                                    }
                                  />
                                  <input
                                    aria-label={'Fin de disponibilidad ' + v.label}
                                    style={{ ...control, width: 118, padding: '.35rem .45rem', fontSize: '.78rem' }}
                                    type="date"
                                    value={period.end}
                                    onChange={(e) =>
                                      setPeriodChoice((s) => ({
                                        ...s,
                                        [v.variant_id]: { ...period, end: e.target.value },
                                      }))
                                    }
                                  />
                                </div>
                                <button
                                  style={{ ...btnSecondary, marginTop: '.3rem', padding: '.3rem .55rem', fontSize: '.76rem' }}
                                  disabled={
                                    !period.start ||
                                    !period.end ||
                                    period.start > period.end ||
                                    availability.isPending
                                  }
                                  onClick={() =>
                                    availability.mutate({
                                      variantId: v.variant_id,
                                      start: period.start,
                                      end: period.end,
                                    })
                                  }
                                >
                                  ✓ Confirmar período
                                </button>
                              </td>

                              {/* Columna 7: Costo y Rentabilidad */}
                              <td style={{ padding: '.65rem .55rem', borderBottom: '1px solid #e2e8f0', minWidth: 155 }}>
                                {v.unitCost !== null ? (
                                  <>
                                    <div>
                                      Costo: <strong>{formatARS(v.unitCost)}</strong>
                                    </div>
                                    <div
                                      style={{
                                        color: (v.marginPct ?? 0) >= 65 ? '#15803d' : '#b45309',
                                        fontWeight: 700,
                                      }}
                                    >
                                      Margen: {v.marginPct !== null ? `${v.marginPct.toFixed(1)}%` : '—'}
                                    </div>
                                    <div style={muted}>
                                      Ganancia: {v.profit !== null ? formatARS(v.profit) : '—'}
                                    </div>
                                  </>
                                ) : (
                                  <span style={{ ...muted, color: '#b45309' }}>Sin receta costeada</span>
                                )}
                              </td>

                              {/* Columna 8: Acciones de Receta */}
                              <td style={{ padding: '.65rem .55rem', borderBottom: '1px solid #e2e8f0', minWidth: 230 }}>
                                <div style={{ display: 'grid', gap: '.35rem' }}>
                                  <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                                    <button
                                      type="button"
                                      style={{ ...btnPrimary, padding: '.38rem .65rem', fontSize: '.78rem' }}
                                      onClick={() => {
                                        loadVariantIntoBuilder(v.variant_id);
                                        setTab('armador');
                                      }}
                                    >
                                      ⚡ {v.recipe_id ? 'Editar Receta' : 'Armar Receta'}
                                    </button>
                                    {v.recipe_id !== null && (
                                      <button
                                        type="button"
                                        style={{ ...btnSecondary, padding: '.38rem .6rem', fontSize: '.78rem' }}
                                        onClick={() =>
                                          setExpandedVariantId((cur) =>
                                            cur === v.variant_id ? null : v.variant_id,
                                          )
                                        }
                                      >
                                        {isExpanded ? '▲ Ocultar' : '🔍 Desglose'}
                                      </button>
                                    )}
                                  </div>
                                  <div style={{ display: 'flex', gap: '.3rem', alignItems: 'center' }}>
                                    <select
                                      style={{ ...control, flex: 1, minWidth: 120, padding: '.32rem .45rem', fontSize: '.78rem' }}
                                      value={recipeChoice[v.variant_id] ?? String(v.recipe_id ?? '')}
                                      onChange={(e) =>
                                        setRecipeChoice((s) => ({
                                          ...s,
                                          [v.variant_id]: e.target.value,
                                        }))
                                      }
                                    >
                                      <option value="">Vincular existente...</option>
                                      {selectableRecipes.map((r) => (
                                        <option key={r.id} value={r.id}>
                                          {r.name}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      style={{ ...btnSecondary, padding: '.32rem .5rem', fontSize: '.76rem' }}
                                      disabled={!recipeChoice[v.variant_id] || link.isPending}
                                      onClick={() =>
                                        link.mutate({
                                          variantId: v.variant_id,
                                          payload: Number(recipeChoice[v.variant_id]),
                                        })
                                      }
                                    >
                                      Vincular
                                    </button>
                                    {v.recipe_id !== null && (
                                      <button
                                        style={{ ...btnSecondary, padding: '.32rem .45rem', fontSize: '.76rem' }}
                                        title="Desvincular receta"
                                        onClick={() => unlink.mutate(v.variant_id)}
                                      >
                                        ×
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>

                            {/* Fila desplegable: Radiografía de ingredientes y costos de la variante */}
                            {isExpanded && v.recipe_id !== null && (
                              <tr key={`${v.variant_id}-detail`} style={{ background: '#f8fafc' }}>
                                <td colSpan={8} style={{ padding: '.85rem 1rem', borderBottom: '2px solid #cbd5e1' }}>
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      flexWrap: 'wrap',
                                      gap: '.5rem',
                                      marginBottom: '.5rem',
                                    }}
                                  >
                                    <strong>
                                      Radiografía de Receta: {v.recipe_name} ({v.label})
                                    </strong>
                                    <div style={{ fontSize: '.82rem', color: '#334155' }}>
                                      Costo Unitario:{' '}
                                      <strong>{v.unitCost !== null ? formatARS(v.unitCost) : '—'}</strong> · Precio Sugerido (30% FC):{' '}
                                      <strong>
                                        {v.suggestedPrice !== null ? formatARS(v.suggestedPrice) : '—'}
                                      </strong>
                                    </div>
                                  </div>
                                  <div
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                                      gap: '.5rem',
                                    }}
                                  >
                                    {v.recipeIngredients.map((line, idx) => {
                                      const share =
                                        line.cost !== null && v.unitCost && v.unitCost > 0
                                          ? (line.cost / v.unitCost) * 100
                                          : null;
                                      return (
                                        <div
                                          key={idx}
                                          style={{
                                            background: '#fff',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: 8,
                                            padding: '.55rem .7rem',
                                          }}
                                        >
                                          <div style={{ fontWeight: 600, fontSize: '.84rem' }}>{line.name}</div>
                                          <div style={muted}>
                                            Cantidad: {line.quantity} {line.unit}
                                          </div>
                                          <div style={{ fontSize: '.82rem', marginTop: '.2rem' }}>
                                            Costo:{' '}
                                            <strong>
                                              {line.cost !== null ? formatARS(line.cost) : '—'}
                                            </strong>{' '}
                                            {share !== null && (
                                              <span style={{ color: '#0f766e', fontWeight: 600 }}>
                                                ({share.toFixed(1)}% del costo)
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ===================================================================== */}
          {/* PESTAÑA 2: INTELIGENCIA DE INGREDIENTES Y COMBINACIONES               */}
          {/* ===================================================================== */}
          {tab === 'ingredientes' && (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {/* Controles de Análisis de Ingredientes */}
              <div
                style={{
                  ...panel,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '.75rem',
                }}
              >
                <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    style={{ ...control, minWidth: 240 }}
                    placeholder="Filtrar ingrediente (ej: burrata, hongos, panceta)..."
                    value={ingredientSearch}
                    onChange={(e) => setIngredientSearch(e.target.value)}
                  />
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', fontSize: '.84rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={excludeBasics}
                      onChange={(e) => setExcludeBasics(e.target.checked)}
                    />
                    Excluir básicos (Masa, Salsa, Muzzarella)
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', fontSize: '.84rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={includeInferredByName}
                      onChange={(e) => setIncludeInferredByName(e.target.checked)}
                    />
                    Incluir ingredientes detectados en el nombre cuando falte la receta
                  </label>
                </div>
                <button style={btnPrimary} onClick={() => setTab('armador')}>
                  ⚡ Ir al Armador Rápido de Recetas
                </button>
              </div>

              {/* Bloque 1: Ranking de Ingredientes en Pizzas de la Semana */}
              <div style={panel}>
                <h3 style={{ margin: '0 0 .25rem' }}>
                  Rendimiento por Ingrediente en Pizzas de la Semana
                </h3>
                <p style={{ ...muted, marginTop: 0 }}>
                  Mide cómo rinden las pizzas de temporada según cada ingrediente: velocidad promedio por día de venta, tracción (Lift % vs el promedio general de {globalStats.avgUnitsPerSaleDay.toFixed(2)} u/día), incidencia en el costo y margen.
                </p>

                {ingredientAnalytics.rows.length === 0 ? (
                  <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: 8, color: '#475569' }}>
                    Todavía no hay ingredientes para mostrar con estos filtros. Podés activar «Incluir ingredientes detectados en el nombre» o cargar las recetas en la pestaña <strong>⚡ Armador de Recetas</strong>.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
                      <thead>
                        <tr>
                          {[
                            'Ingrediente',
                            'Categoría',
                            'Pizzas de la Semana que lo llevan',
                            'Unidades vendidas',
                            'Velocidad (u/día venta)',
                            'Tracción vs Promedio',
                            'Costo prom. en receta',
                            'Margen prom.',
                          ].map((h) => (
                            <th
                              key={h}
                              style={{
                                textAlign: 'left',
                                padding: '.6rem',
                                borderBottom: '2px solid #cbd5e1',
                                fontSize: '.78rem',
                                color: '#475569',
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ingredientAnalytics.rows.map((row) => (
                          <tr key={row.key}>
                            <td style={{ padding: '.6rem', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>
                              {row.name}
                              {row.confirmedCount === 0 && (
                                <span
                                  style={{
                                    marginLeft: '.4rem',
                                    fontSize: '.7rem',
                                    padding: '.1rem .35rem',
                                    borderRadius: 4,
                                    background: '#fffbeb',
                                    color: '#92400e',
                                    border: '1px solid #fde68a',
                                  }}
                                >
                                  sugerido por nombre
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '.6rem', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                              {row.category}
                            </td>
                            <td style={{ padding: '.6rem', borderBottom: '1px solid #e2e8f0' }}>
                              <strong>{row.variantCount}</strong> ({row.variantLabels.slice(0, 4).join(', ')}
                              {row.variantLabels.length > 4 ? '…' : ''})
                            </td>
                            <td style={{ padding: '.6rem', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>
                              {row.totalUnits.toLocaleString('es-AR', { maximumFractionDigits: 1 })} u.
                              <div style={muted}>{formatARS(row.totalRevenue)}</div>
                            </td>
                            <td style={{ padding: '.6rem', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#0f766e' }}>
                              {row.avgUnitsPerSaleDay !== null ? `${row.avgUnitsPerSaleDay.toFixed(2)} u/día` : '—'}
                            </td>
                            <td style={{ padding: '.6rem', borderBottom: '1px solid #e2e8f0' }}>
                              {row.liftPct !== null ? (
                                <span
                                  style={{
                                    padding: '.2rem .5rem',
                                    borderRadius: 6,
                                    fontWeight: 700,
                                    fontSize: '.78rem',
                                    background: row.liftPct >= 0 ? '#dcfce7' : '#fee2e2',
                                    color: row.liftPct >= 0 ? '#166534' : '#991b1b',
                                  }}
                                >
                                  {row.liftPct >= 0 ? '+' : ''}
                                  {row.liftPct.toFixed(1)}%
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td style={{ padding: '.6rem', borderBottom: '1px solid #e2e8f0' }}>
                              {row.avgIngredientCost !== null ? (
                                <>
                                  <strong>{formatARS(row.avgIngredientCost)}</strong>
                                  {row.avgCostSharePct !== null && (
                                    <div style={muted}>{row.avgCostSharePct.toFixed(1)}% del costo</div>
                                  )}
                                </>
                              ) : (
                                <span style={muted}>Cargar receta</span>
                              )}
                            </td>
                            <td style={{ padding: '.6rem', borderBottom: '1px solid #e2e8f0', fontWeight: 700 }}>
                              {row.avgMarginPct !== null ? `${row.avgMarginPct.toFixed(1)}%` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Bloque 2: Duplas ganadoras en Pizzas de Temporada + Demanda General del Menú */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                  gap: '1rem',
                }}
              >
                <div style={panel}>
                  <h3 style={{ margin: '0 0 .25rem' }}>
                    Duplas de Toppings en Pizzas de la Semana
                  </h3>
                  <p style={{ ...muted, marginTop: 0 }}>
                    Combinaciones de 2 ingredientes especiales presentes en las variantes de temporada, ordenadas por velocidad diaria de venta.
                  </p>
                  {ingredientAnalytics.pairs.length === 0 ? (
                    <p style={muted}>
                      Asigná 2 o más toppings a las variantes en el Armador de Recetas para ver las duplas más potentes de las Pizzas de la Semana.
                    </p>
                  ) : (
                    <div style={{ display: 'grid', gap: '.5rem' }}>
                      {ingredientAnalytics.pairs.slice(0, 10).map((p) => (
                        <div
                          key={p.key}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '.55rem .75rem',
                            borderRadius: 8,
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700 }}>
                              {p.ingA} + {p.ingB}
                            </div>
                            <div style={muted}>
                              En {p.variantCount} pizza(s): {p.variantLabels.join(', ')}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 700, color: '#0f766e' }}>
                              {p.avgUnitsPerSaleDay !== null
                                ? `${p.avgUnitsPerSaleDay.toFixed(2)} u/día`
                                : '—'}
                            </div>
                            <div style={muted}>
                              {p.totalUnits.toLocaleString('es-AR', { maximumFractionDigits: 1 })} u. totales
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Referencia cruzada con todo el menú de la pizzería */}
                <div style={panel}>
                  <h3 style={{ margin: '0 0 .25rem' }}>
                    Top Ingredientes y Duplas en Carta General (Referencia)
                  </h3>
                  <p style={{ ...muted, marginTop: 0 }}>
                    Ingredientes y combinaciones con mayor volumen en toda la carta durante el mismo período, ideales para inspirar nuevas Pizzas de la Semana.
                  </p>
                  <div style={{ display: 'grid', gap: '.45rem' }}>
                    {(menuIngredientsQ.data?.ingredients ?? []).slice(0, 6).map((ing) => (
                      <div
                        key={ing.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '.45rem .65rem',
                          borderRadius: 6,
                          background: '#f8fafc',
                          fontSize: '.84rem',
                        }}
                      >
                        <span>
                          <strong>{ing.name}</strong>{' '}
                          <span style={muted}>({ing.category})</span>
                        </span>
                        <strong>
                          {ing.units.toLocaleString('es-AR', { maximumFractionDigits: 0 })} u. ({ing.sales_count} tickets)
                        </strong>
                      </div>
                    ))}
                    {(winningCombosQ.data?.ingredient_combinations ?? []).length > 0 && (
                      <>
                        <div style={{ fontWeight: 700, fontSize: '.82rem', marginTop: '.4rem', color: '#334155' }}>
                          Duplas más vendidas en carta general:
                        </div>
                        {(winningCombosQ.data?.ingredient_combinations ?? []).slice(0, 5).map((c, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              padding: '.4rem .65rem',
                              borderRadius: 6,
                              background: '#eff6ff',
                              fontSize: '.82rem',
                            }}
                          >
                            <span>
                              <strong>
                                {c.i1_name} + {c.i2_name}
                              </strong>
                            </span>
                            <span>
                              {c.occurrences.toLocaleString('es-AR', { maximumFractionDigits: 0 })} pizzas ({c.orders_count} pedidos)
                            </span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* PESTAÑA 3: ARMADOR RÁPIDO DE RECETAS DE TEMPORADA                     */}
          {/* ===================================================================== */}
          {tab === 'armador' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(260px, 320px) 1fr',
                gap: '1rem',
                alignItems: 'start',
              }}
            >
              {/* Columna izquierda: Lista de variantes de Pizza de la Semana */}
              <div style={panel}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
                  <strong>Variantes ({enrichedVariants.length})</strong>
                  <label style={{ fontSize: '.78rem', display: 'flex', alignItems: 'center', gap: '.3rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={builderOnlyMissing}
                      onChange={(e) => setBuilderOnlyMissing(e.target.checked)}
                    />
                    Solo sin receta
                  </label>
                </div>
                <div style={{ display: 'grid', gap: '.35rem', maxHeight: 540, overflowY: 'auto' }}>
                  {enrichedVariants
                    .filter((v) => !builderOnlyMissing || v.recipe_id === null)
                    .map((v) => {
                      const active = v.variant_id === builderVariantId;
                      return (
                        <button
                          key={v.variant_id}
                          type="button"
                          onClick={() => loadVariantIntoBuilder(v.variant_id)}
                          style={{
                            textAlign: 'left',
                            padding: '.55rem .7rem',
                            borderRadius: 8,
                            border: active ? '2px solid var(--c-accent,#c7101b)' : '1px solid #e2e8f0',
                            background: active ? '#fef2f2' : '#fff',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.4rem' }}>
                            <strong style={{ fontSize: '.85rem', color: '#0f172a' }}>{v.label}</strong>
                            <span
                              style={{
                                fontSize: '.72rem',
                                padding: '.1rem .4rem',
                                borderRadius: 999,
                                background: v.recipe_id !== null ? '#dcfce7' : '#fef3c7',
                                color: v.recipe_id !== null ? '#166534' : '#92400e',
                                fontWeight: 700,
                              }}
                            >
                              {v.recipe_id !== null ? '✓ Receta' : 'Pendiente'}
                            </span>
                          </div>
                          <div style={muted}>
                            {v.units.toLocaleString('es-AR', { maximumFractionDigits: 0 })} u. ·{' '}
                            {v.unitsPerSaleDay !== null ? `${v.unitsPerSaleDay.toFixed(1)} u/día` : '—'}
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Columna derecha: Editor en vivo para la variante seleccionada */}
              <div style={panel}>
                {selectedBuilderVariant ? (
                  <>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        flexWrap: 'wrap',
                        gap: '.75rem',
                        marginBottom: '.85rem',
                      }}
                    >
                      <div>
                        <h3 style={{ margin: 0 }}>
                          Receta de «{selectedBuilderVariant.label}»
                        </h3>
                        <div style={muted}>
                          Ventas históricas: {selectedBuilderVariant.units} u. en {selectedBuilderVariant.saleDays} días de venta ({formatARS(selectedBuilderVariant.revenue)})
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          style={btnSecondary}
                          onClick={() => applyStandardPizzaBase(setBuilderComponents)}
                        >
                          🍕 + Aplicar Base de Pizza (Masa + Salsa + Muzza)
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '.65rem',
                        marginBottom: '.85rem',
                      }}
                    >
                      <label style={{ display: 'grid', gap: '.25rem', fontSize: '.8rem', fontWeight: 600 }}>
                        Nombre de la receta
                        <input
                          style={control}
                          value={builderRecipeName}
                          onChange={(e) => setBuilderRecipeName(e.target.value)}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: '.25rem', fontSize: '.8rem', fontWeight: 600 }}>
                        Precio de venta de referencia (ARS)
                        <input
                          style={control}
                          type="number"
                          min={0}
                          value={builderPrice}
                          onChange={(e) => setBuilderPrice(Number(e.target.value) || 0)}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: '.25rem', fontSize: '.8rem', fontWeight: 600 }}>
                        Food Cost objetivo (%)
                        <input
                          style={control}
                          type="number"
                          min={5}
                          max={95}
                          value={builderTargetFoodCost}
                          onChange={(e) => setBuilderTargetFoodCost(Number(e.target.value) || 30)}
                        />
                      </label>
                    </div>

                    {/* Chips rápidos para agregar insumos detectados o frecuentes */}
                    {selectedBuilderVariant.inferredIngredients.length > 0 && (
                      <div style={{ marginBottom: '.75rem', padding: '.55rem .75rem', background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a' }}>
                        <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#92400e', marginBottom: '.35rem' }}>
                          💡 Ingredientes detectados en el nombre de esta pizza (click para sumar):
                        </div>
                        <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                          {selectedBuilderVariant.inferredIngredients.map((ing) => (
                            <button
                              key={ing.supplyId}
                              type="button"
                              style={{ ...chipStyle, cursor: 'pointer', background: '#fff', borderColor: '#f59e0b' }}
                              onClick={() =>
                                setBuilderComponents((prev) => [
                                  ...prev.filter((c) => c.component_id > 0),
                                  {
                                    component_type: 'supply',
                                    component_id: ing.supplyId,
                                    quantity: ing.quantity,
                                    unit: ing.unit,
                                  },
                                ])
                              }
                            >
                              + {ing.name} ({ing.quantity} {ing.unit})
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Filas de componentes de la receta */}
                    <div style={{ display: 'grid', gap: '.45rem', marginBottom: '.85rem' }}>
                      {builderComponents.map((row, idx) => {
                        const evalLine = builderEval.lines[idx];
                        return (
                          <div
                            key={idx}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '125px 1fr 110px 95px 130px auto',
                              gap: '.45rem',
                              alignItems: 'center',
                            }}
                          >
                            <select
                              style={control}
                              value={row.component_type}
                              onChange={(e) => {
                                const ct = e.target.value as 'supply' | 'recipe';
                                setBuilderComponents((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, component_type: ct, component_id: 0 } : item,
                                  ),
                                );
                              }}
                            >
                              <option value="supply">Insumo</option>
                              <option value="recipe">Subreceta</option>
                            </select>

                            <select
                              style={control}
                              value={row.component_id}
                              onChange={(e) => {
                                const cid = Number(e.target.value) || 0;
                                const defaultUnit =
                                  row.component_type === 'supply'
                                    ? supplies.find((s) => s.id === cid)?.unit || 'kg'
                                    : rawRecipes.find((r) => r.id === cid)?.yield_unit || 'u';
                                setBuilderComponents((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, component_id: cid, unit: defaultUnit } : item,
                                  ),
                                );
                              }}
                            >
                              <option value={0}>Seleccionar...</option>
                              {row.component_type === 'supply'
                                ? supplies.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name} ({s.cost !== null ? `${formatARS(s.cost)}/${s.unit}` : 'sin costo'})
                                    </option>
                                  ))
                                : rawRecipes
                                    .filter((r) => r.recipe_type === 'subrecipe')
                                    .map((r) => (
                                      <option key={r.id} value={r.id}>
                                        {r.name} (rinde {r.yield_quantity} {r.yield_unit})
                                      </option>
                                    ))}
                            </select>

                            <input
                              style={control}
                              type="number"
                              step="0.001"
                              min="0"
                              value={row.quantity}
                              onChange={(e) => {
                                const q = Number(e.target.value) || 0;
                                setBuilderComponents((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, quantity: q } : item)),
                                );
                              }}
                            />

                            <select
                              style={control}
                              value={row.unit}
                              onChange={(e) => {
                                const u = e.target.value;
                                setBuilderComponents((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, unit: u } : item)),
                                );
                              }}
                            >
                              {['kg', 'g', 'L', 'cc', 'ml', 'u'].map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>

                            <div style={{ fontSize: '.8rem', textAlign: 'right' }}>
                              {evalLine?.lineCost !== null && evalLine?.lineCost !== undefined ? (
                                <>
                                  <strong>{formatARS(evalLine.lineCost)}</strong>
                                  {evalLine.sharePct !== null && (
                                    <div style={muted}>{evalLine.sharePct.toFixed(0)}%</div>
                                  )}
                                </>
                              ) : (
                                <span style={muted}>—</span>
                              )}
                            </div>

                            <button
                              type="button"
                              style={btnSecondary}
                              onClick={() =>
                                setBuilderComponents((prev) =>
                                  prev.length > 1
                                    ? prev.filter((_, i) => i !== idx)
                                    : [{ component_type: 'supply', component_id: 0, quantity: 0.1, unit: 'kg' }],
                                )
                              }
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem' }}>
                      <button
                        type="button"
                        style={btnSecondary}
                        onClick={() =>
                          setBuilderComponents((prev) => [
                            ...prev,
                            { component_type: 'supply', component_id: 0, quantity: 0.08, unit: 'kg' },
                          ])
                        }
                      >
                        + Agregar ingrediente
                      </button>
                    </div>

                    {/* Resumen de Cost Engine en vivo */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                        gap: '.65rem',
                        padding: '.85rem',
                        borderRadius: 8,
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        marginBottom: '1rem',
                      }}
                    >
                      <div>
                        <div style={muted}>Costo Unitario (Cost Engine)</div>
                        <strong style={{ fontSize: '1.2rem' }}>
                          {builderEval.unitCost !== null ? formatARS(builderEval.unitCost) : 'Incompleto'}
                        </strong>
                      </div>
                      <div>
                        <div style={muted}>Food Cost actual</div>
                        <strong style={{ fontSize: '1.2rem' }}>
                          {builderEval.foodCostPct !== null ? `${builderEval.foodCostPct.toFixed(1)}%` : '—'}
                        </strong>
                      </div>
                      <div>
                        <div style={muted}>Margen por Pizza</div>
                        <strong style={{ fontSize: '1.2rem', color: '#15803d' }}>
                          {builderEval.marginArs !== null
                            ? `${formatARS(builderEval.marginArs)} (${builderEval.marginPct?.toFixed(1)}%)`
                            : '—'}
                        </strong>
                      </div>
                      <div>
                        <div style={muted}>Precio sugerido ({builderTargetFoodCost}% FC)</div>
                        <strong style={{ fontSize: '1.2rem', color: '#0f766e' }}>
                          {builderEval.suggestedPrice !== null ? formatARS(builderEval.suggestedPrice) : '—'}
                        </strong>
                      </div>
                    </div>

                    {builderFeedback && (
                      <div
                        style={{
                          padding: '.6rem .8rem',
                          borderRadius: 6,
                          marginBottom: '.75rem',
                          background: builderFeedback.type === 'ok' ? '#dcfce7' : '#fee2e2',
                          color: builderFeedback.type === 'ok' ? '#166534' : '#991b1b',
                          fontSize: '.85rem',
                          fontWeight: 600,
                        }}
                      >
                        {builderFeedback.msg}
                      </div>
                    )}

                    <button
                      type="button"
                      style={btnPrimary}
                      disabled={link.isPending}
                      onClick={() => {
                        const valid = builderComponents.filter((c) => c.component_id > 0 && c.quantity > 0);
                        if (valid.length === 0) {
                          setBuilderFeedback({
                            type: 'err',
                            msg: 'Seleccioná al menos un insumo o subreceta con cantidad válida.',
                          });
                          return;
                        }
                        link.mutate(
                          {
                            variantId: selectedBuilderVariant.variant_id,
                            payload: {
                              recipe_id: selectedBuilderVariant.recipe_id ?? undefined,
                              name: builderRecipeName,
                              yield_quantity: 1,
                              yield_unit: 'u',
                              price: builderPrice,
                              target_food_cost_pct: builderTargetFoodCost,
                              components: valid,
                            },
                          },
                          {
                            onSuccess: () => {
                              setBuilderFeedback({
                                type: 'ok',
                                msg: `✓ Receta guardada y vinculada a «${selectedBuilderVariant.label}».`,
                              });
                            },
                            onError: (err: unknown) => {
                              setBuilderFeedback({
                                type: 'err',
                                msg: err instanceof Error ? err.message : 'No se pudo guardar la receta.',
                              });
                            },
                          },
                        );
                      }}
                    >
                      {link.isPending
                        ? 'Guardando y vinculando...'
                        : `💾 Guardar y Vincular a «${selectedBuilderVariant.label}»`}
                    </button>
                  </>
                ) : (
                  <p style={muted}>Seleccioná una variante de la izquierda para armar o editar su receta.</p>
                )}
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* PESTAÑA 4: SIMULADOR DE PRÓXIMA PIZZA DE LA SEMANA                    */}
          {/* ===================================================================== */}
          {tab === 'simulador' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                gap: '1rem',
                alignItems: 'start',
              }}
            >
              {/* Constructor del prototipo */}
              <div style={panel}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
                  <h3 style={{ margin: 0 }}>🧪 Mesa de Diseño · Nueva Pizza</h3>
                  <button
                    type="button"
                    style={btnSecondary}
                    onClick={() => applyStandardPizzaBase(setSimComponents)}
                  >
                    🍕 + Cargar Base de Pizza
                  </button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: '.6rem',
                    marginBottom: '.85rem',
                  }}
                >
                  <label style={{ display: 'grid', gap: '.25rem', fontSize: '.8rem', fontWeight: 600 }}>
                    Nombre del prototipo
                    <input
                      style={control}
                      value={simName}
                      onChange={(e) => setSimName(e.target.value)}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: '.25rem', fontSize: '.8rem', fontWeight: 600 }}>
                    Precio de venta planeado
                    <input
                      style={control}
                      type="number"
                      min={0}
                      value={simPrice}
                      onChange={(e) => setSimPrice(Number(e.target.value) || 0)}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: '.25rem', fontSize: '.8rem', fontWeight: 600 }}>
                    Food Cost objetivo (%)
                    <input
                      style={control}
                      type="number"
                      min={5}
                      max={95}
                      value={simTargetFoodCost}
                      onChange={(e) => setSimTargetFoodCost(Number(e.target.value) || 28)}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: '.25rem', fontSize: '.8rem', fontWeight: 600 }}>
                    Días planeados en carta
                    <input
                      style={control}
                      type="number"
                      min={1}
                      max={90}
                      value={simExpectedDays}
                      onChange={(e) => setSimExpectedDays(Math.max(1, Number(e.target.value) || 7))}
                    />
                  </label>
                </div>

                <div style={{ display: 'grid', gap: '.45rem', marginBottom: '.75rem' }}>
                  {simComponents.map((row, idx) => {
                    const evalLine = simEval.lines[idx];
                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '110px 1fr 95px 80px 100px auto',
                          gap: '.4rem',
                          alignItems: 'center',
                        }}
                      >
                        <select
                          style={control}
                          value={row.component_type}
                          onChange={(e) => {
                            const ct = e.target.value as 'supply' | 'recipe';
                            setSimComponents((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, component_type: ct, component_id: 0 } : item,
                              ),
                            );
                          }}
                        >
                          <option value="supply">Insumo</option>
                          <option value="recipe">Subreceta</option>
                        </select>
                        <select
                          style={control}
                          value={row.component_id}
                          onChange={(e) => {
                            const cid = Number(e.target.value) || 0;
                            const defaultUnit =
                              row.component_type === 'supply'
                                ? supplies.find((s) => s.id === cid)?.unit || 'kg'
                                : rawRecipes.find((r) => r.id === cid)?.yield_unit || 'u';
                            setSimComponents((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, component_id: cid, unit: defaultUnit } : item,
                              ),
                            );
                          }}
                        >
                          <option value={0}>Elegir ingrediente...</option>
                          {row.component_type === 'supply'
                            ? supplies.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name} ({s.cost !== null ? `${formatARS(s.cost)}/${s.unit}` : 'sin costo'})
                                </option>
                              ))
                            : rawRecipes
                                .filter((r) => r.recipe_type === 'subrecipe')
                                .map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name}
                                  </option>
                                ))}
                        </select>
                        <input
                          style={control}
                          type="number"
                          step="0.001"
                          min="0"
                          value={row.quantity}
                          onChange={(e) => {
                            const q = Number(e.target.value) || 0;
                            setSimComponents((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, quantity: q } : item)),
                            );
                          }}
                        />
                        <select
                          style={control}
                          value={row.unit}
                          onChange={(e) => {
                            const u = e.target.value;
                            setSimComponents((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, unit: u } : item)),
                            );
                          }}
                        >
                          {['kg', 'g', 'L', 'cc', 'ml', 'u'].map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                        <div style={{ fontSize: '.78rem', textAlign: 'right' }}>
                          {evalLine?.lineCost !== null && evalLine?.lineCost !== undefined
                            ? formatARS(evalLine.lineCost)
                            : '—'}
                        </div>
                        <button
                          type="button"
                          style={btnSecondary}
                          onClick={() =>
                            setSimComponents((prev) =>
                              prev.length > 1
                                ? prev.filter((_, i) => i !== idx)
                                : [{ component_type: 'supply', component_id: 0, quantity: 0.1, unit: 'kg' }],
                            )
                          }
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem' }}>
                  <button
                    type="button"
                    style={btnSecondary}
                    onClick={() =>
                      setSimComponents((prev) => [
                        ...prev,
                        { component_type: 'supply', component_id: 0, quantity: 0.08, unit: 'kg' },
                      ])
                    }
                  >
                    + Agregar topping / componente
                  </button>
                  <button
                    type="button"
                    style={btnPrimary}
                    disabled={link.isPending}
                    onClick={() => {
                      const valid = simComponents.filter((c) => c.component_id > 0 && c.quantity > 0);
                      if (valid.length === 0) {
                        setSimFeedback({
                          type: 'err',
                          msg: 'Agregá al menos un ingrediente válido para guardar el prototipo.',
                        });
                        return;
                      }
                      link.mutate(
                        {
                          variantId: 0,
                          payload: {
                            name: simName,
                            yield_quantity: 1,
                            yield_unit: 'u',
                            price: simPrice,
                            target_food_cost_pct: simTargetFoodCost,
                            components: valid,
                          },
                        },
                        {
                          onSuccess: () => {
                            setSimFeedback({
                              type: 'ok',
                              msg: `✓ Prototipo «${simName}» guardado en el Estudio de Recetas.`,
                            });
                          },
                          onError: (err: unknown) => {
                            setSimFeedback({
                              type: 'err',
                              msg: err instanceof Error ? err.message : 'No se pudo guardar.',
                            });
                          },
                        },
                      );
                    }}
                  >
                    💾 Guardar Prototipo como Receta
                  </button>
                </div>

                {simFeedback && (
                  <div
                    style={{
                      padding: '.6rem .8rem',
                      borderRadius: 6,
                      background: simFeedback.type === 'ok' ? '#dcfce7' : '#fee2e2',
                      color: simFeedback.type === 'ok' ? '#166534' : '#991b1b',
                      fontSize: '.84rem',
                      fontWeight: 600,
                    }}
                  >
                    {simFeedback.msg}
                  </div>
                )}
              </div>

              {/* Panel derecho: Resultados financieros + Predicción histórica por ingredientes */}
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div style={panel}>
                  <h3 style={{ margin: '0 0 .65rem' }}>
                    Proyección Económica del Lanzamiento (Cost Engine)
                  </h3>
                  {(() => {
                    const effectiveDailyUnits =
                      simCustomUnitsPerDay.trim() !== '' && Number.isFinite(Number(simCustomUnitsPerDay))
                        ? Math.max(0, Number(simCustomUnitsPerDay))
                        : simHistoricalPrediction.predictedUnitsPerDay;
                    const projectedTotalUnits = effectiveDailyUnits * simExpectedDays;
                    const projectedRevenue = projectedTotalUnits * simPrice;
                    const projectedCost =
                      simEval.unitCost !== null ? projectedTotalUnits * simEval.unitCost : null;
                    const projectedProfit =
                      projectedCost !== null ? projectedRevenue - projectedCost : null;

                    return (
                      <>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
                            gap: '.6rem',
                            marginBottom: '.85rem',
                          }}
                        >
                          <div style={{ padding: '.65rem', background: '#f8fafc', borderRadius: 8 }}>
                            <div style={muted}>Costo Unitario</div>
                            <strong style={{ fontSize: '1.2rem' }}>
                              {simEval.unitCost !== null ? formatARS(simEval.unitCost) : '—'}
                            </strong>
                          </div>
                          <div style={{ padding: '.65rem', background: '#f8fafc', borderRadius: 8 }}>
                            <div style={muted}>Precio Sugerido ({simTargetFoodCost}% FC)</div>
                            <strong style={{ fontSize: '1.2rem', color: '#0f766e' }}>
                              {simEval.suggestedPrice !== null ? formatARS(simEval.suggestedPrice) : '—'}
                            </strong>
                          </div>
                          <div style={{ padding: '.65rem', background: '#f8fafc', borderRadius: 8 }}>
                            <div style={muted}>Margen Unitario</div>
                            <strong style={{ fontSize: '1.2rem', color: '#15803d' }}>
                              {simEval.marginArs !== null
                                ? `${formatARS(simEval.marginArs)} (${simEval.marginPct?.toFixed(1)}%)`
                                : '—'}
                            </strong>
                          </div>
                          <div style={{ padding: '.65rem', background: '#f8fafc', borderRadius: 8 }}>
                            <div style={muted}>Ganancia en {simExpectedDays} días</div>
                            <strong style={{ fontSize: '1.2rem', color: '#15803d' }}>
                              {projectedProfit !== null ? formatARS(projectedProfit) : '—'}
                            </strong>
                            <div style={muted}>
                              Sobre ~{projectedTotalUnits.toFixed(0)} pizzas ({effectiveDailyUnits.toFixed(1)} u/día)
                            </div>
                          </div>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.82rem' }}>
                          <span>Supuesto de venta diaria (opcional):</span>
                          <input
                            style={{ ...control, width: 110 }}
                            type="number"
                            step="0.5"
                            placeholder={simHistoricalPrediction.predictedUnitsPerDay.toFixed(1)}
                            value={simCustomUnitsPerDay}
                            onChange={(e) => setSimCustomUnitsPerDay(e.target.value)}
                          />
                          <span style={muted}>
                            u/día (si lo dejás vacío usa la tracción histórica de los ingredientes)
                          </span>
                        </label>
                      </>
                    );
                  })()}
                </div>

                <div style={panel}>
                  <h3 style={{ margin: '0 0 .35rem' }}>
                    🔍 Antecedentes Históricos de los Ingredientes Elegidos
                  </h3>
                  {simHistoricalPrediction.chosenNames.length === 0 ? (
                    <p style={muted}>
                      Seleccioná los toppings de la nueva pizza a la izquierda para ver cómo rindieron históricamente esos ingredientes en otras Pizzas de la Semana.
                    </p>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.75rem' }}>
                        {simHistoricalPrediction.matchedMetrics.map((m) => (
                          <div
                            key={m.key}
                            style={{
                              padding: '.45rem .65rem',
                              borderRadius: 8,
                              background: '#ecfdf5',
                              border: '1px solid #a7f3d0',
                              fontSize: '.82rem',
                            }}
                          >
                            <strong>{m.name}</strong>: {m.avgUnitsPerSaleDay?.toFixed(2) ?? '—'} u/día en{' '}
                            {m.variantCount} pizza(s)
                          </div>
                        ))}
                      </div>
                      {simHistoricalPrediction.similarVariants.length > 0 && (
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '.82rem', marginBottom: '.4rem' }}>
                            Pizzas de la Semana pasadas con estos ingredientes:
                          </div>
                          <div style={{ display: 'grid', gap: '.4rem' }}>
                            {simHistoricalPrediction.similarVariants.map(({ variant: sv, overlap }) => (
                              <div
                                key={sv.variant_id}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  padding: '.45rem .65rem',
                                  background: '#f8fafc',
                                  borderRadius: 6,
                                  fontSize: '.83rem',
                                }}
                              >
                                <div>
                                  <strong>{sv.label}</strong>{' '}
                                  <span style={muted}>
                                    (coincide en: {overlap.map((o) => o.name).join(', ')})
                                  </span>
                                </div>
                                <div style={{ fontWeight: 700 }}>
                                  {sv.units} u. ·{' '}
                                  {sv.unitsPerSaleDay !== null ? `${sv.unitsPerSaleDay.toFixed(2)} u/día` : '—'}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
