import { useState } from 'react';
import { formatARS, type Supply } from '@pizzalog/shared';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Loading,
  Modal,
  PageHeader,
} from '@/ui';
import type { Column } from '@/ui';
import { useDeleteSupply, useSupplies } from './hooks';
import { SupplyForm } from './SupplyForm';
import { StockModal } from './StockModal';

function isLow(s: Supply): boolean {
  return s.min_stock != null && s.stock <= s.min_stock;
}

export function SuppliesPage() {
  const supplies = useSupplies();
  const del = useDeleteSupply();
  const [editing, setEditing] = useState<Supply | null>(null);
  const [creating, setCreating] = useState(false);
  const [stockFor, setStockFor] = useState<Supply | null>(null);

  const lowCount = (supplies.data ?? []).filter(isLow).length;

  const columns: Column<Supply>[] = [
    { key: 'name', header: 'Insumo' },
    { key: 'category', header: 'Categoría', render: (s) => s.category ?? '—' },
    {
      key: 'stock',
      header: 'Stock',
      align: 'right',
      render: (s) => (
        <span className="stock-cell">
          {s.stock} {s.unit}
          {isLow(s) && <Badge tone="danger">Bajo</Badge>}
        </span>
      ),
    },
    { key: 'supplier_name', header: 'Proveedor', render: (s) => s.supplier_name ?? '—' },
    { key: 'cost', header: 'Costo', align: 'right', render: (s) => (s.cost != null ? formatARS(s.cost) : '—') },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (s) => (
        <div className="row-actions">
          <button className="link" onClick={() => setStockFor(s)}>
            Stock
          </button>
          <button className="link" onClick={() => setEditing(s)}>
            Editar
          </button>
          <button
            className="link link--danger"
            onClick={() => {
              if (confirm(`¿Eliminar "${s.name}"?`)) del.mutate(s.id);
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
        title="Insumos"
        actions={<Button onClick={() => setCreating(true)}>Nuevo insumo</Button>}
      />

      {lowCount > 0 && (
        <p className="alert-banner">
          {lowCount === 1
            ? 'Hay 1 insumo en nivel bajo de stock.'
            : `Hay ${lowCount} insumos en nivel bajo de stock.`}
        </p>
      )}

      {supplies.isLoading ? (
        <Loading />
      ) : supplies.isError ? (
        <ErrorState message="No se pudieron cargar los insumos." />
      ) : (supplies.data ?? []).length === 0 ? (
        <EmptyState title="Todavía no hay insumos">
          <Button onClick={() => setCreating(true)}>Crear el primero</Button>
        </EmptyState>
      ) : (
        <DataTable columns={columns} rows={supplies.data ?? []} />
      )}

      <Modal
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? 'Editar insumo' : 'Nuevo insumo'}
      >
        <SupplyForm
          supply={editing}
          onDone={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      </Modal>

      <Modal
        open={stockFor !== null}
        onClose={() => setStockFor(null)}
        title={stockFor ? `Stock · ${stockFor.name}` : 'Stock'}
      >
        {stockFor && <StockModal supply={stockFor} onDone={() => setStockFor(null)} />}
      </Modal>
    </section>
  );
}
