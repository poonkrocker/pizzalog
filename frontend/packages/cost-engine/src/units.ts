import {
  CostEngineValidationError,
  type Dimension,
  type Ingredient,
  type UnitCode,
} from './types.js';

interface UnitDefinition {
  code: UnitCode;
  dimension: Dimension;
  /** Factor hacia la unidad base canónica de su dimensión (g para masa, ml para volumen, unit para conteo) */
  toCanonicalFactor: number;
}

const UNIT_CATALOG: Record<string, UnitDefinition> = {
  // Masa (canónica: g)
  mg: { code: 'mg', dimension: 'mass', toCanonicalFactor: 0.001 },
  g: { code: 'g', dimension: 'mass', toCanonicalFactor: 1 },
  kg: { code: 'kg', dimension: 'mass', toCanonicalFactor: 1000 },
  oz: { code: 'oz', dimension: 'mass', toCanonicalFactor: 28.349523125 },
  lb: { code: 'lb', dimension: 'mass', toCanonicalFactor: 453.59237 },

  // Volumen (canónica: ml)
  ml: { code: 'ml', dimension: 'volume', toCanonicalFactor: 1 },
  cc: { code: 'cc', dimension: 'volume', toCanonicalFactor: 1 },
  l: { code: 'l', dimension: 'volume', toCanonicalFactor: 1000 },
  L: { code: 'L', dimension: 'volume', toCanonicalFactor: 1000 },
  fl_oz_us: { code: 'fl_oz_us', dimension: 'volume', toCanonicalFactor: 29.5735295625 },
  gal_us: { code: 'gal_us', dimension: 'volume', toCanonicalFactor: 3785.411784 },

  // Conteo (canónica: unit)
  unit: { code: 'unit', dimension: 'count', toCanonicalFactor: 1 },
  u: { code: 'u', dimension: 'count', toCanonicalFactor: 1 },
  dozen: { code: 'dozen', dimension: 'count', toCanonicalFactor: 12 },
  docena: { code: 'docena', dimension: 'count', toCanonicalFactor: 12 },
};

export function getUnitDefinition(unit: string): UnitDefinition {
  const trimmed = (unit ?? '').trim();
  const def = UNIT_CATALOG[trimmed] ?? UNIT_CATALOG[trimmed.toLowerCase()];
  if (!def) {
    throw new CostEngineValidationError(
      'UNKNOWN_UNIT',
      `Unidad de medida desconocida o no soportada: "${unit}"`,
      { unit }
    );
  }
  return def;
}

/**
 * Convierte una cantidad desde `fromUnit` hacia `toUnit`.
 * - Misma dimensión: conversión directa exacta.
 * - Masa ↔ Volumen: exige `density_g_per_ml > 0` explícita en el ingrediente.
 * - Conteo ↔ Masa: exige `unit_weight_g > 0` explícito en el ingrediente.
 * - De lo contrario lanza CostEngineValidationError (nunca devuelve la cantidad sin convertir).
 */
export function convertQuantity(
  quantity: number,
  fromUnit: string,
  toUnit: string,
  ingredient?: Pick<Ingredient, 'name' | 'density_g_per_ml' | 'unit_weight_g'>
): number {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new CostEngineValidationError(
      'INCOMPATIBLE_UNITS',
      `La cantidad a convertir debe ser un número finito no negativo (recibido: ${quantity})`,
      { quantity, fromUnit, toUnit }
    );
  }

  const fromDef = getUnitDefinition(fromUnit);
  const toDef = getUnitDefinition(toUnit);

  if (fromDef.dimension === toDef.dimension) {
    if (fromDef.code === toDef.code || fromDef.toCanonicalFactor === toDef.toCanonicalFactor) {
      return quantity;
    }
    const canonicalValue = quantity * fromDef.toCanonicalFactor;
    return canonicalValue / toDef.toCanonicalFactor;
  }

  // Conversión Masa ↔ Volumen (requiere densidad g/ml explícita)
  if (
    (fromDef.dimension === 'mass' && toDef.dimension === 'volume') ||
    (fromDef.dimension === 'volume' && toDef.dimension === 'mass')
  ) {
    const density = ingredient?.density_g_per_ml;
    if (density === undefined || density === null || !Number.isFinite(density) || density <= 0) {
      const label = ingredient?.name ? ` para "${ingredient.name}"` : '';
      throw new CostEngineValidationError(
        'INCOMPATIBLE_UNITS_MISSING_DENSITY',
        `No se puede convertir entre ${fromUnit} (${fromDef.dimension}) y ${toUnit} (${toDef.dimension})${label} sin densidad explícita (density_g_per_ml > 0).`,
        { fromUnit, toUnit, ingredient: ingredient?.name }
      );
    }

    if (fromDef.dimension === 'mass' && toDef.dimension === 'volume') {
      const grams = quantity * fromDef.toCanonicalFactor;
      const ml = grams / density;
      return ml / toDef.toCanonicalFactor;
    } else {
      const ml = quantity * fromDef.toCanonicalFactor;
      const grams = ml * density;
      return grams / toDef.toCanonicalFactor;
    }
  }

  // Conversión Conteo ↔ Masa (requiere peso por unidad en gramos explícito)
  if (
    (fromDef.dimension === 'count' && toDef.dimension === 'mass') ||
    (fromDef.dimension === 'mass' && toDef.dimension === 'count')
  ) {
    const unitWeightG = ingredient?.unit_weight_g;
    if (unitWeightG === undefined || unitWeightG === null || !Number.isFinite(unitWeightG) || unitWeightG <= 0) {
      const label = ingredient?.name ? ` para "${ingredient.name}"` : '';
      throw new CostEngineValidationError(
        'INCOMPATIBLE_UNITS',
        `No se puede convertir entre ${fromUnit} (${fromDef.dimension}) y ${toUnit} (${toDef.dimension})${label} sin equivalencia unit_weight_g > 0.`,
        { fromUnit, toUnit, ingredient: ingredient?.name }
      );
    }

    if (fromDef.dimension === 'count' && toDef.dimension === 'mass') {
      const units = quantity * fromDef.toCanonicalFactor;
      const grams = units * unitWeightG;
      return grams / toDef.toCanonicalFactor;
    } else {
      const grams = quantity * fromDef.toCanonicalFactor;
      const units = grams / unitWeightG;
      return units / toDef.toCanonicalFactor;
    }
  }

  throw new CostEngineValidationError(
    'INCOMPATIBLE_UNITS',
    `Dimensiones incompatibles entre "${fromUnit}" (${fromDef.dimension}) y "${toUnit}" (${toDef.dimension}).`,
    { fromUnit, toUnit }
  );
}
