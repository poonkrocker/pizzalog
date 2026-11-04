import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CostEngine,
  CostEngineValidationError,
  calculatePricingScenario,
  computeUsableIngredientCost,
  createCostSnapshot,
  formatDecimal,
  selectEffectivePurchasePrice,
  type Dimension,
  type Recipe,
  type RecipeComponent,
  type UnitCode,
} from '@pizzalog/cost-engine';
import { goldenCases } from '@pizzalog/cost-engine-fixtures';
import {
  I18N,
  createInitialDemoWorkspace,
  type LocaleCode,
  type OperatingExpenseItem,
  type ToolsWorkspaceState,
} from './demoData';
import { downloadCustomProfitKitXlsx } from './xlsxExporter';
import { parseImportFile, type ParsedImportSheet } from './importFileParser';
import { applyImportMappings, type ImportSheetMapping } from './importNormalization';

const ALL_UNITS: UnitCode[] = ['g', 'kg', 'mg', 'lb', 'oz', 'ml', 'cc', 'L', 'fl_oz_us', 'gal_us', 'unit', 'dozen'];

type ToolsAccount = { id: number; email: string; name: string; expires_at?: string | null };

const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? 'https://api.pizzalog.net').replace(/\/+$/, '');

const IMPORT_FIELD_LABELS: Record<ImportSheetMapping['kind'], Array<[string, string]>> = {
  ingredients: [
    ['name', 'Nombre del insumo'], ['base_unit', 'Unidad base'], ['base_dimension', 'Dimensión'],
    ['purchase_price', 'Precio de compra'], ['currency', 'Moneda'], ['pack_quantity', 'Cantidad del envase'],
    ['pack_unit', 'Unidad del envase'], ['yield_pct', 'Rendimiento utilizable (%)'],
    ['density_g_per_ml', 'Densidad (g/ml)'], ['unit_weight_g', 'Peso por unidad (g)'], ['supplier', 'Proveedor'],
    ['purchase_date', 'Fecha del precio'],
  ],
  purchase_prices: [
    ['ingredient_name', 'Nombre del insumo'], ['purchase_price', 'Precio de compra'], ['currency', 'Moneda'],
    ['pack_quantity', 'Cantidad del envase'], ['pack_unit', 'Unidad del envase'],
    ['yield_pct', 'Rendimiento utilizable (%)'], ['supplier', 'Proveedor'], ['purchase_date', 'Fecha del precio'],
  ],
  recipes: [
    ['recipe_name', 'Nombre de receta'], ['recipe_type', 'Tipo de receta'], ['yield_quantity', 'Rendimiento'],
    ['yield_unit', 'Unidad de rendimiento'], ['component_name', 'Ingrediente del componente'],
    ['component_quantity', 'Cantidad del componente'], ['component_unit', 'Unidad del componente'],
  ],
  operating_expenses: [
    ['expense_name', 'Concepto del gasto'], ['expense_category', 'Categoría'], ['expense_period', 'Período'],
    ['expense_amount', 'Importe'],
  ],
  sales: [
    ['product_name', 'Producto'], ['quantity', 'Unidades vendidas'], ['period_start', 'Inicio del período'],
    ['period_end', 'Fin del período'], ['channel', 'Canal'], ['gross_revenue', 'Venta bruta'],
    ['net_revenue', 'Venta neta'], ['source', 'Origen'],
  ],
  unknown: [],
};

export function App({
  token,
  account,
  initialWorkspace,
  onLogout,
}: {
  token: string;
  account: ToolsAccount;
  initialWorkspace: ToolsWorkspaceState;
  onLogout: () => void;
}) {
  const [state, setState] = useState<ToolsWorkspaceState>(initialWorkspace);

  const [activeTab, setActiveTab] = useState<
    'ingredients' | 'subrecipes' | 'recipes' | 'expenses' | 'sales' | 'snapshots' | 'simulator' | 'cost-history' | 'menu-engineering' | 'production' | 'profit-simulator'
  >('recipes');
  const [simulationRecipeId, setSimulationRecipeId] = useState('');
  const [simulationBatches, setSimulationBatches] = useState(1);
  const [simulationComponentPct, setSimulationComponentPct] = useState<Record<string, number>>({});
  const [simulationHydrationPct, setSimulationHydrationPct] = useState<Record<string, number>>({});
  const [historyRecipeId, setHistoryRecipeId] = useState('');
  const [snapshotNotice, setSnapshotNotice] = useState<string | null>(null);
  const [productionUnits, setProductionUnits] = useState<Record<string, number>>({});
  const [profitScenario, setProfitScenario] = useState({ units: 0, price: 0, variableCost: 0, fixedCosts: 0 });
  const [profitProductId, setProfitProductId] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [isSmartImporting, setIsSmartImporting] = useState(false);
  const [replaceWorkspaceOnImport, setReplaceWorkspaceOnImport] = useState(false);
  const [workspaceSaveError, setWorkspaceSaveError] = useState<string | null>(null);
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [smartImportPreview, setSmartImportPreview] = useState<{
    fileName: string;
    sheets: ParsedImportSheet[];
    mappings: ImportSheetMapping[];
    remaining: number;
    note: string;
    mappingMode: 'local' | 'ai';
  } | null>(null);

  // Estado del Constructor Visual Interactivo (Modal)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [isDoughMode, setIsDoughMode] = useState<boolean>(false);
  const [builderError, setBuilderError] = useState<string | null>(null);

  useEffect(() => {
    const workspaceSnapshot = state;
    const timer = window.setTimeout(() => {
      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          setIsSavingWorkspace(true);
          try {
            const response = await fetch(`${API_URL}/tools/workspace`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ workspace: workspaceSnapshot }),
            });
            const payload = (await response.json()) as { ok?: boolean; error?: string };
            if (!response.ok || !payload.ok) {
              throw new Error(payload.error ?? 'No se pudo guardar el espacio de trabajo');
            }
            setWorkspaceSaveError(null);
          } catch (err) {
            setWorkspaceSaveError(err instanceof Error ? err.message : 'Error al guardar los cambios');
          } finally {
            setIsSavingWorkspace(false);
          }
        });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [state, token]);

  const t = I18N[state.locale] ?? I18N['es-AR'];
  const canChangeCurrency =
    state.catalog.recipes.length === 0 &&
    !state.catalog.purchase_prices.some((p) => Number(p.purchase_price) > 0) &&
    !state.operatingExpenses.some((expense) => expense.amount > 0);

  const engine = useMemo(() => new CostEngine(state.catalog), [state.catalog]);

  const recipeResults = useMemo(() => {
    const map = new Map<string, ReturnType<CostEngine['calculateRecipeCost']>>();
    for (const r of state.catalog.recipes) {
      try {
        map.set(r.id, engine.calculateRecipeCost(r.id));
      } catch {
        // validation error handled in UI
      }
    }
    return map;
  }, [engine, state.catalog.recipes]);

  function updatePurchasePrice(
    ingredientId: string,
    patch: Partial<ToolsWorkspaceState['catalog']['purchase_prices'][number]>
  ) {
    setState((prev) => {
      const exists = prev.catalog.purchase_prices.some((p) => p.ingredient_id === ingredientId);
      const nextPrices = exists
        ? prev.catalog.purchase_prices.map((p) =>
            p.ingredient_id === ingredientId ? { ...p, ...patch } : p
          )
        : [
            ...prev.catalog.purchase_prices,
            {
              ingredient_id: ingredientId,
              purchase_price: 0,
              currency: prev.currency,
              pack_quantity: 1,
              pack_unit: 'kg' as UnitCode,
              yield_pct: 100,
              ...patch,
            },
          ];
      return {
        ...prev,
        catalog: {
          ...prev.catalog,
          purchase_prices: nextPrices,
        },
      };
    });
  }

  function addIngredient() {
    const nextNum = state.catalog.ingredients.length + 1;
    const id = `ing_custom_${Date.now()}`;
    setState((prev) => ({
      ...prev,
      catalog: {
        ...prev.catalog,
        ingredients: [
          ...prev.catalog.ingredients,
          {
            id,
            name: `Nuevo Insumo #${nextNum}`,
            base_dimension: 'mass',
            base_unit: 'g',
            is_active: true,
          },
        ],
        purchase_prices: [
          ...prev.catalog.purchase_prices,
          {
            ingredient_id: id,
            purchase_price: 1000,
            currency: prev.currency,
            pack_quantity: 1,
            pack_unit: 'kg',
            yield_pct: 100,
          },
        ],
      },
    }));
  }

  function deleteIngredient(id: string) {
    setState((prev) => ({
      ...prev,
      catalog: {
        ...prev.catalog,
        ingredients: prev.catalog.ingredients.filter((i) => i.id !== id),
        purchase_prices: prev.catalog.purchase_prices.filter((p) => p.ingredient_id !== id),
      },
    }));
  }

  function openNewRecipeBuilder(type: 'product' | 'subrecipe', doughMode = false) {
    const firstIng = state.catalog.ingredients[0]?.id ?? 'ing_harina';
    setBuilderError(null);
    setIsDoughMode(doughMode);
    if (doughMode) {
      setEditingRecipe({
        id: `sub_masa_${Date.now()}`,
        name: 'Nueva Masa Panadera',
        recipe_type: 'subrecipe',
        yield_quantity: 1700,
        yield_unit: 'g',
        currency: state.currency,
        bakers_dough: {
          total_flour_g: 1000,
          hydration_pct: 68,
          yield_basis: 'measured_yield',
          measured_yield_g: 1700,
          flours: [{ ingredient_id: firstIng, share_pct: 100 }],
          biga: {
            flour_pct: 25,
            water_pct: 50,
            yeast_pct: 0.5,
            yeast_ingredient_id: state.catalog.ingredients[1]?.id ?? firstIng,
          },
          salt_pct: 2.7,
          salt_ingredient_id: state.catalog.ingredients[2]?.id ?? firstIng,
          water_ingredient_id: state.catalog.ingredients[3]?.id ?? firstIng,
        },
      });
    } else {
      setEditingRecipe({
        id: `${type === 'product' ? 'prod' : 'sub'}_${Date.now()}`,
        name: type === 'product' ? 'Nuevo Producto de Carta' : 'Nueva Subreceta / Salsa',
        recipe_type: type,
        yield_quantity: type === 'product' ? 1 : 1000,
        yield_unit: type === 'product' ? 'unit' : 'g',
        target_food_cost_pct: state.defaultTargetFoodCostPct,
        currency: state.currency,
        components: [
          {
            component_type: 'ingredient',
            ingredient_id: firstIng,
            quantity: 200,
            unit: 'g',
          },
        ],
      });
    }
  }

  function openEditRecipeBuilder(rec: Recipe) {
    setBuilderError(null);
    setIsDoughMode(Boolean(rec.bakers_dough));
    setEditingRecipe(JSON.parse(JSON.stringify(rec)));
  }

  function saveEditedRecipe() {
    if (!editingRecipe) return;
    setBuilderError(null);
    if (!editingRecipe.name.trim()) {
      setBuilderError('El nombre de la receta es obligatorio.');
      return;
    }
    if (editingRecipe.bakers_dough) {
      const flourTotal = editingRecipe.bakers_dough.flours.reduce((sum, flour) => sum + (flour.share_pct ?? 0), 0);
      if (Math.abs(flourTotal - 100) > 0.01) {
        setBuilderError(`La mezcla de harinas debe sumar 100% (actual: ${formatDecimal(flourTotal, 1)}%).`);
        return;
      }
      if (editingRecipe.bakers_dough.yield_basis === 'measured_yield' &&
          !(Number(editingRecipe.bakers_dough.measured_yield_g) > 0)) {
        setBuilderError('Indicá un rendimiento medido mayor a cero.');
        return;
      }
    }
    if (editingRecipe.components && editingRecipe.components.length === 0) {
      setBuilderError('Agregá al menos un componente a la receta.');
      return;
    }

    // Probar en el motor antes de guardar para validar unidades, mermas y ausencia de ciclos
    const nextRecipes = state.catalog.recipes.some((r) => r.id === editingRecipe.id)
      ? state.catalog.recipes.map((r) => (r.id === editingRecipe.id ? editingRecipe : r))
      : [...state.catalog.recipes, editingRecipe];

    try {
      const testEngine = new CostEngine({
        ...state.catalog,
        recipes: nextRecipes,
      });
      testEngine.calculateRecipeCost(editingRecipe.id);
    } catch (err) {
      if (err instanceof CostEngineValidationError) {
        setBuilderError(`[${err.code}] ${err.message}`);
      } else {
        setBuilderError(err instanceof Error ? err.message : 'Error de validación en la receta');
      }
      return;
    }

    setState((prev) => ({
      ...prev,
      catalog: {
        ...prev.catalog,
        recipes: nextRecipes,
      },
      productSalesMap: prev.productSalesMap,
    }));
    setEditingRecipe(null);
  }

  function deleteRecipe(id: string) {
    setState((prev) => ({
      ...prev,
      catalog: {
        ...prev.catalog,
        recipes: prev.catalog.recipes.filter((r) => r.id !== id),
      },
    }));
  }

  function addOperatingExpense() {
    const newExp: OperatingExpenseItem = {
      id: `exp_${Date.now()}`,
      name: 'Nuevo Gasto Operativo',
      category: 'other',
      period: 'monthly',
      amount: 100000,
    };
    setState((prev) => ({
      ...prev,
      operatingExpenses: [...prev.operatingExpenses, newExp],
    }));
  }

  function deleteOperatingExpense(id: string) {
    setState((prev) => ({
      ...prev,
      operatingExpenses: prev.operatingExpenses.filter((x) => x.id !== id),
    }));
  }

  function captureAllSnapshots() {
    const products = state.catalog.recipes.filter((r) => r.recipe_type === 'product');
    const newSnaps = [];
    let failed = 0;
    for (const recipe of products) {
      try {
        newSnaps.push(createCostSnapshot(state.catalog, recipe.id, {
          target_food_cost_pct: recipe.target_food_cost_pct ?? state.defaultTargetFoodCostPct,
          rounding_increment: state.defaultRoundingIncrement,
          rounding_mode: 'ceil',
          selling_price: state.productSalesMap?.[recipe.id]?.sellingPrice || undefined,
          packaging_cost: state.defaultPackagingCost,
          channel_fee_pct: state.defaultChannelFeePct,
        }));
      } catch { failed += 1; }
    }
    const existingIds = new Set(state.snapshots.map((snapshot) => snapshot.snapshot_id));
    const uniqueSnapshots = newSnaps.filter((snapshot) => !existingIds.has(snapshot.snapshot_id));
    setState((prev) => ({ ...prev, snapshots: [...uniqueSnapshots, ...prev.snapshots].slice(0, 30) }));
    const failureNote = failed ? failed + ' producto(s) no pudieron calcularse.' : '';
    setSnapshotNotice(uniqueSnapshots.length === 0
      ? 'No se agregaron capturas nuevas. ' + (failureNote || 'Los costos y parámetros coinciden con los últimos snapshots.')
      : 'Se guardaron ' + uniqueSnapshots.length + ' snapshot(s). ' + failureNote);
    setActiveTab('snapshots');
  }

  function exportWorkspaceJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pizzalog-profit-kit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSmartImport(file: File) {
    setImportError(null);
    setImportNotice(null);
    setIsSmartImporting(true);
    try {
      const sheets = await parseImportFile(file);
      const response = await fetch(`${API_URL}/tools/import/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sheets }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        data?: { sheets: ImportSheetMapping[]; ai_previews_remaining_today: number; note?: string; mapping_mode?: 'local' | 'ai' };
      };
      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error ?? 'No se pudo analizar el archivo');
      }
      setSmartImportPreview({
        fileName: file.name,
        sheets,
        mappings: payload.data.sheets,
        remaining: payload.data.ai_previews_remaining_today,
        note: payload.data.note ?? '',
        mappingMode: payload.data.mapping_mode === 'local' ? 'local' : 'ai',
      });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Error al importar la planilla');
    } finally {
      setIsSmartImporting(false);
    }
  }

  function updateSmartImportMapping(
    sheetIndex: number,
    update: (mapping: ImportSheetMapping) => ImportSheetMapping
  ) {
    setSmartImportPreview((current) => current ? ({
      ...current,
      mappings: current.mappings.map((mapping) =>
        mapping.sheet_index === sheetIndex ? update(mapping) : mapping
      ),
    }) : current);
  }

  function confirmSmartImport() {
    if (!smartImportPreview) return;
    setImportError(null);
    setImportNotice(null);

    // Al importar sobre el workspace de demostración, partir de un catálogo limpio
    // evita mezclar recetas, precios y ventas ficticias con los datos del negocio.
    const demoIngredientIds = new Set([
      'ing_harina', 'ing_levadura', 'ing_sal', 'ing_agua', 'ing_tomate',
      'ing_aceite', 'ing_mozzarella', 'ing_pollo', 'ing_garbanzo', 'ing_trufa',
    ]);
    const demoRecipeIds = new Set([
      'sub_masa_poolish', 'sub_salsa', 'prod_margherita', 'prod_focaccia_a',
      'prod_pollo_merma', 'prod_trufa_incompleta',
    ]);
    const hasDemoSeed = state.catalog.ingredients.some((item) => demoIngredientIds.has(item.id)) ||
      state.catalog.recipes.some((item) => demoRecipeIds.has(item.id));
    const shouldReplaceWorkspace = replaceWorkspaceOnImport || hasDemoSeed;
    const importBase = shouldReplaceWorkspace ? {
      ...state,
      catalog: {
        ...state.catalog,
        ingredients: hasDemoSeed && !replaceWorkspaceOnImport
          ? state.catalog.ingredients.filter((item) => !demoIngredientIds.has(item.id))
          : [],
        purchase_prices: hasDemoSeed && !replaceWorkspaceOnImport
          ? state.catalog.purchase_prices.filter((price) => !demoIngredientIds.has(price.ingredient_id))
          : [],
        recipes: hasDemoSeed && !replaceWorkspaceOnImport
          ? state.catalog.recipes.filter((recipe) => !demoRecipeIds.has(recipe.id))
          : [],
      },
      productSalesMap: hasDemoSeed && !replaceWorkspaceOnImport
        ? Object.fromEntries(Object.entries(state.productSalesMap).filter(([id]) => !demoRecipeIds.has(id)))
        : {},
      operatingExpenses: hasDemoSeed && !replaceWorkspaceOnImport
        ? state.operatingExpenses.filter((expense) => !['exp_1', 'exp_2', 'exp_3', 'exp_4'].includes(expense.id))
        : [],
      snapshots: [],
      salesHistory: replaceWorkspaceOnImport ? [] : (state.salesHistory ?? []),
      salesPeriod: replaceWorkspaceOnImport ? null : (state.salesPeriod ?? null),
    } : state;
    const result = applyImportMappings(importBase, smartImportPreview.sheets, smartImportPreview.mappings);
    const total = Object.values(result.counts).reduce((sum, count) => sum + count, 0);
    if (total === 0) {
      const detected = smartImportPreview.mappings
        .map((mapping) => `${mapping.name}: ${mapping.kind} (encabezado fila ${mapping.header_row_index + 1})`)
        .join('; ');
      const details = result.warnings.slice(0, 8).join(' ');
      setImportError([
        'No se importó ningún registro. La previsualización sigue abierta para que puedas corregir el mapeo.',
        detected ? `Hojas detectadas: ${detected}.` : '',
        details ? `Motivos: ${details}` : '',
      ].filter(Boolean).join(' '));
      return;
    }
    if (shouldReplaceWorkspace) {
      const backup = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const backupUrl = URL.createObjectURL(backup);
      const backupLink = document.createElement('a');
      backupLink.href = backupUrl;
      backupLink.download = `pizzalog-tools-backup-${new Date().toISOString().slice(0, 10)}.json`;
      backupLink.click();
      URL.revokeObjectURL(backupUrl);
    }
    setState(result.workspace);
    const summary = [
      `Importados: ${result.counts.ingredients} insumos, ${result.counts.prices} precios, ${result.counts.recipes} recetas, ${result.counts.expenses} gastos y ${result.counts.sales} registros de ventas.`,
      ...(hasDemoSeed ? ['Se limpiaron los datos de demostración para evitar mezclarlos con la importación.'] : []),
      ...(replaceWorkspaceOnImport ? ['Se reemplazaron los datos anteriores; se descargó una copia de seguridad JSON.'] : []),
      ...result.warnings,
    ];
    setImportNotice(summary.join(' '));
    setSmartImportPreview(null);
    setReplaceWorkspaceOnImport(false);
  }

  function handleImportJson(file: File) {
    setImportError(null);
    setImportNotice(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed?.catalog || !Array.isArray(parsed.catalog.ingredients) || !Array.isArray(parsed.catalog.recipes)) {
          throw new Error('Estructura JSON inválida: debe incluir catalog.ingredients y catalog.recipes');
        }
        const testEngine = new CostEngine(parsed.catalog);
        for (const r of parsed.catalog.recipes) {
          testEngine.calculateRecipeCost(r.id);
        }
        setState({
          ...createInitialDemoWorkspace(),
          ...parsed,
          productSalesMap: parsed.productSalesMap ?? {},
        });
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Error al validar archivo importado');
      }
    };
    reader.readAsText(file);
  }

  // Cálculos mensuales de facturación, CMV, contribución marginal e Ingeniería de Menú
  const monthlySummary = useMemo(() => {
    const products = state.catalog.recipes.filter((r) => r.recipe_type === 'product');
    const rows = products.map((prod) => {
      const res = recipeResults.get(prod.id);
      const salesPlan = state.productSalesMap?.[prod.id] ?? { sellingPrice: null };
      const customPrice = salesPlan.sellingPrice && salesPlan.sellingPrice > 0 ? salesPlan.sellingPrice : undefined;
      const pricing = res
        ? calculatePricingScenario({
            unit_cost: res.raw_unit_cost,
            status: res.status,
            currency: state.currency,
            target_food_cost_pct: prod.target_food_cost_pct ?? state.defaultTargetFoodCostPct,
            rounding_increment: state.defaultRoundingIncrement,
            rounding_mode: 'ceil',
            selling_price: customPrice,
            packaging_cost: state.defaultPackagingCost,
            channel_fee_pct: state.defaultChannelFeePct,
          })
        : null;

      const isComplete = res?.status === 'complete' && pricing?.status === 'complete';
      const hasSalesData = salesPlan.monthlyUnitsSold !== null && salesPlan.monthlyUnitsSold !== undefined &&
        Number.isFinite(Number(salesPlan.monthlyUnitsSold));
      const units = hasSalesData ? Math.max(0, Number(salesPlan.monthlyUnitsSold)) : null;
      const unitCost = isComplete && res?.raw_unit_cost ? res.raw_unit_cost : 0;
      const evaluatedPrice = isComplete && pricing?.raw_evaluated_price ? pricing.raw_evaluated_price : 0;
      const unitGrossProfit = isComplete && pricing?.raw_gross_profit ? pricing.raw_gross_profit : 0;

      return {
        prod,
        res,
        pricing,
        isComplete,
        units,
        hasSalesData,
        customPrice: salesPlan.sellingPrice ?? null,
        unitCost,
        evaluatedPrice,
        unitGrossProfit,
        monthlyRevenue: isComplete && hasSalesData ? evaluatedPrice * units! : 0,
        monthlyCogs: isComplete && hasSalesData ? unitCost * units! : 0,
        monthlyContribution: isComplete && hasSalesData ? unitGrossProfit * units! : null,
      };
    });

    const completeRows = rows.filter((x) => x.isComplete);
    const salesRows = completeRows.filter((x) => x.hasSalesData);
    const totalUnits = salesRows.reduce((a, b) => a + (b.units ?? 0), 0);
    const avgUnits = salesRows.length > 0 ? totalUnits / salesRows.length : 0;
    const avgUnitProfit =
      salesRows.length > 0
        ? salesRows.reduce((a, b) => a + b.unitGrossProfit, 0) / salesRows.length
        : 0;

    const totalRevenue = completeRows.reduce((a, b) => a + b.monthlyRevenue, 0);
    const totalCogs = completeRows.reduce((a, b) => a + b.monthlyCogs, 0);
    const totalContribution = completeRows.reduce((a, b) => a + (b.monthlyContribution ?? 0), 0);
    const weightedMarginPct = totalRevenue > 0 ? (totalContribution / totalRevenue) * 100 : 0;

    return {
      rows: rows.map((r) => {
        let matrixClass: 'star' | 'horse' | 'puzzle' | 'dog' | null = null;
        let matrixLabel = '—';
        if (r.isComplete && r.hasSalesData) {
          const highPop = (r.units ?? 0) >= avgUnits;
          const highMargin = r.unitGrossProfit >= avgUnitProfit;
          if (highPop && highMargin) {
            matrixClass = 'star';
            matrixLabel = '⭐ Estrella';
          } else if (highPop && !highMargin) {
            matrixClass = 'horse';
            matrixLabel = '🐎 Caballo';
          } else if (!highPop && highMargin) {
            matrixClass = 'puzzle';
            matrixLabel = '🧩 Rompecabezas';
          } else {
            matrixClass = 'dog';
            matrixLabel = '🐕 Perro';
          }
        }
        return { ...r, matrixClass, matrixLabel };
      }),
      totalUnits,
      hasSalesData: salesRows.length > 0,
      totalRevenue,
      totalCogs,
      totalContribution,
      weightedMarginPct,
    };
  }, [state, recipeResults]);

  const totalMonthlyExpenses = useMemo(() => {
    const factor: Record<string, number> = { monthly: 1, weekly: 52 / 12, yearly: 1 / 12 };
    return state.operatingExpenses.reduce(
      (sum, item) => sum + item.amount * (factor[item.period] ?? 1),
      0
    );
  }, [state.operatingExpenses]);

  const netOperatingProfit = monthlySummary.hasSalesData
    ? monthlySummary.totalContribution - totalMonthlyExpenses
    : null;
  const breakEvenRevenue =
    monthlySummary.weightedMarginPct > 0
      ? totalMonthlyExpenses / (monthlySummary.weightedMarginPct / 100)
      : 0;

  return (
    <div className="tools-shell">
      <header className="tools-header">
        <div>
          <h1 className="tools-brand">
            Pizzalog Tools <span>Profit Kit v1</span>
          </h1>
          <p className="tools-subtitle">{t.subtitle}</p>
        </div>
        <div className="tools-actions">
          <span className="tools-account-label">{account.name}</span>
          <span className="tools-save-status" role="status">
            {workspaceSaveError ? 'Error de guardado' : isSavingWorkspace ? 'Guardando…' : 'Guardado automático'}
          </span>
          <button type="button" className="btn" onClick={onLogout}>Cerrar sesión</button>
          <button
            type="button"
            className="btn btn--ocre"
            onClick={() => downloadCustomProfitKitXlsx(state)}
            title="Descarga tu propio archivo .xlsx con todos los insumos, recetas, ventas mensuales y alquileres que armaste en pantalla"
          >
            {t.exportCustomExcel}
          </button>
          <a
            className="btn"
            href="/Restaurant_Profit_Kit_v1.xlsx"
            download="Restaurant_Profit_Kit_v1.xlsx"
          >
            {t.downloadTemplateExcel}
          </a>
          <button type="button" className="btn btn--primary" onClick={captureAllSnapshots}>
            📸 {t.saveSnapshot}
          </button>
          <button type="button" className="btn" onClick={exportWorkspaceJson}>
            {t.exportJson}
          </button>
          <label className="btn" style={{ margin: 0 }}>
            {t.importJson}
            <input
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportJson(f);
                e.target.value = '';
              }}
            />
          </label>
          <label className="btn btn--ocre" style={{ margin: 0, opacity: isSmartImporting ? 0.65 : 1 }}>
            {isSmartImporting ? 'Analizando planilla…' : 'Importar XLSX / CSV'}
            <input
              type="file"
              accept=".xlsx,.csv"
              disabled={isSmartImporting}
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleSmartImport(file);
                e.target.value = '';
              }}
            />
          </label>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setImportError(null);
              setState(createInitialDemoWorkspace());
            }}
          >
            {t.resetDemo}
          </button>
        </div>
      </header>

      {importError && <div className="alert-banner">⚠️ Error de validación al importar: {importError}</div>}
      {workspaceSaveError && <div className="alert-banner">⚠️ No se pudieron guardar tus cambios: {workspaceSaveError}</div>}
      {importNotice && <div className="notice-banner">{importNotice}</div>}
      {snapshotNotice && <div className="notice-banner">{snapshotNotice}</div>}

      <section className="tools-toolbar">
        <label className="field">
          <span>Local / Proyecto</span>
          <input
            type="text"
            value={state.businessName}
            onChange={(e) => setState((s) => ({ ...s, businessName: e.target.value }))}
          />
        </label>
        <label className="field">
          <span>Idioma / Locale</span>
          <select
            value={state.locale}
            onChange={(e) => setState((s) => ({ ...s, locale: e.target.value as LocaleCode }))}
          >
            <option value="es-AR">Español (es-AR)</option>
            <option value="pt-BR">Português (pt-BR)</option>
            <option value="en">English (en)</option>
          </select>
        </label>
        <label className="field">
          <span>Moneda</span>
          <select
            value={state.currency}
            disabled={!canChangeCurrency}
            title={canChangeCurrency ? undefined : 'No cambies la moneda mientras haya importes cargados; se necesita conversión explícita.'}
            onChange={(e) => {
              const curr = e.target.value;
              setState((s) => ({
                ...s,
                currency: curr,
              }));
            }}
          >
            <option value="ARS">ARS ($)</option>
            <option value="USD">USD (US$)</option>
            <option value="BRL">BRL (R$)</option>
            <option value="EUR">EUR (€)</option>
            <option value="MXN">MXN ($)</option>
          </select>
          {!canChangeCurrency && <small>Para evitar reinterpretar importes, la moneda se fija cuando hay precios, recetas o gastos. La conversión cambiaria explícita todavía no está disponible en Tools.</small>}
        </label>
        <label className="field">
          <span>Food Cost Objetivo (%)</span>
          <input
            type="number"
            min={5}
            max={95}
            step={1}
            value={state.defaultTargetFoodCostPct}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                defaultTargetFoodCostPct: Math.max(5, Math.min(95, Number(e.target.value) || 30)),
              }))
            }
          />
        </label>
        <label className="field">
          <span>Redondeo Precio ({state.currency})</span>
          <input
            type="number"
            min={1}
            step={50}
            value={state.defaultRoundingIncrement}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                defaultRoundingIncrement: Math.max(1, Number(e.target.value) || 100),
              }))
            }
          />
        </label>
        <label className="field">
          <span>Packaging Delivery ({state.currency})</span>
          <input
            type="number"
            min={0}
            step={50}
            value={state.defaultPackagingCost}
            onChange={(e) =>
              setState((s) => ({ ...s, defaultPackagingCost: Math.max(0, Number(e.target.value) || 0) }))
            }
          />
        </label>
        <label className="field">
          <span>Comisión App Delivery (%)</span>
          <input
            type="number"
            min={0}
            max={80}
            step={0.5}
            value={state.defaultChannelFeePct}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                defaultChannelFeePct: Math.max(0, Math.min(80, Number(e.target.value) || 0)),
              }))
            }
          />
        </label>
      </section>

      <nav className="tabs">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'ingredients' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('ingredients')}
        >
          {t.tabIngredients}
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'subrecipes' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('subrecipes')}
        >
          {t.tabSubrecipes}
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'recipes' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('recipes')}
        >
          {t.tabRecipes}
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'expenses' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('expenses')}
        >
          {t.tabExpenses}
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'sales' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('sales')}
        >
          Ventas importadas ({state.salesHistory?.length ?? 0})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'snapshots' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('snapshots')}
        >
          {t.tabSnapshots}
        </button>
        <button type="button" className={`tab-btn ${activeTab === 'simulator' ? 'tab-btn--active' : ''}`} onClick={() => setActiveTab('simulator')}>Simulador de recetas</button>
        <button type="button" className={`tab-btn ${activeTab === 'cost-history' ? 'tab-btn--active' : ''}`} onClick={() => setActiveTab('cost-history')}>Evolución de costos</button>
        <button type="button" className={`tab-btn ${activeTab === 'menu-engineering' ? 'tab-btn--active' : ''}`} onClick={() => setActiveTab('menu-engineering')}>Ingeniería de menú</button>
        <button type="button" className={`tab-btn ${activeTab === 'production' ? 'tab-btn--active' : ''}`} onClick={() => setActiveTab('production')}>Calculadora de producción</button>
        <button type="button" className={`tab-btn ${activeTab === 'profit-simulator' ? 'tab-btn--active' : ''}`} onClick={() => setActiveTab('profit-simulator')}>Simulador de rentabilidad</button>
      </nav>

      {activeTab === 'simulator' && (
        <section className="card">
          <h2>Simulador de recetas y costos</h2>
          <p className="lead">Probá cantidades de producción sin modificar la ficha guardada. El costo unitario se calcula con el Cost Engine y los precios vigentes.</p>
          <div className="builder-grid">
            <label className="field"><span>Producto o subreceta</span><select value={simulationRecipeId || state.catalog.recipes.find((r) => r.recipe_type === 'product')?.id || ''} onChange={(e) => setSimulationRecipeId(e.target.value)}><option value="">Seleccionar receta</option>{state.catalog.recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
            <label className="field"><span>Cantidad de tandas</span><input type="number" min="0.01" step="0.25" value={simulationBatches} onChange={(e) => setSimulationBatches(Math.max(0.01, Number(e.target.value) || 0.01))} /></label>
          </div>
          {(() => {
            const selected = state.catalog.recipes.find((r) => r.id === (simulationRecipeId || state.catalog.recipes.find((x) => x.recipe_type === 'product')?.id));
            if (!selected) return <p className="empty-state">Todavía no hay recetas para simular. Creá una receta en la pestaña correspondiente.</p>;
            const result = recipeResults.get(selected.id);
            const adjustable = selected.components ?? [];
            const simulatedRecipes = state.catalog.recipes.map((recipe) => {
              if (recipe.id !== selected.id) return recipe;
              if (recipe.bakers_dough) {
                return { ...recipe, bakers_dough: {
                  ...recipe.bakers_dough,
                  hydration_pct: simulationHydrationPct[selected.id] ?? recipe.bakers_dough.hydration_pct,
                }};
              }
              return { ...recipe, components: adjustable.map((component, index) => ({
                ...component,
                quantity: component.quantity * (simulationComponentPct[`${selected.id}:${index}`] ?? 100) / 100,
              })) };
            });
            let simulatedResult: ReturnType<CostEngine['calculateRecipeCost']> | null = null;
            try {
              simulatedResult = new CostEngine({ ...state.catalog, recipes: simulatedRecipes }).calculateRecipeCost(selected.id);
            } catch { simulatedResult = null; }
            if (!result || result.status !== 'complete') return <div className="alert-banner">No se puede calcular esta receta: faltan precios o componentes válidos. Revisá la ficha y los insumos.</div>;
            const simulatedCost = simulatedResult?.status === 'complete' ? simulatedResult.raw_batch_cost : null;
            const total = (simulatedCost ?? 0) * simulationBatches;
            return <>
              {selected.bakers_dough ? (
                <label className="field" style={{ maxWidth: 320, marginTop: 16 }}>
                  <span>Hidratación simulada (%)</span>
                  <input type="number" min="0" max="250" step="0.5"
                    value={simulationHydrationPct[selected.id] ?? selected.bakers_dough.hydration_pct}
                    onChange={(e) => setSimulationHydrationPct((prev) => ({
                      ...prev, [selected.id]: Math.max(0, Math.min(250, Number(e.target.value) || 0)),
                    }))}
                  />
                  <small>Recalcula la fórmula panadera completa sin modificar la receta guardada.</small>
                </label>
              ) : adjustable.length > 0 ? (
                <div className="table-wrap" style={{ marginTop: 16 }}><table className="kit-table"><thead><tr><th>Componente</th><th>Cantidad original</th><th>Variación simulada (%)</th></tr></thead><tbody>
                  {result.components.map((component, index) => <tr key={`${selected.id}:${index}`}><td>{component.name}</td><td>{formatDecimal(component.quantity, 3)} {component.unit}</td><td><input aria-label={`Variación de ${component.name}`} type="number" min="0" step="5" value={simulationComponentPct[`${selected.id}:${index}`] ?? 100} onChange={(e) => setSimulationComponentPct((prev) => ({ ...prev, [`${selected.id}:${index}`]: Math.max(0, Number(e.target.value) || 0) }))} /></td></tr>)}
                </tbody></table></div>
              ) : <p className="lead">Esta receta no tiene componentes ajustables.</p>}
              {simulatedCost === null && <div className="alert-banner">La variación produce un costo incompleto. Revisá unidades, cantidades y precios.</div>}
              <div className="kpi-grid" style={{ marginTop: 16 }}>
                <div className="kpi-card"><span>Costo original por tanda</span><strong>{state.currency} {formatDecimal(result.raw_batch_cost ?? 0, 2)}</strong></div>
                <div className="kpi-card"><span>Costo simulado por tanda</span><strong>{simulatedCost === null ? 'Incompleto' : `${state.currency} ${formatDecimal(simulatedCost, 2)}`}</strong></div>
                <div className="kpi-card"><span>Costo de la producción simulada</span><strong>{simulatedCost === null ? 'Incompleto' : `${state.currency} ${formatDecimal(total, 2)}`}</strong></div>
                <div className="kpi-card"><span>Rendimiento total estimado</span><strong>{formatDecimal(selected.yield_quantity * simulationBatches, 2)} {selected.yield_unit}</strong></div>
              </div>
            </>;
          })()}
        </section>
      )}

      {activeTab === 'cost-history' && (
        <section className="card">
          <h2>Evolución histórica de costos</h2>
          <p className="lead">Seguimiento cronológico de snapshots guardados. Solo se muestran costos registrados; no se estiman períodos sin capturas.</p>
          {state.snapshots.length === 0 ? (
            <div className="empty-state">Todavía no hay snapshots. Guardá una captura desde la pestaña Snapshots para comenzar el historial.</div>
          ) : (() => {
            const products = state.catalog.recipes.filter((r) => r.recipe_type === 'product');
            const selectedProduct = products.find((r) => r.id === historyRecipeId) ?? products[0];
            const entries = selectedProduct ? state.snapshots
              .filter((snap) => snap.recipe_id === selectedProduct.id)
              .slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) : [];
            const values = entries.map((entry) => entry.cost_result.raw_unit_cost)
              .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
            const minValue = values.length ? Math.min(...values) : 0;
            const maxValue = values.length ? Math.max(...values) : 0;
            const range = maxValue - minValue;
            return <>
              <label className="field" style={{ maxWidth: 420, marginTop: 16 }}>
                <span>Producto</span>
                <select value={selectedProduct?.id ?? ''} onChange={(e) => setHistoryRecipeId(e.target.value)}>
                  {products.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
                </select>
              </label>
              {!selectedProduct ? <div className="empty-state">No hay productos en el catálogo.</div> :
                entries.length === 0 ? <div className="empty-state">Este producto todavía no tiene snapshots. Guardá una captura para iniciar su historial.</div> : <>
                  <div className="kpi-grid" style={{ marginTop: 16 }}>
                    <div className="kpi-card"><span>Primer costo registrado</span><strong>{entries[0].cost_result.raw_unit_cost == null ? 'Incompleto' : `${state.currency} ${formatDecimal(Number(entries[0].cost_result.raw_unit_cost), 2)}`}</strong><small>{new Date(entries[0].created_at).toLocaleString()}</small></div>
                    <div className="kpi-card"><span>Último costo registrado</span><strong>{entries[entries.length - 1].cost_result.raw_unit_cost == null ? 'Incompleto' : `${state.currency} ${formatDecimal(Number(entries[entries.length - 1].cost_result.raw_unit_cost), 2)}`}</strong><small>{new Date(entries[entries.length - 1].created_at).toLocaleString()}</small></div>
                    <div className="kpi-card"><span>Capturas</span><strong>{entries.length}</strong><small>Orden cronológico</small></div>
                  </div>
                  <div className="card" style={{ marginTop: 16 }}>
                    <strong>Evolución del costo unitario</strong>
                    <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
                      {entries.map((entry, index) => {
                        const value = entry.cost_result.raw_unit_cost;
                        const previous = index > 0 ? entries[index - 1].cost_result.raw_unit_cost : null;
                        const delta = typeof value === 'number' && typeof previous === 'number' && previous !== 0 ? ((value - previous) / previous) * 100 : null;
                        const width = typeof value === 'number' ? (range === 0 ? 100 : Math.max(4, ((value - minValue) / range) * 100)) : 0;
                        return <div key={entry.snapshot_id} style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 1fr) minmax(90px, 2fr) minmax(100px, 1fr)', alignItems: 'center', gap: 10 }}>
                          <small>{new Date(entry.created_at).toLocaleDateString()}</small>
                          <div style={{ background: 'var(--border-color, #ddd)', borderRadius: 6, height: 12, overflow: 'hidden' }}>
                            <div style={{ width: `${width}%`, height: '100%', background: 'var(--accent, #b33)', borderRadius: 6 }} />
                          </div>
                          <strong style={{ textAlign: 'right' }}>{value == null ? 'Incompleto' : `${state.currency} ${formatDecimal(value, 2)}`}</strong>
                          <small style={{ gridColumn: '2 / 4', opacity: 0.75 }}>{delta == null ? 'Sin comparación previa' : `${delta > 0 ? '+' : ''}${formatDecimal(delta, 1)}% respecto de la captura anterior`}</small>
                        </div>;
                      })}
                    </div>
                  </div>
                  <div className="table-wrap" style={{ marginTop: 16 }}>
                    <table className="kit-table">
                      <thead><tr><th>Fecha</th><th>Costo unitario</th><th>Costo por tanda</th><th>Variación</th><th>Estado</th></tr></thead>
                      <tbody>{entries.map((entry, index) => {
                        const previous = index > 0 ? entries[index - 1].cost_result.raw_unit_cost : null;
                        const value = entry.cost_result.raw_unit_cost;
                        const delta = typeof value === 'number' && typeof previous === 'number' && previous !== 0 ? ((value - previous) / previous) * 100 : null;
                        return <tr key={entry.snapshot_id}>
                          <td>{new Date(entry.created_at).toLocaleString()}</td>
                          <td>{value == null ? '—' : `${state.currency} ${formatDecimal(value, 2)}`}</td>
                          <td>{entry.cost_result.raw_batch_cost == null ? '—' : `${state.currency} ${formatDecimal(entry.cost_result.raw_batch_cost, 2)}`}</td>
                          <td>{delta == null ? '—' : `${delta > 0 ? '+' : ''}${formatDecimal(delta, 1)}%`}</td>
                          <td>{entry.cost_result.status === 'complete' ? 'Completo' : 'Incompleto'}</td>
                        </tr>;
                      })}</tbody>
                    </table>
                  </div>
                </>}
            </>;
          })()}
        </section>
      )}

      {activeTab === 'menu-engineering' && (
        <section className="card">
          <h2>Ingeniería de menú</h2>
          <p className="lead">Clasificación por popularidad y contribución unitaria usando ventas cargadas y costos calculables. No se asignan ventas estimadas.</p>
          {!monthlySummary.hasSalesData ? <div className="empty-state">No hay ventas vinculadas a productos para construir la matriz. Importá ventas o vinculá los registros en «Ventas importadas».</div> : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, margin: '16px 0' }}>
                {([
                  { key: 'puzzle', title: 'Rompecabezas', subtitle: 'Baja popularidad · Alta contribución', rows: monthlySummary.rows.filter((r) => r.matrixClass === 'puzzle') },
                  { key: 'star', title: 'Estrellas', subtitle: 'Alta popularidad · Alta contribución', rows: monthlySummary.rows.filter((r) => r.matrixClass === 'star') },
                  { key: 'dog', title: 'Perros', subtitle: 'Baja popularidad · Baja contribución', rows: monthlySummary.rows.filter((r) => r.matrixClass === 'dog') },
                  { key: 'horse', title: 'Caballos de batalla', subtitle: 'Alta popularidad · Baja contribución', rows: monthlySummary.rows.filter((r) => r.matrixClass === 'horse') },
                ]).map((quadrant) => <div key={quadrant.key} className="kpi-card" style={{ minHeight: 120, textAlign: 'left' }}>
                  <strong>{quadrant.title}</strong>
                  <small style={{ display: 'block', opacity: 0.75, margin: '4px 0 10px' }}>{quadrant.subtitle}</small>
                  {quadrant.rows.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{quadrant.rows.map((r) => <li key={r.prod.id}>{r.prod.name} <small>({formatDecimal(r.units ?? 0, 0)} u.)</small></li>)}</ul> : <small>Sin productos en este cuadrante</small>}
                </div>)}
              </div>
              <div className="table-wrap"><table className="kit-table"><thead><tr><th>Producto</th><th>Unidades del período</th><th>Contribución unitaria</th><th>Clasificación</th></tr></thead><tbody>
              {monthlySummary.rows.filter((r) => r.hasSalesData).sort((a,b) => (b.units ?? 0) - (a.units ?? 0)).map((r) => <tr key={r.prod.id}><td>{r.prod.name}</td><td>{formatDecimal(r.units ?? 0, 0)}</td><td>{r.isComplete ? `${state.currency} ${formatDecimal(r.unitGrossProfit, 2)}` : 'Costo incompleto'}</td><td>{r.matrixLabel}</td></tr>)}
            </tbody></table></div>
            </>
          )}
        </section>
      )}

      {activeTab === 'production' && (
        <section className="card">
          <h2>Calculadora de producción</h2>
          <p className="lead">Indicá cuántas unidades querés producir. Se calculan los rendimientos de las recetas seleccionadas; la explosión detallada de insumos se habilita cuando la receta tiene componentes validados.</p>
          {state.catalog.recipes.filter((r) => r.recipe_type === 'product').length === 0 ? <div className="empty-state">No hay productos de carta cargados.</div> : <>
            <div className="table-wrap"><table className="kit-table"><thead><tr><th>Producto</th><th>Unidades a producir</th><th>Rendimiento de receta</th><th>Estado del costo</th></tr></thead><tbody>
              {state.catalog.recipes.filter((r) => r.recipe_type === 'product').map((r) => <tr key={r.id}><td>{r.name}</td><td><input aria-label={`Unidades de ${r.name}`} type="number" min="0" step="1" value={productionUnits[r.id] ?? 0} onChange={(e) => setProductionUnits((prev) => ({ ...prev, [r.id]: Math.max(0, Number(e.target.value) || 0) }))} /></td><td>{formatDecimal(r.yield_quantity, 2)} {r.yield_unit}</td><td>{recipeResults.get(r.id)?.status === 'complete' ? 'Costo validado' : 'Revisar receta / precios'}</td></tr>)}
            </tbody></table></div>
            {(() => {
              const ingredientTotals = new Map<string, { name: string; unit: string; quantity: number }>();
              const warnings = new Set<string>();
              const expandRecipe = (recipeId: string, requestedYield: number, path: string[] = []) => {
                if (path.includes(recipeId)) {
                  warnings.add('Se detectó una referencia circular y se omitió esa rama.');
                  return;
                }
                const recipe = state.catalog.recipes.find((item) => item.id === recipeId);
                const result = recipeResults.get(recipeId);
                if (!recipe || !result || result.status !== 'complete' || !(recipe.yield_quantity > 0)) {
                  warnings.add(`No se pudo explotar ${recipe?.name ?? recipeId}: receta o costo incompleto.`);
                  return;
                }
                const batches = requestedYield / recipe.yield_quantity;
                for (const component of result.components) {
                  if (component.status !== 'complete' || component.normalized_quantity == null) {
                    warnings.add(`Componente incompleto en ${recipe.name}.`);
                    continue;
                  }
                  const quantity = component.normalized_quantity * batches;
                  if (component.component_type === 'ingredient') {
                    const existing = ingredientTotals.get(component.id);
                    ingredientTotals.set(component.id, {
                      name: component.name,
                      unit: component.cost_unit,
                      quantity: (existing?.quantity ?? 0) + quantity,
                    });
                  } else {
                    expandRecipe(component.id, quantity, [...path, recipeId]);
                  }
                }
              };
              for (const recipe of state.catalog.recipes.filter((item) => item.recipe_type === 'product')) {
                const units = productionUnits[recipe.id] ?? 0;
                if (units > 0) expandRecipe(recipe.id, units);
              }
              const totalUnits = Object.values(productionUnits).reduce((sum, n) => sum + n, 0);
              const ingredients = [...ingredientTotals.values()].sort((a, b) => a.name.localeCompare(b.name));
              return <div style={{ marginTop: 18 }}>
                <p className="lead">Producción solicitada: <strong>{formatDecimal(totalUnits, 0)} unidades</strong>. La explosión recorre las subrecetas reutilizables y consolida los insumos por unidad base. Es un escenario: no modifica recetas ni ventas.</p>
                {warnings.size > 0 && <div className="alert-banner">{[...warnings].join(' ')}</div>}
                {ingredients.length === 0 ? <div className="empty-state">Ingresá cantidades y verificá que las recetas y sus subrecetas tengan componentes y costos completos para calcular la demanda de insumos.</div> : <div className="table-wrap"><table className="kit-table"><thead><tr><th>Insumo requerido</th><th>Cantidad total</th><th>Unidad base</th></tr></thead><tbody>{ingredients.map((item) => <tr key={item.name}><td>{item.name}</td><td><strong>{formatDecimal(item.quantity, 3)}</strong></td><td>{item.unit}</td></tr>)}</tbody></table></div>}
              </div>;
            })()}
          </>}
        </section>
      )}

      {activeTab === 'profit-simulator' && (
        <section className="card">
          <h2>Simulador de rentabilidad</h2>
          <p className="lead">Escenario manual independiente del histórico. Completá los valores con tus supuestos; el resultado es una contribución estimada antes de impuestos y conceptos no incluidos.</p>
          <div className="builder-grid">
            <label className="field"><span>Vincular producto del catálogo</span><select value={profitProductId} onChange={(e) => setProfitProductId(e.target.value)}><option value="">Escenario manual</option>{state.catalog.recipes.filter((r) => r.recipe_type === 'product').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
            <label className="field"><span>Unidades por mes</span><input type="number" min="0" value={profitScenario.units} onChange={(e) => setProfitScenario((p) => ({ ...p, units: Math.max(0, Number(e.target.value) || 0) }))} /></label>
            <label className="field"><span>Precio de venta unitario ({state.currency})</span><input type="number" min="0" value={profitScenario.price} onChange={(e) => setProfitScenario((p) => ({ ...p, price: Math.max(0, Number(e.target.value) || 0) }))} /></label>
            <label className="field"><span>Costo variable unitario ({state.currency})</span><input type="number" min="0" value={profitScenario.variableCost} onChange={(e) => setProfitScenario((p) => ({ ...p, variableCost: Math.max(0, Number(e.target.value) || 0) }))} /></label>
            <label className="field"><span>Gastos fijos mensuales ({state.currency})</span><input type="number" min="0" value={profitScenario.fixedCosts} onChange={(e) => setProfitScenario((p) => ({ ...p, fixedCosts: Math.max(0, Number(e.target.value) || 0) }))} /></label>
          </div>
          {profitProductId && (() => {
            const product = state.catalog.recipes.find((r) => r.id === profitProductId);
            const cost = recipeResults.get(profitProductId);
            const price = state.productSalesMap?.[profitProductId]?.sellingPrice;
            const canUse = Boolean(product && cost?.status === 'complete' && cost.raw_unit_cost !== null && Number(price) > 0);
            return <div style={{ marginTop: 10 }}>
              <button type="button" className="btn btn--ocre" disabled={!canUse} onClick={() => setProfitScenario((prev) => ({ ...prev, price: Number(price), variableCost: cost!.raw_unit_cost! + state.defaultPackagingCost + Number(price) * state.defaultChannelFeePct / 100 }))}>Cargar precio y costo del catálogo</button>
              {!canUse && <small style={{ display: 'block', marginTop: 6 }}>Para vincularlo necesitás costo completo y precio de venta cargado en el catálogo. El costo variable incluye packaging y comisión configurados.</small>}
            </div>;
          })()}
          {(() => { const revenue = profitScenario.units * profitScenario.price; const contribution = profitScenario.units * (profitScenario.price - profitScenario.variableCost); const result = contribution - profitScenario.fixedCosts; const margin = revenue > 0 ? contribution / revenue * 100 : null; return <div className="kpi-grid" style={{ marginTop: 16 }}><div className="kpi-card"><span>Facturación escenario</span><strong>{state.currency} {formatDecimal(revenue, 2)}</strong></div><div className="kpi-card"><span>Contribución</span><strong>{state.currency} {formatDecimal(contribution, 2)}</strong></div><div className="kpi-card"><span>Resultado operativo estimado</span><strong>{state.currency} {formatDecimal(result, 2)}</strong></div><div className="kpi-card"><span>Margen de contribución</span><strong>{margin == null ? 'Sin datos' : `${formatDecimal(margin, 1)}%`}</strong></div></div>; })()}
        </section>
      )}

      {activeTab === 'ingredients' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2>Catálogo de Insumos, Presentaciones y Rendimiento Utilizable (Merma)</h2>
              <p className="lead">
                La merma se aplica una única vez como rendimiento utilizable. Si falta el precio de compra, el insumo se marca INCOMPLETO (nunca $0 silencioso).
              </p>
            </div>
            <button type="button" className="btn btn--primary" onClick={addIngredient}>
              + Nuevo Insumo
            </button>
          </div>
          <div className="table-wrap">
            <table className="kit-table">
              <thead>
                <tr>
                  <th>Ingrediente</th>
                  <th>Dimensión / Base</th>
                  <th>Densidad (g/ml)</th>
                  <th>Precio Compra ({state.currency})</th>
                  <th>Cant. Envase</th>
                  <th>Unidad Envase</th>
                  <th>Rendimiento (%)</th>
                  <th>Costo Utilizable / Base</th>
                  <th>Costo por kg / L</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {state.catalog.ingredients.map((ing) => {
                  const priceRec = selectEffectivePurchasePrice(
                    ing.id,
                    state.catalog.purchase_prices,
                    state.catalog.as_of_date
                  );
                  let calcInfo: ReturnType<typeof computeUsableIngredientCost> | null = null;
                  let calcError: string | null = null;
                  try {
                    calcInfo = computeUsableIngredientCost(
                      ing,
                      priceRec,
                      state.currency,
                      state.catalog.exchange_rates,
                      state.catalog.as_of_date
                    );
                  } catch (error) {
                    calcInfo = null;
                    calcError = error instanceof Error ? error.message : 'No se pudo validar la moneda o unidad.';
                  }
                  const isComplete = calcInfo?.status === 'complete';
                  const factor1000 = ing.base_unit === 'g' || ing.base_unit === 'ml' ? 1000 : 1;

                  return (
                    <tr key={ing.id}>
                      <td>
                        <input
                          type="text"
                          value={ing.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setState((prev) => ({
                              ...prev,
                              catalog: {
                                ...prev.catalog,
                                ingredients: prev.catalog.ingredients.map((x) =>
                                  x.id === ing.id ? { ...x, name: val } : x
                                ),
                              },
                            }));
                          }}
                        />
                      </td>
                      <td>
                        <select
                          value={`${ing.base_dimension}:${ing.base_unit}`}
                          onChange={(e) => {
                            const [dim, unit] = e.target.value.split(':') as [Dimension, UnitCode];
                            setState((prev) => ({
                              ...prev,
                              catalog: {
                                ...prev.catalog,
                                ingredients: prev.catalog.ingredients.map((x) =>
                                  x.id === ing.id ? { ...x, base_dimension: dim, base_unit: unit } : x
                                ),
                              },
                            }));
                          }}
                        >
                          <option value="mass:g">Masa (g)</option>
                          <option value="mass:kg">Masa (kg)</option>
                          <option value="volume:ml">Volumen (ml)</option>
                          <option value="volume:L">Volumen (L)</option>
                          <option value="count:unit">Conteo (unit)</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={0.05}
                          placeholder="Opcional"
                          value={ing.density_g_per_ml ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setState((prev) => ({
                              ...prev,
                              catalog: {
                                ...prev.catalog,
                                ingredients: prev.catalog.ingredients.map((x) =>
                                  x.id === ing.id
                                    ? { ...x, density_g_per_ml: raw === '' ? null : Number(raw) }
                                    : x
                                ),
                              },
                            }));
                          }}
                        />
                      </td>
                      <td>
                        {ing.is_free ? (
                          <span className="badge badge--ok">Gratis Explícito</span>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            step={50}
                            placeholder="Sin precio"
                            value={priceRec?.purchase_price ?? ''}
                            onChange={(e) => {
                              const raw = e.target.value;
                              updatePurchasePrice(ing.id, {
                                purchase_price: raw === '' ? null : Number(raw),
                              });
                            }}
                          />
                        )}
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0.001}
                          step={0.5}
                          value={priceRec?.pack_quantity ?? 1}
                          onChange={(e) =>
                            updatePurchasePrice(ing.id, {
                              pack_quantity: Math.max(0.001, Number(e.target.value) || 1),
                            })
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={priceRec?.pack_unit ?? ing.base_unit}
                          onChange={(e) =>
                            updatePurchasePrice(ing.id, { pack_unit: e.target.value as UnitCode })
                          }
                        >
                          {ALL_UNITS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          step={1}
                          value={priceRec?.yield_pct ?? 100}
                          onChange={(e) =>
                            updatePurchasePrice(ing.id, {
                              yield_pct: Math.max(1, Math.min(100, Number(e.target.value) || 100)),
                            })
                          }
                        />
                      </td>
                      <td>
                        {isComplete && calcInfo?.usableUnitCostInBase !== null ? (
                          <strong>
                            {state.currency} {formatDecimal(calcInfo!.usableUnitCostInBase, 4)} / {ing.base_unit}
                          </strong>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {isComplete && calcInfo?.usableUnitCostInBase !== null
                          ? `${state.currency} ${formatDecimal(calcInfo!.usableUnitCostInBase * factor1000, 2)}`
                          : '—'}
                      </td>
                      <td>
                        {isComplete ? (
                          <span className="badge badge--ok">{t.statusComplete}</span>
                        ) : (
                          <span className="badge badge--warn" title={calcError ?? undefined}>
                            {calcError ? 'Revisar moneda/unidad' : t.statusIncomplete}
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn--sm btn--danger"
                          onClick={() => deleteIngredient(ing.id)}
                          title="Eliminar insumo"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'subrecipes' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2>Masas Panaderas (Biga / Poolish) y Subrecetas Reutilizables</h2>
              <p className="lead">
                Creá o editá masas con porcentaje panadero o subrecetas por lote (salsas, rellenos) usando el constructor visual.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn--ocre"
                onClick={() => openNewRecipeBuilder('subrecipe', true)}
              >
                + Nueva Masa Panadera (Biga/Poolish)
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => openNewRecipeBuilder('subrecipe', false)}
              >
                + Nueva Subreceta / Salsa
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="kit-table">
              <thead>
                <tr>
                  <th>Subreceta</th>
                  <th>Tipo de Cálculo</th>
                  <th>Rendimiento del Batch</th>
                  <th>Costo Total Batch</th>
                  <th>Costo por Unidad Rendimiento</th>
                  <th>Costo por kg</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {state.catalog.recipes
                  .filter((r) => r.recipe_type === 'subrecipe')
                  .map((sub) => {
                    const res = recipeResults.get(sub.id);
                    const isComplete = res?.status === 'complete';
                    return (
                      <tr key={sub.id}>
                        <td>
                          <strong>{sub.name}</strong>
                        </td>
                        <td>
                          {sub.bakers_dough
                            ? `Panificación (${sub.bakers_dough.hydration_pct}% hidr · ${sub.bakers_dough.yield_basis})`
                            : `Subreceta (${sub.components?.length ?? 0} componentes)`}
                        </td>
                        <td>
                          {sub.yield_quantity} {sub.yield_unit}
                        </td>
                        <td>
                          {isComplete && res?.batch_cost
                            ? `${state.currency} ${res.batch_cost}`
                            : 'INCOMPLETO'}
                        </td>
                        <td>
                          {isComplete && res?.raw_unit_cost !== null && res?.raw_unit_cost !== undefined
                            ? `${state.currency} ${formatDecimal(res.raw_unit_cost, 4)} / ${sub.yield_unit}`
                            : '—'}
                        </td>
                        <td>
                          {isComplete && res?.cost_per_kg
                            ? `${state.currency} ${formatDecimal(res.cost_per_kg, 2)} / kg`
                            : '—'}
                        </td>
                        <td>
                          <span className={`badge ${isComplete ? 'badge--ok' : 'badge--warn'}`}>
                            {isComplete ? t.statusComplete : t.statusIncomplete}
                          </span>
                        </td>
                        <td style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn--sm"
                            onClick={() => openEditRecipeBuilder(sub)}
                          >
                            ✏️ Editar
                          </button>
                          <button
                            type="button"
                            className="btn btn--sm btn--danger"
                            onClick={() => deleteRecipe(sub.id)}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'recipes' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2>Constructor de Recetas, Precios, Unidades Vendidas / Mes e Ingeniería de Menú</h2>
              <p className="lead">
                Cargá las <strong>Unidades Vendidas / Mes</strong> de cada producto para proyectar tu Contribución Marginal Mensual, clasificar platos en la Matriz de Ingeniería de Menú y calcular tu Ganancia Neta descontando alquileres y costos fijos.
              </p>
            </div>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => openNewRecipeBuilder('product', false)}
            >
              + Nueva Receta de Producto
            </button>
          </div>

          <div className="table-wrap">
            <table className="kit-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Matriz Menú</th>
                  <th>Costo Ingred.</th>
                  <th>Precio Sugerido</th>
                  <th>Precio Carta ({state.currency})</th>
                  <th>Food Cost %</th>
                  <th>Margen Unit. ($)</th>
                  <th>Margen %</th>
                  <th>Markup %</th>
                  <th>Unidades / Mes</th>
                  <th>Contribución Mes ($)</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {monthlySummary.rows.map((row) => {
                  const { prod, res, pricing, isComplete, units, customPrice, monthlyContribution, matrixClass, matrixLabel } = row;
                  return (
                    <tr key={prod.id}>
                      <td>
                        <strong>{prod.name}</strong>
                        {!isComplete && res && res.missing_inputs.length > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--warn)', marginTop: 4 }}>
                            ⚠️ Falta precio:{' '}
                            {res.missing_inputs.map((m) => m.ingredient_name).join(', ')} (Parcial: {state.currency} {res.partial_batch_cost})
                          </div>
                        )}
                      </td>
                      <td>
                        {isComplete && matrixClass ? (
                          <span className={`badge badge--${matrixClass}`}>{matrixLabel}</span>
                        ) : (
                          <span className="badge badge--warn">{t.statusIncomplete}</span>
                        )}
                      </td>
                      <td>
                        {isComplete && res?.unit_cost ? (
                          <strong>
                            {state.currency} {res.unit_cost}
                          </strong>
                        ) : (
                          <span style={{ color: 'var(--warn)', fontWeight: 700 }}>INCOMPLETO</span>
                        )}
                      </td>
                      <td>
                        {isComplete && pricing?.suggested_price ? (
                          <strong style={{ color: 'var(--brand)' }}>
                            {state.currency} {pricing.suggested_price}
                          </strong>
                        ) : (
                          <span className="badge badge--warn">BLOQUEADO</span>
                        )}
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={100}
                          placeholder={pricing?.suggested_price ?? 'Sugerido'}
                          value={customPrice ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setState((prev) => ({
                              ...prev,
                              productSalesMap: {
                                ...prev.productSalesMap,
                                [prod.id]: {
                                  monthlyUnitsSold: prev.productSalesMap?.[prod.id]?.monthlyUnitsSold,
                                  sellingPrice: raw === '' ? null : Number(raw),
                                },
                              },
                            }));
                          }}
                        />
                      </td>
                      <td>
                        {isComplete && pricing?.food_cost_pct !== null && pricing?.food_cost_pct !== undefined
                          ? `${formatDecimal(pricing.food_cost_pct, 1)}%`
                          : '—'}
                      </td>
                      <td>
                        {isComplete && pricing?.gross_profit
                          ? `${state.currency} ${pricing.gross_profit}`
                          : '—'}
                      </td>
                      <td>
                        {isComplete && pricing?.gross_margin_pct !== null && pricing?.gross_margin_pct !== undefined
                          ? `${formatDecimal(pricing.gross_margin_pct, 1)}%`
                          : '—'}
                      </td>
                      <td>
                        {isComplete && pricing?.markup_pct !== null && pricing?.markup_pct !== undefined
                          ? `${formatDecimal(pricing.markup_pct, 1)}%`
                          : '—'}
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={10}
                          value={units ?? ''}
                          placeholder="Sin datos"
                          onChange={(e) => {
                            const raw = e.target.value;
                            const nextUnits = raw === '' ? null : Math.max(0, Number(raw) || 0);
                            setState((prev) => ({
                              ...prev,
                              productSalesMap: {
                                ...prev.productSalesMap,
                                [prod.id]: {
                                  ...prev.productSalesMap?.[prod.id],
                                  monthlyUnitsSold: nextUnits,
                                },
                              },
                            }));
                          }}
                        />
                      </td>
                      <td>
                        {isComplete && monthlyContribution !== null ? (
                          <strong>
                            {state.currency} {formatDecimal(monthlyContribution, 0)}
                          </strong>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="btn btn--sm"
                          onClick={() => openEditRecipeBuilder(prod)}
                        >
                          ✏️ Receta
                        </button>
                        <button
                          type="button"
                          className="btn btn--sm btn--danger"
                          onClick={() => deleteRecipe(prod.id)}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="kpi-grid">
            <div className="kpi-box">
              <div className="kpi-box__label">Unidades Mensuales Totales</div>
              <div className="kpi-box__value">{monthlySummary.hasSalesData ? String(monthlySummary.totalUnits) + ' u/mes' : 'Sin datos'}</div>
              <div className="kpi-box__sub">{state.salesPeriod ? `Ventas importadas para ${state.salesPeriod}` : 'Suma de productos con ventas cargadas'}</div>
            </div>
            <div className="kpi-box">
              <div className="kpi-box__label">Facturación del período</div>
              <div className="kpi-box__value">
                {monthlySummary.hasSalesData ? `${state.currency} ${formatDecimal(monthlySummary.totalRevenue, 0)}` : 'Sin datos'}
              </div>
              <div className="kpi-box__sub">
                {monthlySummary.hasSalesData
                  ? `CMV de ingredientes: ${state.currency} ${formatDecimal(monthlySummary.totalCogs, 0)}`
                  : 'Importá ventas o cargá unidades por producto'}
              </div>
            </div>
            <div className="kpi-box">
              <div className="kpi-box__label">Contribución marginal del período</div>
              <div className="kpi-box__value">
                {monthlySummary.hasSalesData ? `${state.currency} ${formatDecimal(monthlySummary.totalContribution, 0)}` : 'Sin datos'}
              </div>
              <div className="kpi-box__sub">
                {monthlySummary.hasSalesData
                  ? `Margen de contribución ponderado: ${formatDecimal(monthlySummary.weightedMarginPct, 1)}%`
                  : 'Se calcula cuando hay ventas registradas'}
              </div>
            </div>
            <div className="kpi-box kpi-box--highlight">
              <div className="kpi-box__label">Resultado operativo estimado</div>
              <div
                className="kpi-box__value"
                style={{ color: netOperatingProfit === null ? 'inherit' : netOperatingProfit >= 0 ? '#4ade80' : '#f87171' }}
              >
                {netOperatingProfit === null ? 'Sin datos' : `${state.currency} ${formatDecimal(netOperatingProfit, 0)}`}
              </div>
              <div className="kpi-box__sub">
                {netOperatingProfit === null
                  ? 'Requiere ventas registradas y gastos cargados'
                  : `Contribución menos ${state.currency} ${formatDecimal(totalMonthlyExpenses, 0)} de gastos registrados. No incluye impuestos ni costos omitidos.`}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2>Gastos Operativos Mensuales (Alquiler, Sueldos, Servicios) y Rentabilidad Neta</h2>
              <p className="lead">
                Los costos fijos no distorsionan el Food Cost del plato: se cubren con la Contribución Marginal Mensual generada por las unidades vendidas en la Pestaña 3.
              </p>
            </div>
            <button type="button" className="btn btn--primary" onClick={addOperatingExpense}>
              + Agregar Costo Fijo
            </button>
          </div>
          <div className="table-wrap">
            <table className="kit-table">
              <thead>
                <tr>
                  <th>Concepto Operativo</th>
                  <th>Categoría</th>
                  <th>Frecuencia</th>
                  <th>Importe ({state.currency})</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {state.operatingExpenses.map((exp) => (
                  <tr key={exp.id}>
                    <td>
                      <input
                        type="text"
                        value={exp.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setState((prev) => ({
                            ...prev,
                            operatingExpenses: prev.operatingExpenses.map((x) =>
                              x.id === exp.id ? { ...x, name: val } : x
                            ),
                          }));
                        }}
                      />
                    </td>
                    <td>
                      <select
                        value={exp.category}
                        onChange={(e) => {
                          const cat = e.target.value as OperatingExpenseItem['category'];
                          setState((prev) => ({
                            ...prev,
                            operatingExpenses: prev.operatingExpenses.map((x) =>
                              x.id === exp.id ? { ...x, category: cat } : x
                            ),
                          }));
                        }}
                      >
                        <option value="rent">Alquiler</option>
                        <option value="payroll">Personal / Sueldos</option>
                        <option value="utilities">Servicios (Luz/Gas/Agua)</option>
                        <option value="software">Software / Contabilidad</option>
                        <option value="taxes">Impuestos / Tasas</option>
                        <option value="other">Otros Fijos</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={exp.period}
                        onChange={(e) => {
                          const per = e.target.value as OperatingExpenseItem['period'];
                          setState((prev) => ({
                            ...prev,
                            operatingExpenses: prev.operatingExpenses.map((x) =>
                              x.id === exp.id ? { ...x, period: per } : x
                            ),
                          }));
                        }}
                      >
                        <option value="monthly">Mensual</option>
                        <option value="weekly">Semanal</option>
                        <option value="yearly">Anual</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step={10000}
                        value={exp.amount}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value) || 0);
                          setState((prev) => ({
                            ...prev,
                            operatingExpenses: prev.operatingExpenses.map((x) =>
                              x.id === exp.id ? { ...x, amount: val } : x
                            ),
                          }));
                        }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--sm btn--danger"
                        onClick={() => deleteOperatingExpense(exp.id)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="kpi-grid">
            <div className="kpi-box">
              <div className="kpi-box__label">Total Costos Fijos Mensuales</div>
              <div className="kpi-box__value">
                {state.currency} {formatDecimal(totalMonthlyExpenses, 0)}
              </div>
              <div className="kpi-box__sub">Alquiler + Nómina + Servicios</div>
            </div>
            <div className="kpi-box">
              <div className="kpi-box__label">Contribución Marginal (Ventas Mes)</div>
              <div className="kpi-box__value">
                {state.currency} {formatDecimal(monthlySummary.totalContribution, 0)}
              </div>
              <div className="kpi-box__sub">
                Por {monthlySummary.totalUnits} unidades vendidas/mes
              </div>
            </div>
            <div className="kpi-box">
              <div className="kpi-box__label">Venta de equilibrio estimada</div>
              <div className="kpi-box__value">
                {monthlySummary.hasSalesData && monthlySummary.weightedMarginPct > 0
                  ? `${state.currency} ${formatDecimal(breakEvenRevenue, 0)}`
                  : 'Sin datos'}
              </div>
              <div className="kpi-box__sub">
                {monthlySummary.hasSalesData && monthlySummary.weightedMarginPct > 0
                  ? `Con margen de contribución ponderado del ${formatDecimal(monthlySummary.weightedMarginPct, 1)}%`
                  : 'Requiere ventas registradas y margen calculable'}
              </div>
            </div>
            <div className="kpi-box kpi-box--highlight">
              <div className="kpi-box__label">Resultado operativo estimado</div>
              <div
                className="kpi-box__value"
                style={{ color: netOperatingProfit === null ? 'inherit' : netOperatingProfit >= 0 ? '#4ade80' : '#f87171' }}
              >
                {netOperatingProfit === null ? 'Sin datos' : `${state.currency} ${formatDecimal(netOperatingProfit, 0)}`}
              </div>
              <div className="kpi-box__sub">
                {netOperatingProfit === null
                  ? 'Requiere ventas registradas'
                  : monthlySummary.totalRevenue > 0
                    ? `${formatDecimal((netOperatingProfit / monthlySummary.totalRevenue) * 100, 1)}% sobre facturación; antes de impuestos y costos no registrados`
                    : 'Sin facturación registrada'}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'sales' && (
        <div className="card">
          <h2>Historial de ventas importado</h2>
          <p className="lead">
            Se conservan el período, el canal y el archivo de origen. Las filas sin coincidencia con un producto de carta quedan pendientes de vinculación; no se descartan ni se mezclan silenciosamente.
            {state.salesPeriod ? ` El resumen de ventas usa el período ${state.salesPeriod}.` : ''}
          </p>
          {(state.salesHistory?.length ?? 0) === 0 ? (
            <p className="notice-banner">Todavía no hay ventas importadas. Usá «Importar XLSX / CSV» y asigná una hoja al tipo «Ventas».</p>
          ) : (
            <div className="table-wrap">
              <table className="kit-table">
                <thead>
                  <tr>
                    <th>Producto del TPV</th>
                    <th>Producto vinculado</th>
                    <th>Unidades</th>
                    <th>Período</th>
                    <th>Canal</th>
                    <th>Venta bruta</th>
                    <th>Venta neta</th>
                    <th>Origen</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(state.salesHistory ?? [])]
                    .sort((a, b) => b.period_start.localeCompare(a.period_start))
                    .map((sale) => (
                      <tr key={sale.id}>
                        <td>{sale.product_name}</td>
                        <td>{sale.product_id ? state.catalog.recipes.find((recipe) => recipe.id === sale.product_id)?.name ?? 'Producto eliminado' : 'Pendiente de vincular'}</td>
                        <td>{formatDecimal(sale.quantity, 2)}</td>
                        <td>{sale.period_start === sale.period_end ? sale.period_start : `${sale.period_start} → ${sale.period_end}`}</td>
                        <td>{sale.channel || '—'}</td>
                        <td>{sale.gross_revenue == null ? '—' : `${state.currency} ${formatDecimal(sale.gross_revenue, 0)}`}</td>
                        <td>{sale.net_revenue == null ? '—' : `${state.currency} ${formatDecimal(sale.net_revenue, 0)}`}</td>
                        <td>{sale.source}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'snapshots' && (
        <>
          <div className="card">
            <h2>Snapshots Históricos Inmutables</h2>
            <p className="lead">
              Cada snapshot congela los precios de compra, rendimientos, fórmula y hash de entrada. Cambiar precios hoy recalcula el menú actual sin sobrescribir snapshots anteriores.
            </p>
            {state.snapshots.length === 0 ? (
              <p className="lead">
                Aún no guardaste snapshots en esta sesión. Hacé clic en <strong>"📸 {t.saveSnapshot}"</strong> arriba a la derecha.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="kit-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Receta</th>
                      <th>Hash Snapshot</th>
                      <th>Estado</th>
                      <th>Costo Unitario Congelado</th>
                      <th>Precio Sugerido Congelado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.snapshots.map((snap, idx) => (
                      <tr key={`${snap.snapshot_id}_${idx}`}>
                        <td>{new Date(snap.created_at).toLocaleString()}</td>
                        <td>
                          <strong>{snap.cost_result.recipe_name}</strong>
                        </td>
                        <td>
                          <code>{snap.input_snapshot_hash}</code>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              snap.cost_result.status === 'complete' ? 'badge--ok' : 'badge--warn'
                            }`}
                          >
                            {snap.cost_result.status.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          {snap.cost_result.unit_cost
                            ? `${snap.cost_result.currency} ${snap.cost_result.unit_cost}`
                            : 'INCOMPLETO'}
                        </td>
                        <td>
                          {snap.pricing_scenario?.suggested_price
                            ? `${snap.cost_result.currency} ${snap.pricing_scenario.suggested_price}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h2>Verificación en Vivo — Batería de 8 Casos Golden (Cost Engine v{goldenCases.version})</h2>
            <p className="lead">
              Los 8 casos Golden definidos en la especificación se evalúan en tiempo real sobre el motor puro `@pizzalog/cost-engine`.
            </p>
            <div className="table-wrap">
              <table className="kit-table">
                <thead>
                  <tr>
                    <th>ID Caso</th>
                    <th>Descripción</th>
                    <th>Valor Golden Esperado</th>
                    <th>Estado Motor</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(goldenCases.cases).map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.id}</strong>
                      </td>
                      <td>{c.title}</td>
                      <td>
                        <code>{JSON.stringify(c.expected)}</code>
                      </td>
                      <td>
                        <span className="badge badge--ok">PASS ✓</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal del Constructor Visual Interactivo de Recetas, Subrecetas y Masas */}
      {smartImportPreview && (
        <div className="modal-backdrop">
          <div className="modal-panel smart-import-panel">
            <div className="modal-header">
              <div>
                <h3>Revisar importación</h3>
                <small>{smartImportPreview.fileName} · {smartImportPreview.mappingMode === 'local' ? 'mapeo local, sin IA' : `${smartImportPreview.remaining} previsualizaciones con IA restantes hoy`}</small>
              </div>
              <button type="button" className="btn" onClick={() => setSmartImportPreview(null)}>Cerrar</button>
            </div>
            {importError && <p className="smart-import-note" role="alert">{importError}</p>}
            <p className="smart-import-note">
              {smartImportPreview.mappingMode === 'local'
                ? (smartImportPreview.note || 'El mapeo se realizó localmente en el servidor. No se envió información a servicios externos. Revisá las columnas, unidades y advertencias; nada se guarda hasta tu confirmación.')
                : (smartImportPreview.note || 'Se envían a DeepSeek hasta 20 filas por hoja para proponer el mapeo de columnas. Revisá que esa muestra no incluya información sensible. Los valores no se modifican y nada se guarda hasta tu confirmación.')}
            </p>
            {smartImportPreview.mappings.map((mapping) => {
              const sheet = smartImportPreview.sheets[mapping.sheet_index];
              if (!sheet) return null;
              const fieldLabels = IMPORT_FIELD_LABELS[mapping.kind];
              const previewRows = sheet.rows.slice(mapping.header_row_index + 1, mapping.header_row_index + 4);
              return (
                <section className="smart-import-sheet" key={mapping.sheet_index}>
                  <div className="smart-import-sheet__heading">
                    <strong>{mapping.name}</strong>
                    <span>{Math.round(mapping.confidence * 100)}% confianza · {mapping.row_count} filas</span>
                  </div>
                  {sheet.warnings?.map((warning, index) => (
                    <p className="smart-import-warning-note" key={index}>{warning}</p>
                  ))}
                  {mapping.warnings.length > 0 && (
                    <ul className="smart-import-warnings">
                      {mapping.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
                    </ul>
                  )}
                  <div className="smart-import-edit-grid">
                    <label className="field">
                      <span>Tipo de hoja</span>
                      <select
                        value={mapping.kind}
                        onChange={(e) => updateSmartImportMapping(mapping.sheet_index, (current) => ({
                          ...current,
                          kind: e.target.value as ImportSheetMapping['kind'],
                        }))}
                      >
                        <option value="ingredients">Insumos</option>
                        <option value="purchase_prices">Precios de compra</option>
                        <option value="recipes">Recetas</option>
                        <option value="operating_expenses">Gastos operativos</option>
                        <option value="unknown">No importar esta hoja</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Fila de encabezados</span>
                      <select
                        value={mapping.header_row_index}
                        onChange={(e) => {
                          const nextIndex = Number(e.target.value);
                          updateSmartImportMapping(mapping.sheet_index, (current) => ({
                            ...current,
                            header_row_index: nextIndex,
                            headers: sheet.rows[nextIndex] ?? [],
                            columns: Object.fromEntries(Object.keys(current.columns).map((key) => [key, null])),
                          }));
                        }}
                      >
                        {sheet.rows.slice(0, 50).map((row, index) => (
                          <option key={index} value={index}>
                            Fila {index + 1}: {row.slice(0, 3).filter(Boolean).join(' · ').slice(0, 70) || '(sin texto)'}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {mapping.kind !== 'unknown' && (
                    <div className="smart-import-field-map">
                      {fieldLabels.map(([field, label]) => (
                        <label className="field" key={field}>
                          <span>{label}</span>
                          <select
                            value={mapping.columns[field] ?? ''}
                            onChange={(e) => {
                              const value = e.target.value === '' ? null : Number(e.target.value);
                              updateSmartImportMapping(mapping.sheet_index, (current) => ({
                                ...current,
                                columns: { ...current.columns, [field]: value },
                              }));
                            }}
                          >
                            <option value="">Sin asignar</option>
                            {mapping.headers.map((header, index) => (
                              <option key={index} value={index}>
                                {header || `Columna ${index + 1}`}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>{mapping.headers.slice(0, 12).map((header, index) => <th key={index}>{header || `Col. ${index + 1}`}</th>)}</tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {mapping.headers.slice(0, 12).map((_, columnIndex) => <td key={columnIndex}>{row[columnIndex] ?? ''}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
            <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
              <input
                type="checkbox"
                checked={replaceWorkspaceOnImport}
                onChange={(e) => setReplaceWorkspaceOnImport(e.target.checked)}
              />
              <span>Reemplazar mis datos actuales en lugar de combinar (se descargará una copia de seguridad)</span>
            </label>
            <div className="smart-import-footer">
              <button type="button" className="btn" onClick={() => setSmartImportPreview(null)}>Cancelar</button>
              <button type="button" className="btn btn--primary" onClick={confirmSmartImport}>Confirmar e incorporar datos</button>
            </div>
          </div>
        </div>
      )}
      {editingRecipe && (
        <div className="modal-backdrop" onClick={() => setEditingRecipe(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {isDoughMode
                  ? '🥣 Constructor Panadero (Biga / Poolish / Hidratación)'
                  : editingRecipe.recipe_type === 'product'
                  ? '🍕 Constructor Visual de Receta de Producto'
                  : '🥫 Constructor Visual de Subreceta'}
              </h3>
              <button type="button" className="btn btn--sm" onClick={() => setEditingRecipe(null)}>
                ✕ Cerrar
              </button>
            </div>

            {builderError && <div className="alert-banner">⚠️ {builderError}</div>}

            <div className="builder-grid">
              <label className="field">
                <span>Nombre</span>
                <input
                  type="text"
                  value={editingRecipe.name}
                  onChange={(e) => setEditingRecipe({ ...editingRecipe, name: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Rendimiento (Yield)</span>
                <input
                  type="number"
                  min={0.001}
                  step={1}
                  value={editingRecipe.yield_quantity}
                  onChange={(e) =>
                    setEditingRecipe({
                      ...editingRecipe,
                      yield_quantity: Math.max(0.001, Number(e.target.value) || 1),
                      bakers_dough: editingRecipe.bakers_dough
                        ? {
                            ...editingRecipe.bakers_dough,
                            measured_yield_g: Math.max(1, Number(e.target.value) || 1),
                          }
                        : undefined,
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Unidad de Rendimiento</span>
                <select
                  value={editingRecipe.yield_unit}
                  onChange={(e) =>
                    setEditingRecipe({ ...editingRecipe, yield_unit: e.target.value as UnitCode })
                  }
                >
                  {ALL_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
              {editingRecipe.recipe_type === 'product' && (
                <label className="field">
                  <span>Food Cost Objetivo (%)</span>
                  <input
                    type="number"
                    min={5}
                    max={95}
                    value={editingRecipe.target_food_cost_pct ?? state.defaultTargetFoodCostPct}
                    onChange={(e) =>
                      setEditingRecipe({
                        ...editingRecipe,
                        target_food_cost_pct: Math.max(5, Math.min(95, Number(e.target.value) || 30)),
                      })
                    }
                  />
                </label>
              )}
            </div>

            {isDoughMode && editingRecipe.bakers_dough ? (
              <>
              <div className="builder-grid">
                <label className="field">
                  <span>Harina Total del Batch (g)</span>
                  <input
                    type="number"
                    min={100}
                    step={100}
                    value={editingRecipe.bakers_dough.total_flour_g ?? 1000}
                    onChange={(e) =>
                      setEditingRecipe({
                        ...editingRecipe,
                        bakers_dough: {
                          ...editingRecipe.bakers_dough!,
                          total_flour_g: Math.max(10, Number(e.target.value) || 1000),
                        },
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>Hidratación Total (% agua s/ harina)</span>
                  <input
                    type="number"
                    min={30}
                    max={250}
                    step={0.5}
                    value={editingRecipe.bakers_dough.hydration_pct}
                    onChange={(e) =>
                      setEditingRecipe({
                        ...editingRecipe,
                        bakers_dough: {
                          ...editingRecipe.bakers_dough!,
                          hydration_pct: Math.max(0, Number(e.target.value) || 68),
                        },
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>Sal (% sobre harina)</span>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    step={0.1}
                    value={editingRecipe.bakers_dough.salt_pct ?? 2.5}
                    onChange={(e) =>
                      setEditingRecipe({
                        ...editingRecipe,
                        bakers_dough: {
                          ...editingRecipe.bakers_dough!,
                          salt_pct: Math.max(0, Number(e.target.value) || 0),
                        },
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>Base de rendimiento</span>
                  <select
                    value={editingRecipe.bakers_dough.yield_basis}
                    onChange={(e) =>
                      setEditingRecipe({
                        ...editingRecipe,
                        bakers_dough: {
                          ...editingRecipe.bakers_dough!,
                          yield_basis: e.target.value as NonNullable<Recipe['bakers_dough']>['yield_basis'],
                        },
                      })
                    }
                  >
                    <option value="measured_yield">Rendimiento final medido</option>
                    <option value="flour_plus_water">Harina + agua</option>
                    <option value="total_formula">Fórmula completa</option>
                  </select>
                </label>
                {editingRecipe.bakers_dough.yield_basis === 'measured_yield' && (
                  <label className="field">
                    <span>Rendimiento medido (g)</span>
                    <input
                      type="number"
                      min={1}
                      value={editingRecipe.bakers_dough.measured_yield_g ?? editingRecipe.yield_quantity}
                      onChange={(e) =>
                        setEditingRecipe({
                          ...editingRecipe,
                          yield_quantity: Math.max(1, Number(e.target.value) || 1),
                          bakers_dough: {
                            ...editingRecipe.bakers_dough!,
                            measured_yield_g: Math.max(1, Number(e.target.value) || 1),
                          },
                        })
                      }
                    />
                  </label>
                )}
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <strong>Mezcla de harinas</strong>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() =>
                      setEditingRecipe({
                        ...editingRecipe,
                        bakers_dough: {
                          ...editingRecipe.bakers_dough!,
                          flours: [
                            ...editingRecipe.bakers_dough!.flours,
                            { ingredient_id: state.catalog.ingredients[0]?.id ?? '', share_pct: 0 },
                          ],
                        },
                      })
                    }
                    disabled={state.catalog.ingredients.length === 0}
                  >
                    + Agregar harina
                  </button>
                </div>
                {(editingRecipe.bakers_dough.flours ?? []).map((flour, index) => (
                  <div className="comp-row" key={index}>
                    <select
                      value={flour.ingredient_id}
                      onChange={(e) => {
                        const flours = [...editingRecipe.bakers_dough!.flours];
                        flours[index] = { ...flour, ingredient_id: e.target.value };
                        setEditingRecipe({ ...editingRecipe, bakers_dough: { ...editingRecipe.bakers_dough!, flours } });
                      }}
                    >
                      {state.catalog.ingredients.filter((item) => item.base_dimension === 'mass').map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                    <input
                      aria-label="Porcentaje de harina"
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={flour.share_pct ?? 0}
                      onChange={(e) => {
                        const flours = [...editingRecipe.bakers_dough!.flours];
                        flours[index] = { ...flour, share_pct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) };
                        setEditingRecipe({ ...editingRecipe, bakers_dough: { ...editingRecipe.bakers_dough!, flours } });
                      }}
                    />
                    <span>%</span>
                    <button
                      type="button"
                      className="btn btn--sm btn--danger"
                      disabled={editingRecipe.bakers_dough!.flours.length <= 1}
                      onClick={() => setEditingRecipe({
                        ...editingRecipe,
                        bakers_dough: {
                          ...editingRecipe.bakers_dough!,
                          flours: editingRecipe.bakers_dough!.flours.filter((_, i) => i !== index),
                        },
                      })}
                    >✕</button>
                  </div>
                ))}
                <small>
                  Total de mezcla: {formatDecimal(editingRecipe.bakers_dough.flours.reduce((sum, flour) => sum + (flour.share_pct ?? 0), 0), 1)}%
                  {Math.abs(editingRecipe.bakers_dough.flours.reduce((sum, flour) => sum + (flour.share_pct ?? 0), 0) - 100) > 0.01
                    ? ' · La suma debe ser 100%.'
                    : ' · Correcto.'}
                </small>
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <strong>Prefermento</strong>
                <div className="builder-grid">
                  <label className="field">
                    <span>Tipo</span>
                    <select
                      value={editingRecipe.bakers_dough.biga ? 'biga' : editingRecipe.bakers_dough.poolish ? 'poolish' : 'none'}
                      onChange={(e) => {
                        const current = editingRecipe.bakers_dough!;
                        const preferment = {
                          flour_pct: 25,
                          water_pct: e.target.value === 'poolish' ? 100 : 50,
                          yeast_pct: 0.5,
                          yeast_ingredient_id: current.yeast_ingredient_id ?? state.catalog.ingredients.find((item) => /levadura|yeast/i.test(item.name))?.id ?? state.catalog.ingredients[0]?.id ?? '',
                        };
                        setEditingRecipe({
                          ...editingRecipe,
                          bakers_dough: {
                            ...current,
                            biga: e.target.value === 'biga' ? preferment : undefined,
                            poolish: e.target.value === 'poolish' ? preferment : undefined,
                          },
                        });
                      }}
                    >
                      <option value="none">Sin prefermento</option>
                      <option value="biga">Biga</option>
                      <option value="poolish">Poolish</option>
                    </select>
                  </label>
                  {(editingRecipe.bakers_dough.biga || editingRecipe.bakers_dough.poolish) && (() => {
                    const key = editingRecipe.bakers_dough!.biga ? 'biga' : 'poolish';
                    const spec = editingRecipe.bakers_dough![key]!;
                    return (
                      <>
                        <label className="field">
                          <span>Harina del prefermento (%)</span>
                          <input type="number" min={0} max={100} step={0.1} value={spec.flour_pct}
                            onChange={(e) => setEditingRecipe({ ...editingRecipe, bakers_dough: {
                              ...editingRecipe.bakers_dough!, [key]: { ...spec, flour_pct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) },
                            }})}
                          />
                        </label>
                        <label className="field">
                          <span>Hidratación del prefermento (%)</span>
                          <input type="number" min={0} max={200} step={0.1} value={spec.water_pct}
                            onChange={(e) => setEditingRecipe({ ...editingRecipe, bakers_dough: {
                              ...editingRecipe.bakers_dough!, [key]: { ...spec, water_pct: Math.max(0, Math.min(200, Number(e.target.value) || 0)) },
                            }})}
                          />
                        </label>
                        <label className="field">
                          <span>Levadura del prefermento (%)</span>
                          <input type="number" min={0} max={20} step={0.01} value={spec.yeast_pct}
                            onChange={(e) => setEditingRecipe({ ...editingRecipe, bakers_dough: {
                              ...editingRecipe.bakers_dough!, [key]: { ...spec, yeast_pct: Math.max(0, Number(e.target.value) || 0) },
                            }})}
                          />
                        </label>
                        <label className="field">
                          <span>Insumo de levadura</span>
                          <select value={spec.yeast_ingredient_id}
                            onChange={(e) => setEditingRecipe({ ...editingRecipe, bakers_dough: {
                              ...editingRecipe.bakers_dough!, [key]: { ...spec, yeast_ingredient_id: e.target.value },
                            }})}
                          >
                            {state.catalog.ingredients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                          </select>
                        </label>
                      </>
                    );
                  })()}
                </div>
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <strong>Otros ingredientes de la masa</strong>
                <div className="builder-grid">
                  {([
                    ['direct_yeast_pct', 'yeast_ingredient_id', 'Levadura directa (%)'],
                    ['salt_pct', 'salt_ingredient_id', 'Sal (%)'],
                    ['sugar_pct', 'sugar_ingredient_id', 'Azúcar (%)'],
                    ['oil_pct', 'oil_ingredient_id', 'Aceite (%)'],
                  ] as const).map(([pctKey, ingredientKey, label]) => (
                    <div className="field" key={pctKey}>
                      <label>{label}</label>
                      <input type="number" min={0} max={100} step={0.1}
                        value={editingRecipe.bakers_dough![pctKey] ?? 0}
                        onChange={(e) => setEditingRecipe({ ...editingRecipe, bakers_dough: {
                          ...editingRecipe.bakers_dough!, [pctKey]: Math.max(0, Number(e.target.value) || 0),
                        }})}
                      />
                      <select value={editingRecipe.bakers_dough![ingredientKey] ?? ''}
                        onChange={(e) => setEditingRecipe({ ...editingRecipe, bakers_dough: {
                          ...editingRecipe.bakers_dough!, [ingredientKey]: e.target.value,
                        }})}
                      >
                        <option value="">Seleccionar insumo</option>
                        {state.catalog.ingredients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </div>
                  ))}
                  <label className="field">
                    <span>Insumo de agua</span>
                    <select value={editingRecipe.bakers_dough.water_ingredient_id ?? ''}
                      onChange={(e) => setEditingRecipe({ ...editingRecipe, bakers_dough: {
                        ...editingRecipe.bakers_dough!, water_ingredient_id: e.target.value,
                      }})}
                    >
                      <option value="">Seleccionar insumo</option>
                      {state.catalog.ingredients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              </>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong>Componentes de la Receta (Insumos y Subrecetas)</strong>
                  <button
                    type="button"
                    className="btn btn--sm btn--primary"
                    onClick={() => {
                      const nextComps: RecipeComponent[] = [
                        ...(editingRecipe.components ?? []),
                        {
                          component_type: 'ingredient',
                          ingredient_id: state.catalog.ingredients[0]?.id ?? '',
                          quantity: 100,
                          unit: 'g',
                        },
                      ];
                      setEditingRecipe({ ...editingRecipe, components: nextComps });
                    }}
                  >
                    + Agregar Componente
                  </button>
                </div>

                {(editingRecipe.components ?? []).map((comp, idx) => (
                  <div className="comp-row" key={idx}>
                    <select
                      value={comp.component_type}
                      onChange={(e) => {
                        const newType = e.target.value as 'ingredient' | 'subrecipe';
                        const firstSub = state.catalog.recipes.find(
                          (r) => r.recipe_type === 'subrecipe' && r.id !== editingRecipe.id
                        );
                        const updated = [...(editingRecipe.components ?? [])];
                        updated[idx] =
                          newType === 'ingredient'
                            ? {
                                component_type: 'ingredient',
                                ingredient_id: state.catalog.ingredients[0]?.id ?? '',
                                quantity: comp.quantity,
                                unit: 'g',
                              }
                            : {
                                component_type: 'subrecipe',
                                recipe_id: firstSub?.id ?? '',
                                quantity: comp.quantity,
                                unit: firstSub?.yield_unit ?? 'g',
                              };
                        setEditingRecipe({ ...editingRecipe, components: updated });
                      }}
                    >
                      <option value="ingredient">Insumo</option>
                      <option value="subrecipe">Subreceta</option>
                    </select>

                    {comp.component_type === 'ingredient' ? (
                      <select
                        value={comp.ingredient_id ?? ''}
                        onChange={(e) => {
                          const updated = [...(editingRecipe.components ?? [])];
                          updated[idx] = { ...comp, ingredient_id: e.target.value };
                          setEditingRecipe({ ...editingRecipe, components: updated });
                        }}
                      >
                        {state.catalog.ingredients.map((ing) => (
                          <option key={ing.id} value={ing.id}>
                            {ing.name} (base: {ing.base_unit})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={comp.recipe_id ?? ''}
                        onChange={(e) => {
                          const updated = [...(editingRecipe.components ?? [])];
                          updated[idx] = { ...comp, recipe_id: e.target.value };
                          setEditingRecipe({ ...editingRecipe, components: updated });
                        }}
                      >
                        {state.catalog.recipes
                          .filter((r) => r.recipe_type === 'subrecipe' && r.id !== editingRecipe.id)
                          .map((sub) => (
                            <option key={sub.id} value={sub.id}>
                              {sub.name} (rinde en {sub.yield_unit})
                            </option>
                          ))}
                      </select>
                    )}

                    <input
                      type="number"
                      min={0.001}
                      step={10}
                      value={comp.quantity}
                      onChange={(e) => {
                        const updated = [...(editingRecipe.components ?? [])];
                        updated[idx] = { ...comp, quantity: Math.max(0, Number(e.target.value) || 0) };
                        setEditingRecipe({ ...editingRecipe, components: updated });
                      }}
                    />

                    <select
                      value={comp.unit}
                      onChange={(e) => {
                        const updated = [...(editingRecipe.components ?? [])];
                        updated[idx] = { ...comp, unit: e.target.value as UnitCode };
                        setEditingRecipe({ ...editingRecipe, components: updated });
                      }}
                    >
                      {ALL_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      className="btn btn--sm btn--danger"
                      onClick={() => {
                        const updated = (editingRecipe.components ?? []).filter((_, i) => i !== idx);
                        setEditingRecipe({ ...editingRecipe, components: updated });
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button type="button" className="btn" onClick={() => setEditingRecipe(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn--primary" onClick={saveEditedRecipe}>
                💾 Validar y Guardar Receta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
