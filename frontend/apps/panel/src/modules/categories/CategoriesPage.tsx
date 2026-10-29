import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, type Category } from '@pizzalog/shared';
import {
  Button,
  Checkbox,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
} from '@/ui';
import type { Column } from '@/ui';
import { useCategories, useDeleteCategory, useReorderCategories, useSaveCategory } from './hooks';

export function CategoriesPage() {
  const categories = useCategories();
  const save = useSaveCategory();
  const del = useDeleteCategory();
  const reorder = useReorderCategories();
  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [allowsExtras, setAllowsExtras] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cats = categories.data ?? [];

  async function moveCategory(index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= cats.length) return;
    const newCats = [...cats];
    const [moved] = newCats.splice(index, 1);
    if (!moved) return;
    newCats.splice(targetIndex, 0, moved);
    await reorder.mutateAsync(newCats.map((c) => c.id));
  }

  function startCreate() {
    setEditing(null);
    setName('');
    setAllowsExtras(false);
    setError(null);
    setOpen(true);
  }

  function startEdit(c: Category) {
    setEditing(c);
    setName(c.name);
    const isEligible = Boolean(c.allows_extras !== undefined && c.allows_extras !== null ? c.allows_extras : /pizza|entrada|s[aá]ngu|sandwich|burger|hamburguesa|lomo/i.test(c.name));
    setAllowsExtras(isEligible);
    setError(null);
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await save.mutateAsync({ id: editing?.id, data: { name: name.trim(), allows_extras: allowsExtras ? 1 : 0 } });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la categoría');
    }
  }

  const columns: Column<Category>[] = [
    {
      key: 'order',
      header: 'Orden',
      width: '80px',
      render: (c) => {
        const i = cats.findIndex((x) => x.id === c.id);
        return (
          <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn--icon"
              style={{ padding: '2px 8px', fontSize: '13px', cursor: i > 0 ? 'pointer' : 'default', opacity: i > 0 ? 1 : 0.3 }}
              disabled={i <= 0 || reorder.isPending}
              onClick={() => moveCategory(i, 'up')}
              title="Subir categoría"
            >
              ▲
            </button>
            <button
              type="button"
              className="btn btn--icon"
              style={{ padding: '2px 8px', fontSize: '13px', cursor: i < cats.length - 1 ? 'pointer' : 'default', opacity: i < cats.length - 1 ? 1 : 0.3 }}
              disabled={i >= cats.length - 1 || reorder.isPending}
              onClick={() => moveCategory(i, 'down')}
              title="Bajar categoría"
            >
              ▼
            </button>
          </div>
        );
      },
    },
    { key: 'name', header: 'Categoría' },
    {
      key: 'allows_extras',
      header: 'Extras',
      width: '120px',
      render: (c) => {
        const active = Boolean(
          c.allows_extras !== undefined && c.allows_extras !== null
            ? c.allows_extras
            : /pizza|entrada|s[aá]ngu|sandwich|burger|hamburguesa|lomo/i.test(c.name),
        );
        return active ? (
          <span style={{ fontSize: '11px', background: '#e2f5ea', color: '#166534', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
            Habilitados
          </span>
        ) : (
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>-</span>
        );
      },
    },
    {
      key: 'products_count',
      header: 'Productos',
      align: 'right',
      render: (c) => c.products_count ?? c.product_count ?? 0,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => (
        <div className="row-actions">
          <button className="link" onClick={() => startEdit(c)}>
            Editar
          </button>
          <button
            className="link link--danger"
            onClick={() => {
              if (confirm(`¿Eliminar "${c.name}"?`)) del.mutate(c.id);
            }}
          >
            Eliminar
          </button>
        </div>
      ),
    },
  ];

  return (
    <section>
      <PageHeader
        eyebrow="Catálogo"
        title="Categorías"
        actions={<Button onClick={startCreate}>Nueva categoría</Button>}
      />

      {categories.isLoading ? (
        <Loading />
      ) : categories.isError ? (
        <ErrorState message="No se pudieron cargar las categorías." />
      ) : (categories.data ?? []).length === 0 ? (
        <EmptyState title="Todavía no hay categorías">
          <Button onClick={startCreate}>Crear la primera</Button>
        </EmptyState>
      ) : (
        <DataTable columns={columns} rows={categories.data ?? []} />
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar categoría' : 'Nueva categoría'}
      >
        <form onSubmit={onSubmit}>
          <Field label="Nombre">
            <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </Field>
          <div style={{ marginTop: '14px', marginBottom: '14px' }}>
            <Checkbox
              label="Permitir agregar extras en esta categoría (ej. Pizzas, Entradas, Sánguches)"
              checked={allowsExtras}
              onChange={() => setAllowsExtras(!allowsExtras)}
            />
            <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 24px' }}>
              En la carta web y pedidos, los productos de esta categoría podrán sumar adicionales (como queso extra, salsas o ingredientes).
            </p>
          </div>
          {error && (
            <p className="login__error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
