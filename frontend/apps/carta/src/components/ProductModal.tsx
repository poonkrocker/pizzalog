import { useMemo, useState } from 'react';
import type { ComboSelection, Product } from '../types';
import { money } from '../lib/api';
import { lineKey, type CartLine } from '../lib/cart';

interface Props {
  product: Product;
  combinableProducts?: Product[];
  /** En modo salón no se pide: el modal es solo de lectura. */
  canOrder: boolean;
  onAdd: (line: Omit<CartLine, 'quantity'>, qty: number) => void;
  onClose: () => void;
}

function Placeholder({ name }: { name: string }) {
  return (
    <div className="ph" aria-hidden="true">
      <span className="ph__glyph">🍕</span>
      <span className="ph__name">{name}</span>
    </div>
  );
}

/**
 * Ficha del producto. Cuatro formas según qué sea:
 *  - simple  → precio y listo
 *  - variantes → elegís una (obligatorio; el back rechaza si no mandás variant_id)
 *  - mitad y mitad → elegís 2° sabor entre pizzas combinables (cobra la más cara)
 *  - combo   → stepper: un paso por grupo, "elegí 3 pizzas" con contador
 *
 * El precio del combo es el del combo, no la suma de lo elegido: por eso los
 * ítems del combo se muestran sin precio, para que nadie sume de más.
 */
export function ProductModal({ product, combinableProducts, canOrder, onAdd, onClose }: Props) {
  const variants = useMemo(
    () => (product.variants ?? []).filter((v) => v.is_active === 1),
    [product],
  );
  const groups = product.combo?.groups ?? [];

  const [variantId, setVariantId] = useState<number | undefined>(
    variants.length === 1 ? variants[0]!.id : undefined,
  );
  const [picks, setPicks] = useState<Record<number, number[]>>({});
  const [qty, setQty] = useState(1);
  const [isHalfHalf, setIsHalfHalf] = useState(false);
  const [secondHalfId, setSecondHalfId] = useState<number | undefined>(undefined);

  const availableHalves = useMemo(() => {
    return (combinableProducts ?? []).filter((p) => p.id !== product.id && p.is_available_now);
  }, [combinableProducts, product.id]);

  const secondHalf = useMemo(() => {
    return availableHalves.find((p) => p.id === secondHalfId);
  }, [availableHalves, secondHalfId]);

  const unitPrice = useMemo(() => {
    let base = product.price;
    if (variantId !== undefined) {
      base = variants.find((v) => v.id === variantId)?.price ?? product.price;
    }
    if (isHalfHalf && secondHalf) {
      return Math.max(base, secondHalf.price);
    }
    return base;
  }, [variantId, variants, product.price, isHalfHalf, secondHalf]);

  function togglePick(group: { id: number; select_count: number }, productId: number) {
    setPicks((prev) => {
      const current = prev[group.id] ?? [];
      if (current.includes(productId)) {
        return { ...prev, [group.id]: current.filter((x) => x !== productId) };
      }
      // Al llegar al tope, el próximo tap reemplaza al más viejo en vez de no
      // hacer nada: si no, el botón parece roto.
      const next =
        current.length >= group.select_count
          ? [...current.slice(1), productId]
          : [...current, productId];
      return { ...prev, [group.id]: next };
    });
  }

  const missing = groups.filter((g) => (picks[g.id] ?? []).length !== g.select_count);
  const needsVariant = variants.length > 0 && variantId === undefined;
  const needsSecondHalf = isHalfHalf && !secondHalfId;
  const blocked = !product.is_available_now || needsVariant || missing.length > 0 || needsSecondHalf;

  function add() {
    if (blocked) return;

    const selections: ComboSelection[] | undefined =
      groups.length > 0
        ? groups.map((g) => ({ group_id: g.id, product_ids: picks[g.id] ?? [] }))
        : undefined;

    const labels =
      groups.length > 0
        ? groups.flatMap((g) =>
            (picks[g.id] ?? []).map(
              (pid) => g.items.find((i) => i.product_id === pid)?.name ?? '',
            ),
          )
        : undefined;

    const variantLabel = variants.find((v) => v.id === variantId)?.label;
    const effectiveName =
      isHalfHalf && secondHalf
        ? `Pizza 1/2 ${product.name} + 1/2 ${secondHalf.name}`
        : variantLabel
        ? `${product.name} · ${variantLabel}`
        : product.name;

    onAdd(
      {
        key: lineKey(product, variantId, selections, isHalfHalf ? secondHalf?.id : undefined),
        product_id: product.id,
        half_product_id: isHalfHalf ? secondHalf?.id : undefined,
        name: effectiveName,
        unit_price: unitPrice,
        image_url: product.image_url,
        ...(variantId !== undefined ? { variant_id: variantId } : {}),
        ...(selections ? { combo_selections: selections } : {}),
        ...(labels ? { combo_labels: labels.filter(Boolean) } : {}),
      },
      qty,
    );
    onClose();
  }

  return (
    <div className="veil" onClick={onClose} role="dialog" aria-modal="true">
      <article className="entry" onClick={(e) => e.stopPropagation()}>
        <header className="entry__bar">
          <span className="entry__bar-title">{product.name}</span>
          <button className="entry__close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div className="entry__photo">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} />
          ) : (
            <Placeholder name={product.name} />
          )}
        </div>

        <div className="entry__body">
          {!product.is_available_now && (
            <p className="entry__unavailable">
              Ahora no está disponible — se pide en otro horario.
            </p>
          )}

          {variants.length === 0 && <p className="entry__price">{money(product.price)}</p>}
          {product.description && <p className="entry__desc">{product.description}</p>}

          {product.is_vegan_opt === 1 && <span className="tag tag--vegan">🌱 opción vegana</span>}

          {/* --- Variantes: elegís una --- */}
          {variants.length > 0 && (
            <section className="comments">
              <h3 className="comments__title">elegí una opción</h3>
              {variants.map((v) => (
                <label
                  key={v.id}
                  className={`pick${variantId === v.id ? ' pick--on' : ''}`}
                >
                  <input
                    type="radio"
                    name="variant"
                    checked={variantId === v.id}
                    onChange={() => setVariantId(v.id)}
                  />
                  <span className="pick__label">{v.label}</span>
                  <span className="pick__price">{money(v.price)}</span>
                </label>
              ))}
            </section>
          )}

          {/* --- Combo: un paso por grupo --- */}
          {groups.map((g) => {
            const chosen = picks[g.id] ?? [];
            const done = chosen.length === g.select_count;
            return (
              <section key={g.id} className="comments">
                <h3 className="comments__title">
                  {g.name.toLowerCase()}{' '}
                  <span className={done ? 'counter counter--done' : 'counter'}>
                    {chosen.length}/{g.select_count}
                  </span>
                </h3>
                {g.items.map((i) => (
                  <label
                    key={i.product_id}
                    className={`pick${chosen.includes(i.product_id) ? ' pick--on' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={chosen.includes(i.product_id)}
                      onChange={() => togglePick(g, i.product_id)}
                    />
                    <span className="pick__label">{i.name}</span>
                  </label>
                ))}
          {/* --- Mitad y Mitad: si hay sabores combinables disponibles --- */}
          {availableHalves.length > 0 && groups.length === 0 && (
            <section className="comments" style={{ marginTop: '1rem', borderTop: '1px dashed var(--c-border, #ddd)', paddingTop: '0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={isHalfHalf}
                  onChange={(e) => {
                    setIsHalfHalf(e.target.checked);
                    if (!e.target.checked) setSecondHalfId(undefined);
                  }}
                />
                <span>🍕 ¿Hacerla Mitad y Mitad?</span>
              </label>

              {isHalfHalf && (
                <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.8rem', background: 'var(--c-surface, #f9f9f9)', borderRadius: '6px' }}>
                  <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: '#666' }}>
                    Elegí el 2° sabor (se cobra el precio de la mitad más cara):
                  </p>
                  <select
                    value={secondHalfId ?? ''}
                    onChange={(e) => setSecondHalfId(e.target.value ? Number(e.target.value) : undefined)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.85rem' }}
                  >
                    <option value="">-- Seleccioná el segundo sabor --</option>
                    {availableHalves.map((h) => (
                      <option key={h.id} value={h.id}>
                        1/2 {h.name} ({money(h.price)})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </section>
          )}

          {canOrder && product.is_available_now && (
            <div className="addbar">
              <div className="stepper" role="group" aria-label="Cantidad">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Menos">
                  −
                </button>
                <span className="stepper__n">{qty}</span>
                <button onClick={() => setQty((q) => q + 1)} aria-label="Más">
                  +
                </button>
              </div>

              <button className="addbar__btn" onClick={add} disabled={blocked}>
                {needsVariant
                  ? 'elegí una opción'
                  : missing.length > 0
                    ? `elegí ${missing[0]!.select_count - (picks[missing[0]!.id] ?? []).length} en «${missing[0]!.name.toLowerCase()}»`
                    : `agregar · ${money(unitPrice * qty)}`}
              </button>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
