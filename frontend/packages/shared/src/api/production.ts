import type { ApiClient } from './client';
import type {
  DoughCalculation,
  DoughProfile,
  DoughProfileInput,
  RecipeStudioResponse,
  SaveStudioRecipeInput,
  BusinessCostsResponse,
  BusinessCostInput,
} from '../types';

export interface DoughCalculateParams {
  profile_id?: number;
  units: number;
  batches?: number;
}


export function productionApi(client: ApiClient) {
  return {
    doughProfiles: () => client.get<{ profiles: DoughProfile[] }>('/production/dough-profiles'),
    createDoughProfile: (body: DoughProfileInput) =>
      client.post<{ profile: DoughProfile }>('/production/dough-profiles', body),
    updateDoughProfile: (id: number, body: DoughProfileInput) =>
      client.put<{ profile: DoughProfile }>(`/production/dough-profiles/${id}`, body),
    deleteDoughProfile: (id: number) =>
      client.delete<{ deleted: boolean }>(`/production/dough-profiles/${id}`),
    doughCalculate: (body: DoughCalculateParams) =>
      client.post<{ profile: DoughProfile; units: number; batches: number; calculation: DoughCalculation }>(
        '/production/dough-calculate',
        body,
      ),
    recipeStudio: () => client.get<RecipeStudioResponse>('/production/recipe-studio'),
    importLegacyRecipes: () => client.post<{ success: boolean; imported_count: number }>('/production/recipe-studio/import-legacy', {}),
    saveStudioRecipe: (body: SaveStudioRecipeInput) =>
      client.post<{ success: boolean; id: number }>('/production/recipe-studio/recipes', body),
    businessCosts: () => client.get<BusinessCostsResponse>('/production/business-costs'),
    saveBusinessCosts: (body: { items: BusinessCostInput[] }) =>
      client.put<{ success: boolean }>('/production/business-costs', body),
  };
}
