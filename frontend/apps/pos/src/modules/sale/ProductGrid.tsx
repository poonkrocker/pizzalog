import { useRef } from 'react';
import { formatARS, type Product } from '@pizzalog/shared';

interface Props {
  products: Product[];
  onAdd: (product: Product, isLongPress?: boolean) => void;
}

function ProductGridItem({
  product,
  onAdd,
}: {
  product: Product;
  onAdd: (product: Product, isLongPress?: boolean) => void;
}) {
  const timerRef = useRef<any>(null);
  const isLongPressRef = useRef(false);

  function startHold() {
    isLongPressRef.current = false;
    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      try {
        if ('vibrate' in navigator) navigator.vibrate(40);
      } catch {}
      onAdd(product, true);
    }, 450);
  }

  function clearHold() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  return (
    <button
      type="button"
      className="product-btn"
      onTouchStart={startHold}
      onTouchEnd={(e) => {
        clearHold();
        if (isLongPressRef.current) {
          e.preventDefault();
        }
      }}
      onTouchCancel={clearHold}
      onMouseDown={startHold}
      onMouseUp={clearHold}
      onMouseLeave={clearHold}
      onClick={(e) => {
        if (isLongPressRef.current) {
          isLongPressRef.current = false;
          e.preventDefault();
          return;
        }
        onAdd(product, false);
      }}
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <span className="product-btn__name">{product.name}</span>
      <span className="product-btn__price">{formatARS(product.price)}</span>
      {product.has_variants === 1 && (
        <span
          style={{
            fontSize: '11px',
            color: 'var(--muted)',
            display: 'block',
            marginTop: '2px',
            opacity: 0.8,
          }}
        >
          Mantener p/ opciones
        </span>
      )}
    </button>
  );
}

export function ProductGrid({ products, onAdd }: Props) {
  if (products.length === 0) {
    return <p className="grid-empty">No hay productos en esta categoría.</p>;
  }
  return (
    <div className="product-grid">
      {products.map((p) => (
        <ProductGridItem key={p.id} product={p} onAdd={onAdd} />
      ))}
    </div>
  );
}
