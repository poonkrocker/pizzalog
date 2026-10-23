import type { ApiClient } from './client';
import type {
  CostMarginsResponse,
  DoughCalculation,
  DoughProfile,
  DoughProfileInput,
  SaveRecipeInput,
  SimulationResponse,
  RecipeStudioResponse,
  SaveStudioRecipeInput,
  BusinessCostsResponse,
  BusinessCostInput,
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

export interface SimulateParams {
  cost_delta_pct?: number;
  price_delta_pct?: number;
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
    costMargins: () => client.get<CostMarginsResponse>('/production/cost-margins'),
    saveRecipe: (body: SaveRecipeInput) =>
      client.post<{ success: boolean; product_id: number; name: string; price: number; cost: number }>(
        '/production/recipes',
        body,
      ),
    recipeStudio: () => client.get<RecipeStudioResponse>('/production/recipe-studio'),
    saveStudioRecipe: (body: SaveStudioRecipeInput) =>
      client.post<{ success: boolean; id: number }>('/production/recipe-studio/recipes', body),
    businessCosts: () => client.get<BusinessCostsResponse>('/production/business-costs'),
    saveBusinessCosts: (body: { items: BusinessCostInput[] }) =>
      client.put<{ success: boolean }>('/production/business-costs', body),
    recipeStudio: () => client.get<RecipeStudioResponse>('/production/recipe-studio'),
    saveStudioRecipe: (body: SaveStudioRecipeInput) =>
      client.post<{ success: boolean; id: number }>('/production/recipe-studio/recipes', body),
    businessCosts: () => client.get<BusinessCostsResponse>('/production/business-costs'),
    saveBusinessCosts: (body: { items: BusinessCostInput[] }) =>
      client.put<{ success: boolean }>('/production/business-costs', body),
    simulate: (body: SimulateParams) => client.post<SimulationResponse>('/production/simulate', body),
  };
}
