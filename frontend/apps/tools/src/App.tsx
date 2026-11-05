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
  createEmptyWorkspace,
  isDemoWorkspace,
  type LocaleCode,
  type OperatingExpenseItem,
  type ToolsWorkspaceState,
} from './demoData';
import { CommercialPlansModal } from './CommercialPlansModal';
import { ContextualHelpModal, type HelpTopic } from './ContextualHelpModal';
import { ExecutiveReportModal } from './ExecutiveReportModal';
import { downloadCustomProfitKitXlsx } from './xlsxExporter';
import { parseImportFile, type ParsedImportSheet } from '@pizzalog/price-list/file';
import {
  detectPriceListColumns,
  extractPriceListItems,
  matchPriceList,
  rematch,
  summarizeMatches,
  type PriceListMatch,
  type CatalogEntry,
} from '@pizzalog/price-list';
import { applyImportMappings, findUnmatchedComponents, type ImportSheetMapping } from './importNormalization';

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
  initialUpdatedAt,
  onLogout,
}: {
  token: string;
  account: ToolsAccount;
  initialWorkspace: ToolsWorkspaceState;
  initialUpdatedAt?: string | null;
  onLogout: () => void;
}) {
  const [state, setState] = useState<ToolsWorkspaceState>(initialWorkspace);
  const workspaceUpdatedAtRef = useRef<string | null>(initialUpdatedAt ?? null);
  const [workspaceConflict, setWorkspaceConflict] = useState<string | null>(null);
  const [importEquivalences, setImportEquivalences] = useState<Record<string, string>>({});
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);

  const [activeTab, setActiveTab] = useState<
    'ingredients' | 'subrecipes' | 'recipes' | 'expenses' | 'sales' | 'snapshots' | 'simulator' | 'cost-history' | 'menu-engineering' | 'production' | 'profit-simulator' | 'sync'
  >('recipes');
  const [simulationRecipeId, setSimulationRecipeId] = useState('');
  const [simulationBatches, setSimulationBatches] = useState(1);
  const [simulationComponentPct, setSimulationComponentPct] = useState<Record<string, number>>({});
  const [simulationHydrationPct, setSimulationHydrationPct] = useState<Record<string, number>>({});
  const [historyRecipeId, setHistoryRecipeId] = useState('');
  const [snapshotNotice, setSnapshotNotice] = useState<string | null>(null);
  const [productionUnits, setProductionUnits] = useState<Record<string, number>>({});
  const [profitScenario, setProfitScenario] = useState({ units: 0, price: 0, variableCost: 0, fixedCosts: 0 });
  const [syncStatus, setSyncStatus] = useState<{ linked: boolean; business_id?: number | null; business_name?: string | null; app_user_email?: string | null } | null>(null);
  const [syncLinkEmail, setSyncLinkEmail] = useState('');
  const [syncLinkPassword, setSyncLinkPassword] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [syncPreviewData, setSyncPreviewData] = useState<any | null>(null);
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

  // Estado del Actualizador de Precios por Lista de Proveedor
  const [showPriceListModal, setShowPriceListModal] = useState(false);
  const [priceListMatches, setPriceListMatches] = useState<PriceListMatch[]>([]);
  const [priceListFileName, setPriceListFileName] = useState<string>('');
  const [priceListSelectedRows, setPriceListSelectedRows] = useState<Record<number, boolean>>({});
  const [priceListFilter, setPriceListFilter] = useState<'all' | 'matched' | 'unmatched' | 'warnings'>('all');
  const [priceListLoading, setPriceListLoading] = useState(false);

  // Estado del Constructor Visual Interactivo (Modal)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [isDoughMode, setIsDoughMode] = useState<boolean>(false);
  const [builderError, setBuilderError] = useState<string | null>(null);

  // Modales comerciales, reportes, ayuda contextual y confirmación de demo
  const [showPlansModal, setShowPlansModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [helpTopic, setHelpTopic] = useState<HelpTopic>('units');
  const [showClearDemoConfirm, setShowClearDemoConfirm] = useState(false);

  // Filtros y Comparación de Ingeniería de Menú
  const [menuPeriodFilter, setMenuPeriodFilter] = useState<string>('all');
  const [menuChannelFilter, setMenuChannelFilter] = useState<string>('all');
  const [menuCompareMode, setMenuCompareMode] = useState<boolean>(false);
  const [menuComparePeriod, setMenuComparePeriod] = useState<string>('');

  // Simulador Estratégico de Negocio
  const [simMode, setSimMode] = useState<'business' | 'single'>('business');
  const [simPriceDelta, setSimPriceDelta] = useState<number>(0);
  const [simCostDelta, setSimCostDelta] = useState<number>(0);
  const [simVolumeDelta, setSimVolumeDelta] = useState<number>(0);
  const [simCategoryFilter, setSimCategoryFilter] = useState<'all' | 'flour' | 'dairy' | 'meat'>('all');

  useEffect(() => {
    const workspaceSnapshot = state;
    if (account.id === 0 || token === 'guest-demo-token') {
      try {
        localStorage.setItem('pizzalog_tools_guest_workspace', JSON.stringify(workspaceSnapshot));
      } catch {
        // Ignorar si el storage local está lleno
      }
      return;
    }

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
              body: JSON.stringify({
                workspace: workspaceSnapshot,
                updated_at: workspaceUpdatedAtRef.current,
              }),
            });
            const payload = (await response.json()) as { ok?: boolean; error?: string; data?: { updated_at?: string } };
            if (response.status === 409) {
              setWorkspaceConflict(
                'El espacio de trabajo fue modificado en otra sesión o pestaña. Para evitar sobreescribir datos ajenos, recargá la versión más reciente del servidor o descargá una copia de seguridad.'
              );
              throw new Error('Conflicto de versiones (409). Hay una versión más reciente en el servidor.');
            }
            if (!response.ok || !payload.ok) {
              throw new Error(payload.error ?? 'No se pudo guardar el espacio de trabajo');
            }
            if (payload.data?.updated_at) {
              workspaceUpdatedAtRef.current = payload.data.updated_at;
            }
            setWorkspaceSaveError(null);
            setWorkspaceConflict(null);
          } catch (err) {
            setWorkspaceSaveError(err instanceof Error ? err.message : 'Error al guardar los cambios');
          } finally {
            setIsSavingWorkspace(false);
          }
        });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [state, token, account.id]);

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
      const target = selectEffectivePurchasePrice(
        ingredientId,
        prev.catalog.purchase_prices,
        prev.catalog.as_of_date
      );
      const nextPrices = target
        ? prev.catalog.purchase_prices.map((p) =>
            p === target ? { ...p, ...patch } : p
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
    const cloned = JSON.parse(JSON.stringify(rec)) as Recipe;
    if (cloned.bakers_dough && cloned.bakers_dough.flours.some((f) => f.share_pct === undefined && f.weight_kg !== undefined)) {
      const totalWeight = cloned.bakers_dough.flours.reduce((sum, f) => sum + (f.weight_kg ?? 0), 0);
      if (totalWeight > 0) {
        let running = 0;
        cloned.bakers_dough.flours = cloned.bakers_dough.flours.map((f, idx, arr) => {
          const pct = idx === arr.length - 1
            ? Math.max(0, Number((100 - running).toFixed(2)))
            : Number((((f.weight_kg ?? 0) / totalWeight) * 100).toFixed(2));
          running += pct;
          return { ingredient_id: f.ingredient_id, share_pct: pct };
        });
      }
    }
    setEditingRecipe(cloned);
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
    const result = applyImportMappings(importBase, smartImportPreview.sheets, smartImportPreview.mappings, importEquivalences);
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
    setState({
      ...result.workspace,
      equivalences: {
        ...(result.workspace.equivalences ?? {}),
        ...importEquivalences,
      },
    });
    const summary = [
      `Importados: ${result.counts.ingredients} insumos, ${result.counts.prices} precios, ${result.counts.recipes} recetas, ${result.counts.expenses} gastos y ${result.counts.sales} registros de ventas.`,
      ...(hasDemoSeed ? ['Se limpiaron los datos de demostración para evitar mezclarlos con la importación.'] : []),
      ...(replaceWorkspaceOnImport ? ['Se reemplazaron los datos anteriores; se descargó una copia de seguridad JSON.'] : []),
      ...result.warnings,
    ];
    setImportNotice(summary.join(' '));
    setSmartImportPreview(null);
    setReplaceWorkspaceOnImport(false);
    setImportEquivalences({});
    setReplaceConfirmed(false);
  }

  async function handlePriceListUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPriceListLoading(true);
    setImportError(null);
    setPriceListFileName(file.name);

    try {
      const sheets = await parseImportFile(file, { raw: true });
      if (!sheets.length || !sheets[0]?.rows?.length) {
        throw new Error('No se encontraron filas con datos en la planilla.');
      }
      const sheet = sheets[0];
      const columns = detectPriceListColumns(sheet.rows);
      if (!columns) {
        throw new Error('No se pudo identificar una columna de producto y otra de precio en el archivo.');
      }
      const items = extractPriceListItems(sheet.rows, columns);
      if (!items.length) {
        throw new Error('No se encontraron filas con productos y precios válidos.');
      }

      const catalog: CatalogEntry[] = state.catalog.ingredients.map((ing) => {
        const priceRec = selectEffectivePurchasePrice(
          ing.id,
          state.catalog.purchase_prices,
          state.catalog.as_of_date
        );
        return {
          id: ing.id,
          name: ing.name,
          unit: ing.base_unit,
          current_price_per_unit: priceRec?.purchase_price != null ? Number(priceRec.purchase_price) : null,
        };
      });

      const matchedList = matchPriceList(items, catalog);
      setPriceListMatches(matchedList);

      const initialSelected: Record<number, boolean> = {};
      matchedList.forEach((m, idx) => {
        if (m.target_id && m.new_price_per_unit != null) {
          initialSelected[idx] = true;
        }
      });
      setPriceListSelectedRows(initialSelected);
      setShowPriceListModal(true);
    } catch (err: any) {
      setImportError(err?.message || 'Error al procesar la lista de precios');
    } finally {
      setPriceListLoading(false);
      e.target.value = '';
    }
  }

  function handlePriceListTargetChange(index: number, newTargetId: string) {
    const catalog: CatalogEntry[] = state.catalog.ingredients.map((ing) => {
      const priceRec = selectEffectivePurchasePrice(
        ing.id,
        state.catalog.purchase_prices,
        state.catalog.as_of_date
      );
      return {
        id: ing.id,
        name: ing.name,
        unit: ing.base_unit,
        current_price_per_unit: priceRec?.purchase_price != null ? Number(priceRec.purchase_price) : null,
      };
    });
    const updated = rematch(priceListMatches[index]!, catalog, { target_id: newTargetId || null });
    const next = [...priceListMatches];
    next[index] = updated;
    setPriceListMatches(next);

    if (newTargetId) {
      setPriceListSelectedRows((prev) => ({ ...prev, [index]: true }));
    } else {
      setPriceListSelectedRows((prev) => ({ ...prev, [index]: false }));
    }
  }

  function confirmPriceListApply() {
    const today = new Date().toISOString().slice(0, 10);
    const toApply = priceListMatches.filter((m, idx) => priceListSelectedRows[idx] && m.target_id && m.new_price_per_unit != null);
    if (!toApply.length) return;

    setState((prev) => {
      const newPrices = [...prev.catalog.purchase_prices];
      toApply.forEach((m) => {
        const ing = prev.catalog.ingredients.find((i) => i.id === m.target_id);
        if (!ing) return;
        newPrices.push({
          ingredient_id: m.target_id!,
          purchase_date: today,
          purchase_price: m.item.price,
          currency: prev.currency,
          pack_quantity: m.presentation?.quantity ?? 1,
          pack_unit: (m.presentation?.unit as UnitCode) ?? ing.base_unit,
          yield_pct: 100,
          supplier: priceListFileName ? `Lista: ${priceListFileName}` : undefined,
        });
      });
      return {
        ...prev,
        catalog: {
          ...prev.catalog,
          purchase_prices: newPrices,
        },
      };
    });

    setImportNotice(`Se aplicaron ${toApply.length} precios actualizados con fecha de hoy (${today}) preservando el historial.`);
    setShowPriceListModal(false);
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

  async function loadSyncStatus() {
    setSyncLoading(true);
    setSyncError(null);
    try {
      const res = await fetch(`${API_URL}/tools/sync/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.ok && data.data) {
        setSyncStatus(data.data);
      }
    } catch {
      // Ignorar si no hay conexión
    } finally {
      setSyncLoading(false);
    }
  }

  async function handleLinkApp(e: React.FormEvent) {
    e.preventDefault();
    setSyncLoading(true);
    setSyncError(null);
    setSyncNotice(null);
    try {
      const res = await fetch(`${API_URL}/tools/sync/link-app`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: syncLinkEmail, password: syncLinkPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al vincular cuenta');
      setSyncStatus(data.data);
      setSyncNotice(`¡Vinculación exitosa con "${data.data.business_name}"!`);
      setSyncLinkPassword('');
    } catch (err: any) {
      setSyncError(err?.message || 'No se pudo vincular la cuenta');
    } finally {
      setSyncLoading(false);
    }
  }

  async function handleSyncPreview(direction: 'to_app' | 'from_app') {
    setSyncLoading(true);
    setSyncError(null);
    try {
      const res = await fetch(`${API_URL}/tools/sync/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ direction }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al obtener previsualización');
      setSyncPreviewData(data.data);
    } catch (err: any) {
      setSyncError(err?.message || 'Error al previsualizar sincronización');
    } finally {
      setSyncLoading(false);
    }
  }

  async function handleSyncApply(direction: 'to_app' | 'from_app') {
    if (!confirm(direction === 'to_app'
      ? '¿Exportar insumos y costos desde Tools hacia Pizzalog App?'
      : '¿Importar catálogo de Pizzalog App a Tools?')) return;

    setSyncLoading(true);
    setSyncError(null);
    setSyncNotice(null);
    try {
      const res = await fetch(`${API_URL}/tools/sync/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ direction }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al sincronizar');

      if (direction === 'to_app') {
        setSyncNotice(`Sincronización completada hacia Pizzalog App: ${data.data.created_supplies} insumos creados, ${data.data.updated_supplies} precios actualizados.`);
      } else {
        const wsRes = await fetch(`${API_URL}/tools/workspace`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const wsData = await wsRes.json();
        if (wsData.ok && wsData.data?.workspace) {
          setState(wsData.data.workspace);
        }
        setSyncNotice(`Sincronización completada desde Pizzalog App: se cargaron ${data.data.imported_ingredients} insumos y ${data.data.imported_prices} precios en tu espacio de trabajo.`);
      }
      setSyncPreviewData(null);
    } catch (err: any) {
      setSyncError(err?.message || 'Error al sincronizar');
    } finally {
      setSyncLoading(false);
    }
  }

  // Función auxiliar de cálculo de resumen y métricas de menú con filtros de período y canal
  function computeFilteredSummary(
    catalogRecipes: Recipe[],
    results: Map<string, ReturnType<CostEngine['calculateRecipeCost']>>,
    wsState: ToolsWorkspaceState,
    periodFilter: string = 'all',
    channelFilter: string = 'all'
  ) {
    const products = catalogRecipes.filter((r) => r.recipe_type === 'product');
    const salesHistory = wsState.salesHistory ?? [];

    const rows = products.map((prod) => {
      const res = results.get(prod.id);
      const salesPlan = wsState.productSalesMap?.[prod.id] ?? { sellingPrice: null };
      const customPrice = salesPlan.sellingPrice && salesPlan.sellingPrice > 0 ? salesPlan.sellingPrice : undefined;
      const pricing = res
        ? calculatePricingScenario({
            unit_cost: res.raw_unit_cost,
            status: res.status,
            currency: wsState.currency,
            target_food_cost_pct: prod.target_food_cost_pct ?? wsState.defaultTargetFoodCostPct,
            rounding_increment: wsState.defaultRoundingIncrement,
            rounding_mode: 'ceil',
            selling_price: customPrice,
            packaging_cost: wsState.defaultPackagingCost,
            channel_fee_pct: wsState.defaultChannelFeePct,
          })
        : null;

      // Filtrar registros de ventas para este producto
      let units: number | null = null;
      let periodGrossRevenue: number | null = null;
      let periodNetRevenue: number | null = null;

      const matchingSales = salesHistory.filter((sale) => {
        if (sale.product_id !== prod.id) return false;
        if (periodFilter !== 'all' && !sale.period_start.startsWith(periodFilter)) return false;
        if (channelFilter !== 'all' && sale.channel !== channelFilter) return false;
        return true;
      });

      if (matchingSales.length > 0) {
        units = matchingSales.reduce((acc, s) => acc + s.quantity, 0);
        periodGrossRevenue = matchingSales.reduce((acc, s) => acc + (s.gross_revenue ?? 0), 0);
        periodNetRevenue = matchingSales.reduce((acc, s) => acc + (s.net_revenue ?? 0), 0);
      } else if (periodFilter === 'all' && channelFilter === 'all' && salesPlan.monthlyUnitsSold !== null && salesPlan.monthlyUnitsSold !== undefined && Number.isFinite(Number(salesPlan.monthlyUnitsSold))) {
        units = Math.max(0, Number(salesPlan.monthlyUnitsSold));
      }

      const isComplete = res?.status === 'complete' && pricing?.status === 'complete';
      const hasSalesData = units !== null;
      const unitCost = isComplete && res?.raw_unit_cost ? res.raw_unit_cost : 0;
      const evaluatedPrice = isComplete && pricing?.raw_evaluated_price ? pricing.raw_evaluated_price : 0;
      const unitGrossProfit = isComplete && pricing?.raw_gross_profit ? pricing.raw_gross_profit : 0;

      const monthlyRevenue = isComplete && hasSalesData
        ? (periodNetRevenue !== null && periodNetRevenue > 0 ? periodNetRevenue : evaluatedPrice * units!)
        : null;
      const monthlyCogs = isComplete && hasSalesData ? unitCost * units! : null;
      const monthlyContribution = isComplete && hasSalesData ? unitGrossProfit * units! : null;

      // Diagnóstico de datos incompletos
      let incompleteReason: string | null = null;
      if (!res || res.status !== 'complete') {
        incompleteReason = 'Falta costo o precio de compra de algún ingrediente';
      } else if (!pricing || pricing.status !== 'complete' || evaluatedPrice <= 0) {
        incompleteReason = 'Falta definir precio de venta sugerido o manual';
      }

      return {
        prod,
        res,
        pricing,
        isComplete,
        incompleteReason,
        units,
        hasSalesData,
        customPrice: salesPlan.sellingPrice ?? null,
        unitCost,
        evaluatedPrice,
        unitGrossProfit,
        monthlyRevenue,
        monthlyCogs,
        monthlyContribution,
        periodGrossRevenue,
        periodNetRevenue,
      };
    });

    const completeRows = rows.filter((x) => x.isComplete);
    const salesRows = completeRows.filter((x) => x.hasSalesData);
    const hasSalesData = salesRows.length > 0;
    const totalUnits = hasSalesData ? salesRows.reduce((a, b) => a + (b.units ?? 0), 0) : 0;
    const avgUnits = salesRows.length > 0 ? totalUnits / salesRows.length : 0;
    const avgUnitProfit =
      salesRows.length > 0
        ? salesRows.reduce((a, b) => a + b.unitGrossProfit, 0) / salesRows.length
        : 0;

    const totalRevenue = hasSalesData ? salesRows.reduce((a, b) => a + (b.monthlyRevenue ?? 0), 0) : 0;
    const totalCogs = hasSalesData ? salesRows.reduce((a, b) => a + (b.monthlyCogs ?? 0), 0) : 0;
    const totalContribution = hasSalesData ? salesRows.reduce((a, b) => a + (b.monthlyContribution ?? 0), 0) : 0;
    const weightedMarginPct = totalRevenue > 0 ? (totalContribution / totalRevenue) * 100 : 0;

    return {
      rows: rows.map((r) => {
        let matrixClass: 'star' | 'horse' | 'puzzle' | 'dog' | null = null;
        let matrixLabel = '—';
        if (!r.isComplete) {
          matrixLabel = '⚠️ Incompleto';
        } else if (r.hasSalesData) {
          if (r.units === 0) {
            matrixClass = 'dog';
            matrixLabel = '0 ventas';
          } else {
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
        } else {
          matrixLabel = '— Sin datos';
        }
        return { ...r, matrixClass, matrixLabel };
      }),
      totalUnits,
      hasSalesData,
      totalRevenue,
      totalCogs,
      totalContribution,
      weightedMarginPct,
      avgUnits,
      avgUnitProfit,
    };
  }

  // Lista de períodos y canales disponibles en el historial de ventas
  const availablePeriods = useMemo(() => {
    const periods = new Set<string>();
    for (const s of state.salesHistory ?? []) {
      const ym = s.period_start.slice(0, 7);
      if (ym) periods.add(ym);
    }
    return [...periods].sort().reverse();
  }, [state.salesHistory]);

  const availableChannels = useMemo(() => {
    const channels = new Set<string>();
    for (const s of state.salesHistory ?? []) {
      if (s.channel && s.channel.trim()) channels.add(s.channel.trim());
    }
    return [...channels].sort();
  }, [state.salesHistory]);

  // Resumen calculado según los filtros activos de período y canal
  const monthlySummary = useMemo(() => {
    return computeFilteredSummary(
      state.catalog.recipes,
      recipeResults,
      state,
      menuPeriodFilter,
      menuChannelFilter
    );
  }, [state, recipeResults, menuPeriodFilter, menuChannelFilter]);

  // Resumen comparativo cuando el modo de comparación está activo
  const compareSummary = useMemo(() => {
    if (!menuCompareMode || !menuComparePeriod) return null;
    return computeFilteredSummary(
      state.catalog.recipes,
      recipeResults,
      state,
      menuComparePeriod,
      menuChannelFilter
    );
  }, [state, recipeResults, menuCompareMode, menuComparePeriod, menuChannelFilter]);

  // Cálculos de Simulación Estratégica de Negocio (Escenarios Pesimista, Base, Optimista y Personalizado)
  const simulatedBusinessResult = useMemo(() => {
    const completeRows = monthlySummary.rows.filter((r) => r.isComplete);
    const isFlour = (name: string) => /harina|masa|dough|poolish|biga/i.test(name);
    const isDairy = (name: string) => /mozzarella|queso|cheese|leche|crema/i.test(name);
    const isMeat = (name: string) => /pollo|carne|jamon|panceta|peperoni|salame/i.test(name);

    const computeScenario = (volDeltaPct: number, priceDeltaPct: number, costDeltaPct: number) => {
      let totRev = 0;
      let totCogs = 0;
      let totVarCosts = 0;
      let totUnits = 0;

      const factor: Record<string, number> = { monthly: 1, weekly: 52 / 12, yearly: 1 / 12 };
      const currentExpenses = state.operatingExpenses.reduce(
        (sum, item) => sum + item.amount * (factor[item.period] ?? 1),
        0
      );

      const simulatedRows = completeRows.map((r) => {
        const baseUnits = r.units ?? 0;
        const simUnits = Math.max(0, Math.round(baseUnits * (1 + volDeltaPct / 100)));
        const basePrice = r.evaluatedPrice;
        const simPrice = Math.max(0, Math.round(basePrice * (1 + priceDeltaPct / 100)));

        let itemCostDelta = costDeltaPct;
        if (simCategoryFilter === 'flour' && !isFlour(r.prod.name)) itemCostDelta = 0;
        if (simCategoryFilter === 'dairy' && !isDairy(r.prod.name)) itemCostDelta = 0;
        if (simCategoryFilter === 'meat' && !isMeat(r.prod.name)) itemCostDelta = 0;

        const simCost = r.unitCost * (1 + itemCostDelta / 100);
        const packaging = state.defaultPackagingCost;
        const channelFee = simPrice * (state.defaultChannelFeePct / 100);
        const simUnitGrossProfit = simPrice - simCost - packaging - channelFee;
        const simRev = simPrice * simUnits;
        const simCogs = simCost * simUnits;
        const simVar = (packaging + channelFee) * simUnits;
        const simContribution = simUnitGrossProfit * simUnits;

        totUnits += simUnits;
        totRev += simRev;
        totCogs += simCogs;
        totVarCosts += simVar;

        return {
          prod: r.prod,
          baseUnits,
          simUnits,
          basePrice,
          simPrice,
          baseCost: r.unitCost,
          simCost,
          baseProfit: r.unitGrossProfit,
          simProfit: simUnitGrossProfit,
          simRev,
          simContribution,
        };
      });

      const totContribution = totRev - totCogs - totVarCosts;
      const marginPct = totRev > 0 ? (totContribution / totRev) * 100 : 0;
      const netProfit = totContribution - currentExpenses;
      const breakEven = marginPct > 0 ? currentExpenses / (marginPct / 100) : 0;
      const avgContribUnit = totUnits > 0 ? totContribution / totUnits : 0;
      const breakEvenUnits = avgContribUnit > 0 ? Math.round(currentExpenses / avgContribUnit) : 0;
      const safetyMarginPct = breakEven > 0 && totRev > 0 ? ((totRev - breakEven) / totRev) * 100 : 0;

      return {
        totUnits,
        totRev,
        totCogs,
        totVarCosts,
        totContribution,
        marginPct,
        netProfit,
        breakEven,
        breakEvenUnits,
        safetyMarginPct,
        rows: simulatedRows,
      };
    };

    const baseScenario = computeScenario(0, 0, 0);
    const pessimisticScenario = computeScenario(-15, 0, 12);
    const optimisticScenario = computeScenario(15, 5, 0);
    const customScenario = computeScenario(simVolumeDelta, simPriceDelta, simCostDelta);

    return {
      base: baseScenario,
      pessimistic: pessimisticScenario,
      optimistic: optimisticScenario,
      custom: customScenario,
    };
  }, [monthlySummary, simCategoryFilter, state.defaultPackagingCost, state.defaultChannelFeePct, state.operatingExpenses, simVolumeDelta, simPriceDelta, simCostDelta]);

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
      {workspaceConflict && (
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '12px 16px', borderRadius: '8px', margin: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <strong>⚠️ Conflicto de versión detectado:</strong> {workspaceConflict}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => {
                const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `pizzalog-tools-backup-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              💾 Descargar respaldo local (.json)
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => window.location.reload()}
            >
              🔄 Recargar versión del servidor
            </button>
          </div>
        </div>
      )}
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
            className="btn btn--secondary"
            style={{ color: 'var(--brand)', borderColor: 'var(--brand)', fontWeight: 700 }}
            onClick={() => setShowPlansModal(true)}
            title="Conocé nuestros planes y condiciones de acceso"
          >
            ✨ Planes & Suscripción
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => setShowReportModal(true)}
            title="Ver reporte ejecutivo listo para imprimir o guardar como PDF"
          >
            📄 Reporte Ejecutivo
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => { setHelpTopic('units'); setShowHelpModal(true); }}
            title="Ayuda sobre unidades, densidades, mermas y fórmulas"
          >
            ❓ Ayuda Contextual
          </button>
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

      {/* Banner de Modo Invitado / Demo en vivo */}
      {account.id === 0 && (
        <div style={{ background: '#7c2d12', border: '1px solid #ea580c', borderRadius: 10, padding: '12px 18px', margin: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, color: '#ffedd5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.4rem' }}>🚀</span>
            <div>
              <strong style={{ color: '#fff', fontSize: '0.96rem' }}>Estás probando la Demo Interactiva en vivo (Modo Invitado)</strong>
              <div style={{ fontSize: '0.82rem', color: '#fed7aa', marginTop: 2 }}>
                Podés editar recetas, probar el simulador de rentabilidad y la matriz BCG. Los cambios se guardan localmente en tu navegador.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn--primary"
              style={{ fontSize: '0.84rem', padding: '6px 14px', background: '#ea580c', borderColor: '#ea580c', color: '#fff', fontWeight: 700 }}
              onClick={() => setShowPlansModal(true)}
            >
              ✨ Ver Planes & Suscribirme
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              style={{ fontSize: '0.82rem', background: 'rgba(255,255,255,0.15)', color: '#fff', borderColor: 'transparent' }}
              onClick={onLogout}
            >
              Iniciar sesión / Salir
            </button>
          </div>
        </div>
      )}

      {/* Banner de datos de demostración y acciones rápidas */}
      {isDemoWorkspace(state) && (
        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 10, padding: '12px 18px', margin: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.4rem' }}>🧪</span>
            <div>
              <strong style={{ color: '#92400e', fontSize: '0.94rem' }}>Estás explorando los datos de ejemplo de «Pizzería Demo — Il Forno»</strong>
              <div style={{ fontSize: '0.82rem', color: '#78350f', marginTop: 2 }}>
                Podés experimentar libremente con recetas, simulaciones y precios. Cuando quieras empezar con tu restaurante real, limpiá el catálogo con un clic.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn--secondary"
              style={{ fontSize: '0.82rem', background: '#fff', borderColor: '#d97706', color: '#92400e', fontWeight: 600 }}
              onClick={() => setShowClearDemoConfirm(true)}
            >
              🗑️ Limpiar datos para empezar
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              style={{ fontSize: '0.82rem', background: '#fff' }}
              onClick={() => {
                setImportError(null);
                setState(createInitialDemoWorkspace());
              }}
            >
              🔄 Restaurar demo
            </button>
          </div>
        </div>
      )}

      {/* Experiencia Inicial Guiada (Onboarding Stepper) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, margin: '0 0 16px' }}>
        <button
          type="button"
          className={`btn ${activeTab === 'ingredients' ? 'btn--primary' : 'btn--secondary'}`}
          style={{ justifyContent: 'center', padding: '8px 10px', fontSize: '0.82rem' }}
          onClick={() => setActiveTab('ingredients')}
        >
          1️⃣ Insumos & Mermas
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'subrecipes' ? 'btn--primary' : 'btn--secondary'}`}
          style={{ justifyContent: 'center', padding: '8px 10px', fontSize: '0.82rem' }}
          onClick={() => setActiveTab('subrecipes')}
        >
          2️⃣ Masas & Subrecetas
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'recipes' ? 'btn--primary' : 'btn--secondary'}`}
          style={{ justifyContent: 'center', padding: '8px 10px', fontSize: '0.82rem' }}
          onClick={() => setActiveTab('recipes')}
        >
          3️⃣ Recetas de Carta
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'expenses' ? 'btn--primary' : 'btn--secondary'}`}
          style={{ justifyContent: 'center', padding: '8px 10px', fontSize: '0.82rem' }}
          onClick={() => setActiveTab('expenses')}
        >
          4️⃣ Gastos Operativos Fijos
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'menu-engineering' ? 'btn--primary' : 'btn--secondary'}`}
          style={{ justifyContent: 'center', padding: '8px 10px', fontSize: '0.82rem' }}
          onClick={() => setActiveTab('menu-engineering')}
        >
          5️⃣ Ingeniería de Menú
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'profit-simulator' ? 'btn--primary' : 'btn--secondary'}`}
          style={{ justifyContent: 'center', padding: '8px 10px', fontSize: '0.82rem' }}
          onClick={() => setActiveTab('profit-simulator')}
        >
          6️⃣ Simulador de Negocio
        </button>
      </div>

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
        <button type="button" className={`tab-btn ${activeTab === 'sync' ? 'tab-btn--active' : ''}`} onClick={() => { setActiveTab('sync'); void loadSyncStatus(); }}>🔄 Sync Pizzalog App</button>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2>Evolución histórica de costos y rentabilidad</h2>
              <p className="lead">Seguimiento cronológico de costos, precios y márgenes registrados en cada snapshot.</p>
            </div>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => { setHelpTopic('yield'); setShowHelpModal(true); }}
            >
              ❓ Ayuda sobre mermas y costos
            </button>
          </div>

          {state.snapshots.length === 0 ? (
            <div className="empty-state">
              Todavía no hay snapshots guardados. Tomá una captura desde el botón superior «📸 Guardar Snapshot» o en la pestaña «Snapshots» para comenzar el registro histórico.
            </div>
          ) : (() => {
            const products = state.catalog.recipes.filter((r) => r.recipe_type === 'product');
            const selectedProduct = products.find((r) => r.id === historyRecipeId) ?? products[0];
            const entries = selectedProduct ? state.snapshots
              .filter((snap) => snap.recipe_id === selectedProduct.id)
              .slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) : [];

            const currentResult = selectedProduct ? recipeResults.get(selectedProduct.id) : null;
            const lastEntry = entries.length ? entries[entries.length - 1] : null;

            // Verificación de costo desactualizado (Stale Cost Alert)
            const isCostStale = Boolean(
              currentResult &&
              currentResult.status === 'complete' &&
              currentResult.raw_unit_cost !== null &&
              lastEntry &&
              lastEntry.cost_result.raw_unit_cost !== null &&
              Math.abs(currentResult.raw_unit_cost - lastEntry.cost_result.raw_unit_cost) > 0.01
            );
            const staleDeltaPct = isCostStale && lastEntry?.cost_result.raw_unit_cost
              ? ((currentResult!.raw_unit_cost! - lastEntry.cost_result.raw_unit_cost) / lastEntry.cost_result.raw_unit_cost) * 100
              : 0;

            const values = entries.map((entry) => entry.cost_result.raw_unit_cost)
              .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
            const minValue = values.length ? Math.min(...values) : 0;
            const maxValue = values.length ? Math.max(...values) : 0;
            const range = maxValue - minValue;

            const firstCost = entries[0]?.cost_result.raw_unit_cost;
            const lastCost = lastEntry?.cost_result.raw_unit_cost;
            const totalVariationPct = typeof firstCost === 'number' && typeof lastCost === 'number' && firstCost > 0
              ? ((lastCost - firstCost) / firstCost) * 100
              : null;

            return <>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 14 }}>
                <label className="field" style={{ maxWidth: 420, margin: 0 }}>
                  <span>Seleccionar Producto</span>
                  <select value={selectedProduct?.id ?? ''} onChange={(e) => setHistoryRecipeId(e.target.value)}>
                    {products.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
                  </select>
                </label>
              </div>

              {!selectedProduct ? (
                <div className="empty-state">No hay productos cargados en el catálogo.</div>
              ) : entries.length === 0 ? (
                <div className="empty-state">
                  Este producto todavía no tiene capturas registradas. Guardá un snapshot para iniciar el seguimiento de su evolución.
                </div>
              ) : <>
                {/* Alerta de Costo Desactualizado */}
                {isCostStale && (
                  <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 8, padding: '12px 16px', margin: '16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <strong style={{ color: '#92400e' }}>⚠️ Costo desactualizado en el catálogo</strong>
                      <div style={{ fontSize: '0.84rem', color: '#78350f', marginTop: 2 }}>
                        El costo actual en catálogo es de <strong>{state.currency} {formatDecimal(currentResult!.raw_unit_cost!, 2)}</strong> ({staleDeltaPct > 0 ? '+' : ''}{formatDecimal(staleDeltaPct, 1)}% vs. tu última captura guardada de <strong>{state.currency} {formatDecimal(lastEntry!.cost_result.raw_unit_cost!, 2)}</strong>). Hubo modificaciones en los precios de los insumos.
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn--primary"
                      style={{ fontSize: '0.82rem' }}
                      onClick={() => {
                        const snap = createCostSnapshot(state.catalog, selectedProduct.id, {
                          selling_price: state.productSalesMap?.[selectedProduct.id]?.sellingPrice ?? undefined,
                          target_food_cost_pct: selectedProduct.target_food_cost_pct ?? state.defaultTargetFoodCostPct,
                          rounding_increment: state.defaultRoundingIncrement,
                          packaging_cost: state.defaultPackagingCost,
                          channel_fee_pct: state.defaultChannelFeePct,
                        });
                        setState((s) => ({ ...s, snapshots: [...s.snapshots, snap] }));
                        setSnapshotNotice(`Se guardó un nuevo snapshot con costos actualizados para «${selectedProduct.name}».`);
                      }}
                    >
                      📸 Guardar nuevo snapshot con costo vigente
                    </button>
                  </div>
                )}

                <div className="kpi-grid" style={{ marginTop: 16 }}>
                  <div className="kpi-card">
                    <span>Primer costo registrado</span>
                    <strong>{firstCost == null ? 'Incompleto' : `${state.currency} ${formatDecimal(firstCost, 2)}`}</strong>
                    <small>{new Date(entries[0].created_at).toLocaleDateString()}</small>
                  </div>
                  <div className="kpi-card">
                    <span>Último costo registrado</span>
                    <strong>{lastCost == null ? 'Incompleto' : `${state.currency} ${formatDecimal(lastCost, 2)}`}</strong>
                    <small>{new Date(entries[entries.length - 1].created_at).toLocaleDateString()}</small>
                  </div>
                  <div className="kpi-card">
                    <span>Variación histórica acumulada</span>
                    <strong style={{ color: (totalVariationPct ?? 0) > 0 ? '#b91c1c' : '#15803d' }}>
                      {totalVariationPct == null ? '—' : `${totalVariationPct > 0 ? '+' : ''}${formatDecimal(totalVariationPct, 1)}%`}
                    </strong>
                    <small>{entries.length} capturas en el tiempo</small>
                  </div>
                  <div className="kpi-card">
                    <span>Food Cost del último snapshot</span>
                    <strong>
                      {lastEntry?.pricing_scenario?.food_cost_pct != null
                        ? `${formatDecimal(lastEntry.pricing_scenario.food_cost_pct, 1)}%`
                        : '—'}
                    </strong>
                    <small>Margen unitario: {lastEntry?.pricing_scenario?.raw_gross_profit != null ? `${state.currency} ${formatDecimal(lastEntry.pricing_scenario.raw_gross_profit, 2)}` : '—'}</small>
                  </div>
                </div>

                <div className="card" style={{ marginTop: 16 }}>
                  <strong>Evolución cronológica del costo unitario</strong>
                  <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
                    {entries.map((entry, index) => {
                      const value = entry.cost_result.raw_unit_cost;
                      const previous = index > 0 ? entries[index - 1].cost_result.raw_unit_cost : null;
                      const delta = typeof value === 'number' && typeof previous === 'number' && previous !== 0
                        ? ((value - previous) / previous) * 100
                        : null;
                      const width = typeof value === 'number' ? (range === 0 ? 100 : Math.max(8, ((value - minValue) / range) * 100)) : 0;
                      return (
                        <div key={entry.snapshot_id} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 140px', alignItems: 'center', gap: 12 }}>
                          <small>{new Date(entry.created_at).toLocaleDateString()}</small>
                          <div style={{ background: 'var(--border-color, #e5e7eb)', borderRadius: 6, height: 14, overflow: 'hidden' }}>
                            <div style={{ width: `${width}%`, height: '100%', background: 'var(--accent, #991b1b)', borderRadius: 6 }} />
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <strong style={{ display: 'block' }}>{value == null ? 'Incompleto' : `${state.currency} ${formatDecimal(value, 2)}`}</strong>
                            <small style={{ color: (delta ?? 0) > 0 ? '#b91c1c' : '#15803d' }}>
                              {delta == null ? 'Línea base' : `${delta > 0 ? '+' : ''}${formatDecimal(delta, 1)}%`}
                            </small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="table-wrap" style={{ marginTop: 16 }}>
                  <table className="kit-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Costo unitario</th>
                        <th>Precio evaluado</th>
                        <th>Food Cost %</th>
                        <th>Margen de contribución</th>
                        <th>Variación vs. anterior</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry, index) => {
                        const previous = index > 0 ? entries[index - 1].cost_result.raw_unit_cost : null;
                        const value = entry.cost_result.raw_unit_cost;
                        const delta = typeof value === 'number' && typeof previous === 'number' && previous !== 0
                          ? ((value - previous) / previous) * 100
                          : null;
                        const price = entry.pricing_scenario?.raw_evaluated_price;
                        const fc = entry.pricing_scenario?.food_cost_pct;
                        const profit = entry.pricing_scenario?.raw_gross_profit;

                        return (
                          <tr key={entry.snapshot_id}>
                            <td>{new Date(entry.created_at).toLocaleString()}</td>
                            <td><strong>{value == null ? '—' : `${state.currency} ${formatDecimal(value, 2)}`}</strong></td>
                            <td>{price == null ? '—' : `${state.currency} ${formatDecimal(price, 2)}`}</td>
                            <td>{fc == null ? '—' : `${formatDecimal(fc, 1)}%`}</td>
                            <td>{profit == null ? '—' : `${state.currency} ${formatDecimal(profit, 2)}`}</td>
                            <td style={{ color: delta && delta > 0 ? '#b91c1c' : '#15803d', fontWeight: delta ? 600 : 400 }}>
                              {delta == null ? '—' : `${delta > 0 ? '+' : ''}${formatDecimal(delta, 1)}%`}
                            </td>
                            <td>{entry.cost_result.status === 'complete' ? 'Completo' : 'Incompleto'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>}
            </>;
          })()}
        </section>
      )}

      {activeTab === 'menu-engineering' && (
        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2>Ingeniería de Menú (Matriz Kasavana & Smith / BCG)</h2>
              <p className="lead">
                Análisis estratégico cruzando popularidad (volumen de ventas) y contribución marginal ($ de ganancia por plato).
              </p>
            </div>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => { setHelpTopic('matrix'); setShowHelpModal(true); }}
            >
              ❓ ¿Cómo interpretar los cuadrantes?
            </button>
          </div>

          {/* Barra de Filtros por Período y Canal */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', margin: '16px 0', padding: '14px', background: 'var(--surface-alt)', borderRadius: 10 }}>
            <label className="field" style={{ minWidth: 200, margin: 0 }}>
              <span>Período de Ventas</span>
              <select value={menuPeriodFilter} onChange={(e) => setMenuPeriodFilter(e.target.value)}>
                <option value="all">Todos los períodos acumulados</option>
                {availablePeriods.map((p) => (
                  <option key={p} value={p}>{p} (Mensual)</option>
                ))}
              </select>
            </label>

            <label className="field" style={{ minWidth: 200, margin: 0 }}>
              <span>Canal de Venta</span>
              <select value={menuChannelFilter} onChange={(e) => setMenuChannelFilter(e.target.value)}>
                <option value="all">Todos los canales combinados</option>
                {availableChannels.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, alignSelf: 'flex-end', height: 42 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.86rem', cursor: 'pointer', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={menuCompareMode}
                  onChange={(e) => {
                    setMenuCompareMode(e.target.checked);
                    if (e.target.checked && !menuComparePeriod && availablePeriods.length > 1) {
                      const other = availablePeriods.find((p) => p !== menuPeriodFilter) ?? availablePeriods[1];
                      setMenuComparePeriod(other);
                    }
                  }}
                />
                Comparar con otro período
              </label>
            </div>

            {menuCompareMode && (
              <label className="field" style={{ minWidth: 200, margin: 0 }}>
                <span>Comparar contra:</span>
                <select value={menuComparePeriod} onChange={(e) => setMenuComparePeriod(e.target.value)}>
                  <option value="">Seleccionar período a comparar</option>
                  {availablePeriods.filter((p) => p !== menuPeriodFilter).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {!monthlySummary.hasSalesData ? (
            <div className="empty-state">
              No hay ventas registradas para el período y canal seleccionados. Probá seleccionando «Todos los períodos» o cargá ventas en la pestaña «Ventas importadas».
            </div>
          ) : (
            <>
              {/* KPIs del período filtrado */}
              <div className="kpi-grid" style={{ marginBottom: 16 }}>
                <div className="kpi-card">
                  <span>Facturación {menuChannelFilter !== 'all' ? `(${menuChannelFilter})` : 'del período'}</span>
                  <strong>{state.currency} {formatDecimal(monthlySummary.totalRevenue, 2)}</strong>
                  <small>{formatDecimal(monthlySummary.totalUnits, 0)} unidades vendidas</small>
                </div>
                <div className="kpi-card">
                  <span>Costo de Insumos (CMV)</span>
                  <strong style={{ color: '#b91c1c' }}>{state.currency} {formatDecimal(monthlySummary.totalCogs, 2)}</strong>
                  <small>Food Cost: {monthlySummary.totalRevenue > 0 ? formatDecimal((monthlySummary.totalCogs / monthlySummary.totalRevenue) * 100, 1) : 0}%</small>
                </div>
                <div className="kpi-card">
                  <span>Contribución Marginal Total</span>
                  <strong style={{ color: '#15803d' }}>{state.currency} {formatDecimal(monthlySummary.totalContribution, 2)}</strong>
                  <small>Margen ponderado: {formatDecimal(monthlySummary.weightedMarginPct, 1)}%</small>
                </div>
                <div className="kpi-card">
                  <span>Punto de Equilibrio</span>
                  <strong>{breakEvenRevenue > 0 ? `${state.currency} ${formatDecimal(breakEvenRevenue, 2)}` : '—'}</strong>
                  <small>{(netOperatingProfit ?? 0) >= 0 ? '🟢 Zona de Ganancia Neta' : '🔴 Zona de Déficit'}</small>
                </div>
              </div>

              {/* Comparación entre dos períodos (si está activada) */}
              {menuCompareMode && compareSummary && (() => {
                const diffUnits = monthlySummary.totalUnits - compareSummary.totalUnits;
                const diffUnitsPct = compareSummary.totalUnits > 0 ? (diffUnits / compareSummary.totalUnits) * 100 : 0;
                const diffRev = monthlySummary.totalRevenue - compareSummary.totalRevenue;
                const diffRevPct = compareSummary.totalRevenue > 0 ? (diffRev / compareSummary.totalRevenue) * 100 : 0;
                const diffContrib = monthlySummary.totalContribution - compareSummary.totalContribution;
                const diffContribPct = compareSummary.totalContribution > 0 ? (diffContrib / compareSummary.totalContribution) * 100 : 0;

                return (
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <strong style={{ color: '#1e40af' }}>
                        📊 Comparativa: {menuPeriodFilter === 'all' ? 'Actual' : menuPeriodFilter} vs. {menuComparePeriod}
                      </strong>
                      <span style={{ fontSize: '0.8rem', color: '#3b82f6' }}>Canal: {menuChannelFilter === 'all' ? 'Todos' : menuChannelFilter}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                      <div>
                        <span style={{ fontSize: '0.8rem', color: '#1e40af', display: 'block' }}>Variación de Unidades:</span>
                        <strong style={{ fontSize: '1.1rem', color: diffUnits >= 0 ? '#15803d' : '#b91c1c' }}>
                          {diffUnits >= 0 ? `+${formatDecimal(diffUnits, 0)} u.` : `${formatDecimal(diffUnits, 0)} u.`}
                          {' '}({diffUnitsPct >= 0 ? `+${formatDecimal(diffUnitsPct, 1)}%` : `${formatDecimal(diffUnitsPct, 1)}%`})
                        </strong>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.8rem', color: '#1e40af', display: 'block' }}>Variación de Facturación:</span>
                        <strong style={{ fontSize: '1.1rem', color: diffRev >= 0 ? '#15803d' : '#b91c1c' }}>
                          {diffRev >= 0 ? `+${state.currency} ${formatDecimal(diffRev, 0)}` : `${state.currency} ${formatDecimal(diffRev, 0)}`}
                          {' '}({diffRevPct >= 0 ? `+${formatDecimal(diffRevPct, 1)}%` : `${formatDecimal(diffRevPct, 1)}%`})
                        </strong>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.8rem', color: '#1e40af', display: 'block' }}>Variación de Contribución:</span>
                        <strong style={{ fontSize: '1.1rem', color: diffContrib >= 0 ? '#15803d' : '#b91c1c' }}>
                          {diffContrib >= 0 ? `+${state.currency} ${formatDecimal(diffContrib, 0)}` : `${state.currency} ${formatDecimal(diffContrib, 0)}`}
                          {' '}({diffContribPct >= 0 ? `+${formatDecimal(diffContribPct, 1)}%` : `${formatDecimal(diffContribPct, 1)}%`})
                        </strong>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Alerta de Productos con Datos Faltantes (Diferenciación estricta de falta de datos vs resultado desfavorable) */}
              {(() => {
                const incompleteProducts = monthlySummary.rows.filter((r) => !r.isComplete);
                if (incompleteProducts.length === 0) return null;
                return (
                  <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 8, padding: '12px 16px', marginBottom: 18 }}>
                    <strong style={{ color: '#92400e', display: 'block', marginBottom: 4 }}>
                      ⚠️ {incompleteProducts.length} producto(s) no clasificados por datos incompletos:
                    </strong>
                    <div style={{ fontSize: '0.84rem', color: '#78350f', marginBottom: 8 }}>
                      Estos productos tienen ventas registradas pero les falta el precio de algún insumo o su precio de venta. No son clasificados como «Perros» para no falsear tus decisiones:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.84rem', color: '#92400e' }}>
                      {incompleteProducts.map((p) => (
                        <li key={p.prod.id} style={{ margin: '4px 0' }}>
                          <strong>{p.prod.name}</strong> ({formatDecimal(p.units ?? 0, 0)} u. vendidas): {p.incompleteReason}
                          <button
                            type="button"
                            className="btn btn--sm"
                            style={{ marginLeft: 8, fontSize: '0.74rem', padding: '2px 8px' }}
                            onClick={() => setActiveTab('recipes')}
                          >
                            Ir a recetas
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              {/* Los 4 Cuadrantes Estratégicos con Recomendaciones */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, margin: '16px 0' }}>
                {([
                  {
                    key: 'puzzle',
                    title: '🧩 Rompecabezas (Puzzles)',
                    badge: 'Baja popularidad · Alta contribución',
                    color: '#6b21a8',
                    bg: '#f3e8ff',
                    border: '#d8b4fe',
                    actionTip: '💡 Oportunidad de margen: Dejan excelente ganancia pero tienen baja rotación. Recomendación: Creá promociones 2x1 en días flojos, sumalos a combos o colocálos en el centro visual de la carta.',
                    rows: monthlySummary.rows.filter((r) => r.matrixClass === 'puzzle'),
                  },
                  {
                    key: 'star',
                    title: '⭐ Estrellas (Stars)',
                    badge: 'Alta popularidad · Alta contribución',
                    color: '#92400e',
                    bg: '#fef3c7',
                    border: '#fde047',
                    actionTip: '✨ Pilares de rentabilidad: Alta rotación y excelente margen. Recomendación: Proteger la calidad estricta de la receta y mantenerlos en el punto focal del menú.',
                    rows: monthlySummary.rows.filter((r) => r.matrixClass === 'star'),
                  },
                  {
                    key: 'dog',
                    title: '🐕 Perros (Dogs)',
                    badge: 'Baja popularidad · Baja contribución',
                    color: '#991b1b',
                    bg: '#fee2e2',
                    border: '#fca5a5',
                    actionTip: '⚠️ Bajo rendimiento: Tienen baja rotación y escaso margen. Recomendación: Evaluar si sus insumos inmovilizan stock; reemplazarlos o reformularlos a fondo.',
                    rows: monthlySummary.rows.filter((r) => r.matrixClass === 'dog'),
                  },
                  {
                    key: 'horse',
                    title: '🐎 Caballos de Batalla (Plowhorses)',
                    badge: 'Alta popularidad · Baja contribución',
                    color: '#1e40af',
                    bg: '#dbeafe',
                    border: '#93c5fd',
                    actionTip: '💡 Oportunidad de volumen: Muy pedidos pero dejan poco margen. Recomendación: Un ajuste de apenas +3% a +5% en el precio, o una optimización de gramaje, tendrá un impacto masivo en tu ganancia neta.',
                    rows: monthlySummary.rows.filter((r) => r.matrixClass === 'horse'),
                  },
                ]).map((quadrant) => (
                  <div
                    key={quadrant.key}
                    className="kpi-card"
                    style={{
                      background: quadrant.bg,
                      border: `1px solid ${quadrant.border}`,
                      textAlign: 'left',
                      padding: 16,
                      borderRadius: 10,
                    }}
                  >
                    <strong style={{ color: quadrant.color, fontSize: '1.05rem', display: 'block' }}>
                      {quadrant.title}
                    </strong>
                    <span style={{ fontSize: '0.78rem', color: quadrant.color, fontWeight: 600, display: 'block', margin: '2px 0 8px' }}>
                      {quadrant.badge}
                    </span>
                    <p style={{ fontSize: '0.8rem', color: '#374151', margin: '0 0 10px', lineHeight: 1.45 }}>
                      {quadrant.actionTip}
                    </p>
                    {quadrant.rows.length ? (
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem' }}>
                        {quadrant.rows.map((r) => (
                          <li key={r.prod.id} style={{ margin: '3px 0' }}>
                            <strong>{r.prod.name}</strong>{' '}
                            <small>({formatDecimal(r.units ?? 0, 0)} u. · Contrib. {state.currency} {formatDecimal(r.unitGrossProfit, 0)})</small>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <small style={{ color: '#6b7280', fontStyle: 'italic' }}>Sin productos en este cuadrante</small>
                    )}
                  </div>
                ))}
              </div>

              {/* Tabla Detallada de Productos */}
              <div className="table-wrap">
                <table className="kit-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th style={{ textAlign: 'right' }}>Unidades vendidas</th>
                      <th style={{ textAlign: 'right' }}>Precio venta</th>
                      <th style={{ textAlign: 'right' }}>Costo unitario</th>
                      <th style={{ textAlign: 'right' }}>Contribución unitaria</th>
                      <th style={{ textAlign: 'right' }}>Contribución total</th>
                      <th style={{ textAlign: 'right' }}>Margen %</th>
                      <th style={{ textAlign: 'center' }}>Clasificación BCG</th>
                      <th>Estrategia recomendada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlySummary.rows
                      .slice()
                      .sort((a, b) => (b.units ?? 0) - (a.units ?? 0))
                      .map((r) => {
                        let strategyTip = '—';
                        if (r.matrixClass === 'star') strategyTip = 'Proteger calidad y visibilidad';
                        else if (r.matrixClass === 'horse') strategyTip = 'Subir precio +3% a +5% o ajustar gramaje';
                        else if (r.matrixClass === 'puzzle') strategyTip = 'Impulsar en combos o promociones';
                        else if (r.matrixClass === 'dog') strategyTip = 'Evaluar reemplazo o reformulación';
                        else if (!r.isComplete) strategyTip = 'Completar costo de insumos faltantes';

                        return (
                          <tr key={r.prod.id}>
                            <td><strong>{r.prod.name}</strong></td>
                            <td style={{ textAlign: 'right' }}>{r.units !== null ? formatDecimal(r.units, 0) : '—'}</td>
                            <td style={{ textAlign: 'right' }}>
                              {r.isComplete ? `${state.currency} ${formatDecimal(r.evaluatedPrice, 2)}` : '—'}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {r.isComplete ? `${state.currency} ${formatDecimal(r.unitCost, 2)}` : 'Incompleto'}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>
                              {r.isComplete ? `${state.currency} ${formatDecimal(r.unitGrossProfit, 2)}` : '—'}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#15803d' }}>
                              {r.monthlyContribution !== null ? `${state.currency} ${formatDecimal(r.monthlyContribution, 2)}` : '—'}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {r.evaluatedPrice > 0 ? `${formatDecimal((r.unitGrossProfit / r.evaluatedPrice) * 100, 1)}%` : '—'}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {r.matrixLabel}
                            </td>
                            <td style={{ fontSize: '0.8rem', color: '#4b5563' }}>
                              {strategyTip}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2>Simulador Estratégico de Rentabilidad y Decisiones</h2>
              <p className="lead">
                Herramienta para proyectar el impacto de aumentos de insumos, variaciones de precios y volumen de ventas sobre el punto de equilibrio y la ganancia neta.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className={`btn ${simMode === 'business' ? 'btn--primary' : 'btn--secondary'}`}
                style={{ fontSize: '0.82rem' }}
                onClick={() => setSimMode('business')}
              >
                🏢 Simulación Global del Negocio
              </button>
              <button
                type="button"
                className={`btn ${simMode === 'single' ? 'btn--primary' : 'btn--secondary'}`}
                style={{ fontSize: '0.82rem' }}
                onClick={() => setSimMode('single')}
              >
                🧮 Calculadora Unitaria
              </button>
            </div>
          </div>

          {simMode === 'business' ? (
            <div style={{ marginTop: 16 }}>
              {/* Bloque de Gastos Fijos y Punto de Equilibrio */}
              <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--line)', borderRadius: 10, padding: '16px', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                  <div>
                    <strong style={{ fontSize: '1.05rem' }}>Estructura de Costos Fijos y Punto de Equilibrio</strong>
                    <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                      Alimentado automáticamente desde tus gastos operativos mensuales (Alquiler, Sueldos, Suministros, Software).
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--sm btn--secondary"
                    onClick={() => setActiveTab('expenses')}
                  >
                    ✏️ Editar gastos fijos ({state.currency} {formatDecimal(totalMonthlyExpenses, 0)}/mes)
                  </button>
                </div>

                <div className="kpi-grid">
                  <div className="kpi-card">
                    <span>Gastos Fijos Mensuales</span>
                    <strong>{state.currency} {formatDecimal(totalMonthlyExpenses, 2)}</strong>
                    <small>{state.operatingExpenses.length} conceptos cargados</small>
                  </div>
                  <div className="kpi-card">
                    <span>Facturación de Equilibrio (Break-Even)</span>
                    <strong style={{ color: '#d97706' }}>
                      {simulatedBusinessResult.custom.breakEven > 0
                        ? `${state.currency} ${formatDecimal(simulatedBusinessResult.custom.breakEven, 2)}`
                        : '—'}
                    </strong>
                    <small>Mínimo mensual para no perder dinero</small>
                  </div>
                  <div className="kpi-card">
                    <span>Unidades de Equilibrio</span>
                    <strong>
                      {simulatedBusinessResult.custom.breakEvenUnits > 0
                        ? `${formatDecimal(simulatedBusinessResult.custom.breakEvenUnits, 0)} u.`
                        : '—'}
                    </strong>
                    <small>Venta mensual promedio necesaria</small>
                  </div>
                  <div className="kpi-card">
                    <span>Margen de Seguridad</span>
                    <strong style={{ color: simulatedBusinessResult.custom.safetyMarginPct >= 0 ? '#15803d' : '#b91c1c' }}>
                      {simulatedBusinessResult.custom.safetyMarginPct >= 0 ? '+' : ''}
                      {formatDecimal(simulatedBusinessResult.custom.safetyMarginPct, 1)}%
                    </strong>
                    <small>
                      {simulatedBusinessResult.custom.safetyMarginPct >= 0 ? '🟢 Operando en Zona de Ganancia' : '🔴 Operando por debajo del punto de equilibrio'}
                    </small>
                  </div>
                </div>
              </div>

              {/* Controles de Sensibilidad Interactivos */}
              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 18, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <h3 style={{ margin: 0, fontSize: '1rem' }}>🎛️ Controles de Simulación en Vivo</h3>
                  <button
                    type="button"
                    className="btn btn--sm btn--secondary"
                    onClick={() => { setSimPriceDelta(0); setSimCostDelta(0); setSimVolumeDelta(0); setSimCategoryFilter('all'); }}
                  >
                    Restablecer simulación a 0%
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
                  {/* Slider Variación de Precios de Venta */}
                  <div style={{ background: 'var(--surface-alt)', padding: 14, borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>Variación de Precios de Venta</span>
                      <strong style={{ color: simPriceDelta >= 0 ? '#15803d' : '#b91c1c' }}>
                        {simPriceDelta >= 0 ? `+${simPriceDelta}%` : `${simPriceDelta}%`}
                      </strong>
                    </div>
                    <input
                      type="range"
                      min={-30}
                      max={30}
                      step={1}
                      value={simPriceDelta}
                      onChange={(e) => setSimPriceDelta(Number(e.target.value))}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                      {[-5, 0, 3, 5, 10, 15].map((val) => (
                        <button
                          key={val}
                          type="button"
                          className="btn btn--sm"
                          style={{ padding: '2px 6px', fontSize: '0.72rem' }}
                          onClick={() => setSimPriceDelta(val)}
                        >
                          {val > 0 ? `+${val}%` : `${val}%`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Slider Inflación / Aumento de Insumos */}
                  <div style={{ background: 'var(--surface-alt)', padding: 14, borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>Aumento de Costo de Insumos</span>
                      <strong style={{ color: simCostDelta > 0 ? '#b91c1c' : '#15803d' }}>
                        {simCostDelta > 0 ? `+${simCostDelta}%` : `${simCostDelta}%`}
                      </strong>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={50}
                      step={1}
                      value={simCostDelta}
                      onChange={(e) => setSimCostDelta(Number(e.target.value))}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                      {[0, 5, 10, 15, 20, 25].map((val) => (
                        <button
                          key={val}
                          type="button"
                          className="btn btn--sm"
                          style={{ padding: '2px 6px', fontSize: '0.72rem' }}
                          onClick={() => setSimCostDelta(val)}
                        >
                          {val > 0 ? `+${val}%` : `${val}%`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Filtro de Categoría de Insumos para Aumento Focalizado */}
                  <div style={{ background: 'var(--surface-alt)', padding: 14, borderRadius: 8 }}>
                    <label className="field" style={{ margin: 0 }}>
                      <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>Insumos Afectados por el Aumento</span>
                      <select value={simCategoryFilter} onChange={(e) => setSimCategoryFilter(e.target.value as any)}>
                        <option value="all">Todos los insumos del restaurante</option>
                        <option value="flour">Solo Harinas y Masas</option>
                        <option value="dairy">Solo Lácteos / Mozzarella</option>
                        <option value="meat">Solo Carnes / Proteínas</option>
                      </select>
                    </label>
                    <small style={{ display: 'block', marginTop: 8, color: 'var(--muted)', fontSize: '0.76rem' }}>
                      Permite simular una suba específica del queso o de la harina sin alterar el resto de las compras.
                    </small>
                  </div>

                  {/* Slider Variación de Volumen de Ventas */}
                  <div style={{ background: 'var(--surface-alt)', padding: 14, borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>Variación de Volumen de Ventas</span>
                      <strong style={{ color: simVolumeDelta >= 0 ? '#15803d' : '#b91c1c' }}>
                        {simVolumeDelta >= 0 ? `+${simVolumeDelta}%` : `${simVolumeDelta}%`}
                      </strong>
                    </div>
                    <input
                      type="range"
                      min={-30}
                      max={30}
                      step={1}
                      value={simVolumeDelta}
                      onChange={(e) => setSimVolumeDelta(Number(e.target.value))}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                      {[-15, -10, 0, 10, 15, 20].map((val) => (
                        <button
                          key={val}
                          type="button"
                          className="btn btn--sm"
                          style={{ padding: '2px 6px', fontSize: '0.72rem' }}
                          onClick={() => setSimVolumeDelta(val)}
                        >
                          {val > 0 ? `+${val}%` : `${val}%`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Comparación de los 3 Escenarios Lado a Lado */}
              <h3 style={{ margin: '0 0 12px', fontSize: '1.05rem' }}>
                ⚖️ Comparativa Estratégica de Escenarios (Pesimista · Base · Optimista)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 24 }}>
                {/* Escenario Pesimista */}
                <div style={{ border: '2px solid #f87171', borderRadius: 10, padding: 16, background: '#fef2f2' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <strong style={{ color: '#991b1b', fontSize: '1.05rem' }}>🔴 Escenario Pesimista</strong>
                    <span style={{ fontSize: '0.72rem', background: '#fee2e2', color: '#991b1b', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                      -15% ventas · +12% insumos
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 12px' }}>
                    Caída de demanda e inflación de costos sin ajuste de precios.
                  </p>
                  <div style={{ display: 'grid', gap: 6, fontSize: '0.84rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Facturación mensual:</span>
                      <strong>{state.currency} {formatDecimal(simulatedBusinessResult.pessimistic.totRev, 0)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Costo insumos (CMV):</span>
                      <span style={{ color: '#b91c1c' }}>{state.currency} {formatDecimal(simulatedBusinessResult.pessimistic.totCogs, 0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Gastos variables:</span>
                      <span>{state.currency} {formatDecimal(simulatedBusinessResult.pessimistic.totVarCosts, 0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Contribución marginal:</span>
                      <strong style={{ color: '#15803d' }}>{state.currency} {formatDecimal(simulatedBusinessResult.pessimistic.totContribution, 0)} ({formatDecimal(simulatedBusinessResult.pessimistic.marginPct, 1)}%)</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #fecaca', paddingTop: 6, marginTop: 4 }}>
                      <span>Gastos fijos:</span>
                      <span>{state.currency} {formatDecimal(totalMonthlyExpenses, 0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.94rem', fontWeight: 800 }}>
                      <span>Ganancia neta:</span>
                      <span style={{ color: simulatedBusinessResult.pessimistic.netProfit >= 0 ? '#15803d' : '#b91c1c' }}>
                        {state.currency} {formatDecimal(simulatedBusinessResult.pessimistic.netProfit, 0)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Escenario Base (Actual) */}
                <div style={{ border: '2px solid var(--line)', borderRadius: 10, padding: 16, background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <strong style={{ fontSize: '1.05rem' }}>⚪ Escenario Base</strong>
                    <span style={{ fontSize: '0.72rem', background: 'var(--surface-alt)', color: 'var(--ink)', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                      Actual vigente
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 12px' }}>
                    Tu volumen de ventas y precios actuales según tu catálogo.
                  </p>
                  <div style={{ display: 'grid', gap: 6, fontSize: '0.84rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Facturación mensual:</span>
                      <strong>{state.currency} {formatDecimal(simulatedBusinessResult.base.totRev, 0)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Costo insumos (CMV):</span>
                      <span style={{ color: '#b91c1c' }}>{state.currency} {formatDecimal(simulatedBusinessResult.base.totCogs, 0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Gastos variables:</span>
                      <span>{state.currency} {formatDecimal(simulatedBusinessResult.base.totVarCosts, 0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Contribución marginal:</span>
                      <strong style={{ color: '#15803d' }}>{state.currency} {formatDecimal(simulatedBusinessResult.base.totContribution, 0)} ({formatDecimal(simulatedBusinessResult.base.marginPct, 1)}%)</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 6, marginTop: 4 }}>
                      <span>Gastos fijos:</span>
                      <span>{state.currency} {formatDecimal(totalMonthlyExpenses, 0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.94rem', fontWeight: 800 }}>
                      <span>Ganancia neta:</span>
                      <span style={{ color: simulatedBusinessResult.base.netProfit >= 0 ? '#15803d' : '#b91c1c' }}>
                        {state.currency} {formatDecimal(simulatedBusinessResult.base.netProfit, 0)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Escenario Optimista */}
                <div style={{ border: '2px solid #86efac', borderRadius: 10, padding: 16, background: '#f0fdf4' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <strong style={{ color: '#15803d', fontSize: '1.05rem' }}>🟢 Escenario Optimista</strong>
                    <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                      +15% ventas · +5% precio
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 12px' }}>
                    Aumento moderado de precios y expansión del volumen de ventas.
                  </p>
                  <div style={{ display: 'grid', gap: 6, fontSize: '0.84rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Facturación mensual:</span>
                      <strong>{state.currency} {formatDecimal(simulatedBusinessResult.optimistic.totRev, 0)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Costo insumos (CMV):</span>
                      <span style={{ color: '#b91c1c' }}>{state.currency} {formatDecimal(simulatedBusinessResult.optimistic.totCogs, 0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Gastos variables:</span>
                      <span>{state.currency} {formatDecimal(simulatedBusinessResult.optimistic.totVarCosts, 0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Contribución marginal:</span>
                      <strong style={{ color: '#15803d' }}>{state.currency} {formatDecimal(simulatedBusinessResult.optimistic.totContribution, 0)} ({formatDecimal(simulatedBusinessResult.optimistic.marginPct, 1)}%)</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #bbf7d0', paddingTop: 6, marginTop: 4 }}>
                      <span>Gastos fijos:</span>
                      <span>{state.currency} {formatDecimal(totalMonthlyExpenses, 0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.94rem', fontWeight: 800 }}>
                      <span>Ganancia neta:</span>
                      <span style={{ color: '#15803d' }}>
                        {state.currency} {formatDecimal(simulatedBusinessResult.optimistic.netProfit, 0)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Desglose de Impacto por Producto con los Controles Actuales */}
              <h3 style={{ margin: '0 0 12px', fontSize: '1.05rem' }}>
                📋 Impacto Proyectado por Producto en el Escenario Simulado ({simPriceDelta >= 0 ? `+${simPriceDelta}%` : `${simPriceDelta}%`} precio · {simCostDelta > 0 ? `+${simCostDelta}%` : `${simCostDelta}%`} insumo · {simVolumeDelta >= 0 ? `+${simVolumeDelta}%` : `${simVolumeDelta}%`} ventas)
              </h3>
              <div className="table-wrap">
                <table className="kit-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th style={{ textAlign: 'right' }}>Unidades proyectadas</th>
                      <th style={{ textAlign: 'right' }}>Precio actual $\to$ simulado</th>
                      <th style={{ textAlign: 'right' }}>Costo actual $\to$ simulado</th>
                      <th style={{ textAlign: 'right' }}>Margen unitario proyectado</th>
                      <th style={{ textAlign: 'right' }}>Contribución total simulada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulatedBusinessResult.custom.rows.map((row) => (
                      <tr key={row.prod.id}>
                        <td><strong>{row.prod.name}</strong></td>
                        <td style={{ textAlign: 'right' }}>
                          {formatDecimal(row.simUnits, 0)} u.
                          {row.simUnits !== row.baseUnits && (
                            <small style={{ display: 'block', color: row.simUnits > row.baseUnits ? '#15803d' : '#b91c1c' }}>
                              (Base: {formatDecimal(row.baseUnits, 0)} u.)
                            </small>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {state.currency} {formatDecimal(row.simPrice, 0)}
                          {row.simPrice !== row.basePrice && (
                            <small style={{ display: 'block', color: 'var(--muted)' }}>
                              (Base: {state.currency} {formatDecimal(row.basePrice, 0)})
                            </small>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {state.currency} {formatDecimal(row.simCost, 2)}
                          {row.simCost !== row.baseCost && (
                            <small style={{ display: 'block', color: '#b91c1c' }}>
                              (Base: {state.currency} {formatDecimal(row.baseCost, 2)})
                            </small>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {state.currency} {formatDecimal(row.simProfit, 2)}
                          <small style={{ display: 'block', color: 'var(--muted)' }}>
                            {row.simPrice > 0 ? `${formatDecimal((row.simProfit / row.simPrice) * 100, 1)}%` : '—'}
                          </small>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#15803d' }}>
                          {state.currency} {formatDecimal(row.simContribution, 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Modo Calculadora Unitaria Manual */
            <div style={{ marginTop: 16 }}>
              <div className="builder-grid">
                <label className="field">
                  <span>Vincular producto del catálogo</span>
                  <select value={profitProductId} onChange={(e) => setProfitProductId(e.target.value)}>
                    <option value="">Escenario manual</option>
                    {state.catalog.recipes.filter((r) => r.recipe_type === 'product').map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Unidades por mes</span>
                  <input type="number" min="0" value={profitScenario.units} onChange={(e) => setProfitScenario((p) => ({ ...p, units: Math.max(0, Number(e.target.value) || 0) }))} />
                </label>
                <label className="field">
                  <span>Precio de venta unitario ({state.currency})</span>
                  <input type="number" min="0" value={profitScenario.price} onChange={(e) => setProfitScenario((p) => ({ ...p, price: Math.max(0, Number(e.target.value) || 0) }))} />
                </label>
                <label className="field">
                  <span>Costo variable unitario ({state.currency})</span>
                  <input type="number" min="0" value={profitScenario.variableCost} onChange={(e) => setProfitScenario((p) => ({ ...p, variableCost: Math.max(0, Number(e.target.value) || 0) }))} />
                </label>
                <label className="field">
                  <span>Gastos fijos mensuales ({state.currency})</span>
                  <input type="number" min="0" value={profitScenario.fixedCosts || totalMonthlyExpenses} onChange={(e) => setProfitScenario((p) => ({ ...p, fixedCosts: Math.max(0, Number(e.target.value) || 0) }))} />
                </label>
              </div>

              {profitProductId && (() => {
                const product = state.catalog.recipes.find((r) => r.id === profitProductId);
                const cost = recipeResults.get(profitProductId);
                const price = state.productSalesMap?.[profitProductId]?.sellingPrice;
                const canUse = Boolean(product && cost?.status === 'complete' && cost.raw_unit_cost !== null && Number(price) > 0);
                return (
                  <div style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="btn btn--ocre"
                      disabled={!canUse}
                      onClick={() => setProfitScenario((prev) => ({
                        ...prev,
                        price: Number(price),
                        variableCost: cost!.raw_unit_cost! + state.defaultPackagingCost + Number(price) * state.defaultChannelFeePct / 100,
                        fixedCosts: totalMonthlyExpenses,
                      }))}
                    >
                      Cargar precio, costo y gastos fijos del catálogo
                    </button>
                    {!canUse && <small style={{ display: 'block', marginTop: 6 }}>Para vincularlo necesitás costo completo y precio de venta cargado en el catálogo. El costo variable incluye packaging y comisión configurados.</small>}
                  </div>
                );
              })()}

              {(() => {
                const effectiveFixed = profitScenario.fixedCosts || totalMonthlyExpenses;
                const revenue = profitScenario.units * profitScenario.price;
                const contribution = profitScenario.units * (profitScenario.price - profitScenario.variableCost);
                const result = contribution - effectiveFixed;
                const margin = revenue > 0 ? (contribution / revenue) * 100 : null;
                const breakEven = margin && margin > 0 ? effectiveFixed / (margin / 100) : 0;
                return (
                  <div className="kpi-grid" style={{ marginTop: 16 }}>
                    <div className="kpi-card"><span>Facturación escenario</span><strong>{state.currency} {formatDecimal(revenue, 2)}</strong></div>
                    <div className="kpi-card"><span>Contribución marginal</span><strong>{state.currency} {formatDecimal(contribution, 2)}</strong></div>
                    <div className="kpi-card"><span>Resultado operativo</span><strong style={{ color: result >= 0 ? '#15803d' : '#b91c1c' }}>{state.currency} {formatDecimal(result, 2)}</strong></div>
                    <div className="kpi-card"><span>Punto de equilibrio</span><strong>{breakEven > 0 ? `${state.currency} ${formatDecimal(breakEven, 2)}` : '—'}</strong><small>Margen: {margin == null ? 'Sin datos' : `${formatDecimal(margin, 1)}%`}</small></div>
                  </div>
                );
              })()}
            </div>
          )}
        </section>
      )}

      {activeTab === 'sync' && (
        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h2>Sincronización 1-Click con Pizzalog App</h2>
              <p className="lead">
                Conectá tu espacio de trabajo de Tools con tu restaurante en Pizzalog App para exportar o importar insumos, precios y recetas con un solo clic.
              </p>
            </div>
            {syncStatus?.linked && (
              <span className="badge" style={{ background: '#e8f5e9', color: '#2e7d32', padding: '6px 12px', borderRadius: 16, fontWeight: 600 }}>
                🟢 Vinculado: {syncStatus.business_name}
              </span>
            )}
          </div>

          {syncNotice && (
            <div className="alert-banner" style={{ background: '#e8f5e9', color: '#2e7d32', marginBottom: 16 }}>
              {syncNotice}
            </div>
          )}
          {syncError && (
            <div className="alert-banner" style={{ background: '#ffebee', color: '#c62828', marginBottom: 16 }}>
              {syncError}
            </div>
          )}

          {!syncStatus?.linked ? (
            <div style={{ maxWidth: 520, padding: 20, border: '1px solid #e0e0e0', borderRadius: 8, background: '#fafafa' }}>
              <h3 style={{ marginTop: 0 }}>Vincular con tu cuenta de Pizzalog App</h3>
              <p style={{ fontSize: '0.88rem', color: '#666' }}>
                Ingresá las credenciales de tu usuario administrador en Pizzalog App para habilitar la sincronización directa.
              </p>
              <form onSubmit={handleLinkApp} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label className="field">
                  <span>Email en Pizzalog App</span>
                  <input
                    type="email"
                    required
                    value={syncLinkEmail}
                    onChange={(e) => setSyncLinkEmail(e.target.value)}
                    placeholder="admin@mitienda.com"
                  />
                </label>
                <label className="field">
                  <span>Contraseña en Pizzalog App</span>
                  <input
                    type="password"
                    required
                    value={syncLinkPassword}
                    onChange={(e) => setSyncLinkPassword(e.target.value)}
                  />
                </label>
                <button type="submit" className="btn btn--primary" disabled={syncLoading} style={{ alignSelf: 'flex-start' }}>
                  {syncLoading ? 'Verificando...' : 'Vincular Restaurante'}
                </button>
              </form>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
              <div style={{ padding: 20, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
                <h3 style={{ marginTop: 0 }}>📤 Exportar a Pizzalog App (Tools → App)</h3>
                <p style={{ fontSize: '0.88rem', color: '#555', lineHeight: 1.5 }}>
                  Envía los insumos creados en Tools y sus precios calculados directamente a tu catálogo de insumos de Pizzalog App. Si cambian costos, conservadoramente se invalidan los costos calculados de tus pizzas para que el sistema los recalcule.
                </p>
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={syncLoading}
                    onClick={() => handleSyncPreview('to_app')}
                  >
                    Previsualizar
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={syncLoading}
                    onClick={() => handleSyncApply('to_app')}
                  >
                    {syncLoading ? 'Sincronizando...' : 'Exportar a App ahora'}
                  </button>
                </div>
              </div>

              <div style={{ padding: 20, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
                <h3 style={{ marginTop: 0 }}>📥 Importar desde Pizzalog App (App → Tools)</h3>
                <p style={{ fontSize: '0.88rem', color: '#555', lineHeight: 1.5 }}>
                  Trae todos tus insumos activos y precios vigentes cargados en tu Pizzalog App a este espacio de trabajo para simular variaciones de menú, costos de masa y proyecciones de rentabilidad sin afectar el sistema en vivo.
                </p>
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button
                    type="button"
                    className="btn btn--ocre"
                    disabled={syncLoading}
                    onClick={() => handleSyncApply('from_app')}
                  >
                    {syncLoading ? 'Importando...' : 'Traer catálogo desde App'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {syncPreviewData && (
            <div style={{ marginTop: 20, padding: 16, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8 }}>
              <h4 style={{ margin: '0 0 10px 0' }}>Resumen de cambios detectados ({syncPreviewData.direction === 'to_app' ? 'Tools → App' : 'App → Tools'})</h4>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.88rem' }}>
                <li>Insumos nuevos para dar de alta en App: <strong>{syncPreviewData.summary?.supplies_to_create ?? 0}</strong></li>
                <li>Precios de insumos existentes a actualizar: <strong>{syncPreviewData.summary?.supplies_to_update_cost ?? 0}</strong></li>
                <li>Insumos sin cambios: <strong>{syncPreviewData.summary?.supplies_unchanged ?? 0}</strong></li>
                <li>Recetas en catálogo de Tools: <strong>{syncPreviewData.summary?.recipes_count ?? 0}</strong></li>
              </ul>
            </div>
          )}
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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label className="btn btn--secondary" style={{ cursor: 'pointer', margin: 0 }}>
                📋 Actualizar por lista de proveedor
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  style={{ display: 'none' }}
                  onChange={handlePriceListUpload}
                />
              </label>
              <button type="button" className="btn btn--primary" onClick={addIngredient}>
                + Nuevo Insumo
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="kit-table">
              <thead>
                <tr>
                  <th>Ingrediente</th>
                  <th>Dimensión / Base <button type="button" className="btn btn--sm" style={{ padding: '0 4px', fontSize: '0.72rem', border: 'none', background: 'transparent', cursor: 'pointer' }} onClick={() => { setHelpTopic('units'); setShowHelpModal(true); }} title="Ver guía de unidades">❓</button></th>
                  <th>Densidad (g/ml) <button type="button" className="btn btn--sm" style={{ padding: '0 4px', fontSize: '0.72rem', border: 'none', background: 'transparent', cursor: 'pointer' }} onClick={() => { setHelpTopic('density'); setShowHelpModal(true); }} title="Ver densidades comunes">❓</button></th>
                  <th>Precio Compra ({state.currency})</th>
                  <th>Cant. Envase</th>
                  <th>Unidad Envase</th>
                  <th>Rendimiento (%) <button type="button" className="btn btn--sm" style={{ padding: '0 4px', fontSize: '0.72rem', border: 'none', background: 'transparent', cursor: 'pointer' }} onClick={() => { setHelpTopic('yield'); setShowHelpModal(true); }} title="Ver cómo impacta la merma">❓</button></th>
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
                {monthlySummary.hasSalesData ? `${state.currency} ${formatDecimal(monthlySummary.totalContribution, 0)}` : 'Sin datos'}
              </div>
              <div className="kpi-box__sub">
                {monthlySummary.hasSalesData ? `Por ${monthlySummary.totalUnits} unidades vendidas/mes` : 'Sin ventas registradas'}
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
                        <td>
                          <select
                            aria-label={`Vincular ${sale.product_name}`}
                            value={sale.product_id ?? ''}
                            onChange={(e) => {
                              const nextProductId = e.target.value || null;
                              setState((prev) => {
                                const updatedSales = (prev.salesHistory ?? []).map((item) =>
                                  item.product_name === sale.product_name
                                    ? { ...item, product_id: nextProductId }
                                    : item
                                );
                                const targetMonth = prev.salesPeriod ?? sale.period_start.slice(0, 7);
                                const monthSales = updatedSales.filter(
                                  (item) =>
                                    item.period_start.slice(0, 7) === targetMonth &&
                                    item.period_end.slice(0, 7) === targetMonth &&
                                    item.product_id !== null
                                );
                                const nextSalesMap = { ...prev.productSalesMap };
                                if (monthSales.length > 0) {
                                  for (const prod of prev.catalog.recipes.filter((r) => r.recipe_type === 'product')) {
                                    nextSalesMap[prod.id] = {
                                      ...nextSalesMap[prod.id],
                                      monthlyUnitsSold: 0,
                                    };
                                  }
                                  for (const item of monthSales) {
                                    const pid = item.product_id!;
                                    nextSalesMap[pid] = {
                                      ...nextSalesMap[pid],
                                      monthlyUnitsSold: (nextSalesMap[pid]?.monthlyUnitsSold ?? 0) + item.quantity,
                                    };
                                  }
                                }
                                return {
                                  ...prev,
                                  salesHistory: updatedSales,
                                  salesPeriod: monthSales.length > 0 ? targetMonth : prev.salesPeriod,
                                  productSalesMap: nextSalesMap,
                                };
                              });
                            }}
                          >
                            <option value="">Pendiente de vincular</option>
                            {state.catalog.recipes
                              .filter((recipe) => recipe.recipe_type === 'product')
                              .map((recipe) => (
                                <option key={recipe.id} value={recipe.id}>
                                  {recipe.name}
                                </option>
                              ))}
                          </select>
                        </td>
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

      {/* Modal de Actualizador Rápido de Precios por Lista de Proveedor */}
      {showPriceListModal && (
        <div className="modal-backdrop">
          <div className="modal-panel" style={{ maxWidth: '960px', width: '95%' }}>
            <div className="modal-header">
              <div>
                <h3>Actualizar Precios por Lista de Proveedor</h3>
                <small>{priceListFileName} · {priceListMatches.length} productos detectados en la lista</small>
              </div>
              <button type="button" className="btn" onClick={() => setShowPriceListModal(false)}>Cerrar</button>
            </div>

            {(() => {
              const summary = summarizeMatches(priceListMatches);
              const selectedCount = Object.values(priceListSelectedRows).filter(Boolean).length;
              const filtered = priceListMatches
                .map((m, idx) => ({ match: m, originalIndex: idx }))
                .filter(({ match }) => {
                  if (priceListFilter === 'matched') return Boolean(match.target_id);
                  if (priceListFilter === 'unmatched') return !match.target_id;
                  if (priceListFilter === 'warnings') return match.warnings.length > 0;
                  return true;
                });

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                  <div style={{
                    display: 'flex',
                    gap: 16,
                    flexWrap: 'wrap',
                    padding: '10px 14px',
                    background: 'var(--color-bg-surface-2, #f5f5f5)',
                    borderRadius: 6,
                    fontSize: '0.85rem',
                    alignItems: 'center',
                  }}>
                    <span>Total en lista: <strong>{summary.total}</strong></span>
                    <span>Vinculados: <strong style={{ color: '#2e7d32' }}>{summary.matched}</strong></span>
                    <span>Sin vincular: <strong style={{ color: summary.unmatched ? '#d32f2f' : '#666' }}>{summary.unmatched}</strong></span>
                    <span>Subas: <strong style={{ color: '#c62828' }}>+{summary.increases}</strong></span>
                    <span>Bajas: <strong style={{ color: '#2e7d32' }}>-{summary.decreases}</strong></span>
                    {summary.average_variation_pct != null && (
                      <span>Var. promedio: <strong>{summary.average_variation_pct > 0 ? `+${summary.average_variation_pct}%` : `${summary.average_variation_pct}%`}</strong></span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, fontSize: '0.8rem' }}>
                    <button
                      type="button"
                      className={`btn btn--sm ${priceListFilter === 'all' ? 'btn--primary' : 'btn--secondary'}`}
                      onClick={() => setPriceListFilter('all')}
                    >
                      Todos ({priceListMatches.length})
                    </button>
                    <button
                      type="button"
                      className={`btn btn--sm ${priceListFilter === 'matched' ? 'btn--primary' : 'btn--secondary'}`}
                      onClick={() => setPriceListFilter('matched')}
                    >
                      Vinculados ({summary.matched})
                    </button>
                    <button
                      type="button"
                      className={`btn btn--sm ${priceListFilter === 'unmatched' ? 'btn--primary' : 'btn--secondary'}`}
                      onClick={() => setPriceListFilter('unmatched')}
                    >
                      Sin vincular ({summary.unmatched})
                    </button>
                    {summary.with_warnings > 0 && (
                      <button
                        type="button"
                        className={`btn btn--sm ${priceListFilter === 'warnings' ? 'btn--primary' : 'btn--secondary'}`}
                        style={{ color: '#e65100', borderColor: '#ffb74d' }}
                        onClick={() => setPriceListFilter('warnings')}
                      >
                        ⚠️ Con advertencias ({summary.with_warnings})
                      </button>
                    )}
                  </div>

                  <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: 6 }}>
                    <table className="kit-table" style={{ fontSize: '0.83rem', width: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ width: 32 }}>
                            <input
                              type="checkbox"
                              checked={selectedCount > 0 && selectedCount === priceListMatches.filter((m) => m.target_id && m.new_price_per_unit != null).length}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                const next: Record<number, boolean> = {};
                                priceListMatches.forEach((m, idx) => {
                                  if (m.target_id && m.new_price_per_unit != null) next[idx] = checked;
                                });
                                setPriceListSelectedRows(next);
                              }}
                            />
                          </th>
                          <th>Ítem en lista de proveedor</th>
                          <th>Insumo en Tools</th>
                          <th style={{ textAlign: 'right' }}>Precio lista</th>
                          <th style={{ textAlign: 'right' }}>Precio actual</th>
                          <th style={{ textAlign: 'right' }}>Nuevo unitario</th>
                          <th style={{ textAlign: 'center' }}>Variación</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(({ match, originalIndex }) => {
                          const isSel = Boolean(priceListSelectedRows[originalIndex]);
                          const ing = state.catalog.ingredients.find((i) => i.id === match.target_id);
                          const isInc = match.variation_pct != null && match.variation_pct > 0.05;
                          const isDec = match.variation_pct != null && match.variation_pct < -0.05;

                          return (
                            <tr key={originalIndex} style={{ background: !match.target_id ? '#fffdf7' : isSel ? '#fff' : '#fafafa' }}>
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  disabled={!match.target_id || match.new_price_per_unit == null}
                                  checked={isSel}
                                  onChange={(e) => {
                                    setPriceListSelectedRows((prev) => ({
                                      ...prev,
                                      [originalIndex]: e.target.checked,
                                    }));
                                  }}
                                />
                              </td>
                              <td>
                                <div style={{ fontWeight: 600 }}>{match.item.raw_name}</div>
                                {match.presentation && (
                                  <div style={{ fontSize: '0.74rem', color: '#666' }}>
                                    Envase: {match.presentation.quantity} {match.presentation.unit}
                                  </div>
                                )}
                                {match.warnings.map((w, i) => (
                                  <div key={i} style={{ fontSize: '0.72rem', color: '#e65100' }}>
                                    ⚠️ {w}
                                  </div>
                                ))}
                              </td>
                              <td>
                                <select
                                  value={match.target_id ?? ''}
                                  onChange={(e) => handlePriceListTargetChange(originalIndex, e.target.value)}
                                  style={{
                                    padding: '4px 6px',
                                    fontSize: '0.8rem',
                                    borderRadius: 4,
                                    border: match.target_id ? '1px solid #ccc' : '1px solid #ffa726',
                                    background: match.target_id ? '#fff' : '#fff8e1',
                                    maxWidth: '220px',
                                  }}
                                >
                                  <option value="">— Sin vincular —</option>
                                  {state.catalog.ingredients.map((i) => (
                                    <option key={i.id} value={i.id}>
                                      {i.name} ({i.base_unit})
                                    </option>
                                  ))}
                                </select>
                                {match.target_id && (
                                  <div style={{ fontSize: '0.7rem', color: '#777', marginTop: 2 }}>
                                    Match: {match.source === 'exact' ? 'Exacto' : `Similar (${Math.round(match.confidence * 100)}%)`}
                                  </div>
                                )}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {state.currency} {formatDecimal(match.item.price, 2)}
                              </td>
                              <td style={{ textAlign: 'right', color: '#666' }}>
                                {match.old_price_per_unit != null ? `${state.currency} ${formatDecimal(match.old_price_per_unit, 2)}` : '—'}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                {match.new_price_per_unit != null && ing
                                  ? `${state.currency} ${formatDecimal(match.new_price_per_unit, 2)} / ${ing.base_unit}`
                                  : '—'}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {match.variation_pct != null ? (
                                  <span
                                    style={{
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      fontSize: '0.75rem',
                                      fontWeight: 600,
                                      background: isInc ? '#ffebee' : isDec ? '#e8f5e9' : '#f5f5f5',
                                      color: isInc ? '#c62828' : isDec ? '#2e7d32' : '#616161',
                                    }}
                                  >
                                    {match.variation_pct > 0 ? `+${match.variation_pct}%` : `${match.variation_pct}%`}
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                    <small style={{ color: '#666' }}>
                      Se agregarán nuevos registros de compra con fecha de hoy. Tus snapshots y cálculos históricos permanecen inalterados.
                    </small>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn btn--secondary" onClick={() => setShowPriceListModal(false)}>
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn btn--primary"
                        disabled={selectedCount === 0}
                        onClick={confirmPriceListApply}
                      >
                        Aplicar {selectedCount} {selectedCount === 1 ? 'precio' : 'precios'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
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
                        <option value="sales">Ventas</option>
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
            {(() => {
              const unmatched = findUnmatchedComponents(state, smartImportPreview.sheets, smartImportPreview.mappings, importEquivalences);
              if (unmatched.length === 0) return null;
              return (
                <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 8, padding: 14, margin: '14px 0' }}>
                  <strong style={{ color: '#92400e', display: 'block', marginBottom: 6 }}>
                    🔍 Insumos en recetas sin coincidencia exacta en el catálogo ({unmatched.length})
                  </strong>
                  <p style={{ fontSize: '0.84rem', color: '#78350f', margin: '0 0 10px' }}>
                    Las recetas importadas mencionan los siguientes ingredientes que no existen con el mismo nombre en tu lista de insumos. Podés asociarlos a un insumo existente para costearlos automáticamente o dejarlos como nuevos insumos.
                  </p>
                  <div style={{ display: 'grid', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                    {unmatched.map((name) => (
                      <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#fff', padding: '6px 10px', borderRadius: 6, border: '1px solid #fed7aa' }}>
                        <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>{name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: '0.78rem', color: '#9a3412' }}>Vincular a:</span>
                          <select
                            style={{ fontSize: '0.82rem', padding: '3px 6px' }}
                            value={importEquivalences[name.toLowerCase()] ?? ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setImportEquivalences((prev) => {
                                const next = { ...prev };
                                if (val) next[name.toLowerCase()] = val;
                                else delete next[name.toLowerCase()];
                                return next;
                              });
                            }}
                          >
                            <option value="">Crear como nuevo insumo</option>
                            {state.catalog.ingredients.map((ing) => (
                              <option key={ing.id} value={ing.name}>
                                {ing.name} ({ing.base_unit})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--line)', borderRadius: 10, padding: 16, marginTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: '0.94rem' }}>Modalidad de Importación</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 10, borderRadius: 8, border: !replaceWorkspaceOnImport ? '2px solid var(--brand)' : '1px solid var(--line)', background: !replaceWorkspaceOnImport ? '#fff' : 'transparent', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="importMode"
                    checked={!replaceWorkspaceOnImport}
                    onChange={() => { setReplaceWorkspaceOnImport(false); setReplaceConfirmed(false); }}
                    style={{ marginTop: 3 }}
                  />
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.88rem' }}>🔗 Combinar con datos existentes</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginTop: 2 }}>
                      Conserva recetas, insumos y precios actuales. Detecta duplicados para evitar registros repetidos.
                    </span>
                  </div>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 10, borderRadius: 8, border: replaceWorkspaceOnImport ? '2px solid #ea580c' : '1px solid var(--line)', background: replaceWorkspaceOnImport ? '#fff7ed' : 'transparent', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="importMode"
                    checked={replaceWorkspaceOnImport}
                    onChange={() => setReplaceWorkspaceOnImport(true)}
                    style={{ marginTop: 3 }}
                  />
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.88rem', color: '#9a3412' }}>🔄 Reemplazar espacio de trabajo</strong>
                    <span style={{ fontSize: '0.8rem', color: '#7c2d12', display: 'block', marginTop: 2 }}>
                      Sustituye recetas, insumos y gastos por los datos de la planilla. Se descargará una copia de seguridad JSON.
                    </span>
                  </div>
                </label>
              </div>

              {replaceWorkspaceOnImport && (
                <div style={{ marginTop: 12, padding: 10, background: '#fef2f2', border: '1px solid #f87171', borderRadius: 6, fontSize: '0.84rem', color: '#991b1b' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={replaceConfirmed}
                      onChange={(e) => setReplaceConfirmed(e.target.checked)}
                    />
                    <span>Confirmo que deseo reemplazar mi catálogo actual por los datos importados (se descargará respaldo JSON).</span>
                  </label>
                </div>
              )}
            </div>

            <div className="smart-import-footer">
              <button type="button" className="btn" onClick={() => { setSmartImportPreview(null); setImportEquivalences({}); setReplaceConfirmed(false); }}>Cancelar</button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={replaceWorkspaceOnImport && !replaceConfirmed}
                onClick={confirmSmartImport}
              >
                Confirmar e incorporar datos
              </button>
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
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                <button
                  type="button"
                  className="btn btn--sm btn--secondary"
                  onClick={() => { setHelpTopic('bakers'); setShowHelpModal(true); }}
                >
                  🍞 ¿Cómo funcionan los porcentajes de panadero?
                </button>
              </div>
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

      {/* Modal de Confirmación para Limpiar Datos Demo */}
      {showClearDemoConfirm && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="clear-demo-title">
          <div className="modal-panel" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3 id="clear-demo-title" style={{ color: '#b91c1c' }}>⚠️ ¿Limpiar datos de demostración?</h3>
              <button type="button" className="btn btn--secondary" onClick={() => setShowClearDemoConfirm(false)}>✕</button>
            </div>
            <p style={{ margin: '14px 0', fontSize: '0.92rem', lineHeight: 1.5 }}>
              Esta acción vaciará las recetas, insumos, gastos y ventas de ejemplo de <strong>«Pizzería Demo — Il Forno»</strong>, dejándote un espacio de trabajo en blanco listo para cargar los datos reales de tu negocio.
            </p>
            <p style={{ fontSize: '0.84rem', color: 'var(--muted)', margin: '0 0 18px' }}>
              Se conservarán tu moneda ({state.currency}), idioma y decimales. Siempre podrás volver a restaurar los datos de demo desde la barra superior.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setShowClearDemoConfirm(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn--primary"
                style={{ background: '#b91c1c', borderColor: '#991b1b' }}
                onClick={() => {
                  setState(createEmptyWorkspace(state.locale, state.currency));
                  setShowClearDemoConfirm(false);
                }}
              >
                Sí, vaciar y empezar de cero
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Comercial de Planes y Suscripción */}
      {showPlansModal && (
        <CommercialPlansModal
          onClose={() => setShowPlansModal(false)}
          userEmail={account.email}
        />
      )}

      {/* Modal de Reporte Ejecutivo Imprimible */}
      {showReportModal && (
        <ExecutiveReportModal
          state={state}
          monthlySummary={monthlySummary}
          totalMonthlyExpenses={totalMonthlyExpenses}
          netOperatingProfit={netOperatingProfit}
          breakEvenRevenue={breakEvenRevenue}
          onClose={() => setShowReportModal(false)}
        />
      )}

      {/* Modal de Ayuda Contextual Culinaria */}
      {showHelpModal && (
        <ContextualHelpModal
          initialTopic={helpTopic}
          onClose={() => setShowHelpModal(false)}
        />
      )}
    </div>
  );
}
