import type { ApiClient } from './client';
import type { User } from '../types';

export function authApi(client: ApiClient) {
  return {
    login: (email: string, password: string, app?: string) =>
      client.post<{ token: string; user: User }>('/auth/login', {
        email,
        username: email,
        password,
        ...(app ? { app } : {}),
      }),
    me: () => client.get<{ user: User }>('/auth/me'),
    changePassword: (current_password: string, new_password: string) =>
      client.post<{ changed: boolean; message: string }>('/auth/change-password', {
        current_password,
        new_password,
      }),
  };
}
