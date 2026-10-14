import { useState } from 'react';
import { formatARS, type Product } from '@pizzalog/shared';

interface Props {
  products: Product[];
  onAdd: (line: { product: Product; secondProduct: Product; unitPrice: number; label: string }) => void;
  onClose: () => void;
}

export function HalfHalfModal({ products, onAdd, onClose }: Props) {
  // Filtrar productos combinables o pizzas
  const combinable = products.filter((p) => p.is_active === 1 && (p.is_combinable === 1 || p.price > 0));

  const [p1Id, setP1Id] = useState<number | null>(combinable[0]?.id ?? null);
  const [p2Id, setP2Id] = useState<number | null>(combinable[1]?.id ?? combinable[0]?.id ?? null);

  const p1 = combinable.find((p) => p.id === p1Id);
  const p2 = combinable.find((p) => p.id === p2Id);

  const finalPrice = p1 && p2 ? Math.max(p1.price, p2.price) : 0;

  const handleConfirm = () => {
    if (!p1 || !p2) return;
    onAdd({
      product: p1,
      secondProduct: p2,
      unitPrice: finalPrice,
      label: `Pizza 1/2 ${p1.name} + 1/2 ${p2.name}`,
    });
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '520px', margin: 'auto', background: '#fff', borderRadius: '12px', padding: '1.25rem' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem' }}>🍕 Pizza Mitad y Mitad</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>
            ✕
          </button>
        </div>

        <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#666' }}>
          Seleccioná los 2 sabores. El sistema calcula automáticamente el precio de la variedad más cara.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
          {/* Mitad 1 */}
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.4rem' }}>
              1° Mitad:
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '220px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '6px', padding: '0.4rem' }}>
              {combinable.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setP1Id(p.id)}
                  style={{
                    textAlign: 'left',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '4px',
                    border: 'none',
                    background: p1Id === p.id ? 'var(--c-accent, #e63946)' : 'transparent',
                    color: p1Id === p.id ? '#fff' : 'inherit',
                    fontWeight: p1Id === p.id ? 700 : 400,
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{p.name}</span>
                  <small>{formatARS(p.price)}</small>
                </button>
              ))}
            </div>
          </div>

          {/* Mitad 2 */}
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.4rem' }}>
              2° Mitad:
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '220px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '6px', padding: '0.4rem' }}>
              {combinable.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setP2Id(p.id)}
                  style={{
                    textAlign: 'left',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '4px',
                    border: 'none',
                    background: p2Id === p.id ? 'var(--c-accent, #e63946)' : 'transparent',
                    color: p2Id === p.id ? '#fff' : 'inherit',
                    fontWeight: p2Id === p.id ? 700 : 400,
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{p.name}</span>
                  <small>{formatARS(p.price)}</small>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Resumen y precio */}
        <div style={{ background: '#f8f9fa', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #eee', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#666' }}>Combinación elegida:</div>
            <strong style={{ fontSize: '0.95rem' }}>
              1/2 {p1?.name ?? '—'} + 1/2 {p2?.name ?? '—'}
            </strong>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.8rem', color: '#666' }}>Precio final:</div>
            <strong style={{ fontSize: '1.25rem', color: 'var(--c-accent, #e63946)' }}>
              {formatARS(finalPrice)}
            </strong>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn"
            style={{ padding: '0.5rem 1rem', background: '#eee', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="btn btn--primary"
            disabled={!p1 || !p2}
            style={{
              padding: '0.5rem 1.25rem',
              background: 'var(--c-accent, #e63946)',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Agregar al Carrito ({formatARS(finalPrice)})
          </button>
        </div>
      </div>
    </div>
  );
}
