import type { LoginRequest, LoginResponse } from '../types/api';
import { AUTH_TOKEN_KEY } from '../constants';

export async function loginApi(credentials: LoginRequest): Promise<LoginResponse> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials)
  });

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || 'Identifiants incorrects.');
  }

  const data: LoginResponse & { token?: string } = await res.json();

  if (data.token) {
    localStorage.setItem(AUTH_TOKEN_KEY, data.token);
  }

  return data;
}
