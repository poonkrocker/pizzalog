import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, type Category } from '@pizzalog/shared';
import {
  Button,
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
import { useCategories, useDeleteCategory, useSaveCategory } from './hooks';

export function CategoriesPage() {
  const categories = useCategories();
  const save = useSaveCategory();
  const del = useDeleteCategory();
  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function startCreate() {
    setEditing(null);
    setName('');
    setError(null);
    setOpen(true);
  }

  function startEdit(c: Category) {
    setEditing(c);
    setName(c.name);
    setError(null);
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await save.mutateAsync({ id: editing?.id, data: { name: name.trim() } });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la categoría');
    }
  }

  const columns: Column<Category>[] = [
    { key: 'name', header: 'Categoría' },
    {
      key: 'products_count',
      header: 'Productos',
      align: 'right',
      render: (c) => c.products_count ?? 0,
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
