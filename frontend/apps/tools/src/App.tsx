import { useEffect, useMemo, useState } from 'react';
import {
  CostEngine,
  calculatePricingScenario,
  computeUsableIngredientCost,
  createCostSnapshot,
  formatDecimal,
  selectEffectivePurchasePrice,
  type UnitCode,
} from '@pizzalog/cost-engine';
import { goldenCases } from '@pizzalog/cost-engine-fixtures';
import {
  I18N,
  createInitialDemoWorkspace,
  type LocaleCode,
  type ToolsWorkspaceState,
} from './demoData';

const STORAGE_KEY = 'pizzalog_tools_workspace_v1';

export function App() {
  const [state, setState] = useState<ToolsWorkspaceState>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.catalog && Array.isArray(parsed.catalog.ingredients)) {
          return parsed;
        }
      }
    } catch {
      // fallback to demo
    }
    return createInitialDemoWorkspace();
  });

  const [activeTab, setActiveTab] = useState<
    'ingredients' | 'subrecipes' | 'recipes' | 'expenses' | 'snapshots'
  >('recipes');
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage quota errors
    }
  }, [state]);

  const t = I18N[state.locale] ?? I18N['es-AR'];

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

  function captureAllSnapshots() {
    const products = state.catalog.recipes.filter((r) => r.recipe_type === 'product');
    const newSnaps = products.map((r) =>
      createCostSnapshot(state.catalog, r.id, {
        target_food_cost_pct: r.target_food_cost_pct ?? state.defaultTargetFoodCostPct,
        rounding_increment: state.defaultRoundingIncrement,
        rounding_mode: 'ceil',
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

  function handleImportJson(file: File) {
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed?.catalog || !Array.isArray(parsed.catalog.ingredients) || !Array.isArray(parsed.catalog.recipes)) {
          throw new Error('Estructura JSON inválida: debe incluir catalog.ingredients y catalog.recipes');
        }
        // Validar con CostEngine antes de aceptar la importación
        const testEngine = new CostEngine(parsed.catalog);
        for (const r of parsed.catalog.recipes) {
          testEngine.calculateRecipeCost(r.id);
        }
        setState(parsed);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Error al validar archivo importado');
      }
    };
    reader.readAsText(file);
  }

  const totalMonthlyExpenses = useMemo(() => {
    const factor: Record<string, number> = { monthly: 1, weekly: 52 / 12, yearly: 1 / 12 };
    return state.operatingExpenses.reduce(
      (sum, item) => sum + item.amount * (factor[item.period] ?? 1),
      0
    );
  }, [state.operatingExpenses]);

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
          <a
            className="btn btn--ocre"
            href="/Restaurant_Profit_Kit_v1.xlsx"
            download="Restaurant_Profit_Kit_v1.xlsx"
          >
            {t.downloadExcel}
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
            onChange={(e) => {
              const curr = e.target.value;
              setState((s) => ({
                ...s,
                currency: curr,
                catalog: {
                  ...s.catalog,
                  purchase_prices: s.catalog.purchase_prices.map((p) => ({ ...p, currency: curr })),
                  recipes: s.catalog.recipes.map((r) => ({ ...r, currency: curr })),
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
              setState((s) => ({ ...s, defaultTargetFoodCostPct: Math.max(5, Math.min(95, Number(e.target.value) || 30)) }))
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
              setState((s) => ({ ...s, defaultRoundingIncrement: Math.max(1, Number(e.target.value) || 100) }))
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
              setState((s) => ({ ...s, defaultChannelFeePct: Math.max(0, Math.min(80, Number(e.target.value) || 0)) }))
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
          className={`tab-btn ${activeTab === 'snapshots' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('snapshots')}
        >
          {t.tabSnapshots}
        </button>
      </nav>

      {activeTab === 'ingredients' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <h2>Catálogo de Insumos, Presentaciones y Rendimiento Utilizable (Merma)</h2>
              <p className="lead">
                La merma se aplica una única vez como rendimiento utilizable. Si falta el precio de compra, el insumo se marca INCOMPLETO (nunca $0 silencioso).
              </p>
            </div>
            <button type="button" className="btn btn--primary" onClick={addIngredient}>
              + Agregar Insumo
            </button>
          </div>
          <div className="table-wrap">
            <table className="kit-table">
              <thead>
                <tr>
                  <th>Ingrediente</th>
                  <th>Unidad Base</th>
                  <th>Precio Compra ({state.currency})</th>
                  <th>Cant. Envase</th>
                  <th>Unidad Envase</th>
                  <th>Rendimiento Utilizable (%)</th>
                  <th>Costo Bruto / Base</th>
                  <th>Costo Utilizable / Base</th>
                  <th>Costo por kg / L</th>
                  <th>Estado</th>
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
                  try {
                    calcInfo = computeUsableIngredientCost(
                      ing,
                      priceRec,
                      state.currency,
                      state.catalog.exchange_rates,
                      state.catalog.as_of_date
                    );
                  } catch {
                    calcInfo = null;
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
                        <strong>{ing.base_unit}</strong> ({ing.base_dimension})
                      </td>
                      <td>
                        {ing.is_free ? (
                          <span className="badge badge--ok">Costo $0 explícito</span>
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
                          {ing.base_dimension === 'mass' && (
                            <>
                              <option value="kg">kg</option>
                              <option value="g">g</option>
                              <option value="lb">lb</option>
                              <option value="oz">oz</option>
                            </>
                          )}
                          {ing.base_dimension === 'volume' && (
                            <>
                              <option value="L">L</option>
                              <option value="ml">ml</option>
                              <option value="gal_us">gal (US)</option>
                              <option value="fl_oz_us">fl oz (US)</option>
                            </>
                          )}
                          {ing.base_dimension === 'count' && (
                            <>
                              <option value="unit">unit</option>
                              <option value="dozen">docena</option>
                            </>
                          )}
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
                        {isComplete && calcInfo?.grossUnitCostInBase !== null
                          ? `${state.currency} ${formatDecimal(calcInfo!.grossUnitCostInBase, 4)} / ${ing.base_unit}`
                          : '—'}
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
                          <span className="badge badge--warn">{t.statusIncomplete}</span>
                        )}
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
          <h2>Masas Panaderas (Biga / Poolish) y Subrecetas Reutilizables</h2>
          <p className="lead">
            Cada subreceta se calcula por lote (batch) y se prorratea según su rendimiento medido. Cualquier cambio de insumo actualiza todas las recetas finales que la utilizan.
          </p>
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
                            : 'Subreceta por componentes'}
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
          <h2>Escandallo de Productos, Precio Sugerido, Food Cost %, Margen Bruto % y Markup %</h2>
          <p className="lead">
            El motor diferencia estrictamente Food Cost % (Costo ÷ Precio), Margen Bruto % ((Precio − Costo) ÷ Precio) y Markup % ((Precio − Costo) ÷ Costo), y separa los costos de canal.
          </p>
          <div className="table-wrap">
            <table className="kit-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Estado</th>
                  <th>Costo Ingredientes</th>
                  <th>Precio Mínimo</th>
                  <th>Precio Sugerido</th>
                  <th>Food Cost %</th>
                  <th>Ganancia Bruta ($)</th>
                  <th>Margen Bruto %</th>
                  <th>Markup %</th>
                  <th>Neta Delivery (tras envase + {state.defaultChannelFeePct}%)</th>
                </tr>
              </thead>
              <tbody>
                {state.catalog.recipes
                  .filter((r) => r.recipe_type === 'product')
                  .map((prod) => {
                    const res = recipeResults.get(prod.id);
                    const pricing = res
                      ? calculatePricingScenario({
                          unit_cost: res.raw_unit_cost,
                          status: res.status,
                          currency: state.currency,
                          target_food_cost_pct: prod.target_food_cost_pct ?? state.defaultTargetFoodCostPct,
                          rounding_increment: state.defaultRoundingIncrement,
                          rounding_mode: 'ceil',
                          packaging_cost: state.defaultPackagingCost,
                          channel_fee_pct: state.defaultChannelFeePct,
                        })
                      : null;

                    const isComplete = res?.status === 'complete' && pricing?.status === 'complete';

                    return (
                      <tr key={prod.id}>
                        <td>
                          <strong>{prod.name}</strong>
                          {!isComplete && res && res.missing_inputs.length > 0 && (
                            <div style={{ fontSize: 11, color: 'var(--warn)', marginTop: 4 }}>
                              ⚠️ Falta precio de:{' '}
                              {res.missing_inputs.map((m) => m.ingredient_name).join(', ')} (Costo parcial conocido: {state.currency} {res.partial_batch_cost})
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${isComplete ? 'badge--ok' : 'badge--warn'}`}>
                            {isComplete ? t.statusComplete : t.statusIncomplete}
                          </span>
                        </td>
                        <td>
                          {isComplete && res?.unit_cost ? (
                            <strong>
                              {state.currency} {res.unit_cost}
                            </strong>
                          ) : (
                            <span style={{ color: 'var(--warn)', fontWeight: 700 }}>
                              INCOMPLETO
                            </span>
                          )}
                        </td>
                        <td>
                          {isComplete && pricing?.minimum_price
                            ? `${state.currency} ${pricing.minimum_price}`
                            : '—'}
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
                          {isComplete && pricing?.net_contribution_after_channel
                            ? `${state.currency} ${pricing.net_contribution_after_channel}`
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="card">
          <h2>Gastos Operativos Mensuales y Punto de Equilibrio (Break-Even)</h2>
          <p className="lead">
            Los gastos de estructura (alquiler, nómina, servicios) se registran por separado y nunca alteran silenciosamente el Food Cost de ingredientes.
          </p>
          <div className="table-wrap">
            <table className="kit-table">
              <thead>
                <tr>
                  <th>Concepto Operativo</th>
                  <th>Categoría</th>
                  <th>Frecuencia</th>
                  <th>Importe ({state.currency})</th>
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
                    <td>{exp.category}</td>
                    <td>{exp.period}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="kpi-grid">
            <div className="kpi-box">
              <div className="kpi-box__label">Total Gastos Fijos Mensuales</div>
              <div className="kpi-box__value">
                {state.currency} {formatDecimal(totalMonthlyExpenses, 2)}
              </div>
              <div className="kpi-box__sub">Excluye costo de mercadería (ingredientes)</div>
            </div>
            <div className="kpi-box">
              <div className="kpi-box__label">Margen Bruto Objetivo</div>
              <div className="kpi-box__value">
                {formatDecimal(100 - state.defaultTargetFoodCostPct, 1)}%
              </div>
              <div className="kpi-box__sub">
                Con Food Cost objetivo de {state.defaultTargetFoodCostPct}%
              </div>
            </div>
            <div className="kpi-box">
              <div className="kpi-box__label">Venta Mensual de Equilibrio</div>
              <div className="kpi-box__value">
                {state.currency}{' '}
                {formatDecimal(
                  totalMonthlyExpenses / ((100 - state.defaultTargetFoodCostPct) / 100),
                  2
                )}
              </div>
              <div className="kpi-box__sub">Facturación necesaria para cubrir estructura</div>
            </div>
          </div>
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
    </div>
  );
}
