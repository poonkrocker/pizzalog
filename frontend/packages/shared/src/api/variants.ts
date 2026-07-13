import type { ApiClient } from './client';
import type { ProductOption, ProductVariant } from '../types';

export interface OptionInput {
  name: string;
  values: string[];
}

export interface VariantUpdateInput {
  id: number;
  price: number;
  sku?: string | null;
  is_active?: number;
  sort_order?: number;
}

type VariantData = { options: ProductOption[]; variants: ProductVariant[] };

export function variantsApi(client: ApiClient) {
  return {
    get: (productId: number) => client.get<VariantData>(`/products/${productId}/variants`),
    setOptions: (productId: number, options: OptionInput[]) =>
      client.put<VariantData>(`/products/${productId}/options`, { options }),
    updateVariants: (productId: number, variants: VariantUpdateInput[]) =>
      client.put<VariantData>(`/products/${productId}/variants`, { variants }),
  };
}
