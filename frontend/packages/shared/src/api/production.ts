import type { ApiClient } from './client';
import type {
  CostMarginsResponse,
  DoughCalculation,
  DoughProfile,
  SimulationResponse,
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
    doughCalculate: (body: DoughCalculateParams) =>
      client.post<{ profile: DoughProfile; units: number; batches: number; calculation: DoughCalculation }>(
        '/production/dough-calculate',
        body,
      ),
    costMargins: () => client.get<CostMarginsResponse>('/production/cost-margins'),
    simulate: (body: SimulateParams) => client.post<SimulationResponse>('/production/simulate', body),
  };
}
