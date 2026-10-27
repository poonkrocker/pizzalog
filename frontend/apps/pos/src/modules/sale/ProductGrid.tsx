import { useRef } from 'react';
import { formatARS, type Product } from '@pizzalog/shared';
import { CategoryIcon } from '@/assets/icons/CategoryIcon';

interface Props {
  products: Product[];
  onAdd: (product: Product, isLongPress?: boolean) => void;
  categoryName?: string;
}

function ProductGridItem({
  product,
  onAdd,
  categoryName,
}: {
  product: Product;
  onAdd: (product: Product, isLongPress?: boolean) => void;
  categoryName?: string;
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
      <span className="product-btn__illustration" aria-hidden="true">
        {categoryName && /pizza/i.test(categoryName) ? (
          <img src="/category-icons/product-pizza.svg" alt="" />
        ) : (
          <CategoryIcon name={categoryName} size={36} />
        )}
      </span>
      <span className="product-btn__details">
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
      </span>
    </button>
  );
}

export function ProductGrid({ products, onAdd, categoryName }: Props) {
  if (products.length === 0) {
    return <p className="grid-empty">No hay productos en esta categoría.</p>;
  }
  return (
    <div className="product-grid">
      {products.map((p) => (
        <ProductGridItem key={p.id} product={p} onAdd={onAdd} categoryName={categoryName} />
      ))}
    </div>
  );
}
