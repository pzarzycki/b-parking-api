import { useEffect, useRef, useState } from 'react';
import { ApiError, ApiClient, eventSocketUrl } from './api';
import type { LiveEvent } from './types';

export type LiveConnection = 'connecting' | 'connected' | 'reconnecting';

function parseLiveEvent(data: unknown): LiveEvent | null {
  if (typeof data !== 'string') return null;
  try {
    const event = JSON.parse(data) as Partial<LiveEvent>;
    return typeof event.id === 'string' && typeof event.type === 'string' && typeof event.occurredAt === 'string' && event.data && typeof event.data === 'object'
      ? event as LiveEvent
      : null;
  } catch {
    return null;
  }
}

export function useLiveGarageEvents(client: ApiClient, onEvent: (event: LiveEvent) => void, onUnauthorized: () => void): LiveConnection {
  const [connection, setConnection] = useState<LiveConnection>('connecting');
  const latestEvent = useRef(onEvent);
  const latestUnauthorized = useRef(onUnauthorized);
  latestEvent.current = onEvent;
  latestUnauthorized.current = onUnauthorized;

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | undefined;
    let retryTimer: number | undefined;
    let attempts = 0;

    const retry = () => {
      if (disposed) return;
      setConnection('reconnecting');
      retryTimer = window.setTimeout(connect, Math.min(1000 * 2 ** attempts++, 15000));
    };

    const connect = async () => {
      if (disposed) return;
      setConnection(attempts ? 'reconnecting' : 'connecting');
      try {
        const { ticket } = await client.webSocketTicket();
        if (disposed) return;
        socket = new WebSocket(eventSocketUrl(ticket));
        socket.addEventListener('message', (message) => {
          const event = parseLiveEvent(message.data);
          if (!event) return;
          if (event.type === 'ready') {
            attempts = 0;
            setConnection('connected');
          }
          latestEvent.current(event);
        });
        socket.addEventListener('close', () => retry());
        socket.addEventListener('error', () => socket?.close());
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) latestUnauthorized.current();
        else retry();
      }
    };

    void connect();
    return () => {
      disposed = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, [client]);

  return connection;
}

export { parseLiveEvent };
