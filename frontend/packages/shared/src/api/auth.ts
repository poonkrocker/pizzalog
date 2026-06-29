import type { ApiClient } from './client';
import type { User } from '../types';

export function authApi(client: ApiClient) {
  return {
    login: (email: string, password: string) =>
      client.post<{ token: string; user: User }>('/auth/login', { email, password }),
    me: () => client.get<{ user: User }>('/auth/me'),
  };
}
