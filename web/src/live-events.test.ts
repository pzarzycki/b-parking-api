import { describe, expect, it } from 'vitest';
import { parseLiveEvent } from './live-events';

describe('parseLiveEvent', () => {
  it('accepts a live spot status event', () => {
    expect(parseLiveEvent(JSON.stringify({ id: 'event-1', type: 'spot.status_changed', occurredAt: '2026-01-01T00:00:00Z', data: { id: 'G-A01', status: 'occupied' } }))).toMatchObject({ type: 'spot.status_changed', data: { status: 'occupied' } });
  });

  it('ignores malformed messages', () => {
    expect(parseLiveEvent('{not json')).toBeNull();
    expect(parseLiveEvent(JSON.stringify({ type: 'ready' }))).toBeNull();
    expect(parseLiveEvent(JSON.stringify({ id: 'event-1', type: 'unknown', occurredAt: '2026-01-01T00:00:00Z', data: {} }))).toBeNull();
  });
});
