import { useEffect, useMemo, useState } from 'react';
import { ApiError, formatARS, uuid, type PaymentSlice, type Product, type ProductVariant, type SaleInput } from '@pizzalog/shared';
import { useOnline } from '@/lib/network';
import { useCurrentCashSession } from '@/modules/cash/hooks';
import { Cart } from './Cart';
import { ProductGrid } from './ProductGrid';
import { VariantPicker } from './VariantPicker';
import { PriceKeypad } from './PriceKeypad';
import { SendToAccountSheet } from './SendToAccountSheet';
import { HalfHalfModal } from './HalfHalfModal';
import { config } from '@/lib/config';
import { saleTicket, comandaTicket } from '@/print/tickets';
import { dispatchComandas, getPrinterSettings, isNative, tryPrint } from '@/print/printer';
import { useCatalog, useCheckout, type CartLine } from './hooks';
import { CategoryIcon } from '@/assets/icons/CategoryIcon';

type OrderChannel = 'here' | 'takeaway' | 'delivery';

const CHANNELS: { value: OrderChannel; icon: string; label: string }[] = [
  { value: 'here', icon: '/category-icons/channel-table.svg', label: 'Acá' },
  { value: 'takeaway', icon: '/category-icons/channel-takeaway.svg', label: 'Llevar' },
  { value: 'delivery', icon: '/category-icons/channel-delivery.svg', label: 'Delivery' },
];

const METHODS: { value: string; label: string }[] = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'other', label: 'Otro' },
];

function isExtrasCategoryName(name: string): boolean {
  return /^(extras?|agregados?|adicionales?)(\s+.*)?$/i.test(name.trim());
}

export function SalePage() {
  const catalog = useCatalog();
  const checkout = useCheckout();
  const online = useOnline();
  const cashQuery = useCurrentCashSession();
  const isCashOpen = cashQuery.isLoading ? true : cashQuery.data !== null && cashQuery.data !== undefined;

  const allProducts = catalog.data?.products ?? [];
  const allCategories = catalog.data?.categories ?? [];

  const extraCatIds = useMemo(() => {
    const set = new Set<number>();
    for (const c of allCategories) {
      if (isExtrasCategoryName(c.name)) set.add(c.id);
    }
    return set;
  }, [allCategories]);

  const extraProducts = useMemo(
    () => allProducts.filter((p) => p.category_id !== null && extraCatIds.has(p.category_id)),
    [allProducts, extraCatIds],
  );

  const categories = useMemo(
    () => allCategories.filter((c) => !extraCatIds.has(c.id)),
    [allCategories, extraCatIds],
  );

  const products = useMemo(
    () => allProducts.filter((p) => p.category_id === null || !extraCatIds.has(p.category_id)),
    [allProducts, extraCatIds],
  );

  const hasUncategorized = products.some((p) => p.category_id === null);

  const [activeTab, setActiveTab] = useState('');
  const [channel, setChannel] = useState<OrderChannel>('takeaway');
  const [toAccount, setToAccount] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [variantFor, setVariantFor] = useState<Product | null>(null);
  const [keypadFor, setKeypadFor] = useState<Product | null>(null);
  const [showHalfHalf, setShowHalfHalf] = useState(false);
  const [showExtraModal, setShowExtraModal] = useState(false);
  const [extraTargetKey, setExtraTargetKey] = useState<string | null>(null);
  const [globalDiscount, setGlobalDiscount] = useState<number>(0);
  const [paying, setPaying] = useState(false);
  const [payMode, setPayMode] = useState<'single' | 'split'>('single');
  const [paymentRows, setPaymentRows] = useState<Array<{ amount: string; payment_method: string; label: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ kind: 'online' | 'queued' | 'round'; detail?: string; withoutCash?: boolean } | null>(null);
  const [lastPrint, setLastPrint] = useState<string | null>(null);
  const [printMsg, setPrintMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!online && channel === 'here') setChannel('takeaway');
  }, [online, channel]);

  useEffect(() => {
    if (activeTab === '' && (categories.length > 0 || hasUncategorized)) {
      const first = categories[0];
      setActiveTab(first ? String(first.id) : 'otros');
    }
  }, [categories, hasUncategorized, activeTab]);

  const activeCategoryName = activeTab === 'otros'
    ? 'Sin categoría'
    : categories.find((category) => String(category.id) === activeTab)?.name;

  const visibleProducts = useMemo(() => {
    if (activeTab === 'otros') return products.filter((p) => p.category_id === null);
    if (activeTab === '') return [];
    return products.filter((p) => p.category_id === Number(activeTab));
  }, [products, activeTab]);

  const subtotal = useMemo(
    () => cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
    [cart],
  );

  const total = useMemo(
    () => Math.max(0, subtotal - globalDiscount),
    [subtotal, globalDiscount],
  );

  function setLineDiscount(key: string, pct: number, fixedAmount?: number) {
    setCart((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const orig = l.originalPrice ?? l.unitPrice;
        const cleanLabel = l.label.replace(/ \(-(?:\d+(?:\.\d+)?%|\$[\d.,]+)\)$/, '');
        if (fixedAmount !== undefined && fixedAmount > 0) {
          const amt = Math.min(orig, fixedAmount);
          const discountedPrice = Math.max(0, Math.round(orig - amt));
          const computedPct = orig > 0 ? Math.round((amt / orig) * 100) : 0;
          return {
            ...l,
            originalPrice: orig,
            unitPrice: discountedPrice,
            discountPct: computedPct,
            label: `${cleanLabel} (-$${amt.toLocaleString('es-AR')})`,
          };
        }
        if (pct <= 0) {
          return {
            ...l,
            unitPrice: orig,
            originalPrice: undefined,
            discountPct: undefined,
            label: cleanLabel,
          };
        }
        const discountedPrice = Math.round(orig * (1 - pct / 100));
        return {
          ...l,
          originalPrice: orig,
          unitPrice: discountedPrice,
          discountPct: pct,
          label: `${cleanLabel} (-${pct}%)`,
        };
      }),
    );
  }

  function addLine(line: CartLine) {
    setCart((prev) => {
      const found = prev.find((l) => l.key === line.key);
      if (found) {
        return prev.map((l) => (l.key === line.key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, line];
    });
  }

  function add(product: Product, isLongPress = false) {
    if (isLongPress) {
      // Tap sostenido: abrir selector de opciones (queso vegano) y extras
      setVariantFor(product);
      return;
    }
    if (product.is_open_price === 1) {
      setKeypadFor(product);
      return;
    }
    if (product.has_variants === 1) {
      // Tap común: agregar directamente con queso común (sin extras)
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
    addLine({
      key: `p${product.id}`,
      product,
      quantity: 1,
      unitPrice: Number(product.price) || 0,
      label: product.name,
    });
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
    setCart((prev) =>
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
    addLine({
      key: `open-${uuid()}`,
      product,
      quantity: 1,
      unitPrice: amount,
      label: product.name,
    });
    setKeypadFor(null);
  }

  function inc(key: string) {
    setCart((p) => p.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l)));
  }
  function dec(key: string) {
    setCart((p) =>
      p.map((l) => (l.key === key ? { ...l, quantity: l.quantity - 1 } : l)).filter((l) => l.quantity > 0),
    );
  }
  function clearCart() {
    setCart([]);
    setGlobalDiscount(0);
  }

  function initEqualSplit(n: number, targetTotal: number) {
    const count = Math.max(2, n);
    const baseShare = Math.floor(targetTotal / count);
    const remainder = Math.round(targetTotal - baseShare * (count - 1));
    setPaymentRows(
      Array.from({ length: count }, (_, idx) => ({
        amount: String(idx === count - 1 ? remainder : baseShare),
        payment_method: idx === 0 ? 'cash' : 'transfer',
        label: `Persona ${idx + 1}`,
      })),
    );
  }

  async function doCheckout(method: string, payments?: PaymentSlice[]) {
    setSaving(true);
    setError(null);
    const input: SaleInput = {
      client_uuid: uuid(),
      items: cart.map((l) => ({
        product_id: l.product.id,
        variant_id: l.variant?.id,
        product_name: l.label,
        unit_price: l.unitPrice,
        quantity: l.quantity,
      })),
      payment_method: method,
      ...(payments && payments.length > 1 ? { payments } : {}),
      discount: globalDiscount > 0 ? globalDiscount : undefined,
      channel: channel === 'delivery' ? 'delivery' : channel === 'here' ? 'salon' : 'takeaway',
    };
    try {
      const outcome = await checkout(input);
      const settings = await getPrinterSettings();
      const payload = saleTicket({
        businessName: config.businessName,
        lines: cart.map((l) => ({ qty: l.quantity, label: l.label, unitPrice: l.unitPrice })),
        total,
        discount: globalDiscount,
        paymentMethod: method,
        channel: input.channel ?? 'takeaway',
        width: settings.width,
        receiptConfig: settings.receiptConfig,
      });
      setLastPrint(payload);
      setPrintMsg(null);
      if (settings.autoTicket && isNative()) {
        void tryPrint(payload).then((err) => setPrintMsg(err));
      }
      setResult({ kind: outcome, withoutCash: !isCashOpen });
      clearCart();
      setPaying(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar la venta');
    } finally {
      setSaving(false);
    }
  }

  if (catalog.isLoading) return <div className="boot">Cargando catálogo…</div>;
  if (catalog.isError && products.length === 0) {
    return <div className="boot">No hay catálogo disponible todavía.</div>;
  }

  return (
    <div className="sale">
      <div className="sale__main">
        <div className="retro-page-heading">
          <CategoryIcon name="pizza" size={38} className="retro-page-heading__icon" />
          <h1>Venta Mostrador</h1>
        </div>
        <div className="channel-bar">
          {CHANNELS.map((c) => (
            <button
              key={c.value}
              className={`channel-btn${channel === c.value ? ' channel-btn--active' : ''}`}
              disabled={c.value === 'here' && !online}
              onClick={() => setChannel(c.value)}
            >
              <span className="channel-btn__icon" aria-hidden="true">
                <img src={c.icon} alt="" />
              </span>
              {c.label}
            </button>
          ))}
        </div>

        <div className="cat-tabs">
          {categories.map((c) => (
            <button
              key={c.id}
              className={`cat-tab${activeTab === String(c.id) ? ' cat-tab--active' : ''}`}
              onClick={() => setActiveTab(String(c.id))}
            >
              <CategoryIcon name={c.name} size={28} className="category-icon" />
              <span className="cat-tab__label">{c.name}</span>
            </button>
          ))}
          {hasUncategorized && (
            <button
              className={`cat-tab${activeTab === 'otros' ? ' cat-tab--active' : ''}`}
              onClick={() => setActiveTab('otros')}
            >
              <CategoryIcon name="Sin categoría" size={28} className="category-icon" />
              <span className="cat-tab__label">Otros</span>
            </button>
          )}
          <button
            type="button"
            className="cat-tab"
            style={{ background: 'var(--c-accent, #e63946)', color: '#fff', fontWeight: 700 }}
            onClick={() => setShowHalfHalf(true)}
          >
            <span className="cat-tab__glyph" aria-hidden="true">½</span>
            <span className="cat-tab__label">Mitad y Mitad</span>
          </button>
          {extraProducts.length > 0 && (
            <button
              type="button"
              className="cat-tab"
              disabled={cart.length === 0}
              style={{
                background: 'rgba(253, 183, 64, 0.16)',
                color: 'var(--ocre, #fdb740)',
                borderColor: 'var(--ocre, #fdb740)',
                fontWeight: 700,
                opacity: cart.length === 0 ? 0.5 : 1,
              }}
              onClick={() => {
                setExtraTargetKey(cart[cart.length - 1]?.key ?? null);
                setShowExtraModal(true);
              }}
              title="Agregar un extra a una pizza del pedido"
            >
              <span className="cat-tab__glyph" aria-hidden="true">+</span>
            <span className="cat-tab__label">Extra a pizza</span>
            </button>
          )}
        </div>
        <div className="sale__products">
          <ProductGrid products={visibleProducts} onAdd={add} categoryName={activeCategoryName} />
        </div>
      </div>

      <Cart
        lines={cart}
        subtotal={subtotal}
        discount={globalDiscount}
        total={total}
        onInc={inc}
        onDec={dec}
        onSetLineDiscount={setLineDiscount}
        onSetGlobalDiscount={setGlobalDiscount}
        onAddExtra={
          extraProducts.length > 0
            ? (lineKey) => {
                setExtraTargetKey(lineKey);
                setShowExtraModal(true);
              }
            : undefined
        }
        onClear={clearCart}
        checkoutLabel="Cobrar"
        onCheckout={() => {
          setPayMode('single');
          setPaying(true);
        }}
        deferLabel="A la cuenta"
        onDefer={online ? () => setToAccount(true) : undefined}
        primaryAction={channel === 'here' ? 'defer' : 'checkout'}
      />

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
            {cart.length > 1 ? (
              <div style={{ marginBottom: 10 }}>
                <label className="muted-text" style={{ display: 'block', marginBottom: 4 }}>
                  Elegí a qué pizza sumarle el extra:
                </label>
                <select
                  className="t-input"
                  value={extraTargetKey ?? cart[cart.length - 1]?.key ?? ''}
                  onChange={(e) => setExtraTargetKey(e.target.value)}
                >
                  {cart.map((l) => (
                    <option key={l.key} value={l.key}>
                      {l.label} ({formatARS(l.unitPrice)})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="muted-text" style={{ marginTop: 0 }}>
                Se sumará a: <strong>{cart[cart.length - 1]?.label ?? ''}</strong>
              </p>
            )}
            <div className="variant-pick-grid">
              {extraProducts.map((ex) => (
                <button
                  key={ex.id}
                  className="variant-pick"
                  onClick={() => {
                    const target = extraTargetKey ?? cart[cart.length - 1]?.key;
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

      {toAccount && (
        <SendToAccountSheet
          lines={cart}
          channel={channel}
          isCashOpen={isCashOpen}
          onDone={(accountName, placeLabel) => {
            setToAccount(false);
            void getPrinterSettings().then((settings) => {
              if (settings.autoComanda) {
                void dispatchComandas({
                  place: placeLabel,
                  account: accountName,
                  lines: cart.map((l) => ({
                    qty: l.quantity,
                    label: l.label,
                    categoryId: l.product.category_id,
                    categoryName: categories.find((c) => c.id === l.product.category_id)?.name,
                  })),
                }).then((res) => {
                  if (res.error) setPrintMsg(res.error);
                });
              }
              clearCart();
              setResult({ kind: 'round', detail: accountName, withoutCash: !isCashOpen });
            });
          }}
          onClose={() => setToAccount(false)}
        />
      )}

      {keypadFor && (
        <PriceKeypad
          product={keypadFor}
          onConfirm={(amount) => confirmOpenPrice(keypadFor, amount)}
          onClose={() => setKeypadFor(null)}
        />
      )}

      {showHalfHalf && (
        <HalfHalfModal
          products={products}
          onAdd={({ product, secondProduct, unitPrice, label }) => {
            addLine({
              key: `half-${product.id}-${secondProduct.id}-${uuid()}`,
              product,
              quantity: 1,
              unitPrice,
              label,
            });
          }}
          onClose={() => setShowHalfHalf(false)}
        />
      )}

      {paying && (
        <div className="overlay" onClick={() => !saving && setPaying(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="sheet__title">¿Cómo paga?</h2>
            <p className="sheet__total">
              Total a cobrar: <strong>{total.toLocaleString('es-AR')}</strong>
            </p>
            {!isCashOpen && (
              <div
                style={{
                  background: 'rgba(253, 183, 64, 0.14)',
                  border: '1px solid var(--ocre)',
                  color: 'var(--ocre)',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  marginBottom: '10px',
                }}
              >
                ⚠️ Atención: La caja está cerrada. Esta venta se registrará igualmente bajo «Ventas sin caja abierta».
              </div>
            )}
            {!online && (
              <p className="sheet__offline">Sin conexión: la venta se guardará y se enviará al volver.</p>
            )}
            {error && <p className="t-error">{error}</p>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              <button
                type="button"
                className="t-btn"
                style={{
                  minHeight: '36px',
                  fontSize: '12px',
                  fontWeight: 700,
                  background: payMode === 'single' ? 'var(--ocre)' : 'var(--surface-2)',
                  color: payMode === 'single' ? '#111' : 'var(--cream)',
                  border: '1px solid var(--line)',
                }}
                onClick={() => setPayMode('single')}
              >
                💳 Pago único
              </button>
              <button
                type="button"
                className="t-btn"
                style={{
                  minHeight: '36px',
                  fontSize: '12px',
                  fontWeight: 700,
                  background: payMode === 'split' ? 'var(--ocre)' : 'var(--surface-2)',
                  color: payMode === 'split' ? '#111' : 'var(--cream)',
                  border: '1px solid var(--line)',
                }}
                onClick={() => {
                  setPayMode('split');
                  if (paymentRows.length === 0) {
                    initEqualSplit(2, total);
                  }
                }}
              >
                👥 Dividir / Varios pagos
              </button>
            </div>

            {payMode === 'single' ? (
              <div className="method-grid">
                {METHODS.map((m) => (
                  <button
                    key={m.value}
                    className="t-btn method-btn"
                    disabled={saving}
                    onClick={() => void doCheckout(m.value)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  {[2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="t-btn"
                      style={{
                        flex: 1,
                        minHeight: '34px',
                        fontSize: '12px',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--line)',
                        color: 'var(--ocre)',
                        fontWeight: 700,
                      }}
                      onClick={() => initEqualSplit(n, total)}
                    >
                      ÷ {n} ({formatARS(Math.round(total / n))})
                    </button>
                  ))}
                  <button
                    type="button"
                    className="t-btn"
                    style={{
                      minHeight: '34px',
                      fontSize: '12px',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--line)',
                      color: 'var(--cream)',
                      padding: '0 10px',
                    }}
                    onClick={() => {
                      const currentSum = paymentRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
                      const rem = Math.max(0, Math.round(total - currentSum));
                      setPaymentRows((prev) => [
                        ...prev,
                        { amount: String(rem), payment_method: 'cash', label: `Persona ${prev.length + 1}` },
                      ]);
                    }}
                  >
                    + Pago
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '28vh', overflowY: 'auto', marginBottom: '10px' }}>
                  {paymentRows.map((row, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '90px 1fr 125px auto',
                        gap: '6px',
                        alignItems: 'center',
                        background: 'var(--surface-2)',
                        padding: '6px 8px',
                        borderRadius: '8px',
                        border: '1px solid var(--line)',
                      }}
                    >
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--cream)' }}>{row.label}</span>
                      <input
                        type="number"
                        min="0"
                        className="t-input"
                        style={{ minHeight: '34px', fontSize: '14px', padding: '4px 8px' }}
                        value={row.amount}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPaymentRows((prev) => {
                            const next = prev.map((r, i) => (i === idx ? { ...r, amount: val } : r));
                            if (next.length === 2 && idx === 0) {
                              const num = parseFloat(val) || 0;
                              next[1] = { ...next[1]!, amount: String(Math.max(0, Math.round(total - num))) };
                            }
                            return next;
                          });
                        }}
                      />
                      <select
                        className="t-input"
                        style={{ minHeight: '34px', fontSize: '12px', padding: '4px 6px' }}
                        value={row.payment_method}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPaymentRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, payment_method: val } : r)),
                          );
                        }}
                      >
                        {METHODS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      {paymentRows.length > 2 && (
                        <button
                          type="button"
                          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '15px' }}
                          onClick={() => setPaymentRows((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {(() => {
                  const sumAssigned = Math.round(paymentRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0));
                  const diff = Math.round(total) - sumAssigned;
                  return (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '13px',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        marginBottom: '10px',
                        background: Math.abs(diff) <= 5 ? 'rgba(46, 204, 113, 0.14)' : 'rgba(253, 183, 64, 0.14)',
                        color: Math.abs(diff) <= 5 ? '#2ecc71' : 'var(--ocre)',
                        fontWeight: 600,
                      }}
                    >
                      <span>Asignado: {formatARS(sumAssigned)}</span>
                      <span>
                        {Math.abs(diff) <= 5
                          ? '✓ Total cubierto'
                          : diff > 0
                            ? `Faltan ${formatARS(diff)}`
                            : `Sobran ${formatARS(Math.abs(diff))}`}
                      </span>
                    </div>
                  );
                })()}

                <button
                  type="button"
                  className="t-btn t-btn--primary t-btn--block"
                  disabled={saving}
                  onClick={() => {
                    const slices: PaymentSlice[] = paymentRows
                      .map((r) => ({
                        amount: parseFloat(r.amount) || 0,
                        payment_method: r.payment_method,
                        label: r.label,
                      }))
                      .filter((r) => r.amount > 0);
                    if (slices.length === 0) {
                      setError('Ingresá al menos un monto mayor a 0');
                      return;
                    }
                    const sumSlices = Math.round(slices.reduce((acc, s) => acc + s.amount, 0));
                    if (Math.abs(sumSlices - Math.round(total)) > 5) {
                      setError(`La suma de los pagos (${formatARS(sumSlices)}) debe coincidir con el total (${formatARS(total)})`);
                      return;
                    }
                    void doCheckout(slices[0]!.payment_method, slices);
                  }}
                >
                  {saving ? 'Registrando…' : `Confirmar cobro dividido (${formatARS(total)})`}
                </button>
              </div>
            )}
            <button className="sheet__cancel" disabled={saving} onClick={() => setPaying(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="overlay">
          <div className="sheet sheet--result">
            <div className={`result-icon${result.kind === 'queued' ? ' result-icon--queued' : ''}`}>
              {result.kind === 'queued' ? '⏳' : '✓'}
            </div>
            <h2 className="sheet__title">
              {result.kind === 'online' && 'Venta registrada'}
              {result.kind === 'queued' && 'Guardada sin conexión'}
              {result.kind === 'round' && 'Comanda enviada'}
            </h2>
            <p className="sheet__msg">
              {result.kind === 'online' && 'La venta se registró correctamente.'}
              {result.kind === 'queued' && 'Se enviará automáticamente cuando vuelva la conexión.'}
              {result.kind === 'round' && `Quedó en la cuenta «${result.detail}». Se cobra al cerrar la cuenta.`}
            </p>
            {result.withoutCash && (
              <p style={{ color: 'var(--ocre)', fontSize: '12px', fontWeight: 600, margin: '4px 0 8px' }}>
                ⚠️ Registrada sin turno de caja abierto.
              </p>
            )}
            {lastPrint && isNative() && (
              <button
                className="t-btn t-btn--block"
                onClick={() => {
                  setPrintMsg('Imprimiendo…');
                  void tryPrint(lastPrint).then((err) => setPrintMsg(err ?? 'Impreso.'));
                }}
              >
                🖨 Imprimir
              </button>
            )}
            {printMsg && <p className="sheet__msg">{printMsg}</p>}
            <button className="t-btn t-btn--primary t-btn--block" onClick={() => setResult(null)}>
              Nueva venta
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
