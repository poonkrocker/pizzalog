import { useState } from 'react';
import {
  computeUsableIngredientCost,
  formatCalendarDate,
  formatLocaleNumber,
  selectEffectivePurchasePrice,
  todayLocalDateString,
  type ExchangeRate,
  type Ingredient,
  type PurchasePrice,
  type UnitCode,
} from '@pizzalog/cost-engine';
import type { LocaleCode } from './demoData';
import type { ToolsDictionary } from './i18n';

const ALL_UNITS: UnitCode[] = ['g', 'kg', 'mg', 'lb', 'oz', 'ml', 'cc', 'L', 'fl_oz_us', 'gal_us', 'unit', 'dozen'];
const CURRENCIES = ['ARS', 'USD', 'BRL', 'EUR', 'MXN'];

interface PriceHistoryModalProps {
  ingredient: Ingredient;
  purchasePrices: PurchasePrice[];
  workspaceCurrency: string;
  exchangeRates?: ExchangeRate[];
  asOfDate?: string;
  locale: LocaleCode;
  t: ToolsDictionary;
  onSavePrices: (nextAllPrices: PurchasePrice[]) => void;
  onClose: () => void;
}

export function PriceHistoryModal({
  ingredient,
  purchasePrices,
  workspaceCurrency,
  exchangeRates,
  asOfDate,
  locale,
  t,
  onSavePrices,
  onClose,
}: PriceHistoryModalProps) {
  const effectiveRecord = selectEffectivePurchasePrice(ingredient.id, purchasePrices, asOfDate);

  const [newDate, setNewDate] = useState<string>(() => todayLocalDateString());
  const [newSupplier, setNewSupplier] = useState<string>('');
  const [newPrice, setNewPrice] = useState<string>('');
  const [newCurrency, setNewCurrency] = useState<string>(effectiveRecord?.currency || workspaceCurrency);
  const [newPackQty, setNewPackQty] = useState<number>(effectiveRecord?.pack_quantity || 1);
  const [newPackUnit, setNewPackUnit] = useState<UnitCode>(effectiveRecord?.pack_unit || ingredient.base_unit);
  const [newYieldPct, setNewYieldPct] = useState<number>(effectiveRecord?.yield_pct ?? 100);
  const [formError, setFormError] = useState<string | null>(null);

  const entries = purchasePrices
    .map((price, idx) => ({ price, idx }))
    .filter(({ price }) => price.ingredient_id === ingredient.id)
    .sort((a, b) => (b.price.purchase_date ?? '').localeCompare(a.price.purchase_date ?? '') || b.idx - a.idx);

  const fmt = (n: number, dec = 2) => formatLocaleNumber(n, locale, dec);

  function addEntry() {
    setFormError(null);
    const numPrice = Number(newPrice);
    if (newPrice.trim() === '' || !Number.isFinite(numPrice) || numPrice <= 0) {
      setFormError(`${t.ingHistoryPrice}: > 0`);
      return;
    }
    if (!Number.isFinite(newPackQty) || newPackQty <= 0) {
      setFormError(`${t.ingColPackQty}: > 0`);
      return;
    }
    const clampedYield = Math.max(1, Math.min(100, Number(newYieldPct) || 100));
    const entry: PurchasePrice = {
      ingredient_id: ingredient.id,
      purchase_date: newDate || todayLocalDateString(),
      purchase_price: numPrice,
      currency: newCurrency || workspaceCurrency,
      pack_quantity: newPackQty,
      pack_unit: newPackUnit,
      yield_pct: clampedYield,
      supplier: newSupplier.trim() || undefined,
    };
    onSavePrices([...purchasePrices, entry]);
    setNewPrice('');
    setNewSupplier('');
  }

  function updateEntry(originalIndex: number, patch: Partial<PurchasePrice>) {
    const next = purchasePrices.map((p, idx) => (idx === originalIndex ? { ...p, ...patch } : p));
    onSavePrices(next);
  }

  function deleteEntry(originalIndex: number) {
    const next = purchasePrices.filter((_, idx) => idx !== originalIndex);
    onSavePrices(next);
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-panel" style={{ maxWidth: 920 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>{t.ingHistoryTitle}: {ingredient.name}</h3>
            <small style={{ color: 'var(--muted)' }}>{t.ingHistoryLead}</small>
          </div>
          <button type="button" className="btn btn--sm btn--secondary" onClick={onClose}>
            ✕ {t.closeBtn}
          </button>
        </div>

        <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--line)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <strong style={{ display: 'block', marginBottom: 10, fontSize: '0.9rem' }}>{t.ingHistoryAddBtn}</strong>
          {formError && <div className="alert-banner">{formError}</div>}
          <div className="builder-grid" style={{ marginBottom: 10 }}>
            <label className="field">
              <span>{t.ingHistoryDate}</span>
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </label>
            <label className="field">
              <span>{t.ingHistorySupplier}</span>
              <input type="text" placeholder={t.ingOptionalPlaceholder} value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} />
            </label>
            <label className="field">
              <span>{t.currencyLabel}</span>
              <select value={newCurrency} onChange={(e) => setNewCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="field">
              <span>{t.ingHistoryPrice}</span>
              <input type="number" min={0} step={50} placeholder="0.00" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
            </label>
            <label className="field">
              <span>{t.ingColPackQty}</span>
              <input type="number" min={0.001} step={0.5} value={newPackQty} onChange={(e) => setNewPackQty(Math.max(0.001, Number(e.target.value) || 1))} />
            </label>
            <label className="field">
              <span>{t.ingColPackUnit}</span>
              <select value={newPackUnit} onChange={(e) => setNewPackUnit(e.target.value as UnitCode)}>
                {ALL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
            <label className="field">
              <span>{t.ingHistoryYield}</span>
              <input type="number" min={1} max={100} step={1} value={newYieldPct} onChange={(e) => setNewYieldPct(Math.max(1, Math.min(100, Number(e.target.value) || 100)))} />
            </label>
          </div>
          <button type="button" className="btn btn--primary btn--sm" onClick={addEntry}>
            {t.ingHistoryAddBtn}
          </button>
        </div>

        {entries.length === 0 ? (
          <div className="empty-state">{t.ingHistoryEmpty}</div>
        ) : (
          <div className="table-wrap">
            <table className="kit-table">
              <thead>
                <tr>
                  <th>{t.ingHistoryDate}</th>
                  <th>{t.ingHistorySupplier}</th>
                  <th>{t.currencyLabel}</th>
                  <th>{t.ingHistoryPrice}</th>
                  <th>{t.ingHistoryPack}</th>
                  <th>{t.ingColPackUnit}</th>
                  <th>{t.ingHistoryYield}</th>
                  <th>{t.ingColUsableUnit}</th>
                  <th>{t.ingColStatus}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {entries.map(({ price, idx }) => {
                  const isActive = price === effectiveRecord;
                  let usableCost: number | null = null;
                  try {
                    const info = computeUsableIngredientCost(ingredient, price, workspaceCurrency, exchangeRates, asOfDate);
                    usableCost = info.usableUnitCostInBase;
                  } catch {
                    usableCost = null;
                  }
                  return (
                    <tr key={`${idx}_${price.purchase_date ?? 'none'}`}>
                      <td>
                        <input
                          type="date"
                          value={price.purchase_date ?? ''}
                          onChange={(e) => updateEntry(idx, { purchase_date: e.target.value || undefined })}
                        />
                        {price.purchase_date && (
                          <small style={{ display: 'block', color: 'var(--muted)', fontSize: '0.72rem' }}>
                            {formatCalendarDate(price.purchase_date, locale)}
                          </small>
                        )}
                      </td>
                      <td>
                        <input
                          type="text"
                          value={price.supplier ?? ''}
                          placeholder="—"
                          onChange={(e) => updateEntry(idx, { supplier: e.target.value || undefined })}
                        />
                      </td>
                      <td>
                        <select value={price.currency || workspaceCurrency} onChange={(e) => updateEntry(idx, { currency: e.target.value })}>
                          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={50}
                          value={price.purchase_price ?? ''}
                          onChange={(e) => updateEntry(idx, { purchase_price: e.target.value === '' ? null : Number(e.target.value) })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0.001}
                          step={0.5}
                          value={price.pack_quantity}
                          onChange={(e) => updateEntry(idx, { pack_quantity: Math.max(0.001, Number(e.target.value) || 1) })}
                        />
                      </td>
                      <td>
                        <select value={price.pack_unit} onChange={(e) => updateEntry(idx, { pack_unit: e.target.value as UnitCode })}>
                          {ALL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={price.yield_pct ?? 100}
                          onChange={(e) => updateEntry(idx, { yield_pct: Math.max(1, Math.min(100, Number(e.target.value) || 100)) })}
                        />
                      </td>
                      <td>
                        {usableCost !== null
                          ? `${workspaceCurrency} ${fmt(usableCost, 4)} / ${ingredient.base_unit}`
                          : '—'}
                      </td>
                      <td>
                        {isActive ? <span className="badge badge--ok">{t.ingHistoryActiveBadge}</span> : <span className="badge">—</span>}
                      </td>
                      <td>
                        <button type="button" className="btn btn--sm btn--danger" onClick={() => deleteEntry(idx)} title={t.deleteTitle}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

interface ExchangeRatesModalProps {
  baseCurrency: string;
  rates: ExchangeRate[];
  locale: LocaleCode;
  t: ToolsDictionary;
  onSave: (nextRates: ExchangeRate[]) => void;
  onClose: () => void;
}

export function ExchangeRatesModal({
  baseCurrency,
  rates,
  locale,
  t,
  onSave,
  onClose,
}: ExchangeRatesModalProps) {
  const [fromCurrency, setFromCurrency] = useState<string>(baseCurrency === 'USD' ? 'ARS' : 'USD');
  const [rateValue, setRateValue] = useState<string>('');
  const [effectiveDate, setEffectiveDate] = useState<string>(() => todayLocalDateString());
  const [error, setError] = useState<string | null>(null);

  function addRate() {
    setError(null);
    const num = Number(rateValue);
    if (!Number.isFinite(num) || num <= 0) {
      setError(`${t.fxRate}: > 0`);
      return;
    }
    if (fromCurrency === baseCurrency) {
      setError(`${fromCurrency} === ${baseCurrency}`);
      return;
    }
    const next: ExchangeRate[] = [
      ...rates,
      {
        from_currency: fromCurrency,
        to_currency: baseCurrency,
        rate: num,
        effective_date: effectiveDate || todayLocalDateString(),
        source: 'manual',
      },
    ];
    onSave(next);
    setRateValue('');
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-panel" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>{t.fxModalTitle}</h3>
            <small style={{ color: 'var(--muted)' }}>{t.fxModalLead}</small>
          </div>
          <button type="button" className="btn btn--sm btn--secondary" onClick={onClose}>✕ {t.closeBtn}</button>
        </div>

        {error && <div className="alert-banner">{error}</div>}
        <div className="builder-grid">
          <label className="field">
            <span>{t.fxFromCurrency}</span>
            <select value={fromCurrency} onChange={(e) => setFromCurrency(e.target.value)}>
              {CURRENCIES.filter((c) => c !== baseCurrency).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{t.fxToCurrency}</span>
            <input type="text" value={baseCurrency} disabled />
          </label>
          <label className="field">
            <span>{t.fxRate}</span>
            <input type="number" min={0.0001} step="0.01" placeholder="1250" value={rateValue} onChange={(e) => setRateValue(e.target.value)} />
          </label>
          <label className="field">
            <span>{t.fxEffectiveDate}</span>
            <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </label>
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={addRate} style={{ marginBottom: 14 }}>
          {t.fxAddBtn}
        </button>

        {rates.length > 0 && (
          <div className="table-wrap">
            <table className="kit-table">
              <thead>
                <tr>
                  <th>{t.fxFromCurrency}</th>
                  <th>{t.fxToCurrency}</th>
                  <th>{t.fxRate}</th>
                  <th>{t.fxEffectiveDate}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r, i) => (
                  <tr key={`${r.from_currency}_${r.to_currency}_${i}`}>
                    <td><strong>{r.from_currency}</strong></td>
                    <td>{r.to_currency}</td>
                    <td>{formatLocaleNumber(r.rate, locale, 4)}</td>
                    <td>{formatCalendarDate(r.effective_date, locale)}</td>
                    <td>
                      <button type="button" className="btn btn--sm btn--danger" onClick={() => onSave(rates.filter((_, idx) => idx !== i))}>
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
    </div>
  );
}
