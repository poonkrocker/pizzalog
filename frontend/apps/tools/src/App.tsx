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
    'ingredients' | 'subrecipes' | 'recipes' | 'expenses' | 'sales' | 'snapshots'
  >('recipes');
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
    const newSnaps = products.map((r) =>
      createCostSnapshot(state.catalog, r.id, {
        target_food_cost_pct: r.target_food_cost_pct ?? state.defaultTargetFoodCostPct,
        rounding_increment: state.defaultRoundingIncrement,
        rounding_mode: 'ceil',
        selling_price: state.productSalesMap?.[r.id]?.sellingPrice || undefined,
        packaging_cost: state.defaultPackagingCost,
        channel_fee_pct: state.defaultChannelFeePct,
      })
    );
    setState((prev) => ({
      ...prev,
      snapshots: [...newSnaps, ...prev.snapshots].slice(0, 30),
    }));
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

  const netOperatingProfit = monthlySummary.totalContribution - totalMonthlyExpenses;
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
      </nav>

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
              <div className="kpi-box__label">Facturación Mensual Proyectada</div>
              <div className="kpi-box__value">
                {state.currency} {formatDecimal(monthlySummary.totalRevenue, 0)}
              </div>
              <div className="kpi-box__sub">
                CMV Ingredientes: {state.currency} {formatDecimal(monthlySummary.totalCogs, 0)}
              </div>
            </div>
            <div className="kpi-box">
              <div className="kpi-box__label">Contribución Marginal Mensual</div>
              <div className="kpi-box__value">
                {state.currency} {formatDecimal(monthlySummary.totalContribution, 0)}
              </div>
              <div className="kpi-box__sub">
                Margen Bruto Ponderado: {formatDecimal(monthlySummary.weightedMarginPct, 1)}%
              </div>
            </div>
            <div className="kpi-box kpi-box--highlight">
              <div className="kpi-box__label">Ganancia Neta Real (Tras Alquiler y Costos Fijos)</div>
              <div
                className="kpi-box__value"
                style={{ color: netOperatingProfit >= 0 ? '#4ade80' : '#f87171' }}
              >
                {state.currency} {formatDecimal(netOperatingProfit, 0)}
              </div>
              <div className="kpi-box__sub">
                Descontando {state.currency} {formatDecimal(totalMonthlyExpenses, 0)} de gastos fijos (Pestaña 4)
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
              <div className="kpi-box__label">Venta de Equilibrio (Break-Even)</div>
              <div className="kpi-box__value">
                {state.currency} {formatDecimal(breakEvenRevenue, 0)}
              </div>
              <div className="kpi-box__sub">
                Al {formatDecimal(monthlySummary.weightedMarginPct, 1)}% de margen bruto ponderado
              </div>
            </div>
            <div className="kpi-box kpi-box--highlight">
              <div className="kpi-box__label">Resultado Operativo Neto (EBITDA)</div>
              <div
                className="kpi-box__value"
                style={{ color: netOperatingProfit >= 0 ? '#4ade80' : '#f87171' }}
              >
                {state.currency} {formatDecimal(netOperatingProfit, 0)}
              </div>
              <div className="kpi-box__sub">
                {monthlySummary.totalRevenue > 0
                  ? `${formatDecimal((netOperatingProfit / monthlySummary.totalRevenue) * 100, 1)}% neto sobre facturación`
                  : 'Cargá unidades en la Pestaña 3'}
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
                  <span>Insumo Harina Principal</span>
                  <select
                    value={editingRecipe.bakers_dough.flours[0]?.ingredient_id ?? ''}
                    onChange={(e) =>
                      setEditingRecipe({
                        ...editingRecipe,
                        bakers_dough: {
                          ...editingRecipe.bakers_dough!,
                          flours: [{ ingredient_id: e.target.value, share_pct: 100 }],
                        },
                      })
                    }
                  >
                    {state.catalog.ingredients.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
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
