import type { ApiClient } from './client';
import type { Business, BusinessTheme } from '../types';

export interface BusinessUpdateInput {
  name: string;
  slug: string;
  phone?: string | null;
  address?: string | null;
  description?: string | null;
  logo_url?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  theme?: BusinessTheme | null;
}

export function businessApi(client: ApiClient) {
  return {
    get: () => client.get<{ business: Business }>('/business'),
    update: (data: BusinessUpdateInput) =>
      client.put<{ business: Business }>('/business', data),
  };
}
