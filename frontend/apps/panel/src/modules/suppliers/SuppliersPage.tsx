import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, type Supplier } from '@pizzalog/shared';
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
  Textarea,
} from '@/ui';
import type { Column } from '@/ui';
import { useDeleteSupplier, useSaveSupplier, useSuppliers } from './hooks';

function SupplierForm({ supplier, onDone }: { supplier: Supplier | null; onDone: () => void }) {
  const save = useSaveSupplier();
  const [f, setF] = useState({
    name: supplier?.name ?? '',
    contact_name: supplier?.contact_name ?? '',
    phone: supplier?.phone ?? '',
    email: supplier?.email ?? '',
    cuit: supplier?.cuit ?? '',
    notes: supplier?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await save.mutateAsync({ id: supplier?.id, data: { ...f, name: f.name.trim() } });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar');
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Field label="Nombre">
        <Input value={f.name} onChange={set('name')} required autoFocus />
      </Field>
      <div className="form-row">
        <Field label="Contacto">
          <Input value={f.contact_name} onChange={set('contact_name')} />
        </Field>
        <Field label="Teléfono">
          <Input value={f.phone} onChange={set('phone')} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Email">
          <Input type="email" value={f.email} onChange={set('email')} />
        </Field>
        <Field label="CUIT">
          <Input value={f.cuit} onChange={set('cuit')} />
        </Field>
      </div>
      <Field label="Notas">
        <Textarea value={f.notes} onChange={set('notes')} rows={2} />
      </Field>
      {error && (
        <p className="login__error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </form>
  );
}

export function SuppliersPage() {
  const suppliers = useSuppliers();
  const del = useDeleteSupplier();
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [creating, setCreating] = useState(false);

  const columns: Column<Supplier>[] = [
    { key: 'name', header: 'Proveedor' },
    { key: 'contact_name', header: 'Contacto', render: (s) => s.contact_name ?? '—' },
    { key: 'phone', header: 'Teléfono', render: (s) => s.phone ?? '—' },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (s) => (
        <div className="row-actions">
          <button className="link" onClick={() => setEditing(s)}>
            Editar
          </button>
          <button
            className="link link--danger"
            onClick={() => {
              if (confirm(`¿Eliminar a "${s.name}"?`)) del.mutate(s.id);
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
        eyebrow="Abastecimiento"
        title="Proveedores"
        actions={<Button onClick={() => setCreating(true)}>Nuevo proveedor</Button>}
      />

      {suppliers.isLoading ? (
        <Loading />
      ) : suppliers.isError ? (
        <ErrorState message="No se pudieron cargar los proveedores." />
      ) : (suppliers.data ?? []).length === 0 ? (
        <EmptyState title="Todavía no hay proveedores">
          <Button onClick={() => setCreating(true)}>Crear el primero</Button>
        </EmptyState>
      ) : (
        <DataTable columns={columns} rows={suppliers.data ?? []} />
      )}

      <Modal
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? 'Editar proveedor' : 'Nuevo proveedor'}
      >
        <SupplierForm
          supplier={editing}
          onDone={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      </Modal>
    </section>
  );
}
