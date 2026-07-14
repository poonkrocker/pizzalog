import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, formatARS, type ComboGroupInput, type Product } from '@pizzalog/shared';
import { Button, Field, Input, Loading, Modal } from '@/ui';
import { useApi } from '@/lib/auth';
import { useProducts } from './hooks';

interface Props {
  product: Product;
  onClose: () => void;
}

interface DraftGroup {
  name: string;
  select_count: number;
  item_product_ids: number[];
}

/**
 * Builder de combos: "Elegí 3 pizzas" + "Elegí 1 bebida".
 * Los ítems apuntan a productos REALES del negocio (no texto libre), así el
 * pedido guarda cada sabor elegido y los reportes ven la popularidad real.
 */
export function ComboModal({ product, onClose }: Props) {
  const api = useApi();
  const qc = useQueryClient();
  const products = useProducts();

  const combo = useQuery({
    queryKey: ['combo', product.id],
    queryFn: () => api.combos.get(product.id),
  });

  const save = useMutation({
    mutationFn: (groups: ComboGroupInput[]) => api.combos.update(product.id, groups),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['combo', product.id] });
      onClose();
    },
  });

  const [groups, setGroups] = useState<DraftGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (combo.data && !loaded) {
      setGroups(
        combo.data.groups.map((g) => ({
          name: g.name,
          select_count: g.select_count,
          item_product_ids: g.items.map((i) => i.product_id),
        })),
      );
      setLoaded(true);
    }
  }, [combo.data, loaded]);

  // Elegibles: cualquier producto activo del negocio que no sea este combo.
  const eligible = useMemo(
    () => (products.data ?? []).filter((p) => p.is_active === 1 && p.id !== product.id),
    [products.data, product.id],
  );

  const patch = (i: number, changes: Partial<DraftGroup>) =>
    setGroups((gs) => gs.map((g, idx) => (idx === i ? { ...g, ...changes } : g)));

  const toggleItem = (i: number, pid: number) =>
    setGroups((gs) =>
      gs.map((g, idx) =>
        idx === i
          ? {
              ...g,
              item_product_ids: g.item_product_ids.includes(pid)
                ? g.item_product_ids.filter((x) => x !== pid)
                : [...g.item_product_ids, pid],
            }
          : g,
      ),
    );

  async function onSave() {
    setError(null);
    for (const g of groups) {
      if (!g.name.trim()) return setError('Cada grupo necesita un nombre.');
      if (g.select_count < 1) return setError(`En «${g.name}», hay que elegir al menos 1.`);
      if (g.item_product_ids.length < g.select_count) {
        return setError(
          `En «${g.name}» pedís elegir ${g.select_count} pero cargaste ${g.item_product_ids.length} opciones.`,
        );
      }
    }
    try {
      await save.mutateAsync(
        groups.map((g) => ({
          name: g.name.trim(),
          select_count: g.select_count,
          item_product_ids: g.item_product_ids,
        })),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el combo');
    }
  }

  return (
    <Modal open title={`Combo · ${product.name}`} onClose={onClose}>
      {combo.isLoading || products.isLoading ? (
        <Loading />
      ) : (
        <>
          <p className="field__hint">
            Un combo es un producto con su propio precio ({formatARS(product.price)}) que obliga a
            elegir productos de tu carta. Guardar sin grupos lo devuelve a ser un producto normal.
          </p>

          {groups.map((g, i) => (
            <fieldset key={i} className="combo-group">
              <div className="form-row">
                <Field label="Nombre del grupo">
                  <Input
                    value={g.name}
                    placeholder="Elegí 3 pizzas"
                    onChange={(e) => patch(i, { name: e.target.value })}
                  />
                </Field>
                <Field label="Cuántas hay que elegir">
                  <Input
                    type="number"
                    min="1"
                    value={String(g.select_count)}
                    onChange={(e) => patch(i, { select_count: Math.max(1, Number(e.target.value)) })}
                  />
                </Field>
              </div>

              <Field
                label="Opciones del grupo"
                hint={`${g.item_product_ids.length} elegibles cargadas`}
              >
                <div className="combo-picker">
                  {eligible.map((p) => (
                    <label key={p.id} className="combo-picker__row">
                      <input
                        type="checkbox"
                        checked={g.item_product_ids.includes(p.id)}
                        onChange={() => toggleItem(i, p.id)}
                      />
                      <span className="combo-picker__name">{p.name}</span>
                      <span className="combo-picker__price">{formatARS(p.price)}</span>
                    </label>
                  ))}
                  {eligible.length === 0 && (
                    <p className="field__hint">Todavía no tenés otros productos cargados.</p>
                  )}
                </div>
              </Field>

              <button
                type="button"
                className="link link--danger"
                onClick={() => setGroups((gs) => gs.filter((_, idx) => idx !== i))}
              >
                Quitar grupo
              </button>
            </fieldset>
          ))}

          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              setGroups((gs) => [...gs, { name: '', select_count: 1, item_product_ids: [] }])
            }
          >
            + Agregar grupo
          </Button>

          {error && (
            <p className="login__error" role="alert">
              {error}
            </p>
          )}

          <div className="form-actions">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void onSave()} disabled={save.isPending}>
              {save.isPending ? 'Guardando…' : 'Guardar combo'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
