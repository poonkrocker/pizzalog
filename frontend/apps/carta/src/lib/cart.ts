import { useCallback, useEffect, useState } from 'react';
import type { ComboSelection, Product } from '../types';

/**
 * Una línea del carrito. `key` identifica la combinación exacta
 * (producto + variante + elecciones del combo): dos pizzas grandes se suman en
 * una línea, pero "grande" y "chica" son líneas distintas, y dos combos con
 * sabores distintos también.
 */
export interface CartLine {
  key: string;
  product_id: number;
  name: string;          // ya incluye la variante o mitad: "Pizza 1/2 Napolitana + 1/2 Fugazzeta"
  unit_price: number;    // precio de la variante si hay; si no, del producto o mitad más cara
  quantity: number;
  image_url: string | null;
  variant_id?: number;
  half_product_id?: number;
  extra_product_ids?: number[];
  combo_selections?: ComboSelection[];
  combo_labels?: string[]; // "Muzzarella", "Fugazzeta"… solo para mostrar
  notes?: string;
}

const VERSION = 1;
const storageKey = (slug: string) => `carta_cart_v${VERSION}_${slug}`;

function load(slug: string): CartLine[] {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return (parsed as CartLine[]).map((l) => ({
      ...l,
      unit_price: Number(l.unit_price) || 0,
      quantity: Number(l.quantity) || 1,
    }));
  } catch {
    return [];
  }
}

export function lineKey(
  product: Product,
  variantId: number | undefined,
  selections: ComboSelection[] | undefined,
  halfProductId?: number,
  extraProductIds?: number[],
): string {
  const combo = (selections ?? [])
    .map((s) => `${s.group_id}:${[...s.product_ids].sort((a, b) => a - b).join('-')}`)
    .sort()
    .join('|');
  return `${product.id}/${variantId ?? 0}/${halfProductId ?? 0}/${combo}/${(extraProductIds ?? []).slice().sort((a, b) => a - b).join(',')}`;
}

/**
 * El carrito sobrevive al refresh y a cerrar el navegador (localStorage), por
 * slug: si el mismo teléfono mira dos locales, no se le mezclan los pedidos.
 */
export function useCart(slug: string) {
  const [lines, setLines] = useState<CartLine[]>(() => load(slug));

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(slug), JSON.stringify(lines));
    } catch {
      // Modo incógnito o storage lleno: el carrito sigue andando en memoria.
    }
  }, [slug, lines]);

  const add = useCallback((line: Omit<CartLine, 'quantity'>, qty = 1) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.key === line.key);
      if (i === -1) return [...prev, { ...line, quantity: qty }];
      return prev.map((l, idx) => (idx === i ? { ...l, quantity: l.quantity + qty } : l));
    });
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    setLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.key !== key)
        : prev.map((l) => (l.key === key ? { ...l, quantity: qty } : l)),
    );
  }, []);

  const remove = useCallback((key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const count = lines.reduce((n, l) => n + (Number(l.quantity) || 0), 0);
  const total = lines.reduce((n, l) => n + (Number(l.unit_price) || 0) * (Number(l.quantity) || 0), 0);

  return { lines, add, setQty, remove, clear, count, total };
}
