import { useMemo, useState } from 'react';
import { formatARS, type Product } from '@pizzalog/shared';
import { Button, DataTable, EmptyState, ErrorState, Loading, Modal, PageHeader } from '@/ui';
import type { Column } from '@/ui';
import { useCategories } from '../categories/hooks';
import { useDeleteProduct, useProducts } from './hooks';
import { ProductForm } from './ProductForm';
import { VariantsModal } from './VariantsModal';
import { ComboModal } from './ComboModal';
import { ReorderModal } from './ReorderModal';

export function ProductsPage() {
  const products = useProducts();
  const categories = useCategories();
  const del = useDeleteProduct();
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [variantsFor, setVariantsFor] = useState<Product | null>(null);
  const [comboFor, setComboFor] = useState<Product | null>(null);
  const [reordering, setReordering] = useState(false);
  // Filtro por categoría del listado (arriba de todo). 'all' = todas.
  const [filterCat, setFilterCat] = useState<number | 'all' | 'none'>('all');

  const categoryName = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of categories.data ?? []) map.set(c.id, c.name);
    return map;
  }, [categories.data]);

  // Los borrados son baja lógica (is_active = 0): el backend los devuelve
  // igual para poder reactivarlos, pero en el listado no van — por eso
  // "no se borraban": seguían apareciendo. Acá se ocultan.
  const activeProducts = useMemo(
    () => (products.data ?? []).filter((p) => p.is_active === 1),
    [products.data],
  );

  // Categorías que realmente tienen productos, para no mostrar filtros vacíos.
  const usedCategories = useMemo(() => {
    const ids = new Set(activeProducts.map((p) => p.category_id));
    return (categories.data ?? []).filter((c) => ids.has(c.id));
  }, [categories.data, activeProducts]);

  const hasUncategorized = useMemo(
    () => activeProducts.some((p) => p.category_id == null),
    [activeProducts],
  );

  const visibleProducts = useMemo(() => {
    if (filterCat === 'all') return activeProducts;
    if (filterCat === 'none') return activeProducts.filter((p) => p.category_id == null);
    return activeProducts.filter((p) => p.category_id === filterCat);
  }, [activeProducts, filterCat]);

  const columns: Column<Product>[] = [
    {
      key: 'name',
      header: 'Producto',
      render: (p) => (
        <div className="prod-name">
          <span className="prod-thumb">
            {p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : '🍕'}
          </span>
          <span className="prod-name__txt">{p.name}</span>
          {p.has_variants === 1 && (
            <span className="badge badge--accent">{p.variants?.length ?? 0} var.</span>
          )}
          {p.is_combo === 1 && <span className="badge badge--accent">combo</span>}
          {p.is_open_price === 1 && <span className="badge">$ abierto</span>}
          {p.show_online !== 1 && <span className="badge">fuera de la carta</span>}
          {p.is_secret === 1 && <span className="badge">🤫 secreta</span>}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Categoría',
      render: (p) => (p.category_id != null ? categoryName.get(p.category_id) ?? '—' : '—'),
    },
    { key: 'price', header: 'Precio', align: 'right', render: (p) => formatARS(p.price) },
    {
      key: 'cost',
      header: 'Costo',
      align: 'right',
      render: (p) => (p.cost != null ? formatARS(p.cost) : '—'),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) => (
        <div className="row-actions">
          <button className="link" onClick={() => setEditing(p)}>
            Editar
          </button>
          <button className="link" onClick={() => setVariantsFor(p)}>
            Variantes
          </button>
          <button className="link" onClick={() => setComboFor(p)}>
            Combo
          </button>
          <button
            className="link link--danger"
            onClick={() => {
              if (confirm(`¿Eliminar "${p.name}"?`)) del.mutate(p.id);
            }}
          >
            Eliminar
          </button>
        </div>
      ),
    },
  ];

  const formOpen = creating || editing !== null;

  return (
    <section>
      <PageHeader
        eyebrow="Catálogo"
        title="Productos"
        actions={
          <>
            <Button variant="ghost" onClick={() => setReordering(true)}>
              Ordenar carta
            </Button>
            <Button onClick={() => setCreating(true)}>Nuevo producto</Button>
          </>
        }
      />

      {products.isLoading ? (
        <Loading />
      ) : products.isError ? (
        <ErrorState message="No se pudieron cargar los productos." />
      ) : activeProducts.length === 0 ? (
        <EmptyState title="Todavía no hay productos">
          <Button onClick={() => setCreating(true)}>Crear el primero</Button>
        </EmptyState>
      ) : (
        <>
          <div className="cat-filter" role="tablist" aria-label="Filtrar por categoría">
            <button
              className={`cat-filter__chip${filterCat === 'all' ? ' cat-filter__chip--on' : ''}`}
              onClick={() => setFilterCat('all')}
            >
              Todas ({activeProducts.length})
            </button>
            {usedCategories.map((c) => {
              const n = activeProducts.filter((p) => p.category_id === c.id).length;
              return (
                <button
                  key={c.id}
                  className={`cat-filter__chip${filterCat === c.id ? ' cat-filter__chip--on' : ''}`}
                  onClick={() => setFilterCat(c.id)}
                >
                  {c.name} ({n})
                </button>
              );
            })}
            {hasUncategorized && (
              <button
                className={`cat-filter__chip${filterCat === 'none' ? ' cat-filter__chip--on' : ''}`}
                onClick={() => setFilterCat('none')}
              >
                Sin categoría
              </button>
            )}
          </div>

          <DataTable
            columns={columns}
            rows={visibleProducts}
            renderExpand={(p) =>
              p.has_variants === 1 ? (
                <div className="variant-peek">
                  {(p.variants ?? []).length === 0 ? (
                    <p className="variant-peek__empty">Sin variantes cargadas todavía.</p>
                  ) : (
                    (p.variants ?? []).map((v) => (
                      <div key={v.id} className="variant-peek__row">
                        <span>{v.label}</span>
                        <span className="variant-peek__price">
                          {formatARS(v.price)}
                          {v.is_active !== 1 && <em> · inactiva</em>}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              ) : null
            }
          />
        </>
      )}

      <Modal
        open={formOpen}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? 'Editar producto' : 'Nuevo producto'}
      >
        <ProductForm
          product={editing}
          categories={categories.data ?? []}
          onDone={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      </Modal>

      {comboFor && <ComboModal product={comboFor} onClose={() => setComboFor(null)} />}

      {reordering && (
        <ReorderModal
          products={products.data ?? []}
          categories={categories.data ?? []}
          onClose={() => setReordering(false)}
        />
      )}

      {variantsFor && (
        <VariantsModal product={variantsFor} onClose={() => setVariantsFor(null)} />
      )}
    </section>
  );
}
