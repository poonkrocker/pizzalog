import { useMemo, useRef, useState } from 'react';
import type { StudioRecipe, SupplyItem } from '@pizzalog/shared';

type DraftLine = {
  id: string;
  name: string;
  ingredient: string;
  quantity: string;
  unit: string;
  supplyId: number | null;
};

type ExistingVariant = { variant_id: number; label: string; recipe_id: number | null; recipe_name: string | null };

type DraftPizza = {
  id: string;
  name: string;
  price: number;
  lines: DraftLine[];
  include: boolean;
  existing: string | null;
  variantId: number;
  recipeId: number | null;
  sourceLabel: string;
  sourcePeriod: string;
};

type Props = {
  supplies: SupplyItem[];
  recipes: StudioRecipe[];
  variants: ExistingVariant[];
  onCreateSupply: (name: string, unit: string) => Promise<number>;
  onImport: (recipe: {
    name: string;
    price: number;
    variantId: number;
    recipeId: number | null;
    components: Array<{ component_type: 'supply'; component_id: number; quantity: number; unit: string }>;
  }) => Promise<void>;
};

const normalize = (value: string) => value.toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const aliases: Record<string, string[]> = {
  pizza: ['pizza', 'producto', 'product', 'name', 'product name', 'pizza name', 'nombre', 'nombre pizza', 'nombre del producto', 'recipe', 'receta'],
  ingredient: ['ingrediente', 'ingredient', 'insumo', 'nombre ingrediente', 'nombre del ingrediente', 'ingredient name', 'supply', 'supply name'],
  ingredients: ['ingredientes', 'ingredients', 'lista ingredientes', 'ingredient list', 'composicion', 'composición'],
  quantity: ['cantidad', 'quantity', 'cant', 'peso', 'gramos', 'cantidad ingrediente'],
  unit: ['unidad', 'unit', 'medida'],
  price: ['precio', 'price', 'importe'],
  from: ['desde', 'from', 'fecha desde', 'vigencia desde'],
  to: ['hasta', 'to', 'fecha hasta', 'vigencia hasta'],
  label: ['tipo', 'etiqueta', 'label', 'tag'],
  sourceId: ['id', 'product id', 'producto id'],
};

function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiters = [',', ';', '\t'];
  const delimiter = delimiters.map((d) => {
    let quoted = false, count = 0;
    for (let i = 0; i < first.length; i += 1) {
      if (first[i] === '"') quoted = !quoted;
      else if (first[i] === d && !quoted) count += 1;
    }
    return { d, count };
  }).sort((a, b) => b.count - a.count)[0]?.d ?? ',';

  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim()); cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('El CSV tiene comillas sin cerrar.');
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) throw new Error('El archivo no contiene encabezados y filas de datos.');
  if (rows.length > 10001) throw new Error('El archivo supera el límite de 10.000 filas.');
  return rows;
}

function column(headers: string[], kind: keyof typeof aliases): number {
  return headers.findIndex((header) => (aliases[kind] ?? []).includes(normalize(header)));
}

function parsePrice(value: string): number {
  const raw = value.trim().replace(/[^0-9,.-]/g, '');
  if (!raw) return 0;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/\.(?=\d{3}(?:\D|$))/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function matchSupply(name: string, supplies: SupplyItem[]): SupplyItem | undefined {
  const target = normalize(name);
  // Only exact normalized matches are preselected. Similar names remain unlinked
  // so a substring coincidence cannot silently assign the wrong catalog supply.
  return supplies.find((s) => normalize(s.name) === target);
}

function buildPizzas(rows: string[][], supplies: SupplyItem[], recipes: StudioRecipe[], variants: ExistingVariant[]): DraftPizza[] {
  const headers = (rows[0] ?? []).map(normalize);
  const pizzaCol = column(headers, 'pizza');
  const ingredientCol = column(headers, 'ingredient');
  const ingredientsCol = column(headers, 'ingredients');
  const quantityCol = column(headers, 'quantity');
  const unitCol = column(headers, 'unit');
  const priceCol = column(headers, 'price');
  const fromCol = column(headers, 'from');
  const toCol = column(headers, 'to');
  const labelCol = column(headers, 'label');
  const sourceIdCol = column(headers, 'sourceId');
  const grouped = new Map<string, DraftPizza>();

  if (pizzaCol < 0 || (ingredientCol < 0 && ingredientsCol < 0)) {
    throw new Error('No pude reconocer las columnas. Se necesitan pizza + ingrediente(s).');
  }

  const normalizedNames = rows.slice(1).map(row => normalize(row[pizzaCol] ?? '')).filter(Boolean);
  const duplicateNames = new Set(normalizedNames.filter((name, index) => normalizedNames.indexOf(name) !== index));

  rows.slice(1).forEach((row, index) => {
    const originalName = row[pizzaCol]?.trim();
    if (!originalName) return;
    const normalizedName = normalize(originalName);
    const sourceId = sourceIdCol >= 0 ? (row[sourceIdCol] ?? '').trim() : '';
    const sourceLabel = labelCol >= 0 ? (row[labelCol] ?? '').trim() : '';
    const sourcePeriod = [fromCol >= 0 ? row[fromCol] : '', toCol >= 0 ? row[toCol] : '']
      .map(value => (value ?? '').trim()).filter(Boolean).join(' → ');
    const isAmbiguousName = duplicateNames.has(normalizedName);
    // A source product ID identifies a distinct publication; do not merge two
    // historical versions just because their display names are equal.
    const key = sourceId || (isAmbiguousName
      ? `${normalizedName}::${normalize(sourceLabel)}::${sourcePeriod}`
      : normalizedName);
    let pizza = grouped.get(key);
    if (!pizza) {
      const variant = isAmbiguousName ? undefined : variants.find(v => normalize(v.label) === normalizedName);
      const exact = isAmbiguousName ? undefined : (
        (variant?.recipe_id ? recipes.find(r => r.id === variant.recipe_id) : undefined)
        ?? recipes.find(r => normalize(r.name) === normalizedName)
      );
      const near = !exact && !variant && !isAmbiguousName ? recipes.find(r => {
        const candidate = normalize(r.name);
        return candidate && (candidate.includes(normalizedName) || normalizedName.includes(candidate));
      }) : undefined;
      const displayName = isAmbiguousName && sourceLabel
        ? `${originalName} · ${sourceLabel.replace(/[¡!]/g, '').trim()}`
        : originalName;
      pizza = {
        id: key,
        name: displayName,
        price: priceCol >= 0 ? parsePrice(row[priceCol] ?? '') : 0,
        lines: [],
        include: !exact && !near,
        existing: isAmbiguousName
          ? 'Publicación histórica distinta con el mismo nombre; se importará como receta independiente'
          : exact
            ? `Ya existe una receta «${exact.name}»; importar actualizará sus ingredientes`
            : variant
              ? 'La pizza ya existe en el histórico; se vinculará la receta'
              : near ? `Posible coincidencia: ${near.name}` : null,
        variantId: variant?.variant_id ?? 0,
        recipeId: exact?.id ?? null,
        sourceLabel,
        sourcePeriod,
      };
      grouped.set(key, pizza);
    }

    const ingredientText = (ingredientCol >= 0 ? row[ingredientCol] : row[ingredientsCol]) ?? '';
    const names = ingredientCol >= 0 ? [ingredientText] : ingredientText.split(/[;,|]/).map(value => value.trim()).filter(Boolean);
    names.forEach((ingredient, part) => {
      if (!ingredient) return;
      const supply = matchSupply(ingredient, supplies);
      const rawQuantity = quantityCol >= 0 ? (row[quantityCol] ?? '') : '';
      const quantity = Number(rawQuantity.replace(',', '.'));
      const unit = unitCol >= 0 && row[unitCol] ? row[unitCol] : supply?.unit ?? 'g';
      pizza!.lines.push({
        id: `${key}-${index}-${part}-${normalize(ingredient)}`,
        name: pizza!.name,
        ingredient,
        quantity: Number.isFinite(quantity) && quantity > 0 ? String(quantity) : '',
        unit,
        supplyId: supply?.id ?? null,
      });
    });
  });
  return [...grouped.values()];
}

export function SeasonalPizzaCsvImport({ supplies, recipes, variants, onCreateSupply, onImport }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pizzas, setPizzas] = useState<DraftPizza[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');

  const summary = useMemo(() => ({
    total: pizzas.length,
    selected: pizzas.filter((p) => p.include).length,
    matched: pizzas.reduce((n, p) => n + p.lines.filter((l) => l.supplyId !== null).length, 0),
    unmatched: pizzas.reduce((n, p) => n + p.lines.filter((l) => l.supplyId === null).length, 0),
  }), [pizzas]);

  const updateLine = (pizzaId: string, lineId: string, patch: Partial<DraftLine>) => {
    setPizzas((current) => current.map((pizza) => pizza.id !== pizzaId ? pizza : {
      ...pizza, lines: pizza.lines.map((line) => line.id !== lineId ? line : { ...line, ...patch }),
    }));
  };

  const readFile = async (file?: File) => {
    if (!file) return;
    setError(''); setNotice(''); setFileName(file.name);
    try {
      const rows = parseCsv(await file.text());
      setPizzas(buildPizzas(rows, supplies, recipes, variants));
    } catch (err) {
      setPizzas([]);
      setError(err instanceof Error ? err.message : 'No se pudo leer el CSV.');
    }
  };

  const importSelected = async () => {
    const selected = pizzas.filter((p) => p.include);
    if (!selected.length) { setError('Seleccioná al menos una pizza nueva.'); return; }
    const invalid = selected.find((p) => !p.lines.length || p.lines.some((l) => !l.ingredient.trim() || !l.unit));
    if (invalid) { setError(`Revisá que todos los ingredientes tengan nombre y unidad en «${invalid.name}».`); return; }
    setBusy(true); setError(''); setNotice('');
    let done = 0;
    let createdCount = 0;
    const createdByName = new Map<string, number>();
    try {
      // Crear cada insumo faltante una sola vez para todo el lote. Si ya fue
      // creado en un intento anterior, onCreateSupply lo recupera por nombre.
      for (const pizza of selected) {
        const components = [];
        for (const line of pizza.lines) {
          let supplyId = line.supplyId;
          if (supplyId === null) {
            const key = normalize(line.ingredient);
            supplyId = createdByName.get(key) ?? await onCreateSupply(line.ingredient.trim(), line.unit);
            if (!createdByName.has(key)) {
              createdByName.set(key, supplyId);
              createdCount += 1;
            }
          }
          components.push({
            component_type: 'supply' as const,
            component_id: supplyId,
            // 0 representa cantidad todavía no relevada; Cost Engine lo trata como incompleto.
            quantity: line.quantity.trim() === '' ? 0 : Number(line.quantity.replace(',', '.')),
            unit: line.unit,
          });
        }
        await onImport({
          name: pizza.name,
          price: pizza.price,
          variantId: pizza.variantId,
          recipeId: pizza.recipeId,
          components,
        });
        done += 1;
      }
      setNotice(`Se importaron ${done} recetas y se agregaron ${createdCount} insumos nuevos. Las cantidades vacías siguen pendientes de completar.`);
      setPizzas((current) => current.map((p) => ({ ...p, include: false })));
    } catch (err) {
      setError(`Se importaron ${done} recetas antes del error. ${err instanceof Error ? err.message : 'Revisá el catálogo e intentá nuevamente.'}`);
    } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ border: '1px solid var(--c-border,#ddd)', borderRadius: 10, padding: '1rem', background: 'var(--c-surface,#fff)' }}>
        <h3 style={{ marginTop: 0 }}>Importar pizzas desde CSV</h3>
        <p style={{ color: 'var(--c-muted,#64748b)', fontSize: '.88rem' }}>
          Importá un CSV con columnas de pizza e ingredientes. Podés usar una fila por pizza con una lista de ingredientes, o una fila por ingrediente con cantidad y unidad.
        </p>
        <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={(e) => void readFile(e.target.files?.[0])} />
        {fileName && <p style={{ fontSize: '.8rem' }}>Archivo: <strong>{fileName}</strong></p>}
        <details style={{ marginTop: '.75rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Ver formatos admitidos</summary>
          <pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto', fontSize: '.78rem', background: '#f8fafc', padding: '.65rem', borderRadius: 6 }}>{'pizza,ingredientes\nPascuapizza,"Muzzarella, acelga, ricota"\n\n' + 'pizza,ingrediente,cantidad,unidad\nPascuapizza,Muzzarella,250,g\nPascuapizza,Ricota,80,g'}</pre>
        </details>
      </div>

      {!!pizzas.length && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
            {[['Pizzas', summary.total], ['Seleccionadas', summary.selected], ['Insumos vinculados', summary.matched], ['Pendientes de vincular', summary.unmatched]].map(([label, value]) => (
              <div key={label} style={{ border: '1px solid var(--c-border,#ddd)', borderRadius: 8, padding: '.55rem .75rem', fontSize: '.82rem' }}>
                <strong>{value}</strong> <span style={{ color: '#64748b' }}>{label}</span>
              </div>
            ))}
          </div>
          {pizzas.map((pizza) => (
            <section key={pizza.id} style={{ border: '1px solid var(--c-border,#ddd)', borderRadius: 10, padding: '.85rem', background: '#fff', display: 'grid', gap: '.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap' }}>
                <div>
                  <strong>{pizza.name}</strong>
                  <div style={{ fontSize: '.78rem', color: pizza.existing ? '#92400e' : '#64748b' }}>{pizza.existing ?? 'Pizza nueva'}</div>
                  {(pizza.sourceLabel || pizza.sourcePeriod) && <div style={{ fontSize: '.75rem', color: '#64748b' }}>{[pizza.sourceLabel, pizza.sourcePeriod].filter(Boolean).join(' · ')}</div>}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.82rem' }}>
                  <input type="checkbox" checked={pizza.include} onChange={(e) => setPizzas((current) => current.map((p) => p.id === pizza.id ? { ...p, include: e.target.checked } : p))} />
                  Importar
                </label>
              </div>
              {pizza.recipeId !== null && recipes.find((r) => r.id === pizza.recipeId) && (
                <div style={{ fontSize: '.78rem', color: '#64748b', background: '#f8fafc', padding: '.55rem', borderRadius: 6 }}>
                  Receta actual: {recipes.find((r) => r.id === pizza.recipeId)!.components.map((component) => component.name).join(', ') || 'sin ingredientes'}
                </div>
              )}
              {pizza.lines.map((line) => (
                <div key={line.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,1fr) minmax(90px,.65fr) minmax(65px,.45fr)', gap: '.4rem', alignItems: 'center' }}>
                  <select aria-label={`Insumo para ${line.ingredient}`} value={line.supplyId ?? '__create__'} onChange={(e) => updateLine(pizza.id, line.id, { supplyId: e.target.value === '__create__' ? null : Number(e.target.value) })} style={{ minWidth: 0, padding: '.5rem', border: '1px solid #cbd5e1', borderRadius: 6 }}>
                    <option value="__create__">Agregar: {line.ingredient}</option>
                    {supplies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <input aria-label={`Cantidad de ${line.ingredient}`} inputMode="decimal" placeholder="Cantidad" value={line.quantity} onChange={(e) => updateLine(pizza.id, line.id, { quantity: e.target.value })} style={{ minWidth: 0, padding: '.5rem', border: '1px solid #cbd5e1', borderRadius: 6 }} />
                  <input aria-label={`Unidad de ${line.ingredient}`} value={line.unit} onChange={(e) => updateLine(pizza.id, line.id, { unit: e.target.value })} style={{ minWidth: 0, padding: '.5rem', border: '1px solid #cbd5e1', borderRadius: 6 }} />
                </div>
              ))}
            </section>
          ))}
          <button type="button" disabled={busy || summary.selected === 0} onClick={() => void importSelected()} style={{ padding: '.7rem 1rem', border: 0, borderRadius: 8, background: 'var(--c-accent,#c7101b)', color: '#fff', fontWeight: 700, opacity: busy ? .65 : 1 }}>
            {busy ? 'Importando recetas…' : `Importar / actualizar ${summary.selected} pizzas seleccionadas`}
          </button>
        </>
      )}
      {error && <div role="alert" style={{ padding: '.7rem', borderRadius: 7, background: '#fee2e2', color: '#991b1b' }}>{error}</div>}
      {notice && <div role="status" style={{ padding: '.7rem', borderRadius: 7, background: '#dcfce7', color: '#166534' }}>{notice}</div>}
    </div>
  );
}
