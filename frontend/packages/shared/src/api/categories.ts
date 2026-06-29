import type { ApiClient } from './client';
import type { Category } from '../types';

export function categoriesApi(client: ApiClient) {
  return {
    list: () => client.get<{ categories: Category[] }>('/categories'),
    get: (id: number) => client.get<{ category: Category }>(`/categories/${id}`),
    create: (data: Partial<Category>) =>
      client.post<{ category: Category }>('/categories', data),
    update: (id: number, data: Partial<Category>) =>
      client.put<{ category: Category }>(`/categories/${id}`, data),
    remove: (id: number) => client.delete<{ deleted: boolean }>(`/categories/${id}`),
  };
}
