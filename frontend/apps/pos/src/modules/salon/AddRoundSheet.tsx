import { useEffect, useMemo, useState } from 'react';
import { uuid, type Product, type ProductVariant } from '@pizzalog/shared';
import { useCatalog, type CartLine } from '@/modules/sale/hooks';
import { ProductGrid } from '@/modules/sale/ProductGrid';
import { VariantPicker } from '@/modules/sale/VariantPicker';
import { PriceKeypad } from '@/modules/sale/PriceKeypad';
import { useAddRound } from './hooks';
import { comandaTicket } from '@/print/tickets';
import { getPrinterSettings, isNative, tryPrint } from '@/print/printer';

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

  const products = catalog.data?.products ?? [];
  const categories = catalog.data?.categories ?? [];
  const hasUncat = products.some((p) => p.category_id === null);

  const [tab, setTab] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [variantFor, setVariantFor] = useState<Product | null>(null);
  const [keypadFor, setKeypadFor] = useState<Product | null>(null);
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
    addLine({ key: `p${product.id}`, product, quantity: 1, unitPrice: product.price, label: product.name });
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
          ...(l.variant ? { variant_id: l.variant.id } : {}),
          ...(!l.variant && l.product.is_open_price === 1 ? { unit_price: l.unitPrice } : {}),
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
                <span>{l.label}</span>
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
          onPick={(v) => pickVariant(variantFor, v)}
          onClose={() => setVariantFor(null)}
        />
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
