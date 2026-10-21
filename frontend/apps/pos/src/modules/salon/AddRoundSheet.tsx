import { useEffect, useMemo, useState } from 'react';
import { formatARS, uuid, type Product, type ProductVariant } from '@pizzalog/shared';
import { useCatalog, type CartLine } from '@/modules/sale/hooks';
import { ProductGrid } from '@/modules/sale/ProductGrid';
import { VariantPicker } from '@/modules/sale/VariantPicker';
import { PriceKeypad } from '@/modules/sale/PriceKeypad';
import { useAddRound } from './hooks';
import { comandaTicket } from '@/print/tickets';
import { getPrinterSettings, isNative, tryPrint } from '@/print/printer';

function isExtrasCategoryName(name: string): boolean {
  return /^(extras?|agregados?|adicionales?)(\s+.*)?$/i.test(name.trim());
}

export function AddRoundSheet({
  sessionId,
  placeLabel,
  accountLabel,
  onClose,
}: {
  sessionId: number;
  placeLabel?: string;
  accountLabel?: string;
  onClose: () => void;
}) {
  const catalog = useCatalog();
  const addRound = useAddRound();

  const allSalonProducts = useMemo(
    () => (catalog.data?.products ?? []).filter((p) => p.show_in_salon !== 0),
    [catalog.data?.products],
  );
  const allCategories = catalog.data?.categories ?? [];

  const extraCatIds = useMemo(() => {
    const set = new Set<number>();
    for (const c of allCategories) {
      if (isExtrasCategoryName(c.name)) set.add(c.id);
    }
    return set;
  }, [allCategories]);

  const extraProducts = useMemo(
    () => allSalonProducts.filter((p) => p.category_id !== null && extraCatIds.has(p.category_id)),
    [allSalonProducts, extraCatIds],
  );

  const categories = useMemo(
    () => allCategories.filter((c) => !extraCatIds.has(c.id)),
    [allCategories, extraCatIds],
  );

  const products = useMemo(
    () => allSalonProducts.filter((p) => p.category_id === null || !extraCatIds.has(p.category_id)),
    [allSalonProducts, extraCatIds],
  );

  const hasUncat = products.some((p) => p.category_id === null);

  const [tab, setTab] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [variantFor, setVariantFor] = useState<Product | null>(null);
  const [keypadFor, setKeypadFor] = useState<Product | null>(null);
  const [showExtraModal, setShowExtraModal] = useState(false);
  const [extraTargetKey, setExtraTargetKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tab === '' && (categories.length > 0 || hasUncat)) {
      const first = categories[0];
      setTab(first ? String(first.id) : 'otros');
    }
  }, [categories, hasUncat, tab]);

  const visible = useMemo(() => {
    if (tab === 'otros') return products.filter((p) => p.category_id === null);
    if (tab === '') return [];
    return products.filter((p) => p.category_id === Number(tab));
  }, [products, tab]);

  function addLine(line: CartLine) {
    setLines((prev) => {
      const f = prev.find((l) => l.key === line.key);
      if (f) return prev.map((l) => (l.key === line.key ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, line];
    });
  }

  function add(product: Product) {
    if (product.has_variants === 1) {
      setVariantFor(product);
      return;
    }
    if (product.is_open_price === 1) {
      setKeypadFor(product);
      return;
    }
    addLine({ key: `p${product.id}`, product, quantity: 1, unitPrice: Number(product.price) || 0, label: product.name });
  }

  function pickVariant(product: Product, variant: ProductVariant | undefined, selectedExtras: Product[]) {
    const extrasSum = selectedExtras.reduce((s, e) => s + (Number(e.price) || 0), 0);
    const extrasKey = selectedExtras.map((e) => e.id).sort((a, b) => a - b).join(',');
    const basePrice = Number(variant ? variant.price : product.price) || 0;
    const baseLabel = variant ? `${product.name} — ${variant.label}` : product.name;
    const label =
      selectedExtras.length > 0
        ? `${baseLabel} (+ ${selectedExtras.map((e) => e.name).join(', ')})`
        : baseLabel;

    addLine({
      key: `p${product.id}-v${variant?.id ?? 0}-ex${extrasKey}`,
      product,
      ...(variant ? { variant } : {}),
      quantity: 1,
      unitPrice: basePrice + extrasSum,
      label,
    });
    setVariantFor(null);
  }

  function attachExtraToLine(lineKey: string, extra: Product) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== lineKey) return l;
        return {
          ...l,
          key: `${l.key}-ex${extra.id}-${uuid().slice(0, 4)}`,
          unitPrice: (Number(l.unitPrice) || 0) + (Number(extra.price) || 0),
          label: `${l.label} (+ ${extra.name})`,
        };
      }),
    );
    setShowExtraModal(false);
    setExtraTargetKey(null);
  }

  function confirmOpenPrice(product: Product, amount: number) {
    addLine({ key: `open-${uuid()}`, product, quantity: 1, unitPrice: amount, label: product.name });
    setKeypadFor(null);
  }

  function inc(key: string) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l)));
  }
  function dec(key: string) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity - 1 } : l)).filter((l) => l.quantity > 0),
    );
  }

  const count = lines.reduce((s, l) => s + l.quantity, 0);

  async function send() {
    setError(null);
    try {
      await addRound.mutateAsync({
        sessionId,
        items: lines.map((l) => ({
          product_id: l.product.id,
          qty: l.quantity,
          name: l.label,
          unit_price: l.unitPrice,
          ...(l.variant ? { variant_id: l.variant.id } : {}),
        })),
      });
      const settings = await getPrinterSettings();
      if (settings.autoComanda && isNative()) {
        void tryPrint(
          comandaTicket({
            place: placeLabel || 'Salón',
            account: accountLabel,
            lines: lines.map((l) => ({ qty: l.quantity, label: l.label })),
            width: settings.width,
          }),
        );
      }
      onClose();
    } catch {
      setError('No se pudo enviar la comanda');
    }
  }

  return (
    <div className="overlay" onClick={() => !addRound.isPending && onClose()}>
      <div className="sheet sheet--tall" onClick={(e) => e.stopPropagation()}>
        <h2 className="sheet__title">Nueva comanda</h2>

        <div className="cat-tabs">
          {extraProducts.length > 0 && (
            <button
              type="button"
              className="cat-tab"
              disabled={lines.length === 0}
              style={{
                background: 'rgba(253, 183, 64, 0.16)',
                color: 'var(--ocre, #fdb740)',
                borderColor: 'var(--ocre, #fdb740)',
                fontWeight: 700,
                opacity: lines.length === 0 ? 0.5 : 1,
              }}
              onClick={() => {
                setExtraTargetKey(lines[lines.length - 1]?.key ?? null);
                setShowExtraModal(true);
              }}
            >
              🧀 + Extra a pizza
            </button>
          )}
          {categories.map((c) => (
            <button
              key={c.id}
              className={`cat-tab${tab === String(c.id) ? ' cat-tab--active' : ''}`}
              onClick={() => setTab(String(c.id))}
            >
              {c.name}
            </button>
          ))}
          {hasUncat && (
            <button
              className={`cat-tab${tab === 'otros' ? ' cat-tab--active' : ''}`}
              onClick={() => setTab('otros')}
            >
              Otros
            </button>
          )}
        </div>

        <div className="round-grid">
          <ProductGrid products={visible} onAdd={add} />
        </div>

        {lines.length > 0 && (
          <div className="round-selected">
            {lines.map((l) => (
              <div key={l.key} className="round-line">
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {l.label}
                  {extraProducts.length > 0 && (
                    <button
                      type="button"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--ocre, #fdb740)',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: '1px 4px',
                      }}
                      onClick={() => {
                        setExtraTargetKey(l.key);
                        setShowExtraModal(true);
                      }}
                    >
                      +extra
                    </button>
                  )}
                </span>
                <div className="qty">
                  <button className="qty__btn" onClick={() => dec(l.key)} aria-label="Quitar uno">
                    −
                  </button>
                  <span className="qty__n">{l.quantity}</span>
                  <button className="qty__btn" onClick={() => inc(l.key)} aria-label="Agregar uno">
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <p className="t-error">{error}</p>}

        <div className="sheet-actions">
          <button className="sheet__cancel" onClick={onClose} disabled={addRound.isPending}>
            Cancelar
          </button>
          <button
            className="t-btn t-btn--primary"
            disabled={count === 0 || addRound.isPending}
            onClick={() => void send()}
          >
            {addRound.isPending ? 'Enviando…' : `Enviar a cocina (${count})`}
          </button>
        </div>
      </div>

      {variantFor && (
        <VariantPicker
          product={variantFor}
          extras={extraProducts}
          onPick={(v, selectedExtras) => pickVariant(variantFor, v, selectedExtras)}
          onClose={() => setVariantFor(null)}
        />
      )}

      {showExtraModal && (
        <div className="overlay" onClick={() => setShowExtraModal(false)}>
          <div className="sheet sheet--tall" onClick={(e) => e.stopPropagation()}>
            <h2 className="sheet__title">🧀 Agregar Extra a Pizza</h2>
            {lines.length > 1 ? (
              <div style={{ marginBottom: 10 }}>
                <label className="muted-text" style={{ display: 'block', marginBottom: 4 }}>
                  Elegí a qué producto sumarle el extra:
                </label>
                <select
                  className="t-input"
                  value={extraTargetKey ?? lines[lines.length - 1]?.key ?? ''}
                  onChange={(e) => setExtraTargetKey(e.target.value)}
                >
                  {lines.map((l) => (
                    <option key={l.key} value={l.key}>
                      {l.label} ({formatARS(l.unitPrice)})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="muted-text" style={{ marginTop: 0 }}>
                Se sumará a: <strong>{lines[lines.length - 1]?.label ?? ''}</strong>
              </p>
            )}
            <div className="variant-pick-grid">
              {extraProducts.map((ex) => (
                <button
                  key={ex.id}
                  className="variant-pick"
                  onClick={() => {
                    const target = extraTargetKey ?? lines[lines.length - 1]?.key;
                    if (target) attachExtraToLine(target, ex);
                  }}
                >
                  <span className="variant-pick__label">+ {ex.name}</span>
                  <span className="variant-pick__price">+{formatARS(Number(ex.price) || 0)}</span>
                </button>
              ))}
            </div>
            <button className="sheet__cancel" onClick={() => setShowExtraModal(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {keypadFor && (
        <PriceKeypad
          product={keypadFor}
          onConfirm={(amount) => confirmOpenPrice(keypadFor, amount)}
          onClose={() => setKeypadFor(null)}
        />
      )}
    </div>
  );
}
