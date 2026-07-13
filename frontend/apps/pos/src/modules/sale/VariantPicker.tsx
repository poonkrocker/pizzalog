import { formatARS, type Product, type ProductVariant } from '@pizzalog/shared';

interface Props {
  product: Product;
  onPick: (variant: ProductVariant) => void;
  onClose: () => void;
}

export function VariantPicker({ product, onPick, onClose }: Props) {
  const variants = (product.variants ?? []).filter((v) => v.is_active === 1);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet sheet--tall" onClick={(e) => e.stopPropagation()}>
        <h2 className="sheet__title">{product.name}</h2>
        <p className="muted-text" style={{ marginTop: 0 }}>
          Elegí una opción
        </p>
        <div className="variant-pick-grid">
          {variants.map((v) => (
            <button key={v.id} className="variant-pick" onClick={() => onPick(v)}>
              <span className="variant-pick__label">{v.label}</span>
              <span className="variant-pick__price">{formatARS(v.price)}</span>
            </button>
          ))}
        </div>
        {variants.length === 0 && (
          <p className="muted-text">Este producto no tiene variantes activas.</p>
        )}
        <button className="sheet__cancel" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
