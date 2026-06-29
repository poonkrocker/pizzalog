import type { ApiClient } from './client';
import type { KitchenRound, RoundStatus } from '../types';

export function kitchenApi(client: ApiClient) {
  return {
    rounds: (statuses?: RoundStatus[]) =>
      client.get<{ rounds: KitchenRound[] }>(
        `/kitchen/rounds${statuses?.length ? `?status=${statuses.join(',')}` : ''}`,
      ),
    setStatus: (roundId: number, status: RoundStatus) =>
      client.put<{ round: KitchenRound }>(`/kitchen/rounds/${roundId}/status`, { status }),
    print: (roundId: number) =>
      client.post<{ round: KitchenRound }>(`/kitchen/rounds/${roundId}/print`),
  };
}
