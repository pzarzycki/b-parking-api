const apiUrl = process.env.API_URL ?? 'http://localhost:3000';

type AuthToken = { token: string };
type WebSocketTicket = { ticket: string };
type ParkingSpot = { id: string };
type LiveEvent = { type: string; data: { id?: string; status?: string } };

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, init);
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${path} returned ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

const login = await json<AuthToken>('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin' })
});
const authorization = { authorization: `Bearer ${login.token}` };
const ticket = await json<WebSocketTicket>('/api/auth/websocket-ticket', { method: 'POST', headers: authorization });
const spots = await json<{ items: ParkingSpot[] }>('/api/parking-spots/available', { headers: authorization });
const spot = spots.items[0];
if (!spot) throw new Error('Expected an available parking spot for the WebSocket test.');

const websocketUrl = `${apiUrl.replace(/^http/, 'ws')}/api/events?ticket=${encodeURIComponent(ticket.ticket)}`;
const socket = new WebSocket(websocketUrl);
let changed = false;

try {
  const event = await new Promise<LiveEvent>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for a WebSocket parking-spot event.')), 5_000);
    socket.addEventListener('message', (message) => {
      const event = JSON.parse(String(message.data)) as LiveEvent;
      if (event.type === 'ready') {
        void json(`/api/parking-spots/${spot.id}`, {
          method: 'PATCH',
          headers: { ...authorization, 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'occupied', reason: 'integration WebSocket test' })
        }).then(() => { changed = true; }).catch(reject);
      }
      if (event.type === 'spot.status_changed') {
        clearTimeout(timeout);
        resolve(event);
      }
    });
    socket.addEventListener('error', () => reject(new Error('WebSocket connection failed.')));
  });
  if (event.data.id !== spot.id || event.data.status !== 'occupied') throw new Error('Received an unexpected WebSocket spot-status event.');
} finally {
  if (changed) {
    await json(`/api/parking-spots/${spot.id}`, {
      method: 'PATCH',
      headers: { ...authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'available' })
    });
  }
  socket.close();
}

console.log('WebSocket integration assertion passed.');
