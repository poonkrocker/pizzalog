import { useEffect, useMemo, useState } from 'react';
import { formatARS, uuid, type Product, type ProductVariant } from '@pizzalog/shared';
import { useCatalog, type CartLine } from '@/modules/sale/hooks';
import { ProductGrid } from '@/modules/sale/ProductGrid';
import { VariantPicker } from '@/modules/sale/VariantPicker';
import { PriceKeypad } from '@/modules/sale/PriceKeypad';
import { useAddRound } from './hooks';
import { comandaTicket } from '@/print/tickets';
import { dispatchComandas, getPrinterSettings, isNative, tryPrint } from '@/print/printer';

function isFoodExtrasCategoryName(name: string): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  // Descartar explícitamente costos, recargos, envíos, comisiones, tarifas o propinas
  if (/costo|recargo|comisi[oó]n|env[ií]o|flete|delivery|propina|tarifa|diferencia|inter[eé]s|tarjeta|financier/i.test(n)) {
    return false;
  }
  return /^(🧀\s*)?(extras?|agregados?|toppings?)(\s+.*)?$/i.test(n);
}

function isOperationalFeeOrSurcharge(productName: string): boolean {
  if (!productName) return false;
  return /env[ií]o|flete|delivery|rappi|pedidosya|uber|comisi[oó]n|inter[eé]s|recargo|propina|descuento|tarjeta|\btc\b|ajuste|diferencia|costo/i.test(
    productName.trim()
  );
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
      if (isFoodExtrasCategoryName(c.name)) set.add(c.id);
    }
    return set;
  }, [allCategories]);

  const extraProducts = useMemo(
    () =>
      allSalonProducts.filter(
        (p) =>
          p.is_active === 1 &&
          p.is_open_price !== 1 &&
          !isOperationalFeeOrSurcharge(p.name) &&
          ((p.category_id !== null && extraCatIds.has(p.category_id)) || (p as any).is_extra === 1)
      ),
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

  function canProductTakeExtras(p: Product): boolean {
    if (extraProducts.length === 0) return false;
    if (p.is_combo === 1) return false;
    if (p.category_id !== null && extraCatIds.has(p.category_id)) return false;

    const cat = allCategories.find((c) => c.id === p.category_id);
    const catName = (cat?.name ?? '').toLowerCase();
    const prodName = p.name.toLowerCase();

    // 1. Si alguna categoría de extras tiene target_category_ids configurado explícitamente:
    const extrasCategories = allCategories.filter((c) => isFoodExtrasCategoryName(c.name));
    const explicitTargets = new Set<number>();
    let hasExplicitTargets = false;
    for (const ec of extrasCategories) {
      const targets = (ec as any).target_category_ids;
      if (targets) {
        hasExplicitTargets = true;
        const arr = Array.isArray(targets)
          ? targets
          : String(targets).split(',').map((x) => parseInt(x.trim(), 10)).filter(Boolean);
        arr.forEach((id: number) => explicitTargets.add(id));
      }
    }

    if (hasExplicitTargets && p.category_id !== null) {
      return explicitTargets.has(p.category_id);
    }

    // 2. Si la categoría tiene configurado explícitamente allows_extras en el panel
    if (cat && (cat as any).allows_extras === 1) return true;

    // 3. Exclusiones evidentes
    if (
      catName.includes('cerve') ||
      catName.includes('bebida') ||
      catName.includes('gaseosa') ||
      catName.includes('postre') ||
      catName.includes('helad') ||
      catName.includes('cafe') ||
      prodName.includes('cerve') ||
      prodName.includes('gaseosa') ||
      prodName.includes('coca') ||
      prodName.includes('postre')
    ) {
      return false;
    }

    // 4. Por defecto: Pizzas SIEMPRE admiten extras, al igual que entradas y sánguches
    const n = `${catName} ${prodName}`;
    return (
      n.includes('pizza') ||
      n.includes('entrada') ||
      n.includes('sangu') ||
      n.includes('sandw') ||
      n.includes('burg') ||
      n.includes('hamburg') ||
      n.includes('lomito') ||
      n.includes('calzone')
    );
  }

  function add(product: Product, isLongPress = false) {
    if (isLongPress) {
      // Tap sostenido: abrir selector de opciones (variantes / extras)
      setVariantFor(product);
      return;
    }
    if (product.is_open_price === 1) {
      setKeypadFor(product);
      return;
    }

    const hasGeneralPrice = Boolean(product.price && Number(product.price) > 0);

    // Artículos sin precio general (solo tienen precio en variantes, ej: cerveza, porciones de pizza porteña):
    // El tap simple abre directamente el menú de variantes sin necesidad de tap sostenido
    // y NUNCA agrega ningún artículo al carrito de forma automática
    if (product.has_variants === 1 && !hasGeneralPrice) {
      setVariantFor(product);
      return;
    }

    // EN TODOS LOS DEMÁS CASOS: el tap simple agrega DIRECTO al carrito o a la cuenta
    if (product.has_variants === 1) {
      // Artículos con precio general que además tienen variantes (ej: pizza con queso común / queso vegano):
      // agregar directamente con queso común (sin extras)
      const variants = (product.variants ?? []).filter((v) => v.is_active === 1);
      const defaultVariant =
        variants.find((v) => !/vegan/i.test(v.label) && /com[uú]n|clasic|tradicional/i.test(v.label)) ??
        variants.find((v) => !/vegan/i.test(v.label)) ??
        variants[0];

      if (defaultVariant) {
        pickVariant(product, defaultVariant, []);
        return;
      }
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
      if (settings.autoComanda) {
        void dispatchComandas({
          place: placeLabel || 'Salón',
          account: accountLabel,
          lines: lines.map((l) => ({
            qty: l.quantity,
            label: l.label,
            categoryId: l.product.category_id,
            categoryName: categories.find((c) => c.id === l.product.category_id)?.name,
          })),
        });
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
          <ProductGrid
            products={visible}
            onAdd={add}
            categoryName={categories.find((c) => String(c.id) === tab)?.name}
          />
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
          extras={canProductTakeExtras(variantFor) ? extraProducts : []}
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
