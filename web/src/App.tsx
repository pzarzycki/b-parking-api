import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ApiClient, ApiError, api } from './api';
import { parseFloorPlan } from './floor-plan';
import type { FloorPlan, FloorPlanFloor, ParkingSpot, Session } from './types';

const SESSION_KEY = 'parkline.session';

function storedSession(): Session | null {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as Session | null; } catch { return null; }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function App() {
  const [session, setSession] = useState<Session | null>(storedSession);
  const signIn = (next: Session) => { sessionStorage.setItem(SESSION_KEY, JSON.stringify(next)); setSession(next); };
  const signOut = () => { sessionStorage.removeItem(SESSION_KEY); setSession(null); };
  return <BrowserRouter>{session ? <AuthenticatedApp session={session} signOut={signOut} /> : <LoginPage onSignIn={signIn} />}</BrowserRouter>;
}

function LoginPage({ onSignIn }: { onSignIn: (session: Session) => void }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setLoading(true);
    try { onSignIn(await api.login(username, password)); } catch (cause) { setError(errorMessage(cause)); } finally { setLoading(false); }
  };
  return <main className="login-shell"><section className="login-card"><div className="brand-mark">P</div><p className="eyebrow">PARKLINE OPERATIONS</p><h1>Garage operations,<br />at a glance.</h1><p className="muted">Sign in to view live availability and manage vehicle flow.</p><form onSubmit={submit} className="stack"><label>Username<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button></form><p className="hint">Local first-run credentials: <code>admin</code> / <code>admin</code></p></section></main>;
}

function AuthenticatedApp({ session, signOut }: { session: Session; signOut: () => void }) {
  const [navOpen, setNavOpen] = useState(false);
  const client = useMemo(() => api.withToken(session.token), [session.token]);
  return <div className="app-shell"><Sidebar admin={session.user.role === 'admin'} open={navOpen} close={() => setNavOpen(false)} /><main className="app-main"><TopBar user={session.user.username} onMenu={() => setNavOpen(true)} signOut={signOut} /><Routes><Route path="/" element={<Dashboard client={client} onUnauthorized={signOut} />} /><Route path="/layout" element={session.user.role === 'admin' ? <LayoutPage client={client} /> : <Navigate to="/" replace />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></main></div>;
}

function Sidebar({ admin, open, close }: { admin: boolean; open: boolean; close: () => void }) {
  const location = useLocation();
  return <><button className={open ? 'nav-scrim visible' : 'nav-scrim'} aria-label="Close navigation" onClick={close} /><aside className={`sidebar ${open ? 'open' : ''}`}><div className="sidebar-brand"><div className="brand-mark small">P</div><span>Parkline</span></div><nav><p className="nav-heading">OPERATIONS</p><Link className={location.pathname === '/' ? 'nav-link active' : 'nav-link'} to="/" onClick={close}><span>▦</span> Garage</Link>{admin && <><p className="nav-heading admin-heading">ADMINISTRATION</p><Link className={location.pathname === '/layout' ? 'nav-link active' : 'nav-link'} to="/layout" onClick={close}><span>⌘</span> Layout</Link></>}</nav><div className="sidebar-footer"><span className="live-dot" /> API connected</div></aside></>;
}

function TopBar({ user, onMenu, signOut }: { user: string; onMenu: () => void; signOut: () => void }) {
  return <header className="top-bar"><button className="mobile-menu" onClick={onMenu} aria-label="Open navigation">☰</button><div className="top-bar-title"><span>Parking operations</span><small>Live garage status</small></div><div className="user-menu"><span className="avatar">{user.slice(0, 1).toUpperCase()}</span><span>{user}</span><button className="text-button" onClick={signOut}>Sign out</button></div></header>;
}

function Dashboard({ client, onUnauthorized }: { client: ApiClient; onUnauthorized: () => void }) {
  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [floorId, setFloorId] = useState('');
  const [filter, setFilter] = useState<'all' | 'available' | 'occupied'>('all');
  const [selected, setSelected] = useState<ParkingSpot | null>(null);
  const [dialog, setDialog] = useState<'check-in' | 'check-out' | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const load = async (): Promise<ParkingSpot[] | undefined> => {
    setError('');
    try {
      const [yaml, nextSpots] = await Promise.all([client.floorPlan(), client.spots()]);
      const nextPlan = parseFloorPlan(yaml);
      setPlan(nextPlan); setSpots(nextSpots);
      setFloorId((current) => nextPlan.floors.some((floor) => floor.id === current) ? current : nextPlan.floors[0].id);
      setSelected((current) => nextSpots.find((spot) => spot.id === current?.id) ?? null);
      return nextSpots;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onUnauthorized(); else setError(errorMessage(cause));
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); const poll = window.setInterval(() => void load(), 30000); return () => window.clearInterval(poll); }, [client]);
  const floor = plan?.floors.find((item) => item.id === floorId) ?? null;
  const floorSpots = spots.filter((spot) => spot.floorId === floorId);
  const counts = { total: spots.length, available: spots.filter((spot) => spot.status === 'available').length, occupied: spots.filter((spot) => spot.status === 'occupied').length };
  const filteredIds = new Set(floorSpots.filter((spot) => filter === 'all' || spot.status === filter).map((spot) => spot.id));
  return <section className="page dashboard"><div className="page-heading"><div><p className="eyebrow">LIVE OVERVIEW</p><h1>{plan?.garage.name ?? 'Garage'}</h1></div><div className="heading-actions"><button className="button secondary" onClick={() => void load()} disabled={loading}>↻ Refresh</button><button className="button secondary" onClick={() => setDialog('check-out')}>Check out</button><button className="button primary" onClick={() => setDialog('check-in')}>+ Check in</button></div></div>{error && <div className="notice error" role="alert">{error}<button onClick={() => void load()}>Try again</button></div>}{message && <div className="notice success">{message}</div>}<div className="metric-row"><Metric label="Available" value={counts.available} accent="available" /><Metric label="Occupied" value={counts.occupied} accent="occupied" /><Metric label="Total spaces" value={counts.total} accent="neutral" /></div><div className="workspace"><div className="map-pane"><div className="map-toolbar"><div className="floor-tabs" role="tablist">{plan?.floors.map((item) => <button key={item.id} role="tab" aria-selected={floorId === item.id} className={floorId === item.id ? 'floor-tab active' : 'floor-tab'} onClick={() => { setFloorId(item.id); setSelected(null); }}>{item.name}<small>L{item.level}</small></button>)}</div><div className="filter-group" aria-label="Space status filter">{(['all', 'available', 'occupied'] as const).map((item) => <button key={item} className={filter === item ? 'filter active' : 'filter'} onClick={() => setFilter(item)}>{item}</button>)}</div></div>{loading && !plan ? <div className="map-empty">Loading garage…</div> : floor ? <FloorMap floor={floor} spots={floorSpots} visibleIds={filteredIds} selectedId={selected?.id} onSelect={(spot) => setSelected(spot)} /> : <div className="map-empty">No floor plan has been uploaded.</div>}<div className="map-legend"><span><i className="legend-dot available" /> Available</span><span><i className="legend-dot occupied" /> Vehicle occupied</span><span><i className="legend-dot manual" /> Manual hold</span></div></div><SpotPanel spot={selected} onClose={() => setSelected(null)} onCheckIn={() => setDialog('check-in')} /></div>{dialog && <OperationDialog mode={dialog} selectedSpot={dialog === 'check-in' ? selected : null} client={client} close={() => setDialog(null)} complete={async (nextMessage, spotId) => { setDialog(null); const refreshed = await load(); if (spotId) setSelected(refreshed?.find((spot) => spot.id === spotId) ?? null); setMessage(nextMessage); }} />}</section>;
}

function Metric({ label, value, accent }: { label: string; value: number; accent: string }) { return <div className={`metric ${accent}`}><span>{label}</span><strong>{value}</strong></div>; }

function FloorMap({ floor, spots, visibleIds, selectedId, onSelect }: { floor: FloorPlanFloor; spots: ParkingSpot[]; visibleIds: Set<string>; selectedId?: string; onSelect: (spot: ParkingSpot) => void }) {
  const byId = new Map(spots.map((spot) => [spot.id, spot]));
  const points = (items: { x: number; y: number }[]) => items.map((point) => `${point.x},${point.y}`).join(' ');
  const activate = (event: KeyboardEvent<SVGGElement>, spot: ParkingSpot) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(spot); } };
  return <div className="floor-map-wrap"><svg className="floor-map" viewBox={`0 -14 ${floor.canvas.width} ${floor.canvas.height + 14}`} aria-label={`${floor.name} interactive floor plan`}><rect className="map-background" x="0" y="-14" width={floor.canvas.width} height={floor.canvas.height + 14} /><polygon className="map-shell" points={points(floor.footprint.points)} />{floor.routes.map((route) => <g key={route.id}><polygon className={`map-route ${route.kind}`} points={points(route.geometry.points)} /><polyline className={`map-centreline ${route.direction}`} points={points(route.centerline)} /></g>)}{floor.bays.map((bay) => <g key={bay.id}><polygon className="map-bay" points={points(bay.geometry.points)} /><text className="map-bay-label" x={bay.labelAt.x} y={bay.labelAt.y}>{bay.name}</text></g>)}{floor.amenities.map((amenity) => <g key={amenity.id}><polygon className={`map-amenity ${amenity.type}`} points={points(amenity.geometry.points)} /><text className="map-amenity-label" x={amenity.geometry.points[0].x + 1} y={amenity.geometry.points[0].y + 2}>{amenity.label}</text></g>)}{floor.bays.flatMap((bay) => bay.spots).map((planSpot) => { const spot = byId.get(planSpot.id); if (!spot) return null; const geometry = planSpot.geometry; const cx = geometry.x + geometry.width / 2; const cy = geometry.y + geometry.height / 2; const hidden = !visibleIds.has(spot.id); const status = spot.status === 'available' ? 'available' : spot.occupancySource === 'manual' ? 'manual' : 'occupied'; return <g key={spot.id} className={`map-space ${planSpot.kind} ${status} ${hidden ? 'muted' : ''} ${selectedId === spot.id ? 'selected' : ''}`} transform={`rotate(${geometry.rotation} ${cx} ${cy})`} role="button" tabIndex={0} aria-label={`${planSpot.label}, ${status}`} onClick={() => onSelect(spot)} onKeyDown={(event) => activate(event, spot)}><rect x={geometry.x} y={geometry.y} width={geometry.width} height={geometry.height} rx="0.45" /><text x={cx} y={cy + 0.55}>{planSpot.label}</text></g>; })}{floor.gates.map((gate) => { const [a, b] = gate.opening; return <g key={gate.id}><line className={`map-gate ${gate.direction}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} /><text className="map-gate-label" x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 2}>{gate.direction === 'inbound' ? 'IN' : 'OUT'}</text></g>; })}<text className="map-title" x="4" y="-8">{floor.name}</text><text className="map-subtitle" x="4" y="-4.5">Level {floor.level} · live availability</text></svg></div>;
}

function SpotPanel({ spot, onClose, onCheckIn }: { spot: ParkingSpot | null; onClose: () => void; onCheckIn: () => void }) {
  if (!spot) return <aside className="spot-panel empty"><span className="panel-icon">⌖</span><h2>Select a space</h2><p>Click any spot on the map to inspect its live state and take the next action.</p></aside>;
  const manual = spot.occupancySource === 'manual';
  return <aside className="spot-panel"><button className="panel-close" onClick={onClose} aria-label="Close selected space">×</button><p className="eyebrow">{spot.floorId} · {spot.bayId}</p><h2>{spot.number}</h2><span className={`status-pill ${spot.status === 'available' ? 'available' : manual ? 'manual' : 'occupied'}`}>{spot.status === 'available' ? 'Available' : manual ? 'Manual hold' : 'Vehicle occupied'}</span><dl><div><dt>Space ID</dt><dd>{spot.id}</dd></div><div><dt>Source</dt><dd>{spot.occupancySource ?? '—'}</dd></div>{spot.manualReason && <div><dt>Reason</dt><dd>{spot.manualReason}</dd></div>}</dl>{spot.status === 'available' && <button className="button primary full-width" onClick={onCheckIn}>Check in here</button>}<p className="panel-note">Live status refreshes automatically every 30 seconds.</p></aside>;
}

function OperationDialog({ mode, selectedSpot, client, close, complete }: { mode: 'check-in' | 'check-out'; selectedSpot: ParkingSpot | null; client: ApiClient; close: () => void; complete: (message: string, spotId?: string) => Promise<void> }) {
  const [plate, setPlate] = useState(''); const [assignAutomatically, setAssignAutomatically] = useState(!selectedSpot); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(''); setSaving(true); try { if (mode === 'check-in') { const result = await client.checkIn(plate, assignAutomatically ? undefined : selectedSpot?.id); await complete(`${result.licensePlate} checked in at ${result.spotId}.`, result.spotId); } else { const result = await client.checkOut(plate); await complete(`${result.licensePlate} checked out.`, result.spotId); } } catch (cause) { setError(errorMessage(cause)); } finally { setSaving(false); } };
  const checkIn = mode === 'check-in';
  return <div className="dialog-layer" role="presentation"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="operation-title"><button className="panel-close" onClick={close} aria-label="Close">×</button><p className="eyebrow">VEHICLE FLOW</p><h2 id="operation-title">{checkIn ? 'Check in vehicle' : 'Check out vehicle'}</h2><form onSubmit={submit} className="stack"><label>License plate<input autoFocus placeholder="ABC 123" value={plate} onChange={(event) => setPlate(event.target.value)} /></label>{checkIn && <><label className="check-row"><input type="checkbox" checked={assignAutomatically} onChange={(event) => setAssignAutomatically(event.target.checked)} /> Let the system assign a space</label>{!assignAutomatically && selectedSpot && <p className="assignment">Assigning to <strong>{selectedSpot.number}</strong> · {selectedSpot.floorId}</p>}</>}{error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" className="button secondary" onClick={close}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving…' : checkIn ? 'Check in' : 'Check out'}</button></div></form></section></div>;
}

function LayoutPage({ client }: { client: ApiClient }) {
  const [yaml, setYaml] = useState(''); const [preview, setPreview] = useState<FloorPlan | null>(null); const [floorId, setFloorId] = useState(''); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const load = async () => { try { const next = await client.floorPlan(); const parsed = parseFloorPlan(next); setYaml(next); setPreview(parsed); setFloorId(parsed.floors[0].id); } catch (cause) { setError(errorMessage(cause)); } };
  useEffect(() => { void load(); }, [client]);
  const parsePreview = () => { setError(''); try { const parsed = parseFloorPlan(yaml); setPreview(parsed); setFloorId((current) => parsed.floors.some((floor) => floor.id === current) ? current : parsed.floors[0].id); setMessage('Preview updated.'); } catch (cause) { setPreview(null); setError(errorMessage(cause)); } };
  const upload = async () => { setError(''); setMessage(''); setSaving(true); try { await client.uploadFloorPlan(yaml); parsePreview(); setMessage('Floor plan uploaded. Live space projections have been refreshed.'); } catch (cause) { setError(errorMessage(cause)); } finally { setSaving(false); } };
  const previewFloor = preview?.floors.find((floor) => floor.id === floorId);
  const previewSpots = previewFloor?.bays.flatMap((bay) => bay.spots.map((spot) => ({ id: spot.id, floorId: previewFloor.id, bayId: bay.id, number: spot.label, status: 'available' as const }))) ?? [];
  return <section className="page layout-page"><div className="page-heading"><div><p className="eyebrow">ADMINISTRATION</p><h1>Floor plan</h1><p className="muted">Upload the canonical version 1 YAML document. Changes replace the live layout.</p></div></div>{error && <div className="notice error" role="alert">{error}</div>}{message && <div className="notice success">{message}</div>}<div className="layout-workspace"><div className="editor-card"><div className="editor-title"><h2>Layout YAML</h2><button className="text-button" onClick={parsePreview}>Refresh preview</button></div><textarea value={yaml} onChange={(event) => setYaml(event.target.value)} spellCheck={false} aria-label="Floor plan YAML" /><div className="editor-actions"><button className="button secondary" onClick={parsePreview}>Preview</button><button className="button primary" onClick={() => void upload()} disabled={saving}>{saving ? 'Uploading…' : 'Upload layout'}</button></div></div><div className="preview-card"><div className="editor-title"><h2>Preview</h2>{preview && <select aria-label="Preview floor" value={floorId} onChange={(event) => setFloorId(event.target.value)}>{preview.floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}</select>}</div>{previewFloor ? <FloorMap floor={previewFloor} spots={previewSpots} visibleIds={new Set(previewSpots.map((spot) => spot.id))} onSelect={() => undefined} /> : <div className="map-empty">Update the preview to inspect this layout.</div>}</div></div></section>;
}

export default App;
