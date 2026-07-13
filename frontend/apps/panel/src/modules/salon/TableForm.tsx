import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, type Table, type TableKind, type TableShape } from '@pizzalog/shared';
import { Button, Field, Input, Select } from '@/ui';
import { useSaveTable } from './hooks';

interface Props {
  table: Table | null; // null = alta
  areaId: number;
  onDone: () => void;
}

const KINDS: { value: TableKind; label: string }[] = [
  { value: 'table', label: 'Mesa' },
  { value: 'bar', label: 'Barra' },
];

const SHAPES: { value: TableShape; label: string }[] = [
  { value: 'square', label: 'Cuadrada' },
  { value: 'rect', label: 'Rectangular' },
  { value: 'round', label: 'Redonda' },
];

export function TableForm({ table, areaId, onDone }: Props) {
  const save = useSaveTable();
  const [kind, setKind] = useState<TableKind>(table?.kind ?? 'table');
  const [label, setLabel] = useState(table?.label ?? '');
  const [capacity, setCapacity] = useState(String(table?.capacity ?? 4));
  const [shape, setShape] = useState<TableShape>(table?.shape ?? 'square');
  const [error, setError] = useState<string | null>(null);

  const isBar = kind === 'bar';

  function onKindChange(next: TableKind) {
    setKind(next);
    // Una barra se dibuja como rectángulo largo por defecto.
    if (next === 'bar' && !table) {
      setShape('rect');
      if (capacity === '4') setCapacity('8');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const dims = isBar
      ? { width: 220, height: 60 }
      : shape === 'rect'
        ? { width: 120, height: 80 }
        : { width: 80, height: 80 };
    try {
      await save.mutateAsync({
        id: table?.id,
        data: table
          ? {
              // El backend valida el payload completo: se conservan sector,
              // posición y dimensiones actuales de la mesa.
              area_id: table.area_id,
              label: label.trim(),
              kind,
              capacity: Number(capacity) || 1,
              shape,
              pos_x: table.pos_x,
              pos_y: table.pos_y,
              width: table.width,
              height: table.height,
              rotation: table.rotation,
            }
          : {
              area_id: areaId,
              label: label.trim(),
              kind,
              capacity: Number(capacity) || 1,
              shape,
              pos_x: 80,
              pos_y: 80,
              rotation: 0,
              ...dims,
            },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el lugar');
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Field label="Tipo">
        <Select value={kind} onChange={(e) => onKindChange(e.target.value as TableKind)}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Nombre"
        hint={isBar ? 'Como la conocés: «Barra 1», «Barra ventana»…' : 'Como la conoce el personal: «5», «Mesa 3»…'}
      >
        <Input value={label} onChange={(e) => setLabel(e.target.value)} required autoFocus />
      </Field>

      <div className="form-row">
        <Field
          label={isBar ? 'Banquetas (referencia)' : 'Capacidad'}
          hint={isBar ? 'En la barra, la cantidad de personas se define al abrir cada cuenta.' : undefined}
        >
          <Input
            type="number"
            min="1"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            required
          />
        </Field>
        {!isBar && (
          <Field label="Forma">
            <Select value={shape} onChange={(e) => setShape(e.target.value as TableShape)}>
              {SHAPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
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
