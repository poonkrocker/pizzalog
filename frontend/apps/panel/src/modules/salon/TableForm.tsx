import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, type Table, type TableShape } from '@pizzalog/shared';
import { Button, Field, Input, Select } from '@/ui';
import { useSaveTable } from './hooks';

interface Props {
  table: Table | null; // null = alta
  areaId: number;
  onDone: () => void;
}

const SHAPES: { value: TableShape; label: string }[] = [
  { value: 'square', label: 'Cuadrada' },
  { value: 'rect', label: 'Rectangular' },
  { value: 'round', label: 'Redonda' },
];

export function TableForm({ table, areaId, onDone }: Props) {
  const save = useSaveTable();
  const [label, setLabel] = useState(table?.label ?? '');
  const [capacity, setCapacity] = useState(String(table?.capacity ?? 4));
  const [shape, setShape] = useState<TableShape>(table?.shape ?? 'square');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    // Tamaño por defecto según forma (solo en alta).
    const dims =
      shape === 'rect' ? { width: 120, height: 80 } : { width: 80, height: 80 };
    try {
      await save.mutateAsync({
        id: table?.id,
        data: table
          ? { label: label.trim(), capacity: Number(capacity), shape }
          : {
              area_id: areaId,
              label: label.trim(),
              capacity: Number(capacity),
              shape,
              pos_x: 80,
              pos_y: 80,
              rotation: 0,
              ...dims,
            },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la mesa');
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Field label="Etiqueta" hint="Como la conoce el personal: «5», «Barra 2»…">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} required autoFocus />
      </Field>
      <div className="form-row">
        <Field label="Capacidad">
          <Input
            type="number"
            min="1"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            required
          />
        </Field>
        <Field label="Forma">
          <Select value={shape} onChange={(e) => setShape(e.target.value as TableShape)}>
            {SHAPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
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
