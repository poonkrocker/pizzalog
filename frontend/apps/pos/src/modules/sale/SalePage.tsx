import { useEffect, useMemo, useState } from 'react';
import { ApiError, uuid, type Product, type ProductVariant, type SaleInput } from '@pizzalog/shared';
import { useOnline } from '@/lib/network';
import { Cart } from './Cart';
import { ProductGrid } from './ProductGrid';
import { VariantPicker } from './VariantPicker';
import { PriceKeypad } from './PriceKeypad';
import { SendToAccountSheet } from './SendToAccountSheet';
import { config } from '@/lib/config';
import { saleTicket, comandaTicket } from '@/print/tickets';
import { getPrinterSettings, isNative, tryPrint } from '@/print/printer';
import { useCatalog, useCheckout, type CartLine } from './hooks';

type OrderChannel = 'here' | 'takeaway' | 'delivery';

const CHANNELS: { value: OrderChannel; icon: string; label: string }[] = [
  { value: 'here', icon: '🍽️', label: 'Acá' },
  { value: 'takeaway', icon: '🛍️', label: 'Llevar' },
  { value: 'delivery', icon: '🛵', label: 'Delivery' },
];

const METHODS: { value: string; label: string }[] = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'otro', label: 'Otro' },
];

export function SalePage() {
  const catalog = useCatalog();
  const checkout = useCheckout();
  const online = useOnline();

  const products = catalog.data?.products ?? [];
  const categories = catalog.data?.categories ?? [];
  const hasUncategorized = products.some((p) => p.category_id === null);

  const [activeTab, setActiveTab] = useState('');
  const [channel, setChannel] = useState<OrderChannel>('takeaway');
  const [toAccount, setToAccount] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [variantFor, setVariantFor] = useState<Product | null>(null);
  const [keypadFor, setKeypadFor] = useState<Product | null>(null);
  const [paying, setPaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ kind: 'online' | 'queued' | 'round'; detail?: string } | null>(null);
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

  const visibleProducts = useMemo(() => {
    if (activeTab === 'otros') return products.filter((p) => p.category_id === null);
    if (activeTab === '') return [];
    return products.filter((p) => p.category_id === Number(activeTab));
  }, [products, activeTab]);

  const total = useMemo(
    () => cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
    [cart],
  );

  function addLine(line: CartLine) {
    setCart((prev) => {
      const found = prev.find((l) => l.key === line.key);
      if (found) {
        return prev.map((l) => (l.key === line.key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, line];
    });
  }

  // Al tocar un producto: ramas según variantes / precio abierto / normal.
  function add(product: Product) {
    if (product.has_variants === 1) {
      setVariantFor(product);
      return;
    }
    if (product.is_open_price === 1) {
      setKeypadFor(product);
      return;
    }
    addLine({
      key: `p${product.id}`,
      product,
      quantity: 1,
      unitPrice: product.price,
      label: product.name,
    });
  }

  function pickVariant(product: Product, variant: ProductVariant) {
    addLine({
      key: `p${product.id}-v${variant.id}`,
      product,
      variant,
      quantity: 1,
      unitPrice: variant.price,
      label: `${product.name} — ${variant.label}`,
    });
    setVariantFor(null);
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
  }

  async function doCheckout(method: string) {
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
      channel: channel === 'delivery' ? 'delivery' : 'takeaway',
    };
    try {
      const outcome = await checkout(input);
      const settings = await getPrinterSettings();
      const payload = saleTicket({
        businessName: config.businessName,
        lines: cart.map((l) => ({ qty: l.quantity, label: l.label, unitPrice: l.unitPrice })),
        total,
        paymentMethod: method,
        channel: input.channel ?? 'takeaway',
        width: settings.width,
      });
      setLastPrint(payload);
      setPrintMsg(null);
      if (settings.autoTicket && isNative()) {
        void tryPrint(payload).then((err) => setPrintMsg(err));
      }
      setResult({ kind: outcome });
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
      <div className="channel-bar">
        {CHANNELS.map((c) => (
          <button
            key={c.value}
            className={`channel-btn${channel === c.value ? ' channel-btn--active' : ''}`}
            disabled={c.value === 'here' && !online}
            onClick={() => setChannel(c.value)}
          >
            <span className="channel-btn__icon" aria-hidden="true">
              {c.icon}
            </span>
            {c.label}
          </button>
        ))}
      </div>

      <div className="sale__main">
        <div className="cat-tabs">
          {categories.map((c) => (
            <button
              key={c.id}
              className={`cat-tab${activeTab === String(c.id) ? ' cat-tab--active' : ''}`}
              onClick={() => setActiveTab(String(c.id))}
            >
              {c.name}
            </button>
          ))}
          {hasUncategorized && (
            <button
              className={`cat-tab${activeTab === 'otros' ? ' cat-tab--active' : ''}`}
              onClick={() => setActiveTab('otros')}
            >
              Otros
            </button>
          )}
        </div>
        <ProductGrid products={visibleProducts} onAdd={add} />
      </div>

      <Cart
        lines={cart}
        total={total}
        onInc={inc}
        onDec={dec}
        onClear={clearCart}
        checkoutLabel={channel === 'here' ? 'A la cuenta' : 'Cobrar'}
        onCheckout={() => (channel === 'here' ? setToAccount(true) : setPaying(true))}
      />

      {variantFor && (
        <VariantPicker
          product={variantFor}
          onPick={(v) => pickVariant(variantFor, v)}
          onClose={() => setVariantFor(null)}
        />
      )}

      {toAccount && (
        <SendToAccountSheet
          lines={cart}
          onDone={(accountName, placeLabel) => {
            setToAccount(false);
            void getPrinterSettings().then((settings) => {
              const payload = comandaTicket({
                place: placeLabel,
                account: accountName,
                lines: cart.map((l) => ({ qty: l.quantity, label: l.label })),
                width: settings.width,
              });
              setLastPrint(payload);
              setPrintMsg(null);
              if (settings.autoComanda && isNative()) {
                void tryPrint(payload).then((err) => setPrintMsg(err));
              }
              clearCart();
              setResult({ kind: 'round', detail: accountName });
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

      {paying && (
        <div className="overlay" onClick={() => !saving && setPaying(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="sheet__title">¿Cómo paga?</h2>
            <p className="sheet__total">
              Total a cobrar: <strong>{total.toLocaleString('es-AR')}</strong>
            </p>
            {!online && (
              <p className="sheet__offline">Sin conexión: la venta se guardará y se enviará al volver.</p>
            )}
            {error && <p className="t-error">{error}</p>}
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
