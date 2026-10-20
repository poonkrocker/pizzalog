import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, type Table, type TableKind, type TableShape } from '@pizzalog/shared';
import { Button, Field, Input, Select } from '@/ui';
import { useSaveTable } from './hooks';

interface Props {
  table: Table | null; // null = alta
  existingTables?: Table[];
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

function findFreePosition(existing: Table[], w: number, h: number): { x: number; y: number } {
  for (let y = 40; y <= 520 - h; y += 40) {
    for (let x = 40; x <= 880 - w; x += 40) {
      const overlaps = existing.some(
        (t) =>
          x < t.pos_x + t.width + 20 &&
          x + w + 20 > t.pos_x &&
          y < t.pos_y + t.height + 20 &&
          y + h + 20 > t.pos_y,
      );
      if (!overlaps) return { x, y };
    }
  }
  return { x: 80, y: 80 };
}

export function TableForm({ table, existingTables = [], areaId, onDone }: Props) {
  const save = useSaveTable();
  const [kind, setKind] = useState<TableKind>(table?.kind ?? 'table');
  const [label, setLabel] = useState(table?.label ?? '');
  const [capacity, setCapacity] = useState(String(table?.capacity ?? 4));
  const [shape, setShape] = useState<TableShape>(table?.shape ?? 'square');
  const [width, setWidth] = useState<number>(table?.width ?? (kind === 'bar' ? 120 : 80));
  const [height, setHeight] = useState<number>(table?.height ?? (kind === 'bar' ? 40 : 80));
  const [error, setError] = useState<string | null>(null);

  const isBar = kind === 'bar';

  function onKindChange(next: TableKind) {
    setKind(next);
    if (next === 'bar') {
      setShape('rect');
      if (!table) {
        setWidth(120);
        setHeight(40);
        if (capacity === '4') setCapacity('6');
      }
    } else {
      if (!table) {
        setWidth(80);
        setHeight(80);
        setShape('square');
      }
    }
  }

  function applyPreset(w: number, h: number, s: TableShape = 'rect') {
    setWidth(w);
    setHeight(h);
    setShape(s);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const w = Number(width) || (isBar ? 120 : 80);
    const h = Number(height) || (isBar ? 40 : 80);
    const freePos = !table ? findFreePosition(existingTables, w, h) : null;

    try {
      await save.mutateAsync({
        id: table?.id,
        data: table
          ? {
              area_id: table.area_id,
              label: label.trim(),
              kind,
              capacity: Number(capacity) || 1,
              shape,
              pos_x: table.pos_x,
              pos_y: table.pos_y,
              width: w,
              height: h,
              rotation: table.rotation,
            }
          : {
              area_id: areaId,
              label: label.trim(),
              kind,
              capacity: Number(capacity) || 1,
              shape,
              pos_x: freePos?.x ?? 80,
              pos_y: freePos?.y ?? 80,
              width: w,
              height: h,
              rotation: 0,
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

      <Field label="Dimensiones (grilla modular)">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
          {isBar ? (
            <>
              <button
                type="button"
                className={`btn btn--sm ${width === 120 && height === 40 ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => applyPreset(120, 40)}
              >
                Barra 120×40 (Horiz.)
              </button>
              <button
                type="button"
                className={`btn btn--sm ${width === 40 && height === 120 ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => applyPreset(40, 120)}
              >
                Barra 40×120 (Vert.)
              </button>
              <button
                type="button"
                className={`btn btn--sm ${width === 80 && height === 40 ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => applyPreset(80, 40)}
              >
                Barra 80×40 (Horiz.)
              </button>
              <button
                type="button"
                className={`btn btn--sm ${width === 40 && height === 80 ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => applyPreset(40, 80)}
              >
                Barra 40×80 (Vert.)
              </button>
              <button
                type="button"
                className={`btn btn--sm ${width === 160 && height === 40 ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => applyPreset(160, 40)}
              >
                Barra 160×40 (4 mod)
              </button>
              <button
                type="button"
                className={`btn btn--sm ${width === 40 && height === 160 ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => applyPreset(40, 160)}
              >
                Barra 40×160 (4 mod)
              </button>
              <button
                type="button"
                className={`btn btn--sm ${width === 40 && height === 40 ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => applyPreset(40, 40, 'square')}
              >
                Módulo 40×40
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`btn btn--sm ${width === 80 && height === 80 && shape === 'square' ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => applyPreset(80, 80, 'square')}
              >
                Cuadrada 80×80 (2×2)
              </button>
              <button
                type="button"
                className={`btn btn--sm ${width === 120 && height === 80 && shape === 'rect' ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => applyPreset(120, 80, 'rect')}
              >
                Rectangular 120×80 (3×2)
              </button>
              <button
                type="button"
                className={`btn btn--sm ${width === 80 && height === 120 && shape === 'rect' ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => applyPreset(80, 120, 'rect')}
              >
                Rectangular 80×120 (2×3)
              </button>
              <button
                type="button"
                className={`btn btn--sm ${shape === 'round' ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => applyPreset(80, 80, 'round')}
              >
                Redonda Ø 80
              </button>
            </>
          )}
        </div>
        <div className="form-row">
          <Field label="Ancho (px)">
            <Input
              type="number"
              step="20"
              min="40"
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
          </Field>
          <Field label="Alto (px)">
            <Input
              type="number"
              step="20"
              min="40"
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
            />
          </Field>
        </div>
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
