import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, formatARS, type Category, type Product } from '@pizzalog/shared';
import { Button, Field, Modal, Select } from '@/ui';
import { useApi } from '@/lib/auth';

interface Props {
  products: Product[];
  categories: Category[];
  onClose: () => void;
}

/**
 * Reordenar la carta dentro de una categoría (drag & drop nativo).
 *
 * Se usa la API de drag del navegador en vez de sumar @dnd-kit: el panel ya
 * arrastra con Konva pero eso es canvas, no sirve para listas, y una lista
 * ordenable no justifica una dependencia nueva.
 *
 * Al soltar se manda la categoría COMPLETA a PUT /products/reorder (todo o
 * nada). Update optimista con rollback al orden anterior si el server rechaza.
 */
export function ReorderModal({ products, categories, onClose }: Props) {
  const api = useApi();
  const qc = useQueryClient();

  const withCategory = useMemo(
    () => categories.filter((c) => products.some((p) => p.category_id === c.id && p.is_active === 1)),
    [categories, products],
  );

  const [catId, setCatId] = useState<string>(
    withCategory.length > 0 ? String(withCategory[0]!.id) : '',
  );
  const [order, setOrder] = useState<Product[] | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const listFromServer = useMemo(
    () =>
      products
        .filter((p) => p.is_active === 1 && String(p.category_id ?? '') === catId)
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
    [products, catId],
  );

  const list = order ?? listFromServer;

  const save = useMutation({
    mutationFn: (ids: number[]) => api.products.reorder(catId === '' ? null : Number(catId), ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });

  async function persist(next: Product[], previous: Product[]) {
    setError(null);
    setOrder(next); // optimista
    try {
      await save.mutateAsync(next.map((p) => p.id));
    } catch (err) {
      setOrder(previous); // rollback
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el orden');
    }
  }

  function onDrop(toIndex: number) {
    if (dragIndex === null || dragIndex === toIndex) return;
    const previous = list;
    const next = [...list];
    const [moved] = next.splice(dragIndex, 1);
    if (!moved) return;
    next.splice(toIndex, 0, moved);
    setDragIndex(null);
    void persist(next, previous);
  }

  return (
    <Modal open title="Ordenar la carta" onClose={onClose}>
      <p className="field__hint">
        Arrastrá para cambiar el orden dentro de una categoría. Así se ve en
        pizzalog.net. Para mover un producto de categoría, editalo.
      </p>

      <Field label="Categoría">
        <Select
          value={catId}
          onChange={(e) => {
            setCatId(e.target.value);
            setOrder(null);
            setError(null);
          }}
        >
          {withCategory.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <ul className="reorder">
        {list.map((p, i) => (
          <li
            key={p.id}
            className={`reorder__row${dragIndex === i ? ' reorder__row--dragging' : ''}`}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(i)}
            onDragEnd={() => setDragIndex(null)}
          >
            <span className="reorder__grip" aria-hidden="true">
              ⠿
            </span>
            <span className="reorder__pos">{i + 1}</span>
            <span className="reorder__thumb">
              {p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : '🍕'}
            </span>
            <span className="reorder__name">{p.name}</span>
            <span className="reorder__price">{formatARS(p.price)}</span>
          </li>
        ))}
        {list.length === 0 && <li className="field__hint">No hay productos en esta categoría.</li>}
      </ul>

      {error && (
        <p className="login__error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <Button type="button" onClick={onClose}>
          {save.isPending ? 'Guardando…' : 'Listo'}
        </Button>
      </div>
    </Modal>
  );
}
