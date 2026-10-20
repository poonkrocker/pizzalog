import { useState } from 'react';
import { formatARS, type Product, type ProductVariant } from '@pizzalog/shared';

interface Props {
  product: Product;
  extras?: Product[];
  onPick: (variant: ProductVariant | undefined, selectedExtras: Product[]) => void;
  onClose: () => void;
}

export function VariantPicker({ product, extras = [], onPick, onClose }: Props) {
  const variants = (product.variants ?? []).filter((v) => v.is_active === 1);
  const [selectedExtraIds, setSelectedExtraIds] = useState<number[]>([]);

  const selectedExtras = extras.filter((e) => selectedExtraIds.includes(e.id));
  const extrasSum = selectedExtras.reduce((s, e) => s + e.price, 0);

  function toggleExtra(id: number) {
    setSelectedExtraIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet sheet--tall" onClick={(e) => e.stopPropagation()}>
        <h2 className="sheet__title">{product.name}</h2>

        {extras.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <p className="muted-text" style={{ marginTop: 0, marginBottom: 8, fontWeight: 600 }}>
              🧀 Extras para agregar a la pizza (opcional):
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {extras.map((ex) => {
                const active = selectedExtraIds.includes(ex.id);
                return (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => toggleExtra(ex.id)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: active ? '2px solid var(--ocre, #fdb740)' : '1px solid var(--line, #333)',
                      background: active ? 'rgba(253, 183, 64, 0.18)' : 'var(--surface, #1e1e1e)',
                      color: active ? 'var(--ocre, #fdb740)' : 'var(--ink, #fff)',
                      fontWeight: active ? 700 : 500,
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    {active ? '✓ ' : '+ '}
                    {ex.name} ({formatARS(ex.price)})
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {variants.length > 0 ? (
          <>
            <p className="muted-text" style={{ marginTop: 0 }}>
              Elegí una opción{extrasSum > 0 ? ` (+${formatARS(extrasSum)} en extras)` : ''}:
            </p>
            <div className="variant-pick-grid">
              {variants.map((v) => (
                <button
                  key={v.id}
                  className="variant-pick"
                  onClick={() => onPick(v, selectedExtras)}
                >
                  <span className="variant-pick__label">{v.label}</span>
                  <span className="variant-pick__price">{formatARS(v.price + extrasSum)}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <button
            type="button"
            className="t-btn t-btn--primary t-btn--block"
            style={{ marginBottom: 10 }}
            onClick={() => onPick(undefined, selectedExtras)}
          >
            {selectedExtras.length > 0
              ? `Agregar con ${selectedExtras.length} extra(s) · ${formatARS(product.price + extrasSum)}`
              : `Agregar sin extras · ${formatARS(product.price)}`}
          </button>
        )}

        <button className="sheet__cancel" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
