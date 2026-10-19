import { useEffect, useMemo, useState } from 'react';
import { formatARS, type CostMarginProduct, type RecipeIngredientInput, type SupplyItem } from '@pizzalog/shared';
import { Button, Field, Input, Modal, Select } from '@/ui';
import { useSaveRecipe } from './hooks';

export function RecipeModal({
  open,
  onClose,
  product,
  supplies = [],
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  product?: CostMarginProduct | null;
  supplies?: SupplyItem[];
  onSaved?: () => void;
}) {
  const isEditing = Boolean(product);
  const saveMutation = useSaveRecipe();

  const [name, setName] = useState('');
  const [categoryName, setCategoryName] = useState('Pizza');
  const [price, setPrice] = useState<number>(14000);
  const [ingredients, setIngredients] = useState<RecipeIngredientInput[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Mapeo rápido de costo unitario por nombre de supply
  const supplyPriceMap = useMemo(() => {
    const map = new Map<string, { unit: string; cost: number; category: string }>();
    for (const s of supplies) {
      map.set(s.name.toLowerCase().trim(), {
        unit: s.unit || 'kg',
        cost: s.cost || 0,
        category: s.category || 'otro',
      });
    }
    return map;
  }, [supplies]);

  useEffect(() => {
    if (product) {
      setName(product.name);
      setCategoryName(product.category || 'Pizza');
      setPrice(product.price);
      setIngredients(
        product.ingredients.map((ing) => ({
          name: ing.name,
          category: ing.category,
          quantity: ing.quantity,
          unit: ing.unit,
          unit_cost: ing.unit_cost,
        })),
      );
    } else {
      setName('');
      setCategoryName('Pizza');
      setPrice(14000);
      // Pre-cargar ingredientes básicos sugeridos para una pizza
      setIngredients([
        { name: 'Masa', category: 'masa', quantity: 0.22, unit: 'kg', unit_cost: 932.3 },
        { name: 'Muzza', category: 'queso', quantity: 0.1, unit: 'kg', unit_cost: 10250 },
        { name: 'Salsa', category: 'salsa', quantity: 0.16, unit: 'kg', unit_cost: 4200 },
      ]);
    }
    setError(null);
  }, [product, open]);

  // Agregar fila de ingrediente
  const handleAddIngredient = () => {
    setIngredients((prev) => [
      ...prev,
      { name: '', category: 'otro', quantity: 0.05, unit: 'kg', unit_cost: 0 },
    ]);
  };

  // Quitar fila
  const handleRemoveIngredient = (index: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  // Actualizar campo de ingrediente
  const handleIngredientChange = (index: number, field: keyof RecipeIngredientInput, value: any) => {
    setIngredients((prev) => {
      const copy = [...prev];
      const item = { ...copy[index], [field]: value };

      // Si cambia el nombre del ingrediente y coincide con un supply conocido, auto-asignar unidad y costo
      if (field === 'name') {
        const found = supplyPriceMap.get(String(value).toLowerCase().trim());
        if (found) {
          item.unit = found.unit;
          item.unit_cost = found.cost;
        }
      }

      copy[index] = item as RecipeIngredientInput;
      return copy;
    });
  };

  // Cálculo en tiempo real del costo de la receta
  const totalCost = useMemo(() => {
    return ingredients.reduce((sum, ing) => {
      const uCost = ing.unit_cost || (supplyPriceMap.get(ing.name.toLowerCase().trim())?.cost ?? 0);
      return sum + (Number(ing.quantity) || 0) * uCost;
    }, 0);
  }, [ingredients, supplyPriceMap]);

  const margin = price - totalCost;
  const foodCostPct = price > 0 ? Math.round((totalCost / price) * 1000) / 10 : 0;
  const suggestedMinPrice = totalCost > 0 ? Math.ceil(totalCost / 0.3 / 100) * 100 : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Por favor ingresá el nombre del producto o pizza.');
      return;
    }

    const validIngredients = ingredients.filter((i) => i.name.trim() !== '' && i.quantity > 0);
    if (validIngredients.length === 0) {
      setError('Por favor agregá al menos 1 ingrediente con cantidad mayor a 0.');
      return;
    }

    try {
      await saveMutation.mutateAsync({
        product_id: product?.id,
        name: name.trim(),
        category_name: categoryName.trim() || 'Pizza',
        price: Number(price) || 0,
        ingredients: validIngredients,
      });

      if (onSaved) onSaved();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error al guardar la receta.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? `Editar Receta: ${product?.name}` : '🍕 Nueva Receta / Pizza'}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
            {ingredients.length} ingredientes en la receta
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleSubmit}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Guardando...' : '💾 Guardar Receta & Costos'}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {error && (
          <div style={{ padding: '0.6rem 0.8rem', background: '#fee2e2', color: '#991b1b', borderRadius: '6px', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.75rem' }}>
          <Field label="Nombre del Producto / Pizza">
            <Input
              placeholder="ej: Pizza Detroit, Margherita..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>

          <Field label="Categoría">
            <Input
              placeholder="Pizza, Sandwiches..."
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              required
            />
          </Field>

          <Field label="Precio de Venta ($)">
            <Input
              type="number"
              step="100"
              min="0"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              required
            />
          </Field>
        </div>

        {/* Resumen de Costeo y Márgenes en tiempo real */}
        <div
          style={{
            background: foodCostPct <= 25 ? '#f0fdf4' : foodCostPct <= 30 ? '#fefce8' : '#fef2f2',
            border: `1px solid ${foodCostPct <= 25 ? '#bbf7d0' : foodCostPct <= 30 ? '#fef08a' : '#fecaca'}`,
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '0.75rem',
          }}
        >
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Costo Receta</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>
              {formatARS(totalCost)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Margen Bruto</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: margin > 0 ? '#166534' : '#991b1b' }}>
              {formatARS(margin)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Food Cost %</div>
            <div
              style={{
                fontSize: '1.25rem',
                fontWeight: 800,
                color: foodCostPct <= 25 ? '#166534' : foodCostPct <= 30 ? '#854d0e' : '#991b1b',
              }}
            >
              {foodCostPct}%
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Precio Mín. Sugerido</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--c-accent, #e63946)' }}>
              {formatARS(suggestedMinPrice)}
            </div>
          </div>
        </div>

        {/* Lista de Ingredientes / Escandallo */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>
              Composición de Ingredientes (por unidad)
            </span>
            <button
              type="button"
              onClick={handleAddIngredient}
              style={{
                padding: '0.35rem 0.75rem',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: 600,
              }}
            >
              + Agregar Ingrediente
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '340px', overflowY: 'auto', paddingRight: '0.2rem' }}>
            {ingredients.map((ing, idx) => {
              const uCost = ing.unit_cost || (supplyPriceMap.get(ing.name.toLowerCase().trim())?.cost ?? 0);
              const subtotal = (Number(ing.quantity) || 0) * uCost;

              return (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 0.8fr 1fr 1fr 36px',
                    gap: '0.5rem',
                    alignItems: 'center',
                    background: '#f8fafc',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  {/* Selector o entrada de Insumo */}
                  <div>
                    <input
                      list={`supplies-list-${idx}`}
                      placeholder="Insumo (ej: Muzza)"
                      value={ing.name}
                      onChange={(e) => handleIngredientChange(idx, 'name', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.35rem 0.5rem',
                        borderRadius: '4px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.85rem',
                      }}
                      required
                    />
                    <datalist id={`supplies-list-${idx}`}>
                      {supplies.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.category} ({formatARS(s.cost)}/{s.unit})
                        </option>
                      ))}
                    </datalist>
                  </div>

                  {/* Cantidad */}
                  <div>
                    <input
                      type="number"
                      step="0.001"
                      min="0.0001"
                      placeholder="Cant."
                      value={ing.quantity}
                      onChange={(e) => handleIngredientChange(idx, 'quantity', Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '0.35rem 0.5rem',
                        borderRadius: '4px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.85rem',
                        textAlign: 'right',
                      }}
                      required
                    />
                  </div>

                  {/* Unidad */}
                  <div>
                    <select
                      value={ing.unit}
                      onChange={(e) => handleIngredientChange(idx, 'unit', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.35rem 0.3rem',
                        borderRadius: '4px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.82rem',
                      }}
                    >
                      <option value="kg">kg</option>
                      <option value="g">g</option>
                      <option value="L">L</option>
                      <option value="cc">cc</option>
                      <option value="u">u</option>
                    </select>
                  </div>

                  {/* Costo Unitario */}
                  <div style={{ fontSize: '0.78rem', color: '#64748b', textAlign: 'right' }}>
                    @{formatARS(uCost)}/{ing.unit}
                  </div>

                  {/* Subtotal */}
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, textAlign: 'right', color: '#1e293b' }}>
                    {formatARS(subtotal)}
                  </div>

                  {/* Eliminar */}
                  <div style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleRemoveIngredient(idx)}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '1rem',
                      }}
                      title="Quitar ingrediente"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </form>
    </Modal>
  );
}
