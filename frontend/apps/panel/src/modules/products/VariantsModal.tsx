import { useEffect, useMemo, useState } from 'react';
import { ApiError, type Product } from '@pizzalog/shared';
import { Button, Checkbox, Input, Modal } from '@/ui';
import { useSetOptions, useUpdateVariants, useVariants } from './variantHooks';

interface OptionDraft {
  name: string;
  values: string[];
}

interface VariantRow {
  id: number;
  label: string;
  price: string;
  is_active: boolean;
}

function OptionRow({
  option,
  index,
  onName,
  onAddValue,
  onRemoveValue,
  onRemove,
}: {
  option: OptionDraft;
  index: number;
  onName: (i: number, name: string) => void;
  onAddValue: (i: number, value: string) => void;
  onRemoveValue: (i: number, value: string) => void;
  onRemove: (i: number) => void;
}) {
  const [draft, setDraft] = useState('');
  return (
    <div className="opt-row">
      <div className="opt-row__head">
        <Input
          value={option.name}
          onChange={(e) => onName(index, e.target.value)}
          placeholder="Dimensión (ej: Tamaño)"
        />
        <button className="link link--danger" onClick={() => onRemove(index)}>
          Quitar
        </button>
      </div>
      <div className="chips">
        {option.values.map((v) => (
          <span key={v} className="chip">
            {v}
            <button onClick={() => onRemoveValue(index, v)} aria-label={`Quitar ${v}`}>
              ✕
            </button>
          </span>
        ))}
        <input
          className="chip-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onAddValue(index, draft);
              setDraft('');
            }
          }}
          placeholder="Valor + Enter"
        />
      </div>
    </div>
  );
}

export function VariantsModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const variants = useVariants(product.id);
  const setOptions = useSetOptions();
  const updateVariants = useUpdateVariants();

  const [options, setOptionsState] = useState<OptionDraft[]>([]);
  const [rows, setRows] = useState<VariantRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (variants.data) {
      setOptionsState(
        variants.data.options.map((o) => ({ name: o.name, values: o.values.map((v) => v.value) })),
      );
      setRows(
        variants.data.variants.map((v) => ({
          id: v.id,
          label: v.label,
          price: String(v.price),
          is_active: v.is_active === 1,
        })),
      );
    }
  }, [variants.data]);

  const comboCount = useMemo(
    () => options.reduce((acc, o) => acc * Math.max(o.values.length, 0), options.length ? 1 : 0),
    [options],
  );

  function addOption() {
    if (options.length < 3) setOptionsState((p) => [...p, { name: '', values: [] }]);
  }
  function removeOption(i: number) {
    setOptionsState((p) => p.filter((_, idx) => idx !== i));
  }
  function setOptionName(i: number, name: string) {
    setOptionsState((p) => p.map((o, idx) => (idx === i ? { ...o, name } : o)));
  }
  function addValue(i: number, value: string) {
    const v = value.trim();
    if (!v) return;
    setOptionsState((p) =>
      p.map((o, idx) => (idx === i && !o.values.includes(v) ? { ...o, values: [...o.values, v] } : o)),
    );
  }
  function removeValue(i: number, value: string) {
    setOptionsState((p) =>
      p.map((o, idx) => (idx === i ? { ...o, values: o.values.filter((x) => x !== value) } : o)),
    );
  }

  async function generate() {
    setError(null);
    try {
      await setOptions.mutateAsync({
        productId: product.id,
        options: options.map((o) => ({ name: o.name.trim(), values: o.values })),
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron generar las combinaciones');
    }
  }

  async function savePrices() {
    setError(null);
    try {
      await updateVariants.mutateAsync({
        productId: product.id,
        variants: rows.map((r) => ({
          id: r.id,
          price: Number(r.price) || 0,
          is_active: r.is_active ? 1 : 0,
        })),
      });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron guardar los precios');
    }
  }

  return (
    <Modal open onClose={onClose} title={`Variantes · ${product.name}`}>
      <p className="muted-text" style={{ marginTop: 0 }}>
        Definí las dimensiones (Tamaño, Masa…) y sus valores. Al generar, se crean
        todas las combinaciones y cargás el precio de cada una.
      </p>

      <div className="opt-list">
        {options.map((o, i) => (
          <OptionRow
            key={i}
            option={o}
            index={i}
            onName={setOptionName}
            onAddValue={addValue}
            onRemoveValue={removeValue}
            onRemove={removeOption}
          />
        ))}
      </div>

      <div className="opt-actions">
        {options.length < 3 && (
          <Button variant="ghost" onClick={addOption}>
            + Agregar dimensión
          </Button>
        )}
        <Button onClick={() => void generate()} disabled={setOptions.isPending || comboCount === 0}>
          {setOptions.isPending ? 'Generando…' : `Generar ${comboCount} combinaciones`}
        </Button>
      </div>

      {rows.length > 0 && (
        <div className="variant-grid">
          <h3 className="variant-grid__title">Combinaciones ({rows.length})</h3>
          {rows.map((r, i) => (
            <div key={r.id} className="variant-row">
              <span className="variant-row__label">{r.label}</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={r.price}
                onChange={(e) =>
                  setRows((p) => p.map((x, idx) => (idx === i ? { ...x, price: e.target.value } : x)))
                }
              />
              <Checkbox
                label="Activa"
                checked={r.is_active}
                onChange={(e) =>
                  setRows((p) =>
                    p.map((x, idx) => (idx === i ? { ...x, is_active: e.target.checked } : x)),
                  )
                }
              />
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="login__error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
        {rows.length > 0 && (
          <Button onClick={() => void savePrices()} disabled={updateVariants.isPending}>
            {updateVariants.isPending ? 'Guardando…' : 'Guardar precios'}
          </Button>
        )}
      </div>
    </Modal>
  );
}
