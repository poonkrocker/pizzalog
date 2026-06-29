import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, formatDateTime, type Customer } from '@pizzalog/shared';
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
import { useCustomers, useDeleteCustomer, useSaveCustomer } from './hooks';

function CustomerForm({ customer, onDone }: { customer: Customer | null; onDone: () => void }) {
  const save = useSaveCustomer();
  const [f, setF] = useState({
    name: customer?.name ?? '',
    phone: customer?.phone ?? '',
    email: customer?.email ?? '',
    address: customer?.address ?? '',
    notes: customer?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await save.mutateAsync({ id: customer?.id, data: { ...f, name: f.name.trim() } });
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
        <Field label="Teléfono">
          <Input value={f.phone} onChange={set('phone')} />
        </Field>
        <Field label="Email">
          <Input type="email" value={f.email} onChange={set('email')} />
        </Field>
      </div>
      <Field label="Dirección">
        <Input value={f.address} onChange={set('address')} />
      </Field>
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

export function CustomersPage() {
  const [q, setQ] = useState('');
  const customers = useCustomers(q);
  const del = useDeleteCustomer();
  const [editing, setEditing] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(false);

  const columns: Column<Customer>[] = [
    { key: 'name', header: 'Cliente' },
    { key: 'phone', header: 'Teléfono', render: (c) => c.phone ?? '—' },
    { key: 'address', header: 'Dirección', render: (c) => c.address ?? '—' },
    { key: 'created_at', header: 'Alta', render: (c) => formatDateTime(c.created_at) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => (
        <div className="row-actions">
          <button className="link" onClick={() => setEditing(c)}>
            Editar
          </button>
          <button
            className="link link--danger"
            onClick={() => {
              if (confirm(`¿Eliminar a "${c.name}"?`)) del.mutate(c.id);
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
        eyebrow="Contactos"
        title="Clientes"
        actions={<Button onClick={() => setCreating(true)}>Nuevo cliente</Button>}
      />

      <div className="filters">
        <Field label="Buscar">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre o teléfono…"
          />
        </Field>
      </div>

      {customers.isLoading ? (
        <Loading />
      ) : customers.isError ? (
        <ErrorState message="No se pudieron cargar los clientes." />
      ) : (customers.data ?? []).length === 0 ? (
        <EmptyState title={q ? 'Sin resultados' : 'Todavía no hay clientes'}>
          {!q && <Button onClick={() => setCreating(true)}>Crear el primero</Button>}
        </EmptyState>
      ) : (
        <DataTable columns={columns} rows={customers.data ?? []} />
      )}

      <Modal
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? 'Editar cliente' : 'Nuevo cliente'}
      >
        <CustomerForm
          customer={editing}
          onDone={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      </Modal>
    </section>
  );
}
