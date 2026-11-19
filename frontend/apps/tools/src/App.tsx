import { useEffect, useMemo, useRef, useState } from 'react';
import {
  areUnitsCompatible,
  CostEngine,
  CostEngineValidationError,
  calculatePricingScenario,
  classifyIngredientCategory,
  computeUsableIngredientCost,
  convertQuantity,
  createCostSnapshot,
  decomposeRecipeCategoryCosts,
  expandBakersDoughSpec,
  formatCalendarDate,
  formatDecimal,
  formatHistoricalDateTime,
  formatLocaleNumber,
  parseLocaleNumber,
  selectEffectivePurchasePrice,
  todayLocalDateString,
  toLocalIsoTimestamp,
  type Dimension,
  type Recipe,
  type RecipeComponent,
  type UnitCode,
} from '@pizzalog/cost-engine';
import { goldenCases } from '@pizzalog/cost-engine-fixtures';
import {
  createInitialDemoWorkspace,
  createEmptyWorkspace,
  isDemoWorkspace,
  normalizeWorkspace,
  type LocaleCode,
  type OperatingExpenseItem,
  type SalesImportRecord,
  type ToolsWorkspaceState,
} from './demoData';
import { CommercialPlansModal } from './CommercialPlansModal';
import { ContextualHelpModal, type HelpTopic } from './ContextualHelpModal';
import { ExecutiveReportModal } from './ExecutiveReportModal';
import { ExchangeRatesModal, PriceHistoryModal } from './PriceHistoryModal';
import { downloadCustomProfitKitXlsx, downloadTemplateProfitKitXlsx } from './xlsxExporter';
import { TOOLS_I18N, type ToolsDictionary } from './i18n';
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
import { parseToolsJsonResponse, toolsFetch } from './ToolsAuthGate';

const ALL_UNITS: UnitCode[] = ['g', 'kg', 'mg', 'lb', 'oz', 'ml', 'cc', 'L', 'fl_oz_us', 'gal_us', 'unit', 'dozen'];

type ToolsAccount = { id: number; email: string; name: string; expires_at?: string | null };

function getImportFieldLabels(t: ToolsDictionary): Record<ImportSheetMapping['kind'], Array<[string, string]>> {
  return {
    ingredients: [
      ['name', t.ingColName], ['base_unit', t.ingColDimBase], ['base_dimension', 'Dimensión'],
      ['purchase_price', t.ingColPrice], ['currency', t.currencyLabel], ['pack_quantity', t.ingColPackQty],
      ['pack_unit', t.ingColPackUnit], ['yield_pct', t.ingColYield],
      ['density_g_per_ml', t.ingColDensity], ['unit_weight_g', t.ingColUnitWeight], ['supplier', t.ingHistorySupplier],
      ['purchase_date', t.ingHistoryDate],
    ],
    purchase_prices: [
      ['ingredient_name', t.ingColName], ['purchase_price', t.ingColPrice], ['currency', t.currencyLabel],
      ['pack_quantity', t.ingColPackQty], ['pack_unit', t.ingColPackUnit],
      ['yield_pct', t.ingColYield], ['supplier', t.ingHistorySupplier], ['purchase_date', t.ingHistoryDate],
    ],
    recipes: [
      ['recipe_name', t.builderNameLabel], ['recipe_type', t.impSheetKindLabel], ['yield_quantity', t.builderYieldLabel],
      ['yield_unit', t.builderYieldUnitLabel], ['component_name', t.recSimColComponent],
      ['component_quantity', t.prodColTotalQty], ['component_unit', t.builderYieldUnitLabel],
    ],
    operating_expenses: [
      ['expense_name', t.expColName], ['expense_category', t.expColCategory], ['expense_period', t.expColPeriod],
      ['expense_amount', t.expColAmount],
    ],
    sales: [
      ['product_name', t.recColProduct], ['quantity', t.salesColUnits], ['period_start', t.salesColPeriod],
      ['period_end', t.salesColPeriod], ['channel', t.salesColChannel], ['gross_revenue', t.salesColGrossRev],
      ['net_revenue', t.salesColNetRev], ['source', t.salesColSource],
    ],
    unknown: [],
  };
}

export function App({
  token,
  account,
  initialWorkspace,
  initialUpdatedAt,
  initialVersion,
  toolsEnvironment = 'production',
  onLogout,
}: {
  token: string;
  account: ToolsAccount;
  initialWorkspace: ToolsWorkspaceState;
  initialUpdatedAt?: string | null;
  initialVersion?: number | null;
  toolsEnvironment?: 'staging' | 'production';
  onLogout: () => void;
}) {
  const [state, setState] = useState<ToolsWorkspaceState>(() => normalizeWorkspace(initialWorkspace));
  const workspaceUpdatedAtRef = useRef<string | null>(initialUpdatedAt ?? null);
  const workspaceVersionRef = useRef<number | null>(initialVersion ?? null);
  const [onlineRetryTick, setOnlineRetryTick] = useState<number>(0);
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
  const isInitialMountRef = useRef<boolean>(true);
  const lastSavedJsonRef = useRef<string>('');
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

  // Modales comerciales, reportes, ayuda contextual, historial de precios, tipos de cambio y confirmación de demo
  const [showPlansModal, setShowPlansModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [helpTopic, setHelpTopic] = useState<HelpTopic>('units');
  const [showClearDemoConfirm, setShowClearDemoConfirm] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [priceHistoryIngredientId, setPriceHistoryIngredientId] = useState<string | null>(null);
  const [showExchangeRatesModal, setShowExchangeRatesModal] = useState(false);
  const [cloudBackups, setCloudBackups] = useState<Array<{ id: number; version: number; created_at: string; size_bytes: number }>>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [restoringBackupId, setRestoringBackupId] = useState<number | null>(null);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [syncImportMode, setSyncImportMode] = useState<'merge_preserve_manual' | 'overwrite_app_records'>('merge_preserve_manual');
  const [manualSaleForm, setManualSaleForm] = useState(() => {
    const ym = todayLocalDateString().slice(0, 7);
    const [y, m] = ym.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y || 2026, m || 1, 0)).getUTCDate();
    return {
      productId: '',
      quantity: 50,
      channel: 'Salón',
      periodStart: `${ym}-01`,
      periodEnd: `${ym}-${String(lastDay).padStart(2, '0')}`,
      grossRevenue: '',
    };
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = state.locale;
    }
    try {
      localStorage.setItem('pizzalog_tools_locale', state.locale);
    } catch { /* ignore */ }
  }, [state.locale]);

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
  const [simCategoryFilter, setSimCategoryFilter] = useState<'all' | 'flour' | 'dairy' | 'meat' | 'vegetables'>('all');

  useEffect(() => {
    const onOnline = () => setOnlineRetryTick((n) => n + 1);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  useEffect(() => {
    const workspaceSnapshot = state;
    const serialized = JSON.stringify(workspaceSnapshot);
    if (account.id === 0 || token === 'guest-demo-token') {
      try {
        localStorage.setItem('pizzalog_tools_guest_workspace', serialized);
      } catch {
        // Ignorar si el storage local está lleno
      }
      return;
    }

    // No disparar un guardado redundante apenas se monta el componente con los mismos datos que vinieron del servidor
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      lastSavedJsonRef.current = serialized;
      try {
        localStorage.setItem(
          `pizzalog_tools_recovery_${account.id}`,
          JSON.stringify({
            workspace: workspaceSnapshot,
            baseVersion: workspaceVersionRef.current,
            baseUpdatedAt: workspaceUpdatedAtRef.current,
            savedAt: new Date().toISOString(),
            pendingSync: false,
          })
        );
      } catch {
        // Ignorar si el storage local está lleno
      }
      return;
    }
    if (serialized === lastSavedJsonRef.current) {
      return;
    }

    // Guardar copia de recuperación local inmediata por cuenta antes del autosave de red (resiliencia ante pérdida de conexión)
    try {
      localStorage.setItem(
        `pizzalog_tools_recovery_${account.id}`,
        JSON.stringify({
          workspace: workspaceSnapshot,
          baseVersion: workspaceVersionRef.current,
          baseUpdatedAt: workspaceUpdatedAtRef.current,
          savedAt: new Date().toISOString(),
          pendingSync: true,
        })
      );
    } catch {
      // Ignorar si el storage local está lleno
    }

    const timer = window.setTimeout(() => {
      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          setIsSavingWorkspace(true);
          try {
            const response = await toolsFetch(`/tools/workspace`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                workspace: workspaceSnapshot,
                version: workspaceVersionRef.current,
                updated_at: workspaceUpdatedAtRef.current,
              }),
            });
            const payload = await parseToolsJsonResponse<{ ok?: boolean; error?: string; data?: { updated_at?: string; version?: number; backup_created?: boolean; backup_warning?: string | null; backup_cleanup_warning?: string | null } }>(response);
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
            if (typeof payload.data?.version === 'number') {
              workspaceVersionRef.current = payload.data.version;
            }
            if (payload.data?.backup_warning) {
              setBackupNotice(payload.data.backup_warning);
            } else if (payload.data?.backup_cleanup_warning) {
              setBackupNotice(payload.data.backup_cleanup_warning);
            }
            lastSavedJsonRef.current = serialized;
            try {
              localStorage.setItem(
                `pizzalog_tools_recovery_${account.id}`,
                JSON.stringify({
                  workspace: workspaceSnapshot,
                  baseVersion: workspaceVersionRef.current,
                  baseUpdatedAt: workspaceUpdatedAtRef.current,
                  savedAt: new Date().toISOString(),
                  pendingSync: false,
                })
              );
            } catch {
              // Ignorar si el storage local está lleno
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
  }, [state, token, account.id, onlineRetryTick]);

  const loc: LocaleCode = state.locale === 'pt-BR' || state.locale === 'en' ? state.locale : 'es-AR';
  const t = TOOLS_I18N[loc] ?? TOOLS_I18N['es-AR'];
  const fmt = (value: number, dec = 2) => formatLocaleNumber(value, loc, dec);
  const fmtDate = (value: string | null | undefined) => formatCalendarDate(value, loc);
  const fmtDateTime = (value: string | null | undefined) => formatHistoricalDateTime(value, loc);
  const importFieldLabels = useMemo(() => getImportFieldLabels(t), [t]);
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
    const isUs = state.unitSystem === 'us_customary';
    const baseUnit: UnitCode = isUs ? 'oz' : 'g';
    const packUnit: UnitCode = isUs ? 'lb' : 'kg';
    setState((prev) => ({
      ...prev,
      catalog: {
        ...prev.catalog,
        ingredients: [
          ...prev.catalog.ingredients,
          {
            id,
            name: `${loc === 'en' ? 'New Ingredient' : loc === 'pt-BR' ? 'Novo Insumo' : 'Nuevo Insumo'} #${nextNum}`,
            base_dimension: 'mass',
            base_unit: baseUnit,
            is_active: true,
          },
        ],
        purchase_prices: [
          ...prev.catalog.purchase_prices,
          {
            ingredient_id: id,
            purchase_date: todayLocalDateString(),
            purchase_price: null,
            currency: prev.currency,
            pack_quantity: 1,
            pack_unit: packUnit,
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
      setBuilderError(t.builderErrNameRequired);
      return;
    }
    if (editingRecipe.bakers_dough) {
      const flourTotal = editingRecipe.bakers_dough.flours.reduce((sum, flour) => sum + (flour.share_pct ?? 0), 0);
      if (Math.abs(flourTotal - 100) > 0.01) {
        setBuilderError(`${t.builderErrFlourSum} (${fmt(flourTotal, 1)}%).`);
        return;
      }
      if (editingRecipe.bakers_dough.yield_basis === 'measured_yield' &&
          !(Number(editingRecipe.bakers_dough.measured_yield_g) > 0)) {
        setBuilderError(t.builderErrMeasuredYield);
        return;
      }
    }
    if (!editingRecipe.bakers_dough && (!editingRecipe.components || editingRecipe.components.length === 0)) {
      setBuilderError(t.builderErrNoComponents);
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
        setBuilderError(err.message);
      } else {
        setBuilderError(err instanceof Error ? err.message : t.recSimIncompleteErr);
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
    a.download = `pizzalog-profit-kit-${todayLocalDateString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSmartImport(file: File) {
    setImportError(null);
    setImportNotice(null);
    setIsSmartImporting(true);
    try {
      const sheets = await parseImportFile(file);
      const previewSampleSheets = sheets.map((s) => ({
        name: s.name,
        rows: s.rows.slice(0, 60),
        total_rows: s.rows.length,
      }));
      const response = await toolsFetch(`/tools/import/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sheets: previewSampleSheets }),
      });
      const payload = await parseToolsJsonResponse<{
        ok?: boolean;
        error?: string;
        data?: { sheets: ImportSheetMapping[]; ai_previews_remaining_today: number; note?: string; mapping_mode?: 'local' | 'ai' };
      }>(response);
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
      backupLink.download = `pizzalog-tools-backup-${todayLocalDateString()}.json`;
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
        let grossInBase: number | null = null;
        try {
          const info = computeUsableIngredientCost(
            ing,
            priceRec,
            state.currency,
            state.catalog.exchange_rates,
            state.catalog.as_of_date
          );
          grossInBase = info.grossUnitCostInBase;
        } catch {
          grossInBase = null;
        }
        return {
          id: ing.id,
          name: ing.name,
          unit: ing.base_unit,
          current_price_per_unit: grossInBase,
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
      let grossInBase: number | null = null;
      try {
        const info = computeUsableIngredientCost(
          ing,
          priceRec,
          state.currency,
          state.catalog.exchange_rates,
          state.catalog.as_of_date
        );
        grossInBase = info.grossUnitCostInBase;
      } catch {
        grossInBase = null;
      }
      return {
        id: ing.id,
        name: ing.name,
        unit: ing.base_unit,
        current_price_per_unit: grossInBase,
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
    const today = todayLocalDateString();
    const toApply = priceListMatches.filter((m, idx) => priceListSelectedRows[idx] && m.target_id && m.new_price_per_unit != null);
    if (!toApply.length) return;

    setState((prev) => {
      const newPrices = [...prev.catalog.purchase_prices];
      toApply.forEach((m) => {
        const ing = prev.catalog.ingredients.find((i) => i.id === m.target_id);
        if (!ing) return;
        const existingPriceRec = selectEffectivePurchasePrice(
          m.target_id!,
          prev.catalog.purchase_prices,
          prev.catalog.as_of_date
        );
        newPrices.push({
          ingredient_id: m.target_id!,
          purchase_date: today,
          purchase_price: m.item.price,
          currency: prev.currency,
          pack_quantity: m.presentation?.quantity ?? existingPriceRec?.pack_quantity ?? 1,
          pack_unit: (m.presentation?.unit as UnitCode) ?? existingPriceRec?.pack_unit ?? ing.base_unit,
          yield_pct: existingPriceRec?.yield_pct ?? 100,
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
        const normalized = normalizeWorkspace(parsed);
        const testEngine = new CostEngine(normalized.catalog);
        for (const r of normalized.catalog.recipes) {
          testEngine.calculateRecipeCost(r.id);
        }
        setState(normalized);
        setImportNotice(`Respaldo JSON restaurado correctamente (${normalized.catalog.ingredients.length} insumos, ${normalized.catalog.recipes.length} recetas).`);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Error al validar archivo importado');
      }
    };
    reader.readAsText(file);
  }

  async function loadCloudBackups() {
    if (account.id === 0 || token === 'guest-demo-token') return;
    setLoadingBackups(true);
    try {
      const res = await toolsFetch(`/tools/workspace/backups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await parseToolsJsonResponse<{ ok?: boolean; data?: { backups?: Array<{ id: number; version: number; created_at: string; size_bytes: number }> } }>(res);
      if (data.ok && Array.isArray(data.data?.backups)) {
        setCloudBackups(data.data.backups);
      }
    } catch {
      // Sin conexión o sin permisos
    } finally {
      setLoadingBackups(false);
    }
  }

  async function restoreCloudBackup(backupId: number) {
    if (account.id === 0 || token === 'guest-demo-token') return;
    setRestoringBackupId(backupId);
    setBackupNotice(null);
    setImportError(null);
    try {
      const res = await toolsFetch(`/tools/workspace/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ backup_id: backupId }),
      });
      const data = await parseToolsJsonResponse<{
        ok?: boolean;
        error?: string;
        data?: { workspace?: any; version?: number; updated_at?: string };
      }>(res);
      if (!res.ok || !data.ok || !data.data?.workspace) {
        throw new Error(data.error || 'No se pudo restaurar el backup');
      }
      const normalized = normalizeWorkspace(data.data.workspace);
      if (typeof data.data.version === 'number') {
        workspaceVersionRef.current = data.data.version;
      }
      if (data.data.updated_at) {
        workspaceUpdatedAtRef.current = data.data.updated_at;
      }
      lastSavedJsonRef.current = JSON.stringify(normalized);
      setState(normalized);
      setBackupNotice(t.bkpRestoredOk);
      void loadCloudBackups();
    } catch (err: any) {
      setImportError(err?.message || 'No se pudo restaurar el backup');
    } finally {
      setRestoringBackupId(null);
    }
  }

  async function loadSyncStatus() {
    setSyncLoading(true);
    setSyncError(null);
    try {
      const res = await toolsFetch(`/tools/sync/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await parseToolsJsonResponse<{ ok?: boolean; data?: any }>(res);
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
      const res = await toolsFetch(`/tools/sync/link-app`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: syncLinkEmail, password: syncLinkPassword }),
      });
      const data = await parseToolsJsonResponse<{ ok?: boolean; error?: string; data?: any }>(res);
      if (!res.ok || !data.ok || !data.data) throw new Error(data.error || 'Error al vincular cuenta');
      setSyncStatus(data.data);
      setSyncNotice(`✓ "${data.data.business_name}"`);
      setSyncLinkPassword('');
    } catch (err: any) {
      setSyncError(err?.message || 'No se pudo vincular la cuenta');
    } finally {
      setSyncLoading(false);
    }
  }

  async function handleUnlinkApp() {
    setSyncLoading(true);
    setSyncError(null);
    setSyncNotice(null);
    try {
      const res = await toolsFetch(`/tools/sync/unlink-app`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await parseToolsJsonResponse<{ ok?: boolean; error?: string; data?: any }>(res);
      if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo desvincular');
      setSyncStatus({ linked: false });
      setSyncPreviewData(null);
      setSyncNotice(t.syncUnlinkBtn + ' ✓');
    } catch (err: any) {
      setSyncError(err?.message || 'No se pudo desvincular');
    } finally {
      setSyncLoading(false);
    }
  }

  async function handleSyncPreview(direction: 'to_app' | 'from_app') {
    setSyncLoading(true);
    setSyncError(null);
    try {
      const res = await toolsFetch(`/tools/sync/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ direction, ...(direction === 'from_app' ? { mode: syncImportMode } : {}) }),
      });
      const data = await parseToolsJsonResponse<{ ok?: boolean; error?: string; data?: any }>(res);
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
      ? `${t.syncExportTitle}?`
      : `${t.syncImportTitle}?`)) return;

    setSyncLoading(true);
    setSyncError(null);
    setSyncNotice(null);
    try {
      const res = await toolsFetch(`/tools/sync/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ direction, ...(direction === 'from_app' ? { mode: syncImportMode } : {}) }),
      });
      const data = await parseToolsJsonResponse<{ ok?: boolean; error?: string; data?: any }>(res);
      if (!res.ok || !data.ok || !data.data) throw new Error(data.error || 'Error al sincronizar');

      if (direction === 'to_app') {
        setSyncNotice(`✓ ${data.data.created_supplies} / ${data.data.updated_supplies}`);
      } else {
        if (data.data?.workspace) {
          workspaceUpdatedAtRef.current = data.data.updated_at ?? workspaceUpdatedAtRef.current;
          if (typeof data.data.version === 'number') {
            workspaceVersionRef.current = data.data.version;
          }
          const normalized = normalizeWorkspace(data.data.workspace);
          lastSavedJsonRef.current = JSON.stringify(normalized);
          setState(normalized);
        } else {
          const wsRes = await toolsFetch(`/tools/workspace`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const wsData = await parseToolsJsonResponse<{ ok?: boolean; data?: any }>(wsRes);
          if (wsData.ok && wsData.data?.workspace) {
            workspaceUpdatedAtRef.current = wsData.data.updated_at ?? data.data?.updated_at ?? null;
            if (typeof wsData.data.version === 'number') {
              workspaceVersionRef.current = wsData.data.version;
            }
            const normalized = normalizeWorkspace(wsData.data.workspace);
            lastSavedJsonRef.current = JSON.stringify(normalized);
            setState(normalized);
          }
        }
        const importedProds = data.data.imported_products ?? data.data.imported_recipes ?? 0;
        const importedSales = data.data.imported_sales ?? 0;
        setSyncNotice(`✓ ${data.data.imported_ingredients} · ${importedProds} · ${importedSales}`);
      }
      setSyncPreviewData(null);
    } catch (err: any) {
      setSyncError(err?.message || 'Error al sincronizar');
    } finally {
      setSyncLoading(false);
    }
  }

  function addManualSale() {
    const product = state.catalog.recipes.find((r) => r.recipe_type === 'product' && r.id === manualSaleForm.productId)
      ?? state.catalog.recipes.find((r) => r.recipe_type === 'product');
    if (!product) return;
    const qty = Math.max(0, Number(manualSaleForm.quantity) || 0);
    if (qty <= 0) return;
    const pStart = manualSaleForm.periodStart || todayLocalDateString();
    const pEnd = (manualSaleForm.periodEnd && manualSaleForm.periodEnd >= pStart) ? manualSaleForm.periodEnd : pStart;
    const grossVal = manualSaleForm.grossRevenue.trim() !== '' ? parseLocaleNumber(manualSaleForm.grossRevenue) : null;
    const newRecord: SalesImportRecord = {
      id: `sale_manual_${Date.now()}`,
      product_id: product.id,
      product_name: product.name,
      quantity: qty,
      period_start: pStart,
      period_end: pEnd,
      channel: manualSaleForm.channel.trim() || 'Salón',
      ...(grossVal !== null && grossVal >= 0 ? { gross_revenue: grossVal, net_revenue: grossVal } : {}),
      source: t.salesManualSourceLabel,
      imported_at: toLocalIsoTimestamp(),
    };
    setState((prev) => {
      const updatedSales = [newRecord, ...(prev.salesHistory ?? [])];
      const targetMonth = pStart.slice(0, 7);
      const monthSales = updatedSales.filter((s) => s.period_start.slice(0, 7) === targetMonth && s.product_id);
      const nextSalesMap = { ...prev.productSalesMap };
      for (const prod of prev.catalog.recipes.filter((r) => r.recipe_type === 'product')) {
        nextSalesMap[prod.id] = { ...nextSalesMap[prod.id], monthlyUnitsSold: 0 };
      }
      for (const item of monthSales) {
        const pid = item.product_id!;
        nextSalesMap[pid] = {
          ...nextSalesMap[pid],
          monthlyUnitsSold: (nextSalesMap[pid]?.monthlyUnitsSold ?? 0) + item.quantity,
        };
      }
      return {
        ...prev,
        salesHistory: updatedSales,
        salesPeriod: targetMonth,
        productSalesMap: nextSalesMap,
      };
    });
    setManualSaleForm((prev) => ({ ...prev, grossRevenue: '' }));
  }

  function deleteSalesRecord(saleId: string) {
    setState((prev) => {
      const updatedSales = (prev.salesHistory ?? []).filter((s) => s.id !== saleId);
      const nextSalesMap = { ...prev.productSalesMap };
      const targetMonth = prev.salesPeriod;
      if (targetMonth) {
        for (const prod of prev.catalog.recipes.filter((r) => r.recipe_type === 'product')) {
          nextSalesMap[prod.id] = { ...nextSalesMap[prod.id], monthlyUnitsSold: 0 };
        }
        for (const item of updatedSales) {
          if (item.product_id && item.period_start.slice(0, 7) === targetMonth) {
            nextSalesMap[item.product_id] = {
              ...nextSalesMap[item.product_id],
              monthlyUnitsSold: (nextSalesMap[item.product_id]?.monthlyUnitsSold ?? 0) + item.quantity,
            };
          }
        }
      }
      return {
        ...prev,
        salesHistory: updatedSales,
        productSalesMap: nextSalesMap,
      };
    });
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
      const rawSellingPrice = Number(salesPlan.sellingPrice);
      const customPrice = Number.isFinite(rawSellingPrice) && rawSellingPrice > 0 ? rawSellingPrice : undefined;

      const rawTargetFc = Number(prod.target_food_cost_pct ?? wsState.defaultTargetFoodCostPct ?? 30);
      const safeTargetFc = Number.isFinite(rawTargetFc) && rawTargetFc > 0 && rawTargetFc < 100 ? rawTargetFc : 30;
      const rawRounding = Number(wsState.defaultRoundingIncrement ?? 100);
      const safeRounding = Number.isFinite(rawRounding) && rawRounding > 0 ? rawRounding : 100;
      const rawPackaging = Number(wsState.defaultPackagingCost ?? 0);
      const safePackaging = Number.isFinite(rawPackaging) && rawPackaging >= 0 ? rawPackaging : 0;
      const rawChannelFee = Number(wsState.defaultChannelFeePct ?? 0);
      const safeChannelFee = Number.isFinite(rawChannelFee) && rawChannelFee >= 0 && rawChannelFee < 100 ? rawChannelFee : 0;

      let pricing: ReturnType<typeof calculatePricingScenario> | null = null;
      if (res) {
        try {
          const canPrice =
            res.status === 'complete' &&
            typeof res.raw_unit_cost === 'number' &&
            Number.isFinite(res.raw_unit_cost) &&
            res.raw_unit_cost > 0;
          pricing = calculatePricingScenario({
            unit_cost: canPrice ? res.raw_unit_cost : null,
            status: canPrice ? 'complete' : 'incomplete',
            currency: wsState.currency || 'ARS',
            target_food_cost_pct: safeTargetFc,
            rounding_increment: safeRounding,
            rounding_mode: 'ceil',
            selling_price: customPrice,
            packaging_cost: safePackaging,
            channel_fee_pct: safeChannelFee,
          });
        } catch {
          pricing = null;
        }
      }

      // Filtrar registros de ventas para este producto
      let units: number | null = null;
      let periodGrossRevenue: number | null = null;
      let periodNetRevenue: number | null = null;

      const matchingSales = salesHistory.filter((sale) => {
        if (!sale || sale.product_id !== prod.id) return false;
        const pStart = typeof sale.period_start === 'string' ? sale.period_start : '';
        if (periodFilter !== 'all' && !pStart.startsWith(periodFilter)) return false;
        if (channelFilter !== 'all' && sale.channel !== channelFilter) return false;
        return true;
      });

      if (matchingSales.length > 0) {
        units = matchingSales.reduce((acc, s) => acc + (Number(s.quantity) || 0), 0);
        periodGrossRevenue = matchingSales.reduce((acc, s) => acc + (Number(s.gross_revenue) || 0), 0);
        periodNetRevenue = matchingSales.reduce((acc, s) => acc + (Number(s.net_revenue) || 0), 0);
      } else if (periodFilter === 'all' && channelFilter === 'all' && salesPlan.monthlyUnitsSold !== null && salesPlan.monthlyUnitsSold !== undefined && Number.isFinite(Number(salesPlan.monthlyUnitsSold))) {
        units = Math.max(0, Number(salesPlan.monthlyUnitsSold));
      }

      const isComplete = res?.status === 'complete' && pricing?.status === 'complete';
      const hasSalesData = units !== null;
      const unitCost = isComplete && res?.raw_unit_cost ? res.raw_unit_cost : 0;
      const evaluatedPrice = isComplete && pricing?.raw_evaluated_price ? pricing.raw_evaluated_price : (customPrice ?? 0);
      const unitGrossProfit = isComplete && pricing?.raw_gross_profit ? pricing.raw_gross_profit : 0;

      const monthlyRevenue = isComplete && hasSalesData
        ? (periodNetRevenue !== null && periodNetRevenue > 0 ? periodNetRevenue : evaluatedPrice * units!)
        : null;
      const monthlyCogs = isComplete && hasSalesData ? unitCost * units! : null;
      const monthlyContribution = isComplete && hasSalesData ? unitGrossProfit * units! : null;

      // Diagnóstico de datos incompletos
      let incompleteReason: string | null = null;
      if (!res || res.status !== 'complete') {
        incompleteReason = (prod.components?.length ?? 0) === 0 && !prod.bakers_dough
          ? t.recNoRecipeHint
          : t.recSimIncompleteErr;
      } else if (!pricing || pricing.status !== 'complete' || evaluatedPrice <= 0) {
        incompleteReason = t.recMissingPriceLabel;
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
          matrixLabel = `⚠️ ${t.incompleteTag}`;
        } else if (r.hasSalesData) {
          if (r.units === 0) {
            matrixClass = 'dog';
            matrixLabel = loc === 'en' ? '0 sales' : loc === 'pt-BR' ? '0 vendas' : '0 ventas';
          } else {
            const highPop = (r.units ?? 0) >= avgUnits;
            const highMargin = r.unitGrossProfit >= avgUnitProfit;
            if (highPop && highMargin) {
              matrixClass = 'star';
              matrixLabel = loc === 'en' ? '⭐ Star' : loc === 'pt-BR' ? '⭐ Estrela' : '⭐ Estrella';
            } else if (highPop && !highMargin) {
              matrixClass = 'horse';
              matrixLabel = loc === 'en' ? '🐎 Plowhorse' : loc === 'pt-BR' ? '🐎 Cavalo' : '🐎 Caballo';
            } else if (!highPop && highMargin) {
              matrixClass = 'puzzle';
              matrixLabel = loc === 'en' ? '🧩 Puzzle' : loc === 'pt-BR' ? '🧩 Quebra-Cabeça' : '🧩 Rompecabezas';
            } else {
              matrixClass = 'dog';
              matrixLabel = loc === 'en' ? '🐕 Dog' : loc === 'pt-BR' ? '🐕 Cão' : '🐕 Perro';
            }
          }
        } else {
          matrixLabel = `— ${t.noDataTag}`;
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
      const ym = typeof s?.period_start === 'string' ? s.period_start.slice(0, 7) : '';
      if (ym) periods.add(ym);
    }
    return [...periods].sort().reverse();
  }, [state.salesHistory]);

  const availableChannels = useMemo(() => {
    const channels = new Set<string>();
    for (const s of state.salesHistory ?? []) {
      if (typeof s?.channel === 'string' && s.channel.trim()) channels.add(s.channel.trim());
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

  // Cálculos de Simulación Estratégica de Negocio impulsados por CostEngine (desglose real por ingrediente y subreceta)
  const baseDecompByProductId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof decomposeRecipeCategoryCosts>>();
    const baseEngine = new CostEngine(state.catalog);
    for (const row of monthlySummary.rows) {
      if (row.isComplete) {
        map.set(row.prod.id, decomposeRecipeCategoryCosts(state.catalog, row.prod.id, state.currency, baseEngine));
      }
    }
    return map;
  }, [monthlySummary.rows, state.catalog, state.currency]);

  const simulatedBusinessResult = useMemo(() => {
    const completeRows = monthlySummary.rows.filter((r) => r.isComplete);
    const ingMap = new Map(state.catalog.ingredients.map((i) => [i.id, i]));

    const computeScenario = (
      volDeltaPct: number,
      priceDeltaPct: number,
      costDeltaPct: number,
      categoryFilter: 'all' | 'flour' | 'dairy' | 'meat' | 'vegetables'
    ) => {
      let totRev = 0;
      let totCogs = 0;
      let totVarCosts = 0;
      let totUnits = 0;

      const factor: Record<string, number> = { monthly: 1, weekly: 52 / 12, yearly: 1 / 12 };
      const currentExpenses = state.operatingExpenses.reduce(
        (sum, item) => sum + item.amount * (factor[item.period] ?? 1),
        0
      );

      // Modificar únicamente los precios de compra de los insumos que pertenecen a la categoría seleccionada
      // y ejecutar CostEngine real para propagar el cambio a masas, subrecetas y productos finales.
      const simPrices = state.catalog.purchase_prices.map((pp) => {
        if (costDeltaPct === 0 || pp.purchase_price === null || pp.purchase_price === undefined || pp.purchase_price === '') {
          return pp;
        }
        const ing = ingMap.get(pp.ingredient_id);
        const cat = classifyIngredientCategory(ing?.name ?? pp.ingredient_id);
        const matches = categoryFilter === 'all' || cat === categoryFilter;
        if (!matches) return pp;
        return {
          ...pp,
          purchase_price: Math.max(0, Number(pp.purchase_price) * (1 + costDeltaPct / 100)),
        };
      });

      const simEngine = new CostEngine({
        ...state.catalog,
        purchase_prices: simPrices,
      });

      const simulatedRows = completeRows.map((r) => {
        const baseUnits = r.units ?? 0;
        const simUnits = Math.max(0, Math.round(baseUnits * (1 + volDeltaPct / 100)));
        const basePrice = r.evaluatedPrice;
        const simPrice = Math.max(0, Math.round(basePrice * (1 + priceDeltaPct / 100)));

        const decomp = baseDecompByProductId.get(r.prod.id) ?? {
          flourCost: 0, dairyCost: 0, meatCost: 0, vegetablesCost: 0, otherCost: 0, totalCost: r.unitCost,
        };
        const affectedCostShare =
          categoryFilter === 'all'
            ? r.unitCost
            : categoryFilter === 'flour'
            ? decomp.flourCost
            : categoryFilter === 'dairy'
            ? decomp.dairyCost
            : categoryFilter === 'meat'
            ? decomp.meatCost
            : decomp.vegetablesCost;
        const affectedSharePct = r.unitCost > 0 ? (affectedCostShare / r.unitCost) * 100 : 0;

        let simCost = r.unitCost;
        try {
          const simRes = simEngine.calculateRecipeCost(r.prod.id);
          if (simRes.status === 'complete' && simRes.raw_unit_cost !== null) {
            simCost = simRes.raw_unit_cost;
          }
        } catch {
          simCost = r.unitCost + affectedCostShare * (costDeltaPct / 100);
        }

        const packaging = state.defaultPackagingCost;
        const channelFee = simPrice * (state.defaultChannelFeePct / 100);
        const simUnitGrossProfit = simPrice - simCost;
        const simUnitNetContribution = simPrice - simCost - packaging - channelFee;
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
          affectedCostShare,
          affectedSharePct,
          baseProfit: r.unitGrossProfit,
          simProfit: simUnitGrossProfit,
          simNetUnitContribution: simUnitNetContribution,
          simRev,
          simContribution,
        };
      });

      const totContribution = totRev - totCogs;
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

    const baseScenario = computeScenario(0, 0, 0, 'all');
    const pessimisticScenario = computeScenario(-15, 0, 12, 'all');
    const optimisticScenario = computeScenario(15, 5, 0, 'all');
    const customScenario = computeScenario(simVolumeDelta, simPriceDelta, simCostDelta, simCategoryFilter);

    return {
      base: baseScenario,
      pessimistic: pessimisticScenario,
      optimistic: optimisticScenario,
      custom: customScenario,
    };
  }, [monthlySummary, baseDecompByProductId, simCategoryFilter, state.catalog, state.currency, state.defaultPackagingCost, state.defaultChannelFeePct, state.operatingExpenses, simVolumeDelta, simPriceDelta, simCostDelta]);

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
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #f87171', color: '#991b1b', padding: '12px 16px', borderRadius: '8px', margin: '14px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <strong>{t.conflictTitle}</strong> {workspaceConflict}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => {
                const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `pizzalog-tools-backup-${todayLocalDateString()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              {t.downloadBackupJsonBtn}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => window.location.reload()}
            >
              {t.reloadServerBtn}
            </button>
          </div>
        </div>
      )}
      <header className="tools-header">
        <div>
          <h1 className="tools-brand">
            Pizzalog Tools <span>Profit Kit v2</span>
            {toolsEnvironment === 'staging' && <span className="env-pill--staging">STAGING</span>}
          </h1>
          <p className="tools-subtitle">{t.subtitle}</p>
        </div>
        <div className="tools-actions">
          <span className="tools-account-label">{account.name}</span>
          <span className="tools-save-status" role="status">
            {workspaceSaveError ? t.saveError : isSavingWorkspace ? t.saving : t.autoSaved}
          </span>
          <button type="button" className="btn" onClick={onLogout}>{t.logout}</button>
          <button type="button" className="btn btn--primary" onClick={captureAllSnapshots}>
            📸 {t.saveSnapshot}
          </button>
          <button
            type="button"
            className="btn btn--ocre"
            onClick={() => downloadCustomProfitKitXlsx(state)}
          >
            {t.exportCustomExcel}
          </button>
          <label className="btn btn--ocre" style={{ margin: 0, opacity: isSmartImporting ? 0.65 : 1 }}>
            {isSmartImporting ? t.analyzingSheet : t.importXlsxCsv}
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

          {showMoreActions && (
            <>
              <button
                type="button"
                className="btn btn--secondary"
                style={{ color: 'var(--brand)', borderColor: 'var(--brand)', fontWeight: 700 }}
                onClick={() => setShowPlansModal(true)}
              >
                {t.plansAndSubscription}
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setShowReportModal(true)}
              >
                {t.executiveReport}
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => { setHelpTopic('units'); setShowHelpModal(true); }}
              >
                {t.contextualHelp}
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setShowExchangeRatesModal(true)}
              >
                {t.fxRatesBtn} ({state.catalog.exchange_rates?.length ?? 0})
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => downloadTemplateProfitKitXlsx(loc)}
              >
                {t.downloadTemplateExcel}
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
            </>
          )}

          <button
            type="button"
            className={`btn ${showMoreActions ? 'btn--secondary' : ''}`}
            onClick={() => setShowMoreActions((prev) => !prev)}
            style={{ fontWeight: 600 }}
          >
            {showMoreActions ? t.lessOptions : t.moreOptions}
          </button>
        </div>
      </header>

      {importError && <div className="alert-banner">⚠️ {importError}</div>}
      {workspaceSaveError && <div className="alert-banner">⚠️ {workspaceSaveError}</div>}
      {importNotice && <div className="notice-banner">{importNotice}</div>}
      {snapshotNotice && <div className="notice-banner">{snapshotNotice}</div>}

      {/* Banner de Modo Invitado / Demo en vivo */}
      {account.id === 0 && (
        <div style={{ background: '#7c2d12', border: '1px solid #ea580c', borderRadius: 10, padding: '12px 18px', margin: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, color: '#ffedd5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.4rem' }}>🚀</span>
            <div>
              <strong style={{ color: '#fff', fontSize: '0.96rem' }}>{t.guestBannerTitle}</strong>
              <div style={{ fontSize: '0.82rem', color: '#fed7aa', marginTop: 2 }}>
                {t.guestBannerDesc}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn--primary"
              style={{ fontSize: '0.84rem', padding: '6px 14px', background: '#ea580c', borderColor: '#ea580c', color: '#fff', fontWeight: 700 }}
              onClick={() => setShowPlansModal(true)}
            >
              {t.guestBannerPlansBtn}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              style={{ fontSize: '0.82rem', background: 'rgba(255,255,255,0.15)', color: '#fff', borderColor: 'transparent' }}
              onClick={onLogout}
            >
              {t.guestBannerExitBtn}
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
              <strong style={{ color: '#92400e', fontSize: '0.94rem' }}>{t.demoBannerTitle}</strong>
              <div style={{ fontSize: '0.82rem', color: '#78350f', marginTop: 2 }}>
                {t.demoBannerDesc}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn--secondary"
              style={{ fontSize: '0.82rem', background: '#fff', borderColor: '#d97706', color: '#92400e', fontWeight: 600 }}
              onClick={() => setShowClearDemoConfirm(true)}
            >
              {t.demoBannerClearBtn}
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
              {t.restoreDemoBtn}
            </button>
          </div>
        </div>
      )}

      {/* Guía rápida inicial cuando el espacio está vacío */}
      {!isDemoWorkspace(state) && state.catalog.ingredients.length === 0 && state.catalog.recipes.length === 0 && (
        <div className="onboarding-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <strong style={{ fontSize: '1rem', color: '#92400e' }}>{t.emptyOnboardingTitle}</strong>
              <p style={{ margin: '4px 0 10px', fontSize: '0.84rem', color: '#78350f' }}>{t.emptyOnboardingDesc}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8, fontSize: '0.82rem', color: '#451a03' }}>
                <div>{t.emptyOnboardingStep1}</div>
                <div>{t.emptyOnboardingStep2}</div>
                <div>{t.emptyOnboardingStep3}</div>
                <div>{t.emptyOnboardingStep4}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => { setActiveTab('ingredients'); addIngredient(); }}>
                {t.ingNewBtn}
              </button>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => downloadTemplateProfitKitXlsx(loc)}>
                {t.downloadTemplateExcel}
              </button>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setState(createInitialDemoWorkspace())}>
                {t.restoreDemoBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Experiencia Inicial Guiada (Onboarding Stepper con progreso) */}
      <div className="stepper-grid">
        {([
          ['ingredients', t.stepIngredients, state.catalog.ingredients.length > 0 && state.catalog.purchase_prices.some((p) => Number(p.purchase_price) > 0)],
          ['subrecipes', t.stepSubrecipes, state.catalog.recipes.some((r) => r.recipe_type === 'subrecipe')],
          ['recipes', t.stepRecipes, state.catalog.recipes.some((r) => r.recipe_type === 'product')],
          ['expenses', t.stepExpenses, state.operatingExpenses.length > 0],
          ['menu-engineering', t.stepMenuEngineering, monthlySummary.hasSalesData],
          ['profit-simulator', t.stepProfitSimulator, monthlySummary.hasSalesData && state.operatingExpenses.length > 0],
        ] as const).map(([tabKey, label, done]) => (
          <button
            key={tabKey}
            type="button"
            className={`btn step-pill ${activeTab === tabKey ? 'btn--primary' : 'btn--secondary'} ${done ? 'step-pill--done' : ''}`}
            onClick={() => setActiveTab(tabKey)}
          >
            {label} {done ? '✓' : ''}
          </button>
        ))}
      </div>

      <section className="tools-toolbar">
        <label className="field">
          <span>{t.businessOrProject}</span>
          <input
            type="text"
            value={state.businessName}
            onChange={(e) => setState((s) => ({ ...s, businessName: e.target.value }))}
          />
        </label>
        <label className="field">
          <span>{t.languageLocale}</span>
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
          <span>{t.currencyLabel}</span>
          <select
            value={state.currency}
            disabled={!canChangeCurrency}
            title={canChangeCurrency ? undefined : t.currencyLockedHint}
            onChange={(e) => {
              const curr = e.target.value;
              setState((s) => ({
                ...s,
                currency: curr,
                catalog: {
                  ...s.catalog,
                  recipes: s.catalog.recipes.map((r) => ({ ...r, currency: curr })),
                  purchase_prices: s.catalog.purchase_prices.map((p) =>
                    !p.purchase_price ? { ...p, currency: curr } : p
                  ),
                },
              }));
            }}
          >
            <option value="ARS">ARS ($)</option>
            <option value="USD">USD (US$)</option>
            <option value="BRL">BRL (R$)</option>
            <option value="EUR">EUR (€)</option>
            <option value="MXN">MXN ($)</option>
          </select>
          {!canChangeCurrency && (
            <small>
              {t.currencyLockedHint}{' '}
              <button type="button" className="link" style={{ fontSize: 'inherit' }} onClick={() => setShowExchangeRatesModal(true)}>
                {t.fxRatesBtn}
              </button>
            </small>
          )}
        </label>
        <label className="field">
          <span>{t.unitSystemLabel}</span>
          <select
            value={state.unitSystem}
            onChange={(e) => setState((s) => ({ ...s, unitSystem: e.target.value === 'us_customary' ? 'us_customary' : 'metric' }))}
          >
            <option value="metric">{t.unitSystemMetric}</option>
            <option value="us_customary">{t.unitSystemUs}</option>
          </select>
        </label>
        <label className="field">
          <span>{t.targetFoodCostLabel}</span>
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
          <span>{t.priceRoundingLabel} ({state.currency})</span>
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
          <span>{t.packagingDeliveryLabel} ({state.currency})</span>
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
          <span>{t.appDeliveryFeeLabel}</span>
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
          {t.tabSales} ({state.salesHistory?.length ?? 0})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'snapshots' ? 'tab-btn--active' : ''}`}
          onClick={() => { setActiveTab('snapshots'); void loadCloudBackups(); }}
        >
          {t.tabSnapshots}
        </button>
        <button type="button" className={`tab-btn ${activeTab === 'simulator' ? 'tab-btn--active' : ''}`} onClick={() => setActiveTab('simulator')}>{t.tabSimulator}</button>
        <button type="button" className={`tab-btn ${activeTab === 'cost-history' ? 'tab-btn--active' : ''}`} onClick={() => setActiveTab('cost-history')}>{t.tabCostHistory}</button>
        <button type="button" className={`tab-btn ${activeTab === 'menu-engineering' ? 'tab-btn--active' : ''}`} onClick={() => setActiveTab('menu-engineering')}>{t.tabMenuEngineering}</button>
        <button type="button" className={`tab-btn ${activeTab === 'production' ? 'tab-btn--active' : ''}`} onClick={() => setActiveTab('production')}>{t.tabProduction}</button>
        <button type="button" className={`tab-btn ${activeTab === 'profit-simulator' ? 'tab-btn--active' : ''}`} onClick={() => setActiveTab('profit-simulator')}>{t.tabProfitSimulator}</button>
        <button type="button" className={`tab-btn ${activeTab === 'sync' ? 'tab-btn--active' : ''}`} onClick={() => { setActiveTab('sync'); void loadSyncStatus(); }}>{t.tabSync}</button>
      </nav>

      {activeTab === 'simulator' && (
        <section className="card">
          <h2>{t.recSimTitle}</h2>
          <p className="lead">{t.recSimLead}</p>
          <div className="builder-grid">
            <label className="field"><span>{t.recSimSelectLabel}</span><select value={simulationRecipeId || state.catalog.recipes.find((r) => r.recipe_type === 'product')?.id || ''} onChange={(e) => setSimulationRecipeId(e.target.value)}><option value="">{t.recSimSelectPlaceholder}</option>{state.catalog.recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
            <label className="field"><span>{t.recSimBatchesLabel}</span><input type="number" min="0.01" step="0.25" value={simulationBatches} onChange={(e) => setSimulationBatches(Math.max(0.01, Number(e.target.value) || 0.01))} /></label>
          </div>
          {(() => {
            const selected = state.catalog.recipes.find((r) => r.id === (simulationRecipeId || state.catalog.recipes.find((x) => x.recipe_type === 'product')?.id));
            if (!selected) return <div className="empty-state">{t.recSimEmpty}</div>;
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
            if (!result || result.status !== 'complete') return <div className="alert-banner">{t.recSimIncompleteErr}</div>;
            const simulatedCost = simulatedResult?.status === 'complete' ? simulatedResult.raw_batch_cost : null;
            const total = (simulatedCost ?? 0) * simulationBatches;
            return <>
              {selected.bakers_dough ? (
                <label className="field" style={{ maxWidth: 320, marginTop: 16 }}>
                  <span>{t.recSimHydrationLabel}</span>
                  <input type="number" min="0" max="250" step="0.5"
                    value={simulationHydrationPct[selected.id] ?? selected.bakers_dough.hydration_pct}
                    onChange={(e) => setSimulationHydrationPct((prev) => ({
                      ...prev, [selected.id]: Math.max(0, Math.min(250, Number(e.target.value) || 0)),
                    }))}
                  />
                  <small>{t.recSimHydrationHint}</small>
                </label>
              ) : adjustable.length > 0 ? (
                <div className="table-wrap" style={{ marginTop: 16 }}><table className="kit-table"><thead><tr><th>{t.recSimColComponent}</th><th>{t.recSimColOrigQty}</th><th>{t.recSimColVarPct}</th></tr></thead><tbody>
                  {result.components.map((component, index) => <tr key={`${selected.id}:${index}`}><td>{component.name}</td><td>{fmt(component.quantity, 3)} {component.unit}</td><td><input aria-label={component.name} type="number" min="0" step="5" value={simulationComponentPct[`${selected.id}:${index}`] ?? 100} onChange={(e) => setSimulationComponentPct((prev) => ({ ...prev, [`${selected.id}:${index}`]: Math.max(0, Number(e.target.value) || 0) }))} /></td></tr>)}
                </tbody></table></div>
              ) : null}
              {simulatedCost === null && <div className="alert-banner">{t.recSimIncompleteErr}</div>}
              <div className="kpi-grid" style={{ marginTop: 16 }}>
                <div className="kpi-card"><span>{t.recSimOrigBatch}</span><strong>{state.currency} {fmt(result.raw_batch_cost ?? 0, 2)}</strong></div>
                <div className="kpi-card"><span>{t.recSimSimBatch}</span><strong>{simulatedCost === null ? t.incompleteTag : `${state.currency} ${fmt(simulatedCost, 2)}`}</strong></div>
                <div className="kpi-card"><span>{t.recSimTotalProd}</span><strong>{simulatedCost === null ? t.incompleteTag : `${state.currency} ${fmt(total, 2)}`}</strong></div>
                <div className="kpi-card"><span>{t.recSimEstYield}</span><strong>{fmt(selected.yield_quantity * simulationBatches, 2)} {selected.yield_unit}</strong></div>
              </div>
            </>;
          })()}
        </section>
      )}

      {activeTab === 'cost-history' && (
        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2>{t.histTitle}</h2>
              <p className="lead">{t.histLead}</p>
            </div>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => { setHelpTopic('yield'); setShowHelpModal(true); }}
            >
              {t.histHelpBtn}
            </button>
          </div>

          {state.snapshots.length === 0 ? (
            <div className="empty-state">
              {t.histEmpty}
            </div>
          ) : (() => {
            const products = state.catalog.recipes.filter((r) => r.recipe_type === 'product');
            const selectedProduct = products.find((r) => r.id === historyRecipeId) ?? products[0];
            const entries = selectedProduct ? state.snapshots
              .filter((snap) => snap.recipe_id === selectedProduct.id)
              .slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) : [];

            const currentResult = selectedProduct ? recipeResults.get(selectedProduct.id) : null;
            const lastEntry = entries.length ? entries[entries.length - 1] : null;

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
                  <span>{t.histSelectProduct}</span>
                  <select value={selectedProduct?.id ?? ''} onChange={(e) => setHistoryRecipeId(e.target.value)}>
                    {products.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
                  </select>
                </label>
              </div>

              {!selectedProduct ? (
                <div className="empty-state">{t.recEmptyState}</div>
              ) : entries.length === 0 ? (
                <div className="empty-state">
                  {t.histNoProductSnaps}
                </div>
              ) : <>
                {isCostStale && (
                  <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 8, padding: '12px 16px', margin: '16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <strong style={{ color: '#92400e' }}>{t.histStaleTitle}</strong>
                      <div style={{ fontSize: '0.84rem', color: '#78350f', marginTop: 2 }}>
                        <strong>{state.currency} {fmt(currentResult!.raw_unit_cost!, 2)}</strong> ({staleDeltaPct > 0 ? '+' : ''}{fmt(staleDeltaPct, 1)}% vs. <strong>{state.currency} {fmt(lastEntry!.cost_result.raw_unit_cost!, 2)}</strong>)
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
                        setSnapshotNotice(`✓ ${selectedProduct.name}`);
                      }}
                    >
                      {t.histSaveUpdatedSnapBtn}
                    </button>
                  </div>
                )}

                <div className="kpi-grid" style={{ marginTop: 16 }}>
                  <div className="kpi-card">
                    <span>{t.histFirstCost}</span>
                    <strong>{firstCost == null ? t.incompleteTag : `${state.currency} ${fmt(firstCost, 2)}`}</strong>
                    <small>{fmtDate(entries[0].created_at)}</small>
                  </div>
                  <div className="kpi-card">
                    <span>{t.histLastCost}</span>
                    <strong>{lastCost == null ? t.incompleteTag : `${state.currency} ${fmt(lastCost, 2)}`}</strong>
                    <small>{fmtDate(entries[entries.length - 1].created_at)}</small>
                  </div>
                  <div className="kpi-card">
                    <span>{t.histAccumVar}</span>
                    <strong style={{ color: (totalVariationPct ?? 0) > 0 ? '#b91c1c' : '#15803d' }}>
                      {totalVariationPct == null ? '—' : `${totalVariationPct > 0 ? '+' : ''}${fmt(totalVariationPct, 1)}%`}
                    </strong>
                    <small>{entries.length}</small>
                  </div>
                  <div className="kpi-card">
                    <span>{t.histLastFc}</span>
                    <strong>
                      {lastEntry?.pricing_scenario?.food_cost_pct != null
                        ? `${fmt(lastEntry.pricing_scenario.food_cost_pct, 1)}%`
                        : '—'}
                    </strong>
                    <small>{t.histUnitContribLabel} {lastEntry?.pricing_scenario?.raw_gross_profit != null ? `${state.currency} ${fmt(lastEntry.pricing_scenario.raw_gross_profit, 2)}` : '—'}</small>
                  </div>
                </div>

                <div className="card" style={{ marginTop: 16 }}>
                  <strong>{t.histChartTitle}</strong>
                  <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
                    {entries.map((entry, index) => {
                      const value = entry.cost_result.raw_unit_cost;
                      const previous = index > 0 ? entries[index - 1].cost_result.raw_unit_cost : null;
                      const delta = typeof value === 'number' && typeof previous === 'number' && previous !== 0
                        ? ((value - previous) / previous) * 100
                        : null;
                      const width = typeof value === 'number' ? (range === 0 ? 100 : Math.max(8, ((value - minValue) / range) * 100)) : 0;
                      return (
                        <div key={entry.snapshot_id} className="history-bar-row">
                          <small>{fmtDate(entry.created_at)}</small>
                          <div style={{ background: 'var(--border-color, #e5e7eb)', borderRadius: 6, height: 14, overflow: 'hidden' }}>
                            <div style={{ width: `${width}%`, height: '100%', background: 'var(--accent, #991b1b)', borderRadius: 6 }} />
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <strong style={{ display: 'block' }}>{value == null ? t.incompleteTag : `${state.currency} ${fmt(value, 2)}`}</strong>
                            <small style={{ color: (delta ?? 0) > 0 ? '#b91c1c' : '#15803d' }}>
                              {delta == null ? t.histBaseline : `${delta > 0 ? '+' : ''}${fmt(delta, 1)}%`}
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
                        <th>{t.histColDate}</th>
                        <th>{t.histColUnitCost}</th>
                        <th>{t.histColEvalPrice}</th>
                        <th>{t.histColFcPct}</th>
                        <th>{t.histColMargin}</th>
                        <th>{t.histColVarPrev}</th>
                        <th>{t.histColStatus}</th>
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
                            <td>{fmtDateTime(entry.created_at)}</td>
                            <td><strong>{value == null ? '—' : `${state.currency} ${fmt(value, 2)}`}</strong></td>
                            <td>{price == null ? '—' : `${state.currency} ${fmt(price, 2)}`}</td>
                            <td>{fc == null ? '—' : `${fmt(fc, 1)}%`}</td>
                            <td>{profit == null ? '—' : `${state.currency} ${fmt(profit, 2)}`}</td>
                            <td style={{ color: delta && delta > 0 ? '#b91c1c' : '#15803d', fontWeight: delta ? 600 : 400 }}>
                              {delta == null ? '—' : `${delta > 0 ? '+' : ''}${fmt(delta, 1)}%`}
                            </td>
                            <td>{entry.cost_result.status === 'complete' ? t.statusComplete : t.incompleteTag}</td>
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
              <h2>{t.menuTitle}</h2>
              <p className="lead">{t.menuLead}</p>
            </div>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => { setHelpTopic('matrix'); setShowHelpModal(true); }}
            >
              {t.menuHelpBtn}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', margin: '16px 0', padding: '14px', background: 'var(--surface-alt)', borderRadius: 10 }}>
            <label className="field" style={{ minWidth: 200, margin: 0 }}>
              <span>{t.menuPeriodLabel}</span>
              <select value={menuPeriodFilter} onChange={(e) => setMenuPeriodFilter(e.target.value)}>
                <option value="all">{t.menuAllPeriods}</option>
                {availablePeriods.map((p) => (
                  <option key={p} value={p}>{p} {t.menuMonthlySuffix}</option>
                ))}
              </select>
            </label>

            <label className="field" style={{ minWidth: 200, margin: 0 }}>
              <span>{t.menuChannelLabel}</span>
              <select value={menuChannelFilter} onChange={(e) => setMenuChannelFilter(e.target.value)}>
                <option value="all">{t.menuAllChannels}</option>
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
                {t.menuCompareCheck}
              </label>
            </div>

            {menuCompareMode && (
              <label className="field" style={{ minWidth: 200, margin: 0 }}>
                <span>{t.menuCompareSelectLabel}</span>
                <select value={menuComparePeriod} onChange={(e) => setMenuComparePeriod(e.target.value)}>
                  <option value="">{t.menuComparePlaceholder}</option>
                  {availablePeriods.filter((p) => p !== menuPeriodFilter).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {!monthlySummary.hasSalesData ? (
            <div className="empty-state">
              {t.menuNoSalesEmpty}
            </div>
          ) : (
            <>
              <div className="kpi-grid" style={{ marginBottom: 16 }}>
                <div className="kpi-card">
                  <span>{t.recKpiRevenue} {menuChannelFilter !== 'all' ? `(${menuChannelFilter})` : ''}</span>
                  <strong>{state.currency} {fmt(monthlySummary.totalRevenue, 2)}</strong>
                  <small>{fmt(monthlySummary.totalUnits, 0)}</small>
                </div>
                <div className="kpi-card">
                  <span>{t.simCogs.replace(':', '')}</span>
                  <strong style={{ color: '#b91c1c' }}>{state.currency} {fmt(monthlySummary.totalCogs, 2)}</strong>
                  <small>Food Cost: {monthlySummary.totalRevenue > 0 ? fmt((monthlySummary.totalCogs / monthlySummary.totalRevenue) * 100, 1) : fmt(0, 1)}%</small>
                </div>
                <div className="kpi-card">
                  <span>{t.recKpiContribution}</span>
                  <strong style={{ color: '#15803d' }}>{state.currency} {fmt(monthlySummary.totalContribution, 2)}</strong>
                  <small>{fmt(monthlySummary.weightedMarginPct, 1)}%</small>
                </div>
                <div className="kpi-card">
                  <span>{t.simBreakEvenRevKpi}</span>
                  <strong>{breakEvenRevenue > 0 ? `${state.currency} ${fmt(breakEvenRevenue, 2)}` : '—'}</strong>
                  <small>{(netOperatingProfit ?? 0) >= 0 ? t.simZoneProfit : t.simZoneLoss}</small>
                </div>
              </div>

              {menuCompareMode && compareSummary && (() => {
                const diffUnits = monthlySummary.totalUnits - compareSummary.totalUnits;
                const diffUnitsPct = compareSummary.totalUnits > 0 ? (diffUnits / compareSummary.totalUnits) * 100 : 0;
                const diffRev = monthlySummary.totalRevenue - compareSummary.totalRevenue;
                const diffRevPct = compareSummary.totalRevenue > 0 ? (diffRev / compareSummary.totalRevenue) * 100 : 0;
                const diffContrib = monthlySummary.totalContribution - compareSummary.totalContribution;
                const diffContribPct = compareSummary.totalContribution > 0 ? (diffContrib / compareSummary.totalContribution) * 100 : 0;

                return (
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                      <strong style={{ color: '#1e40af' }}>
                        📊 {menuPeriodFilter === 'all' ? t.simBaseTitle : menuPeriodFilter} vs. {menuComparePeriod}
                      </strong>
                      <span style={{ fontSize: '0.8rem', color: '#3b82f6' }}>{t.salesColChannel}: {menuChannelFilter === 'all' ? t.menuAllChannels : menuChannelFilter}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                      <div>
                        <span style={{ fontSize: '0.8rem', color: '#1e40af', display: 'block' }}>{t.salesColUnits}:</span>
                        <strong style={{ fontSize: '1.1rem', color: diffUnits >= 0 ? '#15803d' : '#b91c1c' }}>
                          {diffUnits >= 0 ? `+${fmt(diffUnits, 0)}` : fmt(diffUnits, 0)}
                          {' '}({diffUnitsPct >= 0 ? `+${fmt(diffUnitsPct, 1)}%` : `${fmt(diffUnitsPct, 1)}%`})
                        </strong>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.8rem', color: '#1e40af', display: 'block' }}>{t.recKpiRevenue}:</span>
                        <strong style={{ fontSize: '1.1rem', color: diffRev >= 0 ? '#15803d' : '#b91c1c' }}>
                          {diffRev >= 0 ? `+${state.currency} ${fmt(diffRev, 0)}` : `${state.currency} ${fmt(diffRev, 0)}`}
                          {' '}({diffRevPct >= 0 ? `+${fmt(diffRevPct, 1)}%` : `${fmt(diffRevPct, 1)}%`})
                        </strong>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.8rem', color: '#1e40af', display: 'block' }}>{t.recKpiContribution}:</span>
                        <strong style={{ fontSize: '1.1rem', color: diffContrib >= 0 ? '#15803d' : '#b91c1c' }}>
                          {diffContrib >= 0 ? `+${state.currency} ${fmt(diffContrib, 0)}` : `${state.currency} ${fmt(diffContrib, 0)}`}
                          {' '}({diffContribPct >= 0 ? `+${fmt(diffContribPct, 1)}%` : `${fmt(diffContribPct, 1)}%`})
                        </strong>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const incompleteProducts = monthlySummary.rows.filter((r) => !r.isComplete);
                if (incompleteProducts.length === 0) return null;
                return (
                  <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 8, padding: '12px 16px', marginBottom: 18 }}>
                    <strong style={{ color: '#92400e', display: 'block', marginBottom: 4 }}>
                      ⚠️ {incompleteProducts.length} {t.menuIncompleteWarnSuffix}
                    </strong>
                    <div style={{ fontSize: '0.84rem', color: '#78350f', marginBottom: 8 }}>
                      {t.menuIncompleteWarnDesc}
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.84rem', color: '#92400e' }}>
                      {incompleteProducts.map((p) => (
                        <li key={p.prod.id} style={{ margin: '4px 0' }}>
                          <strong>{p.prod.name}</strong> ({fmt(p.units ?? 0, 0)}): {p.incompleteReason}
                          <button
                            type="button"
                            className="btn btn--sm"
                            style={{ marginLeft: 8, fontSize: '0.74rem', padding: '2px 8px' }}
                            onClick={() => setActiveTab('recipes')}
                          >
                            {t.menuGoToRecipesBtn}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, margin: '16px 0' }}>
                {([
                  {
                    key: 'puzzle',
                    title: t.menuPuzzleTitle,
                    badge: t.menuPuzzleBadge,
                    color: '#6b21a8',
                    bg: '#f3e8ff',
                    border: '#d8b4fe',
                    actionTip: t.menuPuzzleTip,
                    rows: monthlySummary.rows.filter((r) => r.matrixClass === 'puzzle'),
                  },
                  {
                    key: 'star',
                    title: t.menuStarTitle,
                    badge: t.menuStarBadge,
                    color: '#92400e',
                    bg: '#fef3c7',
                    border: '#fde047',
                    actionTip: t.menuStarTip,
                    rows: monthlySummary.rows.filter((r) => r.matrixClass === 'star'),
                  },
                  {
                    key: 'dog',
                    title: t.menuDogTitle,
                    badge: t.menuDogBadge,
                    color: '#991b1b',
                    bg: '#fee2e2',
                    border: '#fca5a5',
                    actionTip: t.menuDogTip,
                    rows: monthlySummary.rows.filter((r) => r.matrixClass === 'dog'),
                  },
                  {
                    key: 'horse',
                    title: t.menuHorseTitle,
                    badge: t.menuHorseBadge,
                    color: '#1e40af',
                    bg: '#dbeafe',
                    border: '#93c5fd',
                    actionTip: t.menuHorseTip,
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
                            <small>({fmt(r.units ?? 0, 0)} · {state.currency} {fmt(r.unitGrossProfit, 0)})</small>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <small style={{ color: '#6b7280', fontStyle: 'italic' }}>{t.menuEmptyQuadrant}</small>
                    )}
                  </div>
                ))}
              </div>

              <div className="table-wrap">
                <table className="kit-table">
                  <thead>
                    <tr>
                      <th>{t.recColProduct}</th>
                      <th style={{ textAlign: 'right' }}>{t.salesColUnits}</th>
                      <th style={{ textAlign: 'right' }}>{t.recColMenuPrice}</th>
                      <th style={{ textAlign: 'right' }}>{t.recColCost}</th>
                      <th style={{ textAlign: 'right' }}>{t.recColUnitMargin}</th>
                      <th style={{ textAlign: 'right' }}>{t.recColContribMonth}</th>
                      <th style={{ textAlign: 'right' }}>{t.recColMarginPct}</th>
                      <th style={{ textAlign: 'center' }}>{t.recColMatrix}</th>
                      <th>{t.menuColStrategy}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlySummary.rows
                      .slice()
                      .sort((a, b) => (b.units ?? 0) - (a.units ?? 0))
                      .map((r) => {
                        let strategyTip = '—';
                        if (r.matrixClass === 'star') strategyTip = t.menuStarTip;
                        else if (r.matrixClass === 'horse') strategyTip = t.menuHorseTip;
                        else if (r.matrixClass === 'puzzle') strategyTip = t.menuPuzzleTip;
                        else if (r.matrixClass === 'dog') strategyTip = t.menuDogTip;
                        else if (!r.isComplete) strategyTip = t.recSimIncompleteErr;

                        return (
                          <tr key={r.prod.id}>
                            <td><strong>{r.prod.name}</strong></td>
                            <td style={{ textAlign: 'right' }}>{r.units !== null ? fmt(r.units, 0) : '—'}</td>
                            <td style={{ textAlign: 'right' }}>
                              {r.isComplete ? `${state.currency} ${fmt(r.evaluatedPrice, 2)}` : '—'}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {r.isComplete ? `${state.currency} ${fmt(r.unitCost, 2)}` : t.incompleteTag}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>
                              {r.isComplete ? `${state.currency} ${fmt(r.unitGrossProfit, 2)}` : '—'}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#15803d' }}>
                              {r.monthlyContribution !== null ? `${state.currency} ${fmt(r.monthlyContribution, 2)}` : '—'}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {r.evaluatedPrice > 0 ? `${fmt((r.unitGrossProfit / r.evaluatedPrice) * 100, 1)}%` : '—'}
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
          <h2>{t.prodTitle}</h2>
          <p className="lead">{t.prodLead}</p>
          {state.catalog.recipes.filter((r) => r.recipe_type === 'product').length === 0 ? <div className="empty-state">{t.prodEmpty}</div> : <>
            <div className="table-wrap"><table className="kit-table"><thead><tr><th>{t.recColProduct}</th><th>{t.prodColToProduce}</th><th>{t.prodColYield}</th><th>{t.prodColCostState}</th></tr></thead><tbody>
              {state.catalog.recipes.filter((r) => r.recipe_type === 'product').map((r) => <tr key={r.id}><td>{r.name}</td><td><input aria-label={r.name} type="number" min="0" step="1" value={productionUnits[r.id] ?? 0} onChange={(e) => setProductionUnits((prev) => ({ ...prev, [r.id]: Math.max(0, Number(e.target.value) || 0) }))} /></td><td>{fmt(r.yield_quantity, 2)} {r.yield_unit}</td><td>{recipeResults.get(r.id)?.status === 'complete' ? t.prodValidated : t.prodCheckRecipe}</td></tr>)}
            </tbody></table></div>
            {(() => {
              const ingredientTotals = new Map<string, { name: string; unit: string; quantity: number }>();
              const warnings = new Set<string>();
              const expandRecipe = (recipeId: string, requestedYield: number, path: string[] = []) => {
                if (path.includes(recipeId)) {
                  warnings.add('Cycle detected.');
                  return;
                }
                const recipe = state.catalog.recipes.find((item) => item.id === recipeId);
                const result = recipeResults.get(recipeId);
                const effectiveYield = result?.raw_yield_quantity && result.raw_yield_quantity > 0 ? result.raw_yield_quantity : (recipe?.yield_quantity ?? 0);
                if (!recipe || !result || result.status !== 'complete' || !(effectiveYield > 0)) {
                  warnings.add(`${recipe?.name ?? recipeId}: ${t.prodCheckRecipe}`);
                  return;
                }
                const batches = requestedYield / effectiveYield;
                for (const component of result.components) {
                  if (component.status !== 'complete' || component.normalized_quantity == null) {
                    warnings.add(`${recipe.name}: ${t.prodCheckRecipe}`);
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
                <p className="lead">{t.prodColToProduce}: <strong>{fmt(totalUnits, 0)}</strong></p>
                {warnings.size > 0 && <div className="alert-banner">{[...warnings].join(' ')}</div>}
                {ingredients.length === 0 ? <div className="empty-state">{t.prodNoExplosionEmpty}</div> : <div className="table-wrap"><table className="kit-table"><thead><tr><th>{t.prodColIngredient}</th><th>{t.prodColTotalQty}</th><th>{t.prodColBaseUnit}</th></tr></thead><tbody>{ingredients.map((item) => <tr key={item.name}><td>{item.name}</td><td><strong>{fmt(item.quantity, 3)}</strong></td><td>{item.unit}</td></tr>)}</tbody></table></div>}
              </div>;
            })()}
          </>}
        </section>
      )}

      {activeTab === 'profit-simulator' && (
        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2>{t.simTitle}</h2>
              <p className="lead">{t.simLead}</p>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className={`btn ${simMode === 'business' ? 'btn--primary' : 'btn--secondary'}`}
                style={{ fontSize: '0.82rem' }}
                onClick={() => setSimMode('business')}
              >
                {t.simGlobalModeBtn}
              </button>
              <button
                type="button"
                className={`btn ${simMode === 'single' ? 'btn--primary' : 'btn--secondary'}`}
                style={{ fontSize: '0.82rem' }}
                onClick={() => setSimMode('single')}
              >
                {t.simUnitModeBtn}
              </button>
            </div>
          </div>

          {simMode === 'business' ? (
            <div style={{ marginTop: 16 }}>
              {simulatedBusinessResult.custom.rows.length === 0 && (
                <div className="empty-state">
                  <span>{t.simEmptyCompleteRows}</span>
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => setActiveTab('recipes')}>
                    {t.menuGoToRecipesBtn}
                  </button>
                </div>
              )}
              <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--line)', borderRadius: 10, padding: '16px', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                  <div>
                    <strong style={{ fontSize: '1.05rem' }}>{t.simFixedBlockTitle}</strong>
                    <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                      {t.simFixedBlockDesc}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--sm btn--secondary"
                    onClick={() => setActiveTab('expenses')}
                  >
                    {t.simEditExpensesBtn} ({state.currency} {fmt(totalMonthlyExpenses, 0)})
                  </button>
                </div>

                <div className="kpi-grid">
                  <div className="kpi-card">
                    <span>{t.simMonthlyFixedKpi}</span>
                    <strong>{state.currency} {fmt(totalMonthlyExpenses, 2)}</strong>
                    <small>{state.operatingExpenses.length}</small>
                  </div>
                  <div className="kpi-card">
                    <span>{t.simBreakEvenRevKpi}</span>
                    <strong style={{ color: '#d97706' }}>
                      {simulatedBusinessResult.custom.breakEven > 0
                        ? `${state.currency} ${fmt(simulatedBusinessResult.custom.breakEven, 2)}`
                        : '—'}
                    </strong>
                    <small>{t.simBreakEvenRevKpi}</small>
                  </div>
                  <div className="kpi-card">
                    <span>{t.simBreakEvenUnitsKpi}</span>
                    <strong>
                      {simulatedBusinessResult.custom.breakEvenUnits > 0
                        ? fmt(simulatedBusinessResult.custom.breakEvenUnits, 0)
                        : '—'}
                    </strong>
                    <small>{t.simBreakEvenUnitsKpi}</small>
                  </div>
                  <div className="kpi-card">
                    <span>{t.simSafetyMarginKpi}</span>
                    <strong style={{ color: simulatedBusinessResult.custom.safetyMarginPct >= 0 ? '#15803d' : '#b91c1c' }}>
                      {simulatedBusinessResult.custom.safetyMarginPct >= 0 ? '+' : ''}
                      {fmt(simulatedBusinessResult.custom.safetyMarginPct, 1)}%
                    </strong>
                    <small>
                      {simulatedBusinessResult.custom.safetyMarginPct >= 0 ? t.simZoneProfit : t.simZoneLoss}
                    </small>
                  </div>
                </div>
              </div>

              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 18, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: '1rem' }}>{t.simControlsTitle}</h3>
                  <button
                    type="button"
                    className="btn btn--sm btn--secondary"
                    onClick={() => { setSimPriceDelta(0); setSimCostDelta(0); setSimVolumeDelta(0); setSimCategoryFilter('all'); }}
                  >
                    {t.simResetBtn}
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
                  <div style={{ background: 'var(--surface-alt)', padding: 14, borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>{t.simPriceDeltaLabel}</span>
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
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
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

                  <div style={{ background: 'var(--surface-alt)', padding: 14, borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>{t.simCostDeltaLabel}</span>
                      <strong style={{ color: simCostDelta > 0 ? '#b91c1c' : '#15803d' }}>
                        {simCostDelta > 0 ? `+${simCostDelta}%` : `${simCostDelta}%`}
                      </strong>
                    </div>
                    <input
                      type="range"
                      min={-30}
                      max={100}
                      step={1}
                      value={simCostDelta}
                      onChange={(e) => setSimCostDelta(Number(e.target.value))}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                      {[-15, -5, 0, 10, 15, 25].map((val) => (
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

                  <div style={{ background: 'var(--surface-alt)', padding: 14, borderRadius: 8 }}>
                    <label className="field" style={{ margin: 0 }}>
                      <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>{t.simAffectedSuppliesLabel}</span>
                      <select value={simCategoryFilter} onChange={(e) => setSimCategoryFilter(e.target.value as any)}>
                        <option value="all">{t.simAffectedAll}</option>
                        <option value="flour">{t.simAffectedFlour}</option>
                        <option value="dairy">{t.simAffectedDairy}</option>
                        <option value="meat">{t.simAffectedMeat}</option>
                        <option value="vegetables">{t.simAffectedVegetables}</option>
                      </select>
                    </label>
                    <small style={{ display: 'block', marginTop: 8, color: 'var(--muted)', fontSize: '0.76rem' }}>
                      {t.simAffectedHint}
                    </small>
                  </div>

                  <div style={{ background: 'var(--surface-alt)', padding: 14, borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>{t.simVolumeDeltaLabel}</span>
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
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
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

              <h3 style={{ margin: '0 0 12px', fontSize: '1.05rem' }}>
                {t.simScenariosTitle}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 24 }}>
                <div style={{ border: '2px solid #f87171', borderRadius: 10, padding: 16, background: '#fef2f2' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 4 }}>
                    <strong style={{ color: '#991b1b', fontSize: '1.05rem' }}>{t.simPessimisticTitle}</strong>
                    <span style={{ fontSize: '0.72rem', background: '#fee2e2', color: '#991b1b', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                      -15% · +12%
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 12px' }}>
                    {t.simPessimisticDesc}
                  </p>
                  <div style={{ display: 'grid', gap: 6, fontSize: '0.84rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{t.simMonthlyRevenue}</span>
                      <strong>{state.currency} {fmt(simulatedBusinessResult.pessimistic.totRev, 0)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{t.simCogs}</span>
                      <span style={{ color: '#b91c1c' }}>{state.currency} {fmt(simulatedBusinessResult.pessimistic.totCogs, 0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{t.simVariableCosts}</span>
                      <span>{state.currency} {fmt(simulatedBusinessResult.pessimistic.totVarCosts, 0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{t.simContributionMargin}</span>
                      <strong style={{ color: '#15803d' }}>{state.currency} {fmt(simulatedBusinessResult.pessimistic.totContribution, 0)} ({fmt(simulatedBusinessResult.pessimistic.marginPct, 1)}%)</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #fecaca', paddingTop: 6, marginTop: 4 }}>
                      <span>{t.simFixedExpenses}</span>
                      <span>{state.currency} {fmt(totalMonthlyExpenses, 0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.94rem', fontWeight: 800 }}>
                      <span>{t.simNetProfit}</span>
                      <span style={{ color: simulatedBusinessResult.pessimistic.netProfit >= 0 ? '#15803d' : '#b91c1c' }}>
                        {state.currency} {fmt(simulatedBusinessResult.pessimistic.netProfit, 0)}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ border: '2px solid var(--line)', borderRadius: 10, padding: 16, background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 4 }}>
                    <strong style={{ fontSize: '1.05rem' }}>{t.simBaseTitle}</strong>
                    <span style={{ fontSize: '0.72rem', background: 'var(--surface-alt)', color: 'var(--ink)', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                      0%
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 12px' }}>
                    {t.simBaseDesc}
                  </p>
                  <div style={{ display: 'grid', gap: 6, fontSize: '0.84rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{t.simMonthlyRevenue}</span>
                      <strong>{state.currency} {fmt(simulatedBusinessResult.base.totRev, 0)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{t.simCogs}</span>
                      <span style={{ color: '#b91c1c' }}>{state.currency} {fmt(simulatedBusinessResult.base.totCogs, 0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{t.simVariableCosts}</span>
                      <span>{state.currency} {fmt(simulatedBusinessResult.base.totVarCosts, 0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{t.simContributionMargin}</span>
                      <strong style={{ color: '#15803d' }}>{state.currency} {fmt(simulatedBusinessResult.base.totContribution, 0)} ({fmt(simulatedBusinessResult.base.marginPct, 1)}%)</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 6, marginTop: 4 }}>
                      <span>{t.simFixedExpenses}</span>
                      <span>{state.currency} {fmt(totalMonthlyExpenses, 0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.94rem', fontWeight: 800 }}>
                      <span>{t.simNetProfit}</span>
                      <span style={{ color: simulatedBusinessResult.base.netProfit >= 0 ? '#15803d' : '#b91c1c' }}>
                        {state.currency} {fmt(simulatedBusinessResult.base.netProfit, 0)}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ border: '2px solid #86efac', borderRadius: 10, padding: 16, background: '#f0fdf4' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 4 }}>
                    <strong style={{ color: '#15803d', fontSize: '1.05rem' }}>{t.simOptimisticTitle}</strong>
                    <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                      +15% · +5%
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 12px' }}>
                    {t.simOptimisticDesc}
                  </p>
                  <div style={{ display: 'grid', gap: 6, fontSize: '0.84rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{t.simMonthlyRevenue}</span>
                      <strong>{state.currency} {fmt(simulatedBusinessResult.optimistic.totRev, 0)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{t.simCogs}</span>
                      <span style={{ color: '#b91c1c' }}>{state.currency} {fmt(simulatedBusinessResult.optimistic.totCogs, 0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{t.simVariableCosts}</span>
                      <span>{state.currency} {fmt(simulatedBusinessResult.optimistic.totVarCosts, 0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{t.simContributionMargin}</span>
                      <strong style={{ color: '#15803d' }}>{state.currency} {fmt(simulatedBusinessResult.optimistic.totContribution, 0)} ({fmt(simulatedBusinessResult.optimistic.marginPct, 1)}%)</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #bbf7d0', paddingTop: 6, marginTop: 4 }}>
                      <span>{t.simFixedExpenses}</span>
                      <span>{state.currency} {fmt(totalMonthlyExpenses, 0)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.94rem', fontWeight: 800 }}>
                      <span>{t.simNetProfit}</span>
                      <span style={{ color: '#15803d' }}>
                        {state.currency} {fmt(simulatedBusinessResult.optimistic.netProfit, 0)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <h3 style={{ margin: '0 0 12px', fontSize: '1.05rem' }}>
                {t.simProductBreakdownTitle} ({simPriceDelta >= 0 ? `+${simPriceDelta}%` : `${simPriceDelta}%`} · {simCostDelta >= 0 ? `+${simCostDelta}%` : `${simCostDelta}%`} · {simVolumeDelta >= 0 ? `+${simVolumeDelta}%` : `${simVolumeDelta}%`})
              </h3>
              <div className="table-wrap">
                <table className="kit-table">
                  <thead>
                    <tr>
                      <th>{t.simColProduct}</th>
                      <th style={{ textAlign: 'right' }}>{t.simColProjectedUnits}</th>
                      <th style={{ textAlign: 'right' }}>{t.simColPriceTransition}</th>
                      <th style={{ textAlign: 'right' }}>{t.simColAffectedShare}</th>
                      <th style={{ textAlign: 'right' }}>{t.simColCostTransition}</th>
                      <th style={{ textAlign: 'right' }}>{t.simColUnitMargin}</th>
                      <th style={{ textAlign: 'right' }}>{t.simColTotalContribution}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulatedBusinessResult.custom.rows.map((row) => (
                      <tr key={row.prod.id}>
                        <td><strong>{row.prod.name}</strong></td>
                        <td style={{ textAlign: 'right' }}>
                          {fmt(row.simUnits, 0)}
                          {row.simUnits !== row.baseUnits && (
                            <small style={{ display: 'block', color: row.simUnits > row.baseUnits ? '#15803d' : '#b91c1c' }}>
                              ({fmt(row.baseUnits, 0)})
                            </small>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {state.currency} {fmt(row.simPrice, 0)}
                          {row.simPrice !== row.basePrice && (
                            <small style={{ display: 'block', color: 'var(--muted)' }}>
                              ({state.currency} {fmt(row.basePrice, 0)})
                            </small>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {state.currency} {fmt(row.affectedCostShare, 2)}
                          <small style={{ display: 'block', color: 'var(--muted)' }}>
                            ({fmt(row.affectedSharePct, 1)}%)
                          </small>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {state.currency} {fmt(row.simCost, 2)}
                          {Math.abs(row.simCost - row.baseCost) > 0.005 && (
                            <small style={{ display: 'block', color: row.simCost > row.baseCost ? '#b91c1c' : '#15803d' }}>
                              ({state.currency} {fmt(row.baseCost, 2)} · {row.simCost >= row.baseCost ? '+' : ''}{state.currency} {fmt(row.simCost - row.baseCost, 2)})
                            </small>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {state.currency} {fmt(row.simProfit, 2)}
                          <small style={{ display: 'block', color: 'var(--muted)' }}>
                            {row.simPrice > 0 ? `${fmt((row.simProfit / row.simPrice) * 100, 1)}%` : '—'}
                          </small>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#15803d' }}>
                          {state.currency} {fmt(row.simContribution, 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              <div className="builder-grid">
                <label className="field">
                  <span>{t.simUnitLinkProduct}</span>
                  <select value={profitProductId} onChange={(e) => setProfitProductId(e.target.value)}>
                    <option value="">{t.simUnitManualOption}</option>
                    {state.catalog.recipes.filter((r) => r.recipe_type === 'product').map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{t.simUnitUnitsMonth}</span>
                  <input type="number" min="0" value={profitScenario.units} onChange={(e) => setProfitScenario((p) => ({ ...p, units: Math.max(0, Number(e.target.value) || 0) }))} />
                </label>
                <label className="field">
                  <span>{t.simUnitPriceLabel} ({state.currency})</span>
                  <input type="number" min="0" value={profitScenario.price} onChange={(e) => setProfitScenario((p) => ({ ...p, price: Math.max(0, Number(e.target.value) || 0) }))} />
                </label>
                <label className="field">
                  <span>{t.simUnitVarCostLabel} ({state.currency})</span>
                  <input type="number" min="0" value={profitScenario.variableCost} onChange={(e) => setProfitScenario((p) => ({ ...p, variableCost: Math.max(0, Number(e.target.value) || 0) }))} />
                </label>
                <label className="field">
                  <span>{t.simUnitFixedLabel} ({state.currency})</span>
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
                      {t.simUnitLoadBtn}
                    </button>
                    {!canUse && <small style={{ display: 'block', marginTop: 6 }}>{t.simUnitCannotLinkHint}</small>}
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
                    <div className="kpi-card"><span>{t.simMonthlyRevenue.replace(':', '')}</span><strong>{state.currency} {fmt(revenue, 2)}</strong></div>
                    <div className="kpi-card"><span>{t.simContributionMargin.replace(':', '')}</span><strong>{state.currency} {fmt(contribution, 2)}</strong></div>
                    <div className="kpi-card"><span>{t.simNetProfit.replace(':', '')}</span><strong style={{ color: result >= 0 ? '#15803d' : '#b91c1c' }}>{state.currency} {fmt(result, 2)}</strong></div>
                    <div className="kpi-card"><span>{t.simBreakEvenRevKpi}</span><strong>{breakEven > 0 ? `${state.currency} ${fmt(breakEven, 2)}` : '—'}</strong><small>{margin == null ? t.noDataTag : `${fmt(margin, 1)}%`}</small></div>
                  </div>
                );
              })()}
            </div>
          )}
        </section>
      )}

      {activeTab === 'sync' && (
        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2>{t.syncTitle}</h2>
              <p className="lead">{t.syncLead}</p>
            </div>
            {syncStatus?.linked && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="badge" style={{ background: '#e8f5e9', color: '#2e7d32', padding: '6px 12px', borderRadius: 16, fontWeight: 600 }}>
                  {t.syncLinkedBadge} {syncStatus.business_name}
                </span>
                <button type="button" className="btn btn--sm btn--secondary" disabled={syncLoading} onClick={handleUnlinkApp}>
                  {t.syncUnlinkBtn}
                </button>
              </div>
            )}
          </div>

          {syncNotice && (
            <div className="alert-banner" style={{ background: '#e8f5e9', color: '#2e7d32', borderColor: '#86efac', marginBottom: 16 }}>
              {syncNotice}
            </div>
          )}
          {syncError && (
            <div className="alert-banner" style={{ marginBottom: 16 }}>
              {syncError}
            </div>
          )}

          {!syncStatus?.linked ? (
            <div style={{ maxWidth: 520, padding: 20, border: '1px solid #e0e0e0', borderRadius: 8, background: '#fafafa' }}>
              <h3 style={{ marginTop: 0 }}>{t.syncLinkCardTitle}</h3>
              <p style={{ fontSize: '0.88rem', color: '#666' }}>
                {t.syncLinkCardLead}
              </p>
              <form onSubmit={handleLinkApp} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label className="field">
                  <span>{t.syncLinkEmailLabel}</span>
                  <input
                    type="text"
                    required
                    value={syncLinkEmail}
                    onChange={(e) => setSyncLinkEmail(e.target.value)}
                    placeholder="admin@mitienda.com"
                  />
                </label>
                <label className="field">
                  <span>{t.syncLinkPassLabel}</span>
                  <input
                    type="password"
                    required
                    value={syncLinkPassword}
                    onChange={(e) => setSyncLinkPassword(e.target.value)}
                  />
                </label>
                <button type="submit" className="btn btn--primary" disabled={syncLoading} style={{ alignSelf: 'flex-start' }}>
                  {syncLoading ? '…' : t.syncLinkSubmitBtn}
                </button>
              </form>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
              <div style={{ padding: 20, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
                <h3 style={{ marginTop: 0 }}>{t.syncExportTitle}</h3>
                <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn--secondary" disabled={syncLoading} onClick={() => handleSyncPreview('to_app')}>
                    {t.syncPreviewBtn}
                  </button>
                  <button type="button" className="btn btn--primary" disabled={syncLoading} onClick={() => handleSyncApply('to_app')}>
                    {syncLoading ? '…' : t.syncExportTitle}
                  </button>
                </div>
              </div>

              <div style={{ padding: 20, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
                <h3 style={{ marginTop: 0 }}>{t.syncImportTitle}</h3>
                <div style={{ marginTop: 10, fontSize: '0.82rem' }}>
                  <strong style={{ display: 'block', marginBottom: 6 }}>{t.syncModeLabel}</strong>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="syncImportMode"
                      checked={syncImportMode === 'merge_preserve_manual'}
                      onChange={() => setSyncImportMode('merge_preserve_manual')}
                      style={{ marginTop: 3 }}
                    />
                    <span>
                      <strong>{t.syncModeMerge}</strong>
                      <small style={{ display: 'block', color: 'var(--muted)' }}>{t.syncModeMergeDesc}</small>
                    </span>
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="syncImportMode"
                      checked={syncImportMode === 'overwrite_app_records'}
                      onChange={() => setSyncImportMode('overwrite_app_records')}
                      style={{ marginTop: 3 }}
                    />
                    <span>
                      <strong>{t.syncModeOverwrite}</strong>
                      <small style={{ display: 'block', color: 'var(--muted)' }}>{t.syncModeOverwriteDesc}</small>
                    </span>
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn--secondary" disabled={syncLoading} onClick={() => handleSyncPreview('from_app')}>
                    {t.syncPreviewBtn}
                  </button>
                  <button type="button" className="btn btn--ocre" disabled={syncLoading} onClick={() => handleSyncApply('from_app')}>
                    {syncLoading ? '…' : t.syncImportTitle}
                  </button>
                </div>
              </div>
            </div>
          )}

          {syncPreviewData && (
            <div style={{ marginTop: 20, padding: 16, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8 }}>
              <h4 style={{ margin: '0 0 10px 0' }}>{syncPreviewData.direction === 'to_app' ? 'Tools → App' : 'App → Tools'}</h4>
              {syncPreviewData.direction === 'from_app' ? (
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.88rem' }}>
                  <li>{t.ingTitle}: <strong>{syncPreviewData.summary?.app_supplies_count ?? 0}</strong> ({t.syncPreviewNew} {syncPreviewData.summary?.new_supplies_to_add ?? 0})</li>
                  <li>{t.recColProduct}: <strong>{syncPreviewData.summary?.app_products_count ?? 0}</strong> ({t.syncPreviewNew} {syncPreviewData.summary?.new_products_to_add ?? 0})</li>
                  <li>{t.salesTitle}: <strong>{syncPreviewData.summary?.app_sales_tickets ?? 0}</strong></li>
                  <li>{t.syncPreviewPreserved} <strong>{syncPreviewData.summary?.manual_items_preserved ?? 0}</strong></li>
                </ul>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.88rem' }}>
                  <li>+ {t.ingColName}: <strong>{syncPreviewData.summary?.supplies_to_create ?? 0}</strong></li>
                  <li>Δ {t.ingColPrice}: <strong>{syncPreviewData.summary?.supplies_to_update_cost ?? 0}</strong></li>
                  <li>{t.recColProduct}: <strong>{syncPreviewData.summary?.recipes_count ?? 0}</strong></li>
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      {activeTab === 'ingredients' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2>{t.ingTitle}</h2>
              <p className="lead">{t.ingLead}</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="btn btn--secondary" style={{ cursor: 'pointer', margin: 0 }}>
                {t.ingPriceListBtn}
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  style={{ display: 'none' }}
                  onChange={handlePriceListUpload}
                />
              </label>
              <button type="button" className="btn btn--primary" onClick={addIngredient}>
                {t.ingNewBtn}
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="kit-table">
              <thead>
                <tr>
                  <th>{t.ingColName}</th>
                  <th>{t.ingColDimBase} <button type="button" className="btn btn--sm" style={{ padding: '0 4px', fontSize: '0.72rem', border: 'none', background: 'transparent', cursor: 'pointer' }} onClick={() => { setHelpTopic('units'); setShowHelpModal(true); }} title={t.contextualHelp}>❓</button></th>
                  <th>{t.ingColDensity} <button type="button" className="btn btn--sm" style={{ padding: '0 4px', fontSize: '0.72rem', border: 'none', background: 'transparent', cursor: 'pointer' }} onClick={() => { setHelpTopic('density'); setShowHelpModal(true); }} title={t.contextualHelp}>❓</button></th>
                  <th>{t.ingColUnitWeight}</th>
                  <th>{t.ingColPrice} ({state.currency})</th>
                  <th>{t.ingColPackQty}</th>
                  <th>{t.ingColPackUnit}</th>
                  <th>{t.ingColYield} <button type="button" className="btn btn--sm" style={{ padding: '0 4px', fontSize: '0.72rem', border: 'none', background: 'transparent', cursor: 'pointer' }} onClick={() => { setHelpTopic('yield'); setShowHelpModal(true); }} title={t.contextualHelp}>❓</button></th>
                  <th>{t.ingColUsableUnit}</th>
                  <th>{state.unitSystem === 'us_customary' ? t.ingColRefUnitUs : t.ingColRefUnit}</th>
                  <th>{t.ingColStatus}</th>
                  <th>{t.ingColHistory}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {state.catalog.ingredients.length === 0 ? (
                  <tr className="empty-state">
                    <td colSpan={13}>{t.ingEmptyState}</td>
                  </tr>
                ) : state.catalog.ingredients.map((ing) => {
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
                    calcError = error instanceof Error ? error.message : t.ingCheckCurrencyUnit;
                  }
                  const isComplete = calcInfo?.status === 'complete';
                  const targetRefUnit: UnitCode =
                    state.unitSystem === 'us_customary'
                      ? (ing.base_dimension === 'mass' ? 'lb' : ing.base_dimension === 'volume' ? 'fl_oz_us' : 'unit')
                      : (ing.base_dimension === 'mass' ? 'kg' : ing.base_dimension === 'volume' ? 'L' : 'unit');
                  let refUnitFactor = 1;
                  try {
                    refUnitFactor = convertQuantity(1, targetRefUnit, ing.base_unit, ing);
                  } catch {
                    refUnitFactor = ing.base_unit === 'g' || ing.base_unit === 'ml' ? 1000 : 1;
                  }
                  const massWord = state.locale === 'en' ? 'Mass' : state.locale === 'pt-BR' ? 'Massa' : 'Masa';
                  const volWord = state.locale === 'en' ? 'Volume' : state.locale === 'pt-BR' ? 'Volume' : 'Volumen';
                  const countWord = state.locale === 'en' ? 'Count' : state.locale === 'pt-BR' ? 'Contagem' : 'Conteo';

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
                            const nextIng = { ...ing, base_dimension: dim, base_unit: unit };
                            setState((prev) => ({
                              ...prev,
                              catalog: {
                                ...prev.catalog,
                                ingredients: prev.catalog.ingredients.map((x) =>
                                  x.id === ing.id ? { ...x, base_dimension: dim, base_unit: unit } : x
                                ),
                              },
                            }));
                            if (priceRec && !areUnitsCompatible(priceRec.pack_unit, unit, nextIng)) {
                              updatePurchasePrice(ing.id, { pack_unit: unit });
                            }
                          }}
                        >
                          <option value="mass:g">{massWord} (g)</option>
                          <option value="mass:kg">{massWord} (kg)</option>
                          <option value="mass:oz">{massWord} (oz)</option>
                          <option value="mass:lb">{massWord} (lb)</option>
                          <option value="volume:ml">{volWord} (ml)</option>
                          <option value="volume:L">{volWord} (L)</option>
                          <option value="volume:fl_oz_us">{volWord} (fl_oz_us)</option>
                          <option value="count:unit">{countWord} (unit)</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={0.05}
                          placeholder={t.ingOptionalPlaceholder}
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
                        <input
                          type="number"
                          min={0}
                          step={5}
                          placeholder={t.ingOptionalPlaceholder}
                          value={ing.unit_weight_g ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setState((prev) => ({
                              ...prev,
                              catalog: {
                                ...prev.catalog,
                                ingredients: prev.catalog.ingredients.map((x) =>
                                  x.id === ing.id
                                    ? { ...x, unit_weight_g: raw === '' ? null : Number(raw) }
                                    : x
                                ),
                              },
                            }));
                          }}
                        />
                      </td>
                      <td>
                        {ing.is_free ? (
                          <span className="badge badge--ok">{t.ingFreeExplicit}</span>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            step={50}
                            placeholder={t.ingNoPricePlaceholder}
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
                        {isComplete && calcInfo && calcInfo.usableUnitCostInBase !== null ? (
                          <strong>
                            {state.currency} {fmt(calcInfo.usableUnitCostInBase, 4)} / {ing.base_unit}
                          </strong>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {isComplete && calcInfo && calcInfo.usableUnitCostInBase !== null
                          ? `${state.currency} ${fmt(calcInfo.usableUnitCostInBase * refUnitFactor, 2)} / ${targetRefUnit}`
                          : '—'}
                      </td>
                      <td>
                        {isComplete ? (
                          <span className="badge badge--ok">{t.statusComplete}</span>
                        ) : (
                          <span className="badge badge--warn" title={calcError ?? undefined}>
                            {calcError ? t.ingCheckCurrencyUnit : t.statusIncomplete}
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn--sm btn--secondary"
                          onClick={() => setPriceHistoryIngredientId(ing.id)}
                          title={t.ingHistoryTitle}
                        >
                          {t.ingHistoryBtn}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn--sm btn--danger"
                          onClick={() => deleteIngredient(ing.id)}
                          title={t.deleteTitle}
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
              <h2>{t.subTitle}</h2>
              <p className="lead">{t.subLead}</p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn--ocre"
                onClick={() => openNewRecipeBuilder('subrecipe', true)}
              >
                {t.subNewDoughBtn}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => openNewRecipeBuilder('subrecipe', false)}
              >
                {t.subNewSubrecipeBtn}
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="kit-table">
              <thead>
                <tr>
                  <th>{t.subColName}</th>
                  <th>{t.subColCalcType}</th>
                  <th>{t.subColYield}</th>
                  <th>{t.subColBatchCost}</th>
                  <th>{t.subColUnitCost}</th>
                  <th>{t.subColCostPerKg}</th>
                  <th>{t.subColStatus}</th>
                  <th>{t.subColActions}</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const subrecipes = state.catalog.recipes.filter((r) => r.recipe_type === 'subrecipe');
                  if (subrecipes.length === 0) {
                    return (
                      <tr className="empty-state">
                        <td colSpan={8}>{t.subEmptyState}</td>
                      </tr>
                    );
                  }
                  return subrecipes.map((sub) => {
                    const res = recipeResults.get(sub.id);
                    const isComplete = res?.status === 'complete';
                    return (
                      <tr key={sub.id}>
                        <td>
                          <strong>{sub.name}</strong>
                        </td>
                        <td>
                          {sub.bakers_dough
                            ? `${fmt(sub.bakers_dough.hydration_pct, 1)}% · ${sub.bakers_dough.yield_basis}`
                            : `${t.builderTypeSubrecipe} (${sub.components?.length ?? 0})`}
                        </td>
                        <td>
                          {fmt(sub.yield_quantity, 2)} {sub.yield_unit}
                        </td>
                        <td>
                          {isComplete && res?.raw_batch_cost != null
                            ? `${state.currency} ${fmt(res.raw_batch_cost, 2)}`
                            : t.incompleteTag}
                        </td>
                        <td>
                          {isComplete && res?.raw_unit_cost !== null && res?.raw_unit_cost !== undefined
                            ? `${state.currency} ${fmt(res.raw_unit_cost, 4)} / ${sub.yield_unit}`
                            : '—'}
                        </td>
                        <td>
                          {isComplete && res?.cost_per_kg != null
                            ? `${state.currency} ${fmt(res.cost_per_kg, 2)} / kg`
                            : '—'}
                        </td>
                        <td>
                          <span className={`badge ${isComplete ? 'badge--ok' : 'badge--warn'}`}>
                            {isComplete ? t.statusComplete : t.statusIncomplete}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn btn--sm"
                              onClick={() => openEditRecipeBuilder(sub)}
                            >
                              {t.subEditBtn}
                            </button>
                            <button
                              type="button"
                              className="btn btn--sm btn--danger"
                              onClick={() => deleteRecipe(sub.id)}
                              title={t.deleteTitle}
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'recipes' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2>{t.recTitle}</h2>
              <p className="lead">{t.recLead}</p>
            </div>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => openNewRecipeBuilder('product', false)}
            >
              {t.recNewBtn}
            </button>
          </div>

          <div className="table-wrap">
            <table className="kit-table">
              <thead>
                <tr>
                  <th>{t.recColProduct}</th>
                  <th>{t.recColMatrix}</th>
                  <th>{t.recColCost}</th>
                  <th>{t.recColSuggested}</th>
                  <th>{t.recColMenuPrice} ({state.currency})</th>
                  <th>{t.recColFcPct}</th>
                  <th>{t.recColUnitMargin} ({state.currency})</th>
                  <th>{t.recColMarginPct}</th>
                  <th>{t.recColMarkupPct}</th>
                  <th>{t.recColUnitsMonth}</th>
                  <th>{t.recColContribMonth} ({state.currency})</th>
                  <th>{t.recColActions}</th>
                </tr>
              </thead>
              <tbody>
                {monthlySummary.rows.length === 0 ? (
                  <tr className="empty-state">
                    <td colSpan={12}>{t.recEmptyState}</td>
                  </tr>
                ) : monthlySummary.rows.map((row) => {
                  const { prod, res, pricing, isComplete, units, customPrice, monthlyContribution, matrixClass, matrixLabel } = row;
                  const hasNoRecipeYet = (prod.components?.length ?? 0) === 0 && !prod.bakers_dough;
                  return (
                    <tr key={prod.id}>
                      <td>
                        <strong>{prod.name}</strong>
                        {!isComplete && hasNoRecipeYet && (
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                            {t.recNoRecipeHint}
                          </div>
                        )}
                        {!isComplete && !hasNoRecipeYet && res && res.missing_inputs.length > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--warn)', marginTop: 4 }}>
                            {t.recMissingPriceLabel}{' '}
                            {res.missing_inputs.map((m) => m.ingredient_name).join(', ')} ({t.recPartialLabel} {state.currency} {fmt(res.raw_partial_batch_cost, 2)})
                          </div>
                        )}
                      </td>
                      <td>
                        {isComplete && matrixClass ? (
                          <span className={`badge badge--${matrixClass}`}>{matrixLabel}</span>
                        ) : (
                          <span className="badge badge--warn">{hasNoRecipeYet ? t.noRecipeTag : t.statusIncomplete}</span>
                        )}
                      </td>
                      <td>
                        {isComplete && res?.raw_unit_cost != null ? (
                          <strong>
                            {state.currency} {fmt(res.raw_unit_cost, 2)}
                          </strong>
                        ) : (
                          <span style={{ color: 'var(--warn)', fontWeight: 700 }}>{hasNoRecipeYet ? t.noRecipeTag : t.incompleteTag}</span>
                        )}
                      </td>
                      <td>
                        {isComplete && pricing?.raw_suggested_price != null ? (
                          <strong style={{ color: 'var(--brand)' }}>
                            {state.currency} {fmt(pricing.raw_suggested_price, 0)}
                          </strong>
                        ) : (
                          <span className="badge badge--warn">{t.blockedTag}</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="number"
                            min={0}
                            step={100}
                            placeholder={pricing?.raw_suggested_price != null ? fmt(pricing.raw_suggested_price, 0) : t.recSuggestedPlaceholder}
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
                          {customPrice != null && (
                            <button
                              type="button"
                              className="btn btn--sm btn--secondary"
                              title={t.recUseSuggestedBtn}
                              onClick={() =>
                                setState((prev) => ({
                                  ...prev,
                                  productSalesMap: {
                                    ...prev.productSalesMap,
                                    [prod.id]: {
                                      ...prev.productSalesMap?.[prod.id],
                                      sellingPrice: null,
                                    },
                                  },
                                }))
                              }
                            >
                              {t.recUseSuggestedBtn}
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        {isComplete && pricing?.food_cost_pct !== null && pricing?.food_cost_pct !== undefined
                          ? `${fmt(pricing.food_cost_pct, 1)}%`
                          : '—'}
                      </td>
                      <td>
                        {isComplete && pricing?.raw_gross_profit != null
                          ? `${state.currency} ${fmt(pricing.raw_gross_profit, 0)}`
                          : '—'}
                      </td>
                      <td>
                        {isComplete && pricing?.gross_margin_pct !== null && pricing?.gross_margin_pct !== undefined
                          ? `${fmt(pricing.gross_margin_pct, 1)}%`
                          : '—'}
                      </td>
                      <td>
                        {isComplete && pricing?.markup_pct !== null && pricing?.markup_pct !== undefined
                          ? `${fmt(pricing.markup_pct, 1)}%`
                          : '—'}
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={10}
                          value={units ?? ''}
                          placeholder={t.noDataTag}
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
                            {state.currency} {fmt(monthlyContribution, 0)}
                          </strong>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn--sm"
                            onClick={() => openEditRecipeBuilder(prod)}
                          >
                            {t.recEditRecipeBtn}
                          </button>
                          <button
                            type="button"
                            className="btn btn--sm btn--danger"
                            onClick={() => deleteRecipe(prod.id)}
                            title={t.deleteTitle}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="kpi-grid">
            <div className="kpi-box">
              <div className="kpi-box__label">{t.recKpiTotalUnits}</div>
              <div className="kpi-box__value">{monthlySummary.hasSalesData ? `${fmt(monthlySummary.totalUnits, 0)} u` : t.noDataTag}</div>
              <div className="kpi-box__sub">{state.salesPeriod ? state.salesPeriod : t.recKpiTotalUnits}</div>
            </div>
            <div className="kpi-box">
              <div className="kpi-box__label">{t.recKpiRevenue}</div>
              <div className="kpi-box__value">
                {monthlySummary.hasSalesData ? `${state.currency} ${fmt(monthlySummary.totalRevenue, 0)}` : t.noDataTag}
              </div>
              <div className="kpi-box__sub">
                {monthlySummary.hasSalesData
                  ? `${t.simCogs} ${state.currency} ${fmt(monthlySummary.totalCogs, 0)}`
                  : t.recKpiNetHintMissing}
              </div>
            </div>
            <div className="kpi-box">
              <div className="kpi-box__label">{t.recKpiContribution}</div>
              <div className="kpi-box__value">
                {monthlySummary.hasSalesData ? `${state.currency} ${fmt(monthlySummary.totalContribution, 0)}` : t.noDataTag}
              </div>
              <div className="kpi-box__sub">
                {monthlySummary.hasSalesData
                  ? `${fmt(monthlySummary.weightedMarginPct, 1)}%`
                  : t.recKpiNetHintMissing}
              </div>
            </div>
            <div className="kpi-box kpi-box--highlight">
              <div className="kpi-box__label">{t.recKpiNetResult}</div>
              <div
                className="kpi-box__value"
                style={{ color: netOperatingProfit === null ? 'inherit' : netOperatingProfit >= 0 ? '#4ade80' : '#f87171' }}
              >
                {netOperatingProfit === null ? t.noDataTag : `${state.currency} ${fmt(netOperatingProfit, 0)}`}
              </div>
              <div className="kpi-box__sub">
                {netOperatingProfit === null
                  ? t.recKpiNetHintMissing
                  : `${t.simFixedExpenses} ${state.currency} ${fmt(totalMonthlyExpenses, 0)}`}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2>{t.expTitle}</h2>
              <p className="lead">{t.expLead}</p>
            </div>
            <button type="button" className="btn btn--primary" onClick={addOperatingExpense}>
              {t.expAddBtn}
            </button>
          </div>
          <div className="table-wrap">
            <table className="kit-table">
              <thead>
                <tr>
                  <th>{t.expColName}</th>
                  <th>{t.expColCategory}</th>
                  <th>{t.expColPeriod}</th>
                  <th>{t.expColAmount} ({state.currency})</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {state.operatingExpenses.length === 0 ? (
                  <tr className="empty-state">
                    <td colSpan={5}>{t.expEmptyState}</td>
                  </tr>
                ) : state.operatingExpenses.map((exp) => (
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
                        <option value="rent">{t.expCatRent}</option>
                        <option value="payroll">{t.expCatPayroll}</option>
                        <option value="utilities">{t.expCatUtilities}</option>
                        <option value="software">{t.expCatSoftware}</option>
                        <option value="taxes">{t.expCatTaxes}</option>
                        <option value="other">{t.expCatOther}</option>
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
                        <option value="monthly">{t.expPeriodMonthly}</option>
                        <option value="weekly">{t.expPeriodWeekly}</option>
                        <option value="yearly">{t.expPeriodYearly}</option>
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
                        title={t.deleteTitle}
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
              <div className="kpi-box__label">{t.expKpiTotalFixed}</div>
              <div className="kpi-box__value">
                {state.currency} {fmt(totalMonthlyExpenses, 0)}
              </div>
              <div className="kpi-box__sub">{t.expCatRent} + {t.expCatPayroll} + {t.expCatUtilities}</div>
            </div>
            <div className="kpi-box">
              <div className="kpi-box__label">{t.expKpiContrib}</div>
              <div className="kpi-box__value">
                {monthlySummary.hasSalesData ? `${state.currency} ${fmt(monthlySummary.totalContribution, 0)}` : t.noDataTag}
              </div>
              <div className="kpi-box__sub">
                {monthlySummary.hasSalesData ? `${fmt(monthlySummary.totalUnits, 0)} u` : t.noDataTag}
              </div>
            </div>
            <div className="kpi-box">
              <div className="kpi-box__label">{t.expKpiBreakEven}</div>
              <div className="kpi-box__value">
                {monthlySummary.hasSalesData && monthlySummary.weightedMarginPct > 0
                  ? `${state.currency} ${fmt(breakEvenRevenue, 0)}`
                  : t.noDataTag}
              </div>
              <div className="kpi-box__sub">
                {monthlySummary.hasSalesData && monthlySummary.weightedMarginPct > 0
                  ? `${fmt(monthlySummary.weightedMarginPct, 1)}%`
                  : t.recKpiNetHintMissing}
              </div>
            </div>
            <div className="kpi-box kpi-box--highlight">
              <div className="kpi-box__label">{t.expKpiNetResult}</div>
              <div
                className="kpi-box__value"
                style={{ color: netOperatingProfit === null ? 'inherit' : netOperatingProfit >= 0 ? '#4ade80' : '#f87171' }}
              >
                {netOperatingProfit === null ? t.noDataTag : `${state.currency} ${fmt(netOperatingProfit, 0)}`}
              </div>
              <div className="kpi-box__sub">
                {netOperatingProfit === null
                  ? t.recKpiNetHintMissing
                  : monthlySummary.totalRevenue > 0
                    ? `${fmt((netOperatingProfit / monthlySummary.totalRevenue) * 100, 1)}%`
                    : t.noDataTag}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'sales' && (
        <div className="card">
          <h2>{t.salesTitle}</h2>
          <p className="lead">
            {t.salesLead}
            {state.salesPeriod ? ` (${state.salesPeriod})` : ''}
          </p>

          <div className="card" style={{ marginBottom: 14, background: 'var(--surface-alt)' }}>
            <h4 style={{ margin: '0 0 10px' }}>{t.salesManualTitle}</h4>
            <div className="builder-grid">
              <label className="field">
                <span>{t.recColProduct}</span>
                <select
                  value={manualSaleForm.productId || state.catalog.recipes.find((r) => r.recipe_type === 'product')?.id || ''}
                  onChange={(e) => setManualSaleForm((prev) => ({ ...prev, productId: e.target.value }))}
                >
                  {state.catalog.recipes
                    .filter((r) => r.recipe_type === 'product')
                    .map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                </select>
              </label>
              <label className="field">
                <span>{t.salesColUnits}</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={manualSaleForm.quantity}
                  onChange={(e) => setManualSaleForm((prev) => ({ ...prev, quantity: Math.max(0, Number(e.target.value) || 0) }))}
                />
              </label>
              <label className="field">
                <span>{t.salesColChannel}</span>
                <input
                  type="text"
                  value={manualSaleForm.channel}
                  onChange={(e) => setManualSaleForm((prev) => ({ ...prev, channel: e.target.value }))}
                />
              </label>
              <label className="field">
                <span>{t.salesColPeriod} (Inicio)</span>
                <input
                  type="date"
                  value={manualSaleForm.periodStart}
                  onChange={(e) => setManualSaleForm((prev) => ({ ...prev, periodStart: e.target.value }))}
                />
              </label>
              <label className="field">
                <span>{t.salesColPeriod} (Fin)</span>
                <input
                  type="date"
                  value={manualSaleForm.periodEnd}
                  onChange={(e) => setManualSaleForm((prev) => ({ ...prev, periodEnd: e.target.value }))}
                />
              </label>
              <label className="field">
                <span>{t.salesColGrossRev} ({state.currency})</span>
                <input
                  type="text"
                  placeholder={t.ingOptionalPlaceholder}
                  value={manualSaleForm.grossRevenue}
                  onChange={(e) => setManualSaleForm((prev) => ({ ...prev, grossRevenue: e.target.value }))}
                />
              </label>
            </div>
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn--primary"
                disabled={state.catalog.recipes.filter((r) => r.recipe_type === 'product').length === 0 || manualSaleForm.quantity <= 0}
                onClick={addManualSale}
              >
                {t.salesAddBtn}
              </button>
            </div>
          </div>

          {(state.salesHistory?.length ?? 0) === 0 ? (
            <div className="empty-state">{t.salesEmptyState}</div>
          ) : (
            <div className="table-wrap">
              <table className="kit-table">
                <thead>
                  <tr>
                    <th>{t.salesColPosProduct}</th>
                    <th>{t.salesColLinkedProduct}</th>
                    <th>{t.salesColUnits}</th>
                    <th>{t.salesColPeriod}</th>
                    <th>{t.salesColChannel}</th>
                    <th>{t.salesColGrossRev}</th>
                    <th>{t.salesColNetRev}</th>
                    <th>{t.salesColSource}</th>
                    <th></th>
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
                            aria-label={`${t.salesColLinkedProduct} ${sale.product_name}`}
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
                            <option value="">{t.salesPendingLink}</option>
                            {state.catalog.recipes
                              .filter((recipe) => recipe.recipe_type === 'product')
                              .map((recipe) => (
                                <option key={recipe.id} value={recipe.id}>
                                  {recipe.name}
                                </option>
                              ))}
                          </select>
                        </td>
                        <td>{fmt(sale.quantity, 2)}</td>
                        <td>{sale.period_start === sale.period_end ? fmtDate(sale.period_start) : `${fmtDate(sale.period_start)} → ${fmtDate(sale.period_end)}`}</td>
                        <td>{sale.channel || '—'}</td>
                        <td>{sale.gross_revenue == null ? '—' : `${state.currency} ${fmt(sale.gross_revenue, 0)}`}</td>
                        <td>{sale.net_revenue == null ? '—' : `${state.currency} ${fmt(sale.net_revenue, 0)}`}</td>
                        <td>{sale.source}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn--sm btn--danger"
                            onClick={() => deleteSalesRecord(sale.id)}
                            title={t.deleteTitle}
                          >
                            ✕
                          </button>
                        </td>
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
            <h2>{t.snapTitle}</h2>
            <p className="lead">{t.snapLead}</p>
            {state.snapshots.length === 0 ? (
              <div className="empty-state">{t.snapEmpty}</div>
            ) : (
              <div className="table-wrap">
                <table className="kit-table">
                  <thead>
                    <tr>
                      <th>{t.snapColDate}</th>
                      <th>{t.snapColRecipe}</th>
                      <th>{t.snapColHash}</th>
                      <th>{t.snapColStatus}</th>
                      <th>{t.snapColUnitCost}</th>
                      <th>{t.snapColSuggestedPrice}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.snapshots.map((snap, idx) => (
                      <tr key={`${snap.snapshot_id}_${idx}`}>
                        <td>{fmtDateTime(snap.created_at)}</td>
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
                            {snap.cost_result.status === 'complete' ? t.statusComplete : t.incompleteTag}
                          </span>
                        </td>
                        <td>
                          {snap.cost_result.raw_unit_cost != null
                            ? `${snap.cost_result.currency} ${fmt(snap.cost_result.raw_unit_cost, 2)}`
                            : snap.cost_result.unit_cost
                            ? `${snap.cost_result.currency} ${snap.cost_result.unit_cost}`
                            : t.incompleteTag}
                        </td>
                        <td>
                          {snap.pricing_scenario?.raw_suggested_price != null
                            ? `${snap.cost_result.currency} ${fmt(snap.pricing_scenario.raw_suggested_price, 0)}`
                            : snap.pricing_scenario?.suggested_price
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

          {account.id > 0 && token !== 'guest-demo-token' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h2>{t.bkpTitle}</h2>
                  <p className="lead">{t.bkpLead}</p>
                </div>
                <button type="button" className="btn btn--secondary" disabled={loadingBackups} onClick={() => void loadCloudBackups()}>
                  {loadingBackups ? '…' : t.bkpRefreshBtn}
                </button>
              </div>
              {backupNotice && (
                <div className="alert-banner" style={{ background: '#e8f5e9', color: '#2e7d32', borderColor: '#86efac', marginBottom: 12 }}>
                  {backupNotice}
                </div>
              )}
              {cloudBackups.length === 0 ? (
                <div className="empty-state">{t.bkpEmpty}</div>
              ) : (
                <div className="table-wrap">
                  <table className="kit-table">
                    <thead>
                      <tr>
                        <th>{t.bkpColVersion}</th>
                        <th>{t.bkpColDate}</th>
                        <th>{t.bkpColSize}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cloudBackups.map((bkp) => (
                        <tr key={bkp.id}>
                          <td><strong>v{bkp.version}</strong> (#{bkp.id})</td>
                          <td>{fmtDateTime(bkp.created_at)}</td>
                          <td>{fmt(Math.max(1, Math.round(bkp.size_bytes / 1024)), 0)} KB</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn--sm btn--secondary"
                              disabled={restoringBackupId !== null}
                              onClick={() => void restoreCloudBackup(bkp.id)}
                            >
                              {restoringBackupId === bkp.id ? t.bkpRestoringBtn : t.bkpRestoreBtn}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="card">
            <h2>{t.goldenTitle} (Cost Engine v{goldenCases.version})</h2>
            <p className="lead">{t.goldenLead}</p>
            <div className="table-wrap">
              <table className="kit-table">
                <thead>
                  <tr>
                    <th>{t.goldenColId}</th>
                    <th>{t.goldenColDesc}</th>
                    <th>{t.goldenColCalculated}</th>
                    <th>{t.goldenColExpected}</th>
                    <th>{t.goldenColStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(goldenCases.cases).map((c: any) => {
                    let liveSummary = '';
                    let passed = false;
                    try {
                      if (c.id === 'CE-001' || c.id === 'CE-002') {
                        const rec = {
                          id: 'test_dough',
                          name: c.title,
                          recipe_type: 'subrecipe' as const,
                          yield_quantity: c.dough_profile.measured_yield_g ?? c.dough_profile.unit_weight_g ?? 220,
                          yield_unit: 'g' as const,
                          currency: c.currency,
                          bakers_dough: c.dough_profile,
                        };
                        const res = new CostEngine({
                          ingredients: c.ingredients,
                          purchase_prices: c.purchase_prices,
                          recipes: [rec],
                        }).calculateRecipeCost('test_dough');
                        const actualKg = res.cost_per_kg ?? 0;
                        passed = Math.abs(actualKg - c.expected.cost_per_kg) <= (c.tolerance ?? 0.01);
                        liveSummary = `cost_per_kg: ${formatDecimal(actualKg, 4)}`;
                      } else if (c.id === 'CE-003' || c.id === 'CE-004' || c.id === 'CE-006') {
                        const res = new CostEngine({
                          ingredients: c.ingredients,
                          purchase_prices: c.purchase_prices,
                          recipes: [c.recipe],
                        }).calculateRecipeCost(c.recipe.id);
                        const expectedVal = c.expected.cost_per_kg ?? c.expected.unit_cost ?? c.expected.recipe_cost;
                        const actualVal = c.expected.cost_per_kg ? (res.cost_per_kg ?? 0) : (res.raw_unit_cost ?? 0);
                        passed = Math.abs(actualVal - expectedVal) <= (c.tolerance ?? 0.01);
                        liveSummary = `${formatDecimal(actualVal, 2)} ${c.currency}`;
                      } else if (c.id === 'CE-005') {
                        const eng = new CostEngine({
                          ingredients: c.ingredients,
                          purchase_prices: c.purchase_prices,
                          recipes: c.recipes,
                        });
                        const rA = eng.calculateRecipeCost('prod_a');
                        const rB = eng.calculateRecipeCost('prod_b');
                        passed =
                          Math.abs((rA.raw_unit_cost ?? 0) - c.expected.prod_a_cost) <= 0.01 &&
                          Math.abs((rB.raw_unit_cost ?? 0) - c.expected.prod_b_cost) <= 0.01;
                        liveSummary = `prod_a: ${rA.unit_cost} | prod_b: ${rB.unit_cost}`;
                      } else if (c.id === 'CE-007') {
                        const res = new CostEngine({
                          ingredients: c.ingredients,
                          purchase_prices: c.purchase_prices,
                          recipes: [c.recipe],
                        }).calculateRecipeCost(c.recipe.id);
                        passed = res.status === 'incomplete' && res.unit_cost === null;
                        liveSummary = `status: ${res.status}, unit_cost: null`;
                      } else if (c.id === 'CE-008') {
                        const pr = calculatePricingScenario({
                          unit_cost: c.inputs.unit_cost,
                          status: 'complete',
                          currency: c.currency,
                          target_food_cost_pct: c.inputs.target_food_cost_pct,
                          rounding_increment: c.inputs.rounding_increment,
                          rounding_mode: c.inputs.rounding_mode,
                        });
                        passed =
                          Math.abs((pr.raw_suggested_price ?? 0) - c.expected.suggested_price) <= 0.01 &&
                          Math.abs((pr.gross_margin_pct ?? 0) - c.expected.gross_margin_pct) <= 0.01;
                        liveSummary = `suggested: ${pr.suggested_price} (${formatDecimal(pr.gross_margin_pct ?? 0, 1)}%)`;
                      }
                    } catch (err) {
                      passed = false;
                      liveSummary = err instanceof Error ? err.message : 'Error';
                    }
                    return (
                      <tr key={c.id}>
                        <td><strong>{c.id}</strong></td>
                        <td>{c.title}</td>
                        <td><code>{liveSummary}</code></td>
                        <td><code>{JSON.stringify(c.expected)}</code></td>
                        <td>
                          <span className={`badge ${passed ? 'badge--ok' : 'badge--warn'}`}>
                            {passed ? 'PASS ✓' : 'FAIL ✕'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal de Actualizador Rápido de Precios por Lista de Proveedor */}
      {showPriceListModal && (() => {
        const pl = state.locale === 'en'
          ? {
              title: 'Update Prices from Supplier List',
              detected: 'products detected in list',
              total: 'Total in list:',
              matched: 'Matched:',
              unmatched: 'Unmatched:',
              inc: 'Increases:',
              dec: 'Decreases:',
              avgVar: 'Avg change:',
              all: 'All',
              matchedBtn: 'Matched',
              unmatchedBtn: 'Unmatched',
              warnBtn: 'With warnings',
              colItem: 'Supplier list item',
              colTools: 'Ingredient in Tools',
              colListPrice: 'List price',
              colCurrPrice: 'Current price',
              colNewUnit: 'New unit cost',
              colVar: 'Change',
              pack: 'Pack:',
              unlinkedOpt: '— Unlinked —',
              exactMatch: 'Exact',
              similarMatch: 'Similar',
              footerNote: 'New purchase records will be added dated today. Existing snapshots and historical calculations stay unchanged.',
              applyOne: 'price',
              applyMany: 'prices',
              applyPrefix: 'Apply',
            }
          : state.locale === 'pt-BR'
          ? {
              title: 'Atualizar Preços por Lista de Fornecedor',
              detected: 'produtos detectados na lista',
              total: 'Total na lista:',
              matched: 'Vinculados:',
              unmatched: 'Sem vínculo:',
              inc: 'Altas:',
              dec: 'Quedas:',
              avgVar: 'Var. média:',
              all: 'Todos',
              matchedBtn: 'Vinculados',
              unmatchedBtn: 'Sem vínculo',
              warnBtn: 'Com alertas',
              colItem: 'Item na lista do fornecedor',
              colTools: 'Insumo no Tools',
              colListPrice: 'Preço lista',
              colCurrPrice: 'Preço atual',
              colNewUnit: 'Novo unitário',
              colVar: 'Variação',
              pack: 'Embalagem:',
              unlinkedOpt: '— Sem vínculo —',
              exactMatch: 'Exato',
              similarMatch: 'Semelhante',
              footerNote: 'Serão adicionados novos registros de compra com a data de hoje. Snapshots e cálculos anteriores permanecem intactos.',
              applyOne: 'preço',
              applyMany: 'preços',
              applyPrefix: 'Aplicar',
            }
          : {
              title: 'Actualizar Precios por Lista de Proveedor',
              detected: 'productos detectados en la lista',
              total: 'Total en lista:',
              matched: 'Vinculados:',
              unmatched: 'Sin vincular:',
              inc: 'Subas:',
              dec: 'Bajas:',
              avgVar: 'Var. promedio:',
              all: 'Todos',
              matchedBtn: 'Vinculados',
              unmatchedBtn: 'Sin vincular',
              warnBtn: 'Con advertencias',
              colItem: 'Ítem en lista de proveedor',
              colTools: 'Insumo en Tools',
              colListPrice: 'Precio lista',
              colCurrPrice: 'Precio actual',
              colNewUnit: 'Nuevo unitario',
              colVar: 'Variación',
              pack: 'Envase:',
              unlinkedOpt: '— Sin vincular —',
              exactMatch: 'Exacto',
              similarMatch: 'Similar',
              footerNote: 'Se agregarán nuevos registros de compra con fecha de hoy. Tus snapshots y cálculos históricos permanecen inalterados.',
              applyOne: 'precio',
              applyMany: 'precios',
              applyPrefix: 'Aplicar',
            };
        return (
        <div className="modal-backdrop">
          <div className="modal-panel" style={{ maxWidth: '960px', width: '95%' }}>
            <div className="modal-header">
              <div>
                <h3>{pl.title}</h3>
                <small>{priceListFileName} · {priceListMatches.length} {pl.detected}</small>
              </div>
              <button type="button" className="btn" onClick={() => setShowPriceListModal(false)}>{t.closeBtn}</button>
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
                    <span>{pl.total} <strong>{summary.total}</strong></span>
                    <span>{pl.matched} <strong style={{ color: '#2e7d32' }}>{summary.matched}</strong></span>
                    <span>{pl.unmatched} <strong style={{ color: summary.unmatched ? '#d32f2f' : '#666' }}>{summary.unmatched}</strong></span>
                    <span>{pl.inc} <strong style={{ color: '#c62828' }}>+{summary.increases}</strong></span>
                    <span>{pl.dec} <strong style={{ color: '#2e7d32' }}>-{summary.decreases}</strong></span>
                    {summary.average_variation_pct != null && (
                      <span>{pl.avgVar} <strong>{summary.average_variation_pct > 0 ? `+${fmt(summary.average_variation_pct, 1)}%` : `${fmt(summary.average_variation_pct, 1)}%`}</strong></span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, fontSize: '0.8rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={`btn btn--sm ${priceListFilter === 'all' ? 'btn--primary' : 'btn--secondary'}`}
                      onClick={() => setPriceListFilter('all')}
                    >
                      {pl.all} ({priceListMatches.length})
                    </button>
                    <button
                      type="button"
                      className={`btn btn--sm ${priceListFilter === 'matched' ? 'btn--primary' : 'btn--secondary'}`}
                      onClick={() => setPriceListFilter('matched')}
                    >
                      {pl.matchedBtn} ({summary.matched})
                    </button>
                    <button
                      type="button"
                      className={`btn btn--sm ${priceListFilter === 'unmatched' ? 'btn--primary' : 'btn--secondary'}`}
                      onClick={() => setPriceListFilter('unmatched')}
                    >
                      {pl.unmatchedBtn} ({summary.unmatched})
                    </button>
                    {summary.with_warnings > 0 && (
                      <button
                        type="button"
                        className={`btn btn--sm ${priceListFilter === 'warnings' ? 'btn--primary' : 'btn--secondary'}`}
                        style={{ color: '#e65100', borderColor: '#ffb74d' }}
                        onClick={() => setPriceListFilter('warnings')}
                      >
                        ⚠️ {pl.warnBtn} ({summary.with_warnings})
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
                          <th>{pl.colItem}</th>
                          <th>{pl.colTools}</th>
                          <th style={{ textAlign: 'right' }}>{pl.colListPrice}</th>
                          <th style={{ textAlign: 'right' }}>{pl.colCurrPrice}</th>
                          <th style={{ textAlign: 'right' }}>{pl.colNewUnit}</th>
                          <th style={{ textAlign: 'center' }}>{pl.colVar}</th>
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
                                    {pl.pack} {fmt(match.presentation.quantity, 2)} {match.presentation.unit}
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
                                  <option value="">{pl.unlinkedOpt}</option>
                                  {state.catalog.ingredients.map((i) => (
                                    <option key={i.id} value={i.id}>
                                      {i.name} ({i.base_unit})
                                    </option>
                                  ))}
                                </select>
                                {match.target_id && (
                                  <div style={{ fontSize: '0.7rem', color: '#777', marginTop: 2 }}>
                                    Match: {match.source === 'exact' ? pl.exactMatch : `${pl.similarMatch} (${Math.round(match.confidence * 100)}%)`}
                                  </div>
                                )}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {state.currency} {fmt(match.item.price, 2)}
                              </td>
                              <td style={{ textAlign: 'right', color: '#666' }}>
                                {match.old_price_per_unit != null ? `${state.currency} ${fmt(match.old_price_per_unit, 2)}` : '—'}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                {match.new_price_per_unit != null && ing
                                  ? `${state.currency} ${fmt(match.new_price_per_unit, 2)} / ${ing.base_unit}`
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
                                    {match.variation_pct > 0 ? `+${fmt(match.variation_pct, 1)}%` : `${fmt(match.variation_pct, 1)}%`}
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

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 10 }}>
                    <small style={{ color: '#666' }}>
                      {pl.footerNote}
                    </small>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn btn--secondary" onClick={() => setShowPriceListModal(false)}>
                        {t.cancelBtn}
                      </button>
                      <button
                        type="button"
                        className="btn btn--primary"
                        disabled={selectedCount === 0}
                        onClick={confirmPriceListApply}
                      >
                        {pl.applyPrefix} {selectedCount} {selectedCount === 1 ? pl.applyOne : pl.applyMany}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
        );
      })()}

      {/* Modal de Revisión de Importación XLSX / CSV */}
      {smartImportPreview && (() => {
        const imp = state.locale === 'en'
          ? {
              aiRem: 'AI previews remaining today',
              noteLocal: 'Mapping was performed locally on the server. No external services received your data. Review columns, units and warnings before confirming.',
              noteAi: 'Up to 20 sample rows per sheet are reviewed to suggest column mappings. Nothing is saved until you confirm.',
              confidence: 'confidence',
              rows: 'rows',
              kindIng: 'Ingredients',
              kindPrices: 'Purchase prices',
              kindRecipes: 'Recipes',
              kindExpenses: 'Operating expenses',
              kindSales: 'Sales',
              kindSkip: 'Do not import this sheet',
              rowPrefix: 'Row',
              noText: '(empty)',
              unassigned: 'Unassigned',
              colPrefix: 'Column',
              unmatchedTitle: 'Recipe ingredients not matched in catalog',
              unmatchedDesc: 'Link them to an existing catalog ingredient or leave them to be created as new ingredients.',
              linkTo: 'Link to:',
              createNewOpt: 'Create as new ingredient',
            }
          : state.locale === 'pt-BR'
          ? {
              aiRem: 'pré-visualizações com IA restantes hoje',
              noteLocal: 'O mapeamento foi feito localmente no servidor sem enviar dados a serviços externos. Revise colunas, unidades e alertas antes de confirmar.',
              noteAi: 'Amostra de até 20 linhas por aba analisada para sugerir colunas. Nada é salvo até sua confirmação.',
              confidence: 'confiança',
              rows: 'linhas',
              kindIng: 'Insumos',
              kindPrices: 'Preços de compra',
              kindRecipes: 'Receitas',
              kindExpenses: 'Despesas operacionais',
              kindSales: 'Vendas',
              kindSkip: 'Não importar esta aba',
              rowPrefix: 'Linha',
              noText: '(sem texto)',
              unassigned: 'Sem atribuição',
              colPrefix: 'Coluna',
              unmatchedTitle: 'Insumos em receitas sem correspondência exata no catálogo',
              unmatchedDesc: 'Vincule a um insumo existente do catálogo ou deixe em branco para criar um novo insumo.',
              linkTo: 'Vincular a:',
              createNewOpt: 'Criar como novo insumo',
            }
          : {
              aiRem: 'previsualizaciones con IA restantes hoy',
              noteLocal: 'El mapeo se realizó localmente en el servidor. No se envió información a servicios externos. Revisá las columnas, unidades y advertencias; nada se guarda hasta tu confirmación.',
              noteAi: 'Se revisa una muestra de hasta 20 filas por hoja para proponer el mapeo de columnas. Nada se guarda hasta tu confirmación.',
              confidence: 'confianza',
              rows: 'filas',
              kindIng: 'Insumos',
              kindPrices: 'Precios de compra',
              kindRecipes: 'Recetas',
              kindExpenses: 'Gastos operativos',
              kindSales: 'Ventas',
              kindSkip: 'No importar esta hoja',
              rowPrefix: 'Fila',
              noText: '(sin texto)',
              unassigned: 'Sin asignar',
              colPrefix: 'Columna',
              unmatchedTitle: 'Insumos en recetas sin coincidencia exacta en el catálogo',
              unmatchedDesc: 'Asociarlos a un insumo existente para costearlos automáticamente o dejarlos para crear como nuevos insumos.',
              linkTo: 'Vincular a:',
              createNewOpt: 'Crear como nuevo insumo',
            };
        return (
        <div className="modal-backdrop">
          <div className="modal-panel smart-import-panel">
            <div className="modal-header">
              <div>
                <h3>{t.impReviewTitle}</h3>
                <small>{smartImportPreview.fileName} · {smartImportPreview.mappingMode === 'local' ? t.impLocalModeLabel : `${smartImportPreview.remaining} ${imp.aiRem}`}</small>
              </div>
              <button type="button" className="btn" onClick={() => setSmartImportPreview(null)}>{t.closeBtn}</button>
            </div>
            {importError && <p className="smart-import-note" role="alert">{importError}</p>}
            <p className="smart-import-note">
              {smartImportPreview.mappingMode === 'local'
                ? (smartImportPreview.note || imp.noteLocal)
                : (smartImportPreview.note || imp.noteAi)}
            </p>
            {smartImportPreview.mappings.map((mapping) => {
              const sheet = smartImportPreview.sheets[mapping.sheet_index];
              if (!sheet) return null;
              const fieldLabels = importFieldLabels[mapping.kind];
              const previewRows = sheet.rows.slice(mapping.header_row_index + 1, mapping.header_row_index + 4);
              return (
                <section className="smart-import-sheet" key={mapping.sheet_index}>
                  <div className="smart-import-sheet__heading">
                    <strong>{mapping.name}</strong>
                    <span>{Math.round(mapping.confidence * 100)}% {imp.confidence} · {mapping.row_count} {imp.rows}</span>
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
                      <span>{t.impSheetKindLabel}</span>
                      <select
                        value={mapping.kind}
                        onChange={(e) => updateSmartImportMapping(mapping.sheet_index, (current) => ({
                          ...current,
                          kind: e.target.value as ImportSheetMapping['kind'],
                        }))}
                      >
                        <option value="ingredients">{imp.kindIng}</option>
                        <option value="purchase_prices">{imp.kindPrices}</option>
                        <option value="recipes">{imp.kindRecipes}</option>
                        <option value="operating_expenses">{imp.kindExpenses}</option>
                        <option value="sales">{imp.kindSales}</option>
                        <option value="unknown">{imp.kindSkip}</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>{t.impHeaderRowLabel}</span>
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
                            {imp.rowPrefix} {index + 1}: {row.slice(0, 3).filter(Boolean).join(' · ').slice(0, 70) || imp.noText}
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
                            <option value="">{imp.unassigned}</option>
                            {mapping.headers.map((header, index) => (
                              <option key={index} value={index}>
                                {header || `${imp.colPrefix} ${index + 1}`}
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
                    🔍 {imp.unmatchedTitle} ({unmatched.length})
                  </strong>
                  <p style={{ fontSize: '0.84rem', color: '#78350f', margin: '0 0 10px' }}>
                    {imp.unmatchedDesc}
                  </p>
                  <div style={{ display: 'grid', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                    {unmatched.map((name) => (
                      <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#fff', padding: '6px 10px', borderRadius: 6, border: '1px solid #fed7aa' }}>
                        <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>{name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: '0.78rem', color: '#9a3412' }}>{imp.linkTo}</span>
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
                            <option value="">{imp.createNewOpt}</option>
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
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: '0.94rem' }}>{t.impModeTitle}</div>
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
                    <strong style={{ display: 'block', fontSize: '0.88rem' }}>{t.impModeMergeTitle}</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginTop: 2 }}>
                      {t.impModeMergeDesc}
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
                    <strong style={{ display: 'block', fontSize: '0.88rem', color: '#9a3412' }}>{t.impModeReplaceTitle}</strong>
                    <span style={{ fontSize: '0.8rem', color: '#7c2d12', display: 'block', marginTop: 2 }}>
                      {t.impModeReplaceDesc}
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
                    <span>{t.impReplaceConfirmCheck}</span>
                  </label>
                </div>
              )}
            </div>

            <div className="smart-import-footer">
              <button type="button" className="btn" onClick={() => { setSmartImportPreview(null); setImportEquivalences({}); setReplaceConfirmed(false); }}>{t.cancelBtn}</button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={replaceWorkspaceOnImport && !replaceConfirmed}
                onClick={confirmSmartImport}
              >
                {t.impConfirmBtn}
              </button>
            </div>
          </div>
        </div>
        );
      })()}
      {editingRecipe && (() => {
        const b = state.locale === 'en'
          ? {
              howBakers: '🍞 How do baker percentages work?',
              totalFlour: 'Total batch flour (g)',
              totalHydr: 'Total hydration (% water / flour)',
              saltPct: 'Salt (% over flour)',
              yieldBasis: 'Yield basis',
              basisMeasured: 'Measured final yield',
              basisFlourWater: 'Flour + water',
              basisTotal: 'Total formula',
              measuredYield: 'Measured yield (g)',
              flourBlend: 'Flour blend',
              addFlour: '+ Add flour',
              blendTotal: 'Blend total:',
              sum100Err: '· Sum must be 100%.',
              okLabel: '· Valid.',
              preferment: 'Preferment',
              typeLabel: 'Type',
              prefNone: 'No preferment',
              prefFlour: 'Preferment flour (%)',
              prefHydr: 'Preferment hydration (%)',
              prefYeast: 'Preferment yeast (%)',
              prefYeastIng: 'Yeast ingredient',
              liveEngine: '⚖️ Live Cost Engine breakdown',
              flourShort: 'flour',
              waterShort: 'water',
              yeastShort: 'yeast',
              finalMix: 'Final dough:',
              batchYield: 'Batch yield:',
              otherIngs: 'Other dough ingredients',
              directYeast: 'Direct yeast (%)',
              saltLabel: 'Salt (%)',
              sugarLabel: 'Sugar (%)',
              oilLabel: 'Oil (%)',
              waterIng: 'Water ingredient',
              selectIng: 'Select ingredient',
              batchCost: 'Batch cost:',
              unitCost: 'Unit cost:',
              suggested: 'Suggested:',
              yieldPrefix: 'yields in',
            }
          : state.locale === 'pt-BR'
          ? {
              howBakers: '🍞 Como funcionam as porcentagens de padeiro?',
              totalFlour: 'Farinha total do lote (g)',
              totalHydr: 'Hidratação total (% água / farinha)',
              saltPct: 'Sal (% sobre farinha)',
              yieldBasis: 'Base de rendimento',
              basisMeasured: 'Rendimento final medido',
              basisFlourWater: 'Farinha + água',
              basisTotal: 'Fórmula completa',
              measuredYield: 'Rendimento medido (g)',
              flourBlend: 'Mix de farinhas',
              addFlour: '+ Adicionar farinha',
              blendTotal: 'Total do mix:',
              sum100Err: '· A soma deve ser 100%.',
              okLabel: '· Correto.',
              preferment: 'Pré-fermento',
              typeLabel: 'Tipo',
              prefNone: 'Sem pré-fermento',
              prefFlour: 'Farinha do pré-fermento (%)',
              prefHydr: 'Hidratação do pré-fermento (%)',
              prefYeast: 'Fermento do pré-fermento (%)',
              prefYeastIng: 'Insumo de fermento',
              liveEngine: '⚖️ Detalhamento ao vivo do Cost Engine',
              flourShort: 'farinha',
              waterShort: 'água',
              yeastShort: 'ferm.',
              finalMix: 'Massa final:',
              batchYield: 'Rendimento do lote:',
              otherIngs: 'Outros ingredientes da massa',
              directYeast: 'Fermento direto (%)',
              saltLabel: 'Sal (%)',
              sugarLabel: 'Açúcar (%)',
              oilLabel: 'Óleo / Azeite (%)',
              waterIng: 'Insumo de água',
              selectIng: 'Selecionar insumo',
              batchCost: 'Custo do lote:',
              unitCost: 'Custo unitário:',
              suggested: 'Sugerido:',
              yieldPrefix: 'rende em',
            }
          : {
              howBakers: '🍞 ¿Cómo funcionan los porcentajes de panadero?',
              totalFlour: 'Harina Total del Batch (g)',
              totalHydr: 'Hidratación Total (% agua s/ harina)',
              saltPct: 'Sal (% sobre harina)',
              yieldBasis: 'Base de rendimiento',
              basisMeasured: 'Rendimiento final medido',
              basisFlourWater: 'Harina + agua',
              basisTotal: 'Fórmula completa',
              measuredYield: 'Rendimiento medido (g)',
              flourBlend: 'Mezcla de harinas',
              addFlour: '+ Agregar harina',
              blendTotal: 'Total de mezcla:',
              sum100Err: '· La suma debe ser 100%.',
              okLabel: '· Correcto.',
              preferment: 'Prefermento',
              typeLabel: 'Tipo',
              prefNone: 'Sin prefermento',
              prefBiga: 'Biga',
              prefFlour: 'Harina del prefermento (%)',
              prefHydr: 'Hidratación del prefermento (%)',
              prefYeast: 'Levadura del prefermento (%)',
              prefYeastIng: 'Insumo de levadura',
              liveEngine: '⚖️ Desglose en vivo del Cost Engine (expandBakersDoughSpec)',
              flourShort: 'harina',
              waterShort: 'agua',
              yeastShort: 'lev.',
              finalMix: 'Amasado final:',
              batchYield: 'Rendimiento Batch:',
              otherIngs: 'Otros ingredientes de la masa',
              directYeast: 'Levadura directa (%)',
              saltLabel: 'Sal (%)',
              sugarLabel: 'Azúcar (%)',
              oilLabel: 'Aceite (%)',
              waterIng: 'Insumo de agua',
              selectIng: 'Seleccionar insumo',
              batchCost: 'Costo batch:',
              unitCost: 'Costo unitario:',
              suggested: 'Sugerido:',
              yieldPrefix: 'rinde en',
            };
        let livePreviewCost: ReturnType<CostEngine['calculateRecipeCost']> | null = null;
        let livePreviewPricing: ReturnType<typeof calculatePricingScenario> | null = null;
        try {
          const tempRecipes = state.catalog.recipes.some((r) => r.id === editingRecipe.id)
            ? state.catalog.recipes.map((r) => (r.id === editingRecipe.id ? editingRecipe : r))
            : [...state.catalog.recipes, editingRecipe];
          livePreviewCost = new CostEngine({
            ...state.catalog,
            recipes: tempRecipes,
          }).calculateRecipeCost(editingRecipe.id);
          if (editingRecipe.recipe_type === 'product') {
            livePreviewPricing = calculatePricingScenario({
              unit_cost: livePreviewCost.raw_unit_cost,
              status: livePreviewCost.status,
              currency: state.currency,
              target_food_cost_pct: editingRecipe.target_food_cost_pct ?? state.defaultTargetFoodCostPct,
              rounding_increment: state.defaultRoundingIncrement,
              rounding_mode: 'ceil',
              packaging_cost: state.defaultPackagingCost,
              channel_fee_pct: state.defaultChannelFeePct,
            });
          }
        } catch {
          livePreviewCost = null;
        }
        const availableSubrecipes = state.catalog.recipes.filter(
          (r) => r.recipe_type === 'subrecipe' && r.id !== editingRecipe.id
        );
        return (
        <div className="modal-backdrop" onClick={() => setEditingRecipe(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {isDoughMode
                  ? t.builderDoughTitle
                  : editingRecipe.recipe_type === 'product'
                  ? t.builderProductTitle
                  : t.builderSubrecipeTitle}
              </h3>
              <button type="button" className="btn btn--sm" onClick={() => setEditingRecipe(null)}>
                ✕ {t.closeBtn}
              </button>
            </div>

            {builderError && <div className="alert-banner">⚠️ {builderError}</div>}

            <div className="builder-grid">
              <label className="field">
                <span>{t.builderNameLabel}</span>
                <input
                  type="text"
                  value={editingRecipe.name}
                  onChange={(e) => setEditingRecipe({ ...editingRecipe, name: e.target.value })}
                />
              </label>
              <label className="field">
                <span>{t.builderYieldLabel}</span>
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
                <span>{t.builderYieldUnitLabel}</span>
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
                  <span>{t.targetFoodCostLabel}</span>
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
                  {b.howBakers}
                </button>
              </div>
              <div className="builder-grid">
                <label className="field">
                  <span>{b.totalFlour}</span>
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
                  <span>{b.totalHydr}</span>
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
                  <span>{b.saltPct}</span>
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
                  <span>{b.yieldBasis}</span>
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
                    <option value="measured_yield">{b.basisMeasured}</option>
                    <option value="flour_plus_water">{b.basisFlourWater}</option>
                    <option value="total_formula">{b.basisTotal}</option>
                  </select>
                </label>
                {editingRecipe.bakers_dough.yield_basis === 'measured_yield' && (
                  <label className="field">
                    <span>{b.measuredYield}</span>
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
                  <strong>{b.flourBlend}</strong>
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
                    {b.addFlour}
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
                      aria-label={b.flourBlend}
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
                  {b.blendTotal} {fmt(editingRecipe.bakers_dough.flours.reduce((sum, flour) => sum + (flour.share_pct ?? 0), 0), 1)}%
                  {Math.abs(editingRecipe.bakers_dough.flours.reduce((sum, flour) => sum + (flour.share_pct ?? 0), 0) - 100) > 0.01
                    ? ` ${b.sum100Err}`
                    : ` ${b.okLabel}`}
                </small>
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <strong>{b.preferment}</strong>
                <div className="builder-grid">
                  <label className="field">
                    <span>{b.typeLabel}</span>
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
                      <option value="none">{b.prefNone}</option>
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
                          <span>{b.prefFlour}</span>
                          <input type="number" min={0} max={100} step={0.1} value={spec.flour_pct}
                            onChange={(e) => setEditingRecipe({ ...editingRecipe, bakers_dough: {
                              ...editingRecipe.bakers_dough!, [key]: { ...spec, flour_pct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) },
                            }})}
                          />
                        </label>
                        <label className="field">
                          <span>{b.prefHydr}</span>
                          <input type="number" min={0} max={200} step={0.1} value={spec.water_pct}
                            onChange={(e) => setEditingRecipe({ ...editingRecipe, bakers_dough: {
                              ...editingRecipe.bakers_dough!, [key]: { ...spec, water_pct: Math.max(0, Math.min(200, Number(e.target.value) || 0)) },
                            }})}
                          />
                        </label>
                        <label className="field">
                          <span>{b.prefYeast}</span>
                          <input type="number" min={0} max={20} step={0.01} value={spec.yeast_pct}
                            onChange={(e) => setEditingRecipe({ ...editingRecipe, bakers_dough: {
                              ...editingRecipe.bakers_dough!, [key]: { ...spec, yeast_pct: Math.max(0, Number(e.target.value) || 0) },
                            }})}
                          />
                        </label>
                        <label className="field">
                          <span>{b.prefYeastIng}</span>
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

              {(() => {
                try {
                  const exp = expandBakersDoughSpec(editingRecipe.bakers_dough!);
                  return (
                    <div className="card" style={{ marginTop: 12, background: '#f8fafc', borderColor: '#cbd5e1' }}>
                      <strong>{b.liveEngine}</strong>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 8, fontSize: '0.84rem' }}>
                        <span>{b.flourShort}: <strong>{fmt(exp.flourTotalG, 1)} g</strong></span>
                        <span>{b.waterShort}: <strong>{fmt(exp.waterTotalG, 1)} g</strong></span>
                        {exp.biga.totalG > 0 && (
                          <span>Biga: <strong>{fmt(exp.biga.totalG, 1)} g</strong> ({fmt(exp.biga.flourG, 0)}g {b.flourShort} + {fmt(exp.biga.waterG, 0)}g {b.waterShort} + {fmt(exp.biga.yeastG, 2)}g {b.yeastShort})</span>
                        )}
                        {exp.poolish.totalG > 0 && (
                          <span>Poolish: <strong>{fmt(exp.poolish.totalG, 1)} g</strong> ({fmt(exp.poolish.flourG, 0)}g {b.flourShort} + {fmt(exp.poolish.waterG, 0)}g {b.waterShort} + {fmt(exp.poolish.yeastG, 2)}g {b.yeastShort})</span>
                        )}
                        <span>{b.finalMix} <strong>{fmt(exp.final.flourG, 1)}g {b.flourShort} + {fmt(exp.final.waterG, 1)}g {b.waterShort}</strong></span>
                        <span>{b.batchYield} <strong>{fmt(exp.yieldQuantityG, 1)} g</strong></span>
                      </div>
                    </div>
                  );
                } catch {
                  return null;
                }
              })()}

              <div className="card" style={{ marginTop: 12 }}>
                <strong>{b.otherIngs}</strong>
                <div className="builder-grid">
                  {([
                    ['direct_yeast_pct', 'yeast_ingredient_id', b.directYeast],
                    ['salt_pct', 'salt_ingredient_id', b.saltLabel],
                    ['sugar_pct', 'sugar_ingredient_id', b.sugarLabel],
                    ['oil_pct', 'oil_ingredient_id', b.oilLabel],
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
                        <option value="">{b.selectIng}</option>
                        {state.catalog.ingredients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </div>
                  ))}
                  <label className="field">
                    <span>{b.waterIng}</span>
                    <select value={editingRecipe.bakers_dough.water_ingredient_id ?? ''}
                      onChange={(e) => setEditingRecipe({ ...editingRecipe, bakers_dough: {
                        ...editingRecipe.bakers_dough!, water_ingredient_id: e.target.value,
                      }})}
                    >
                      <option value="">{b.selectIng}</option>
                      {state.catalog.ingredients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              </>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong>{t.builderComponentsHeading}</strong>
                  <button
                    type="button"
                    className="btn btn--sm btn--primary"
                    onClick={() => {
                      const firstIng = state.catalog.ingredients[0];
                      const nextComps: RecipeComponent[] = [
                        ...(editingRecipe.components ?? []),
                        {
                          component_type: 'ingredient',
                          ingredient_id: firstIng?.id ?? '',
                          quantity: 100,
                          unit: firstIng?.base_unit ?? 'g',
                        },
                      ];
                      setEditingRecipe({ ...editingRecipe, components: nextComps });
                    }}
                  >
                    {t.builderAddCompBtn}
                  </button>
                </div>

                {(editingRecipe.components ?? []).map((comp, idx) => (
                  <div className="comp-row" key={idx}>
                    <select
                      value={comp.component_type}
                      onChange={(e) => {
                        const newType = e.target.value as 'ingredient' | 'subrecipe';
                        const firstSub = availableSubrecipes[0];
                        const firstIng = state.catalog.ingredients[0];
                        const updated = [...(editingRecipe.components ?? [])];
                        updated[idx] =
                          newType === 'ingredient'
                            ? {
                                component_type: 'ingredient',
                                ingredient_id: firstIng?.id ?? '',
                                quantity: comp.quantity,
                                unit: firstIng?.base_unit ?? 'g',
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
                      <option value="ingredient">{t.builderTypeIngredient}</option>
                      <option value="subrecipe">{t.builderTypeSubrecipe}</option>
                    </select>

                    {comp.component_type === 'ingredient' ? (
                      <select
                        value={comp.ingredient_id ?? ''}
                        onChange={(e) => {
                          const targetIng = state.catalog.ingredients.find((item) => item.id === e.target.value);
                          const updated = [...(editingRecipe.components ?? [])];
                          const nextUnit =
                            targetIng && !areUnitsCompatible(comp.unit, targetIng.base_unit, targetIng)
                              ? targetIng.base_unit
                              : comp.unit;
                          updated[idx] = { ...comp, ingredient_id: e.target.value, unit: nextUnit };
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
                          const targetSub = availableSubrecipes.find((r) => r.id === e.target.value);
                          const updated = [...(editingRecipe.components ?? [])];
                          const nextUnit = targetSub?.yield_unit ?? comp.unit;
                          updated[idx] = { ...comp, recipe_id: e.target.value, unit: nextUnit };
                          setEditingRecipe({ ...editingRecipe, components: updated });
                        }}
                      >
                        {availableSubrecipes.length === 0 && (
                          <option value="">{t.builderNoSubrecipesOption}</option>
                        )}
                        {availableSubrecipes.map((sub) => (
                          <option key={sub.id} value={sub.id}>
                            {sub.name} ({b.yieldPrefix} {sub.yield_unit})
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
                      title={t.deleteTitle}
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

            {livePreviewCost && (
              <div className="card" style={{ marginTop: 14, background: 'var(--surface-alt)', padding: 12 }}>
                <strong>{t.builderLiveCostLabel}</strong>{' '}
                {livePreviewCost.status === 'complete' && livePreviewCost.raw_unit_cost != null ? (
                  <span>
                    {b.batchCost} <strong>{state.currency} {fmt(livePreviewCost.raw_batch_cost ?? 0, 2)}</strong> ·{' '}
                    {b.unitCost} <strong>{state.currency} {fmt(livePreviewCost.raw_unit_cost, 2)} / {editingRecipe.yield_unit}</strong>
                    {livePreviewPricing?.raw_suggested_price != null && (
                      <> · {b.suggested} <strong style={{ color: 'var(--brand)' }}>{state.currency} {fmt(livePreviewPricing.raw_suggested_price, 0)}</strong></>
                    )}
                  </span>
                ) : (
                  <span style={{ color: 'var(--warn)', fontWeight: 600 }}>
                    {t.statusIncomplete}
                    {livePreviewCost.missing_inputs.length > 0 && ` (${livePreviewCost.missing_inputs.map((m) => m.ingredient_name).join(', ')})`}
                  </span>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button type="button" className="btn" onClick={() => setEditingRecipe(null)}>
                {t.cancelBtn}
              </button>
              <button type="button" className="btn btn--primary" onClick={saveEditedRecipe}>
                {t.builderValidateSaveBtn}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Modal de Confirmación para Limpiar Datos Demo */}
      {showClearDemoConfirm && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="clear-demo-title">
          <div className="modal-panel" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3 id="clear-demo-title" style={{ color: '#b91c1c' }}>{t.clearDemoTitle}</h3>
              <button type="button" className="btn btn--secondary" onClick={() => setShowClearDemoConfirm(false)}>✕</button>
            </div>
            <p style={{ margin: '14px 0', fontSize: '0.92rem', lineHeight: 1.5 }}>
              {t.clearDemoDesc1}
            </p>
            <p style={{ fontSize: '0.84rem', color: 'var(--muted)', margin: '0 0 18px' }}>
              {t.clearDemoDesc2} ({state.currency} · {state.locale})
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setShowClearDemoConfirm(false)}
              >
                {t.cancelBtn}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                style={{ background: '#b91c1c', borderColor: '#991b1b' }}
                onClick={() => {
                  setState({
                    ...createEmptyWorkspace(state.locale, state.currency),
                    unitSystem: state.unitSystem,
                  });
                  setShowClearDemoConfirm(false);
                }}
              >
                {t.clearDemoConfirmBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Historial de Precios del Insumo */}
      {priceHistoryIngredientId && (() => {
        const targetIng = state.catalog.ingredients.find((i) => i.id === priceHistoryIngredientId);
        if (!targetIng) return null;
        return (
          <PriceHistoryModal
            ingredient={targetIng}
            purchasePrices={state.catalog.purchase_prices}
            workspaceCurrency={state.currency}
            exchangeRates={state.catalog.exchange_rates}
            asOfDate={state.catalog.as_of_date}
            locale={state.locale}
            t={t}
            onSavePrices={(nextAllPrices) =>
              setState((prev) => ({
                ...prev,
                catalog: { ...prev.catalog, purchase_prices: nextAllPrices },
              }))
            }
            onClose={() => setPriceHistoryIngredientId(null)}
          />
        );
      })()}

      {/* Modal de Tipos de Cambio Explícitos */}
      {showExchangeRatesModal && (
        <ExchangeRatesModal
          baseCurrency={state.currency}
          rates={state.catalog.exchange_rates ?? []}
          locale={state.locale}
          t={t}
          onSave={(nextRates) =>
            setState((prev) => ({
              ...prev,
              catalog: { ...prev.catalog, exchange_rates: nextRates },
            }))
          }
          onClose={() => setShowExchangeRatesModal(false)}
        />
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
          locale={state.locale}
          onClose={() => setShowHelpModal(false)}
        />
      )}
    </div>
  );
}
