import { useEffect, useMemo, useState } from 'react';
import { formatARS, type Product } from '@pizzalog/shared';
import { Button, DataTable, EmptyState, ErrorState, Loading, Modal, PageHeader } from '@/ui';
import type { Column } from '@/ui';
import { useCategories } from '../categories/hooks';
import {
  useBulkPriceUpdate,
  useDeleteProduct,
  useProducts,
  useQuickUpdateProduct,
  useToggleAvailability,
} from './hooks';
import { ProductForm } from './ProductForm';
import { VariantsModal } from './VariantsModal';
import { ComboModal } from './ComboModal';
import { ReorderModal } from './ReorderModal';

type InlineField = 'name' | 'category' | 'price';

export function ProductsPage() {
  const products = useProducts();
  const categories = useCategories();
  const del = useDeleteProduct();
  const toggleAvail = useToggleAvailability();
  const quickUpdate = useQuickUpdateProduct();
  const bulkPrice = useBulkPriceUpdate();

  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [variantsFor, setVariantsFor] = useState<Product | null>(null);
  const [comboFor, setComboFor] = useState<Product | null>(null);
  const [reordering, setReordering] = useState(false);

  // Filtro por categoría del listado (arriba de todo). 'all' = todas.
  const [filterCat, setFilterCat] = useState<number | 'all' | 'none'>('all');
  // Categoría objetivo para el ajuste masivo (+$1000 / -$1000)
  const [bulkCat, setBulkCat] = useState<number | 'all' | 'none'>('all');

  // Edición rápida con doble clic
  const [inlineEdit, setInlineEdit] = useState<{
    id: number;
    field: InlineField;
    value: string;
  } | null>(null);

  // Sincronizar selector de ajuste masivo cuando cambia el filtro de categoría
  useEffect(() => {
    setBulkCat(filterCat);
  }, [filterCat]);

  const categoryName = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of categories.data ?? []) map.set(c.id, c.name);
    return map;
  }, [categories.data]);

  const activeProducts = useMemo(
    () => (products.data ?? []).filter((p) => p.is_active === 1),
    [products.data],
  );

  const usedCategories = useMemo(() => {
    const ids = new Set(activeProducts.map((p) => p.category_id));
    return (categories.data ?? []).filter((c) => ids.has(c.id));
  }, [categories.data, activeProducts]);

  // Si 'all' está seleccionado en bulkCat y hay categorías, sugerir la primera categoría si el usuario quiere por categoría
  useEffect(() => {
    if (bulkCat === 'all' && filterCat === 'all' && usedCategories.length > 0 && usedCategories[0]) {
      setBulkCat(usedCategories[0].id);
    }
  }, [usedCategories, bulkCat, filterCat]);

  const hasUncategorized = useMemo(
    () => activeProducts.some((p) => p.category_id == null),
    [activeProducts],
  );

  const visibleProducts = useMemo(() => {
    if (filterCat === 'all') return activeProducts;
    if (filterCat === 'none') return activeProducts.filter((p) => p.category_id == null);
    return activeProducts.filter((p) => p.category_id === filterCat);
  }, [activeProducts, filterCat]);

  function startInline(p: Product, field: InlineField) {
    if (field === 'name') {
      setInlineEdit({ id: p.id, field: 'name', value: p.name });
    } else if (field === 'category') {
      setInlineEdit({
        id: p.id,
        field: 'category',
        value: p.category_id != null ? String(p.category_id) : '',
      });
    } else if (field === 'price') {
      setInlineEdit({ id: p.id, field: 'price', value: String(p.price) });
    }
  }

  function commitInline(p: Product, overrideValue?: string) {
    if (!inlineEdit || inlineEdit.id !== p.id) return;
    const { field } = inlineEdit;
    const raw = overrideValue !== undefined ? overrideValue : inlineEdit.value;
    setInlineEdit(null);

    if (field === 'name') {
      const trimmed = raw.trim();
      if (trimmed && trimmed !== p.name) {
        quickUpdate.mutate({ id: p.id, data: { name: trimmed } });
      }
    } else if (field === 'category') {
      const nextCat = raw === '' ? null : Number(raw);
      if (nextCat !== (p.category_id ?? null)) {
        quickUpdate.mutate({ id: p.id, data: { category_id: nextCat } });
      }
    } else if (field === 'price') {
      const nextPrice = parseFloat(raw);
      if (!isNaN(nextPrice) && nextPrice >= 0 && nextPrice !== p.price) {
        quickUpdate.mutate({ id: p.id, data: { price: nextPrice } });
      }
    }
  }

  function handleBulkAdjust(delta: number) {
    const label =
      bulkCat === 'all'
        ? 'TODAS las categorías'
        : bulkCat === 'none'
          ? 'productos Sin categoría'
          : `la categoría «${categoryName.get(bulkCat) ?? ''}»`;
    const actionTxt = delta > 0 ? `SUMAR $${delta.toLocaleString('es-AR')}` : `RESTAR $${Math.abs(delta).toLocaleString('es-AR')}`;
    if (!confirm(`¿Confirmás ${actionTxt} a todos los productos de ${label}?`)) return;
    bulkPrice.mutate({ categoryId: bulkCat, delta });
  }

  const columns: Column<Product>[] = [
    {
      key: 'name',
      header: 'Producto',
      render: (p) => {
        const isEditingName = inlineEdit?.id === p.id && inlineEdit.field === 'name';
        return (
          <div className="prod-name">
            <span className="prod-thumb">
              {p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : '🍕'}
            </span>
            {isEditingName ? (
              <input
                type="text"
                className="input"
                style={{
                  padding: '4px 8px',
                  minHeight: '32px',
                  fontSize: '14px',
                  width: '220px',
                  maxWidth: '100%',
                }}
                value={inlineEdit.value}
                autoFocus
                onFocus={(e) => e.target.select()}
                onChange={(e) =>
                  setInlineEdit((prev) => (prev ? { ...prev, value: e.target.value } : null))
                }
                onBlur={() => commitInline(p)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitInline(p);
                  } else if (e.key === 'Escape') {
                    setInlineEdit(null);
                  }
                }}
              />
            ) : (
              <span
                className="prod-name__txt"
                onDoubleClick={() => startInline(p, 'name')}
                title="Doble clic para editar el nombre"
                style={{
                  cursor: 'pointer',
                  borderBottom: '1px dashed rgba(0,0,0,0.2)',
                  paddingBottom: '1px',
                }}
              >
                {p.name}
              </span>
            )}
            {p.has_variants === 1 && (
              <span className="badge badge--accent">{p.variants?.length ?? 0} var.</span>
            )}
            {p.is_combo === 1 && <span className="badge badge--accent">combo</span>}
            {p.is_open_price === 1 && <span className="badge">$ abierto</span>}
            {p.show_online !== 1 && <span className="badge">fuera de la carta</span>}
            {p.show_in_salon === 0 && <span className="badge badge--info">solo online</span>}
            {p.show_online === 1 && p.is_available !== 1 && (
              <span className="badge badge--warn">agotado</span>
            )}
            {p.is_secret === 1 && <span className="badge">🤫 secreta</span>}
          </div>
        );
      },
    },
    {
      key: 'category',
      header: 'Categoría',
      render: (p) => {
        const isEditingCat = inlineEdit?.id === p.id && inlineEdit.field === 'category';
        if (isEditingCat) {
          return (
            <select
              className="input"
              style={{
                padding: '4px 8px',
                minHeight: '32px',
                fontSize: '13px',
                width: '170px',
              }}
              value={inlineEdit.value}
              autoFocus
              onChange={(e) => {
                const nextVal = e.target.value;
                commitInline(p, nextVal);
              }}
              onBlur={() => commitInline(p)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setInlineEdit(null);
              }}
            >
              <option value="">— Sin categoría —</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          );
        }
        return (
          <span
            onDoubleClick={() => startInline(p, 'category')}
            title="Doble clic para cambiar categoría"
            style={{
              cursor: 'pointer',
              borderBottom: '1px dashed rgba(0,0,0,0.2)',
              paddingBottom: '1px',
              display: 'inline-block',
              minWidth: '40px',
            }}
          >
            {p.category_id != null ? categoryName.get(p.category_id) ?? '—' : 'Sin categoría'}
          </span>
        );
      },
    },
    {
      key: 'price',
      header: 'Precio',
      align: 'right',
      render: (p) => {
        const isEditingPrice = inlineEdit?.id === p.id && inlineEdit.field === 'price';
        if (isEditingPrice) {
          return (
            <input
              type="number"
              step="any"
              min="0"
              className="input"
              style={{
                padding: '4px 8px',
                minHeight: '32px',
                fontSize: '14px',
                width: '110px',
                textAlign: 'right',
              }}
              value={inlineEdit.value}
              autoFocus
              onFocus={(e) => e.target.select()}
              onChange={(e) =>
                setInlineEdit((prev) => (prev ? { ...prev, value: e.target.value } : null))
              }
              onBlur={() => commitInline(p)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitInline(p);
                } else if (e.key === 'Escape') {
                  setInlineEdit(null);
                }
              }}
            />
          );
        }
        return (
          <span
            onDoubleClick={() => startInline(p, 'price')}
            title="Doble clic para editar el precio"
            style={{
              cursor: 'pointer',
              fontWeight: 600,
              borderBottom: '1px dashed rgba(0,0,0,0.2)',
              paddingBottom: '1px',
            }}
          >
            {formatARS(p.price)}
          </span>
        );
      },
    },
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
          {p.show_online === 1 && (
            <button
              className={`avail-toggle${p.is_available === 1 ? ' avail-toggle--on' : ' avail-toggle--off'}`}
              disabled={toggleAvail.isPending}
              onClick={() => toggleAvail.mutate({ id: p.id, isAvailable: p.is_available !== 1 })}
              title={
                p.is_available === 1
                  ? 'Disponible en la carta. Clic para marcar agotado.'
                  : 'Agotado: no aparece en la carta. Clic para reponer.'
              }
            >
              {p.is_available === 1 ? '● disponible' : '○ agotado'}
            </button>
          )}
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

          {/* Barra de ajuste masivo de precios por categoría + aviso de doble clic */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: '12px',
              padding: '10px 14px',
              marginBottom: '16px',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700 }}>
                Ajuste masivo de precios:
              </span>
              <select
                className="input"
                style={{
                  width: 'auto',
                  minWidth: '170px',
                  minHeight: '36px',
                  padding: '4px 10px',
                  fontSize: '13px',
                }}
                value={String(bulkCat)}
                onChange={(e) => {
                  const v = e.target.value;
                  setBulkCat(v === 'all' ? 'all' : v === 'none' ? 'none' : Number(v));
                }}
              >
                {(categories.data ?? []).map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    Categoría: {c.name}
                  </option>
                ))}
                {hasUncategorized && <option value="none">Sin categoría</option>}
                <option value="all">Todas las categorías</option>
              </select>

              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={bulkPrice.isPending}
                onClick={() => handleBulkAdjust(-1000)}
                style={{ fontWeight: 700 }}
              >
                − $1.000
              </button>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={bulkPrice.isPending}
                onClick={() => handleBulkAdjust(1000)}
                style={{ fontWeight: 700 }}
              >
                + $1.000
              </button>
            </div>

            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
              💡 Doble clic en <b>nombre</b>, <b>categoría</b> o <b>precio</b> para editar sin abrir el formulario.
            </span>
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
