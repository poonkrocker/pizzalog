import { formatARS, type Product } from '@pizzalog/shared';

interface Props {
  products: Product[];
  onAdd: (product: Product) => void;
}

export function ProductGrid({ products, onAdd }: Props) {
  if (products.length === 0) {
    return <p className="grid-empty">No hay productos en esta categoría.</p>;
  }
  return (
    <div className="product-grid">
      {products.map((p) => (
        <button key={p.id} className="product-btn" onClick={() => onAdd(p)}>
          <span className="product-btn__name">{p.name}</span>
          <span className="product-btn__price">{formatARS(p.price)}</span>
        </button>
      ))}
    </div>
  );
}
