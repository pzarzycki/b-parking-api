import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, eventSocketUrl } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('ApiClient', () => {
  it('uses the selected-space check-in contract and bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'session-1', licensePlate: 'ABC 123', spotId: 'G-A01', checkedInAt: '2026-01-01T00:00:00Z', checkedOutAt: null }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new ApiClient('token-123').checkIn('ABC 123', 'G-A01')).resolves.toMatchObject({ spotId: 'G-A01' });
    expect(fetchMock).toHaveBeenCalledWith('/api/parking-sessions/check-in', expect.objectContaining({ method: 'POST' }));
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(request.headers).toBeInstanceOf(Headers);
    expect((request.headers as Headers).get('Authorization')).toBe('Bearer token-123');
    expect(request.body).toBe(JSON.stringify({ licensePlate: 'ABC 123', spotId: 'G-A01' }));
  });

  it('uses plate checkout and preserves API problem details', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'No active session found.' }), { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new ApiClient('token-123').checkOut({ licensePlate: 'ABC 123' })).rejects.toEqual(expect.objectContaining({ status: 404, message: 'No active session found.' }));
    expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBe(JSON.stringify({ licensePlate: 'ABC 123' }));
  });

  it('collects every paginated parking-space result', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'A' }], page: 1, pageSize: 100, total: 101 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'B' }], page: 2, pageSize: 100, total: 101 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new ApiClient('token-123').spots()).resolves.toEqual([{ id: 'A' }, { id: 'B' }]);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/api/parking-spots?page=1&pageSize=100', '/api/parking-spots?page=2&pageSize=100']);
  });

  it('finds an active vehicle session by its selected parking spot', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ id: 'session-1', spotId: 'G-A02' }], page: 1, pageSize: 100, total: 1 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new ApiClient('token-123').activeSessionForSpot('G-A02')).resolves.toMatchObject({ id: 'session-1', spotId: 'G-A02' });
    expect(fetchMock).toHaveBeenCalledWith('/api/parking-sessions?active=true&page=1&pageSize=100', expect.anything());
  });

  it('exchanges the bearer token for a one-time WebSocket ticket', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ticket: 'ticket-1', expiresAt: '2026-01-01T00:01:00Z' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new ApiClient('token-123').webSocketTicket()).resolves.toMatchObject({ ticket: 'ticket-1' });
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/websocket-ticket', expect.objectContaining({ method: 'POST' }));
  });

  it('uses the current origin and secure WebSocket protocol when building an event URL', () => {
    vi.stubGlobal('window', { location: { origin: 'https://parking.example.test', protocol: 'https:' } });
    expect(eventSocketUrl('ticket value')).toBe('wss://parking.example.test/api/events?ticket=ticket+value');
  });
});
