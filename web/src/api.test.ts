import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from './api';

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
    await expect(new ApiClient('token-123').checkOut('ABC 123')).rejects.toEqual(expect.objectContaining({ status: 404, message: 'No active session found.' }));
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
});
