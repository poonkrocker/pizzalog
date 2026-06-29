import type { Role } from '../types';

// El JWT del backend lleva sub (user id), business_id y role. Lo leemos en el
// cliente solo para UI/permisos; la autoridad real es el backend.
export interface TokenPayload {
  sub: number;
  business_id: number;
  role: Role;
  exp?: number;
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as TokenPayload;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string, skewSeconds = 30): boolean {
  const payload = decodeToken(token);
  if (!payload?.exp) return false;
  return Date.now() / 1000 >= payload.exp - skewSeconds;
}
