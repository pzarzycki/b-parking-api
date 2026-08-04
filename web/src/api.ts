import type { FloorPlan, ParkingSession, ParkingSpot, Session, User } from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class ApiClient {
  constructor(private token?: string) {}

  withToken(token?: string) {
    return new ApiClient(token);
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
    if (options.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(path, { ...options, headers });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { detail?: string; title?: string } | null;
      throw new ApiError(response.status, body?.detail ?? body?.title ?? `Request failed (${response.status}).`);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  async login(username: string, password: string): Promise<Session> {
    return this.request<Session>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  }

  async currentUser(): Promise<User> {
    return this.request<User>('/api/auth/me');
  }

  async floorPlan(): Promise<string> {
    const response = await fetch('/api/garage/floor-plan', { headers: this.token ? { Authorization: `Bearer ${this.token}` } : undefined });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { detail?: string } | null;
      throw new ApiError(response.status, body?.detail ?? 'Unable to load floor plan.');
    }
    return response.text();
  }

  async spots(): Promise<ParkingSpot[]> {
    return this.request<ParkingSpot[]>('/api/parking-spots');
  }

  async checkIn(licensePlate: string, spotId?: string): Promise<ParkingSession> {
    return this.request<ParkingSession>('/api/parking-sessions/check-in', { method: 'POST', body: JSON.stringify({ licensePlate, ...(spotId ? { spotId } : {}) }) });
  }

  async checkOut(licensePlate: string): Promise<ParkingSession> {
    return this.request<ParkingSession>('/api/parking-sessions/check-out', { method: 'POST', body: JSON.stringify({ licensePlate }) });
  }

  async uploadFloorPlan(yaml: string): Promise<void> {
    await this.request('/api/garage/floor-plan', { method: 'PUT', body: JSON.stringify({ yaml }) });
  }
}

export const api = new ApiClient();
