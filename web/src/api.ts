import type { ParkingSession, ParkingSessionPage, ParkingSpot, ParkingSpotPage, Session, User, WebSocketTicket } from './types';

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

  async webSocketTicket(): Promise<WebSocketTicket> {
    return this.request<WebSocketTicket>('/api/auth/websocket-ticket', { method: 'POST' });
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
    const pageSize = 100;
    const first = await this.request<ParkingSpotPage>('/api/parking-spots?page=1&pageSize=100');
    const pages = Math.ceil(first.total / pageSize);
    if (pages <= 1) return first.items;
    const remaining = await Promise.all(Array.from({ length: pages - 1 }, (_, index) => this.request<ParkingSpotPage>(`/api/parking-spots?page=${index + 2}&pageSize=100`)));
    return [first, ...remaining].flatMap((page) => page.items);
  }

  async checkIn(licensePlate: string, spotId?: string): Promise<ParkingSession> {
    return this.request<ParkingSession>('/api/parking-sessions/check-in', { method: 'POST', body: JSON.stringify({ licensePlate, ...(spotId ? { spotId } : {}) }) });
  }

  async activeSessionForSpot(spotId: string): Promise<ParkingSession | null> {
    const page = await this.request<ParkingSessionPage>('/api/parking-sessions?active=true&page=1&pageSize=100');
    return page.items.find((session) => session.spotId === spotId) ?? null;
  }

  async checkOut(reference: { sessionId: string } | { licensePlate: string }): Promise<ParkingSession> {
    return this.request<ParkingSession>('/api/parking-sessions/check-out', { method: 'POST', body: JSON.stringify(reference) });
  }

  async uploadFloorPlan(yaml: string): Promise<void> {
    await this.request('/api/garage/floor-plan', { method: 'PUT', body: JSON.stringify({ yaml }) });
  }
}

export const api = new ApiClient();

export function eventSocketUrl(ticket: string): string {
  const url = new URL('/api/events', window.location.origin);
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('ticket', ticket);
  return url.toString();
}
