import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, type Supply } from '@pizzalog/shared';
import { Button, Field, Input, Select } from '@/ui';
import { useSuppliers } from '../suppliers/hooks';
import { useSaveSupply } from './hooks';

interface Props {
  supply: Supply | null;
  onDone: () => void;
}

export function SupplyForm({ supply, onDone }: Props) {
  const save = useSaveSupply();
  const suppliers = useSuppliers(true);
  const [name, setName] = useState(supply?.name ?? '');
  const [category, setCategory] = useState(supply?.category ?? '');
  const [unit, setUnit] = useState(supply?.unit ?? 'u');
  const [minStock, setMinStock] = useState(supply?.min_stock != null ? String(supply.min_stock) : '');
  const [cost, setCost] = useState(supply?.cost != null ? String(supply.cost) : '');
  const [supplierId, setSupplierId] = useState(
    supply?.supplier_id != null ? String(supply.supplier_id) : '',
  );
  const [initialStock, setInitialStock] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const base = {
      name: name.trim(),
      category: category.trim() || null,
      unit: unit.trim() || 'u',
      min_stock: minStock === '' ? null : Number(minStock),
      cost: cost === '' ? null : Number(cost),
      supplier_id: supplierId === '' ? null : Number(supplierId),
    };
    try {
      await save.mutateAsync({
        id: supply?.id,
        data: supply
          ? base
          : { ...base, initial_stock: initialStock === '' ? 0 : Number(initialStock) },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el insumo');
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Field label="Nombre">
        <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </Field>
      <div className="form-row">
        <Field label="Categoría" hint="Descartables, Limpieza…">
          <Input value={category} onChange={(e) => setCategory(e.target.value)} />
        </Field>
        <Field label="Unidad" hint="u, caja, pack, kg, lt…">
          <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Stock mínimo" hint="Dispara la alerta de reposición.">
          <Input
            type="number"
            min="0"
            step="0.001"
            value={minStock}
            onChange={(e) => setMinStock(e.target.value)}
          />
        </Field>
        <Field label="Costo unitario">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Proveedor habitual">
        <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">Sin proveedor</option>
          {(suppliers.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      {!supply && (
        <Field label="Stock inicial" hint="Se registra como una reposición.">
          <Input
            type="number"
            min="0"
            step="0.001"
            value={initialStock}
            onChange={(e) => setInitialStock(e.target.value)}
          />
        </Field>
      )}
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
