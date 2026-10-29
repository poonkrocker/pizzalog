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
  const isMovedRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const touchStartTimeRef = useRef<number>(0);
  const isTouchRef = useRef(false);

  const onScrollCancelRef = useRef<(() => void) | null>(null);

  function clearHold() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (onScrollCancelRef.current) {
      window.removeEventListener('scroll', onScrollCancelRef.current, true);
      onScrollCancelRef.current = null;
    }
  }

  function startHold(clientX: number, clientY: number) {
    isLongPressRef.current = false;
    isMovedRef.current = false;
    startPosRef.current = { x: clientX, y: clientY };
    touchStartTimeRef.current = Date.now();

    clearHold();

    // Si la pantalla se scrollea durante el toque, cancelar inmediatamente cualquier tap o hold
    const onScroll = () => {
      isMovedRef.current = true;
      clearHold();
    };
    onScrollCancelRef.current = onScroll;
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });

    timerRef.current = setTimeout(() => {
      if (!isMovedRef.current) {
        isLongPressRef.current = true;
        try {
          if ('vibrate' in navigator) navigator.vibrate(40);
        } catch {}
        onAdd(product, true);
      }
    }, 500);
  }

  function handleTouchStart(e: React.TouchEvent) {
    isTouchRef.current = true;
    const t = e.touches[0];
    if (t) startHold(t.clientX, t.clientY);
  }

  function handleTouchMove(e: React.TouchEvent) {
    const t = e.touches[0];
    if (t && startPosRef.current) {
      const dx = Math.abs(t.clientX - startPosRef.current.x);
      const dy = Math.abs(t.clientY - startPosRef.current.y);
      // Si el desplazamiento supera los 8px, es scroll y se cancela cualquier tap/hold
      if (dx > 8 || dy > 8) {
        isMovedRef.current = true;
        clearHold();
      }
    }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    clearHold();
    if (isLongPressRef.current || isMovedRef.current) {
      e.preventDefault();
    }
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (isTouchRef.current) return;
    startHold(e.clientX, e.clientY);
  }

  function handleMouseUp() {
    if (isTouchRef.current) return;
    clearHold();
  }

  function handleClick(e: React.MouseEvent) {
    if (isLongPressRef.current || isMovedRef.current) {
      isLongPressRef.current = false;
      isMovedRef.current = false;
      e.preventDefault();
      return;
    }

    // Filtrar micro-toques accidentales durante el scroll
    const elapsed = Date.now() - touchStartTimeRef.current;
    if (isTouchRef.current && elapsed < 40) {
      return;
    }

    onAdd(product, false);
  }

  const hasBasePrice = Boolean(product.price && Number(product.price) > 0);
  const activeVariants = (product.variants ?? []).filter((v) => v.is_active === 1);
  const minVariantPrice = activeVariants.length > 0
    ? Math.min(...activeVariants.map((v) => Number(v.price) || 0).filter((p) => p > 0))
    : 0;

  return (
    <button
      type="button"
      className="product-btn"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={clearHold}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={clearHold}
      onClick={handleClick}
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <span className="product-btn__illustration" aria-hidden="true">
        {categoryName && /pizza/i.test(categoryName) ? (
          <img src="/category-icons/porcion-pizza.svg" alt="" />
        ) : (
          <CategoryIcon name={categoryName} size={36} />
        )}
      </span>
      <span className="product-btn__details">
        <span className="product-btn__name">{product.name}</span>
        <span className="product-btn__price">
          {hasBasePrice
            ? formatARS(product.price)
            : minVariantPrice > 0
            ? `Desde ${formatARS(minVariantPrice)}`
            : formatARS(product.price)}
        </span>
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
            {hasBasePrice ? 'Mantener p/ opciones' : 'Elegir opción'}
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
