import type { ApiClient } from './client';
import type { Business, BusinessHour, BusinessTheme, SocialLink } from '../types';

export interface BusinessUpdateInput {
  name: string;
  slug: string;
  phone?: string | null;
  address?: string | null;
  google_maps_url?: string | null;
  description?: string | null;
  logo_url?: string | null;
  accepts_online_orders?: number;
  transfer_alias?: string | null;
  card_surcharge_pct?: number;
  theme?: BusinessTheme | null;
}

export interface BusinessHoursResponse {
  hours: BusinessHour[];
  accepts_online_orders: number;
  is_open_for_orders: boolean;
}

export function businessApi(client: ApiClient) {
  return {
    get: () => client.get<{ business: Business }>('/business'),
    update: (data: BusinessUpdateInput) =>
      client.put<{ business: Business }>('/business', data),

    // Horarios y redes: reemplazo total en cada PUT (mismo patrón que variantes).
    hours: () => client.get<BusinessHoursResponse>('/business/hours'),
    updateHours: (hours: BusinessHour[]) =>
      client.put<BusinessHoursResponse>('/business/hours', { hours }),

    socialLinks: () => client.get<{ social_links: SocialLink[] }>('/business/social-links'),
    updateSocialLinks: (links: Array<Pick<SocialLink, 'platform' | 'url'>>) =>
      client.put<{ social_links: SocialLink[] }>('/business/social-links', {
        social_links: links,
      }),
  };
}
