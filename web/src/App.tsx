import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ApiClient, ApiError, api } from './api';
import { parseFloorPlan } from './floor-plan';
import { useLiveGarageEvents } from './live-events';
import type { FloorPlan, FloorPlanFloor, HistoryEventCounts, OccupancyHistory, ParkingSpot, Session } from './types';

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
  return <div className="app-shell"><Sidebar admin={session.user.role === 'admin'} open={navOpen} close={() => setNavOpen(false)} /><main className="app-main"><TopBar user={session.user.username} onMenu={() => setNavOpen(true)} signOut={signOut} /><Routes><Route path="/" element={<Dashboard client={client} onUnauthorized={signOut} />} /><Route path="/history" element={<HistoryPage client={client} onUnauthorized={signOut} />} /><Route path="/layout" element={session.user.role === 'admin' ? <LayoutPage client={client} /> : <Navigate to="/" replace />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></main></div>;
}

function Sidebar({ admin, open, close }: { admin: boolean; open: boolean; close: () => void }) {
  const location = useLocation();
  return <><button className={open ? 'nav-scrim visible' : 'nav-scrim'} aria-label="Close navigation" onClick={close} /><aside className={`sidebar ${open ? 'open' : ''}`}><div className="sidebar-brand"><div className="brand-mark small">P</div><span>Parkline</span></div><nav><p className="nav-heading">OPERATIONS</p><Link className={location.pathname === '/' ? 'nav-link active' : 'nav-link'} to="/" onClick={close}><span>▦</span> Garage</Link><Link className={location.pathname === '/history' ? 'nav-link active' : 'nav-link'} to="/history" onClick={close}><span>⌁</span> History</Link>{admin && <><p className="nav-heading admin-heading">ADMINISTRATION</p><Link className={location.pathname === '/layout' ? 'nav-link active' : 'nav-link'} to="/layout" onClick={close}><span>⌘</span> Layout</Link></>}</nav><div className="sidebar-footer"><span className="live-dot" /> API connected</div></aside></>;
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
  const [checkoutSelected, setCheckoutSelected] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (): Promise<ParkingSpot[] | undefined> => {
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
  }, [client, onUnauthorized]);
  useEffect(() => { void load(); const poll = window.setInterval(() => void load(), 30000); return () => window.clearInterval(poll); }, [load]);
  const liveConnection = useLiveGarageEvents(client, () => void load(), onUnauthorized);
  const floor = plan?.floors.find((item) => item.id === floorId) ?? null;
  const floorSpots = spots.filter((spot) => spot.floorId === floorId);
  const counts = { total: spots.length, available: spots.filter((spot) => spot.status === 'available').length, occupied: spots.filter((spot) => spot.status === 'occupied').length };
  const filteredIds = new Set(floorSpots.filter((spot) => filter === 'all' || spot.status === filter).map((spot) => spot.id));
  return <section className="page dashboard"><div className="page-heading"><div><p className="eyebrow">LIVE OVERVIEW</p><h1>{plan?.garage.name ?? 'Garage'}</h1><p className={`live-status ${liveConnection}`} role="status">{liveConnection === 'connected' ? 'Live updates connected' : liveConnection === 'reconnecting' ? 'Reconnecting live updates…' : 'Connecting live updates…'}</p></div><div className="heading-actions"><button className="button secondary" onClick={() => void load()} disabled={loading}>↻ Refresh</button><button className="button secondary" onClick={() => { setCheckoutSelected(false); setDialog('check-out'); }}>Check out</button><button className="button primary" onClick={() => setDialog('check-in')}>+ Check in</button></div></div>{error && <div className="notice error" role="alert">{error}<button onClick={() => void load()}>Try again</button></div>}{message && <div className="notice success">{message}</div>}<div className="metric-row"><Metric label="Available" value={counts.available} accent="available" /><Metric label="Occupied" value={counts.occupied} accent="occupied" /><Metric label="Total spaces" value={counts.total} accent="neutral" /></div><div className="workspace"><div className="map-pane"><div className="map-toolbar"><div className="floor-tabs" role="tablist">{plan?.floors.map((item) => <button key={item.id} role="tab" aria-selected={floorId === item.id} className={floorId === item.id ? 'floor-tab active' : 'floor-tab'} onClick={() => { setFloorId(item.id); setSelected(null); }}>{item.name}<small>L{item.level}</small></button>)}</div><div className="filter-group" aria-label="Space status filter">{(['all', 'available', 'occupied'] as const).map((item) => <button key={item} className={filter === item ? 'filter active' : 'filter'} onClick={() => setFilter(item)}>{item}</button>)}</div></div>{loading && !plan ? <div className="map-empty">Loading garage…</div> : floor ? <FloorMap floor={floor} spots={floorSpots} visibleIds={filteredIds} selectedId={selected?.id} onSelect={(spot) => setSelected(spot)} /> : <div className="map-empty">No floor plan has been uploaded.</div>}<div className="map-legend"><span><i className="legend-dot available" /> Available</span><span><i className="legend-dot occupied" /> Vehicle occupied</span><span><i className="legend-dot manual" /> Manual hold</span></div></div><SpotPanel spot={selected} onClose={() => setSelected(null)} onCheckIn={() => setDialog('check-in')} onCheckOut={() => { setCheckoutSelected(true); setDialog('check-out'); }} /></div>{dialog && <OperationDialog mode={dialog} selectedSpot={dialog === 'check-in' || checkoutSelected ? selected : null} client={client} close={() => { setCheckoutSelected(false); setDialog(null); }} complete={async (nextMessage, spotId) => { setCheckoutSelected(false); setDialog(null); const refreshed = await load(); if (spotId) setSelected(refreshed?.find((spot) => spot.id === spotId) ?? null); setMessage(nextMessage); }} />}</section>;
}

function HistoryPage({ client, onUnauthorized }: { client: ApiClient; onUnauthorized: () => void }) {
  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [floorId, setFloorId] = useState('');
  const [bayId, setBayId] = useState('');
  const [spotId, setSpotId] = useState('');
  const [preset, setPreset] = useState<'24h' | '7d' | '30d' | 'custom'>('7d');
  const [customFrom, setCustomFrom] = useState(() => localDate(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)));
  const [customTo, setCustomTo] = useState(() => localDate(new Date()));
  const [report, setReport] = useState<OccupancyHistory | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const selectedFloor = plan?.floors.find((floor) => floor.id === floorId) ?? null;
  const bays = selectedFloor?.bays ?? [];
  const selectedBay = bays.find((bay) => bay.id === bayId) ?? null;
  const baySpots = spots.filter((spot) => spot.bayId === bayId);
  const range = useMemo(() => reportRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  useEffect(() => { void (async () => {
    try {
      const [yaml, nextSpots] = await Promise.all([client.floorPlan(), client.spots()]);
      const nextPlan = parseFloorPlan(yaml); const firstFloor = nextPlan.floors[0]; const firstBay = firstFloor?.bays[0];
      setPlan(nextPlan); setSpots(nextSpots); setFloorId(firstFloor?.id ?? ''); setBayId(firstBay?.id ?? '');
    } catch (cause) { if (cause instanceof ApiError && cause.status === 401) onUnauthorized(); else setError(errorMessage(cause)); } finally { setLoading(false); }
  })(); }, [client, onUnauthorized]);

  useEffect(() => { void (async () => {
    if (!bayId || !range) { setReport(null); return; }
    setError(''); setLoading(true);
    try { setReport(await client.occupancyHistory({ bayId, ...(spotId ? { spotId } : {}), from: range.from.toISOString(), to: range.to.toISOString() })); }
    catch (cause) { if (cause instanceof ApiError && cause.status === 401) onUnauthorized(); else setError(errorMessage(cause)); }
    finally { setLoading(false); }
  })(); }, [bayId, spotId, range, client, onUnauthorized]);

  const selectFloor = (nextFloorId: string) => { const nextFloor = plan?.floors.find((floor) => floor.id === nextFloorId); setFloorId(nextFloorId); setBayId(nextFloor?.bays[0]?.id ?? ''); setSpotId(''); };
  return <section className="page history-page"><div className="page-heading"><div><p className="eyebrow">ASSET ANALYTICS</p><h1>History</h1><p className="muted">Review occupancy and activity for a bay or individual stall. Times use your local time zone.</p></div></div><section className="history-controls" aria-label="History filters"><label>Floor<select value={floorId} onChange={(event) => selectFloor(event.target.value)} disabled={!plan}>{plan?.floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}</select></label><label>Bay<select value={bayId} onChange={(event) => { setBayId(event.target.value); setSpotId(''); }} disabled={!selectedFloor}>{bays.map((bay) => <option key={bay.id} value={bay.id}>{bay.name}</option>)}</select></label><label>Asset<select value={spotId} onChange={(event) => setSpotId(event.target.value)} disabled={!selectedBay}><option value="">Entire bay</option>{baySpots.map((spot) => <option key={spot.id} value={spot.id}>{spot.number}</option>)}</select></label><div className="range-control"><span>Period</span><div className="range-presets">{([['24h', '24 hours'], ['7d', '7 days'], ['30d', '30 days']] as const).map(([value, label]) => <button key={value} className={preset === value ? 'filter active' : 'filter'} onClick={() => setPreset(value)}>{label}</button>)}<button className={preset === 'custom' ? 'filter active' : 'filter'} onClick={() => setPreset('custom')}>Custom</button></div></div>{preset === 'custom' && <><label>From<input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label><label>To<input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label></>}</section>{!range && <div className="notice error" role="alert">Choose a valid date range of 90 days or less.</div>}{error && <div className="notice error" role="alert">{error}</div>}{loading && !report ? <div className="history-empty">Loading asset history…</div> : report ? <><div className="metric-row history-metrics"><Metric label="Average occupancy" value={formatPercent(report.summary.averageOccupancy)} accent="occupied" /><Metric label="Peak occupancy" value={formatPercent(report.summary.peakOccupancy)} accent="neutral" /><Metric label="Capacity" value={report.asset.capacity} accent="available" /><Metric label="Check-ins" value={report.summary.checkIns} accent="available" /><Metric label="Check-outs" value={report.summary.checkOuts} accent="neutral" /><Metric label="Manual actions" value={report.summary.manualHolds + report.summary.manualReleases} accent="occupied" /></div><div className="history-chart-grid"><TrendChart history={report} /><EventChart history={report} /></div></> : !error && <div className="history-empty">Select a bay with parking stalls to view its history.</div>}</section>;
}

function Metric({ label, value, accent }: { label: string; value: number | string; accent: string }) { return <div className={`metric ${accent}`}><span>{label}</span><strong>{value}</strong></div>; }

function TrendChart({ history }: { history: OccupancyHistory }) {
  const points = history.points; const width = 620; const height = 230; const plotTop = 24; const plotBottom = 190; const x = (index: number) => points.length < 2 ? width / 2 : 36 + index * (width - 72) / (points.length - 1); const y = (value: number) => plotBottom - value / 100 * (plotBottom - plotTop);
  const line = points.map((point, index) => `${x(index)},${y(point.occupancyPercent)}`).join(' ');
  return <section className="history-card"><div><h2>Occupancy</h2><p>Average occupied capacity per {history.granularity}.</p></div><svg viewBox={`0 0 ${width} ${height}`} className="history-chart" role="img" aria-label="Occupancy percentage over time"><line x1="36" x2={width - 36} y1={y(100)} y2={y(100)} className="chart-grid" /><line x1="36" x2={width - 36} y1={y(50)} y2={y(50)} className="chart-grid" /><line x1="36" x2={width - 36} y1={y(0)} y2={y(0)} className="chart-grid" /><text x="3" y={y(100) + 4}>100%</text><text x="12" y={y(50) + 4}>50%</text><text x="18" y={y(0) + 4}>0%</text>{points.length > 0 && <polyline points={line} className="occupancy-line" />}{points.map((point, index) => <g key={point.startsAt}><circle cx={x(index)} cy={y(point.occupancyPercent)} r="3.5" className="occupancy-point"><title>{`${chartLabel(point.startsAt, history.granularity)}: ${formatPercent(point.occupancyPercent)}`}</title></circle>{(index === 0 || index === points.length - 1 || index === Math.round((points.length - 1) / 2)) && <text x={x(index)} y="216" textAnchor="middle" className="chart-label">{chartLabel(point.startsAt, history.granularity)}</text>}</g>)}</svg></section>;
}

function EventChart({ history }: { history: OccupancyHistory }) {
  const points = history.points; const width = 620; const height = 230; const plotBottom = 190; const max = Math.max(1, ...points.map((point) => point.checkIns + point.checkOuts + point.manualHolds + point.manualReleases)); const barWidth = Math.max(3, Math.min(22, (width - 72) / Math.max(points.length, 1) - 4));
  const colors: Array<[keyof HistoryEventCounts, string]> = [['checkIns', 'check-in'], ['checkOuts', 'check-out'], ['manualHolds', 'manual-hold'], ['manualReleases', 'manual-release']];
  return <section className="history-card"><div><h2>Activity</h2><p>Check-ins, check-outs, and manual occupancy actions.</p></div><div className="chart-key"><span className="check-in">Check-ins</span><span className="check-out">Check-outs</span><span className="manual-hold">Holds</span><span className="manual-release">Releases</span></div><svg viewBox={`0 0 ${width} ${height}`} className="history-chart" role="img" aria-label="Operational event counts over time"><line x1="36" x2={width - 36} y1={plotBottom} y2={plotBottom} className="chart-grid" />{points.map((point, index) => { const x = 36 + index * (width - 72) / Math.max(points.length, 1) + ((width - 72) / Math.max(points.length, 1) - barWidth) / 2; let stacked = 0; return <g key={point.startsAt}>{colors.map(([key, color]) => { const value = point[key] as number; const barHeight = value / max * 150; const y = plotBottom - stacked - barHeight; stacked += barHeight; return value ? <rect key={key} x={x} y={y} width={barWidth} height={barHeight} className={`event-bar ${color}`}><title>{`${chartLabel(point.startsAt, history.granularity)}: ${String(key)} ${value}`}</title></rect> : null; })}{(index === 0 || index === points.length - 1 || index === Math.round((points.length - 1) / 2)) && <text x={x + barWidth / 2} y="216" textAnchor="middle" className="chart-label">{chartLabel(point.startsAt, history.granularity)}</text>}</g>; })}</svg></section>;
}

function reportRange(preset: '24h' | '7d' | '30d' | 'custom', customFrom: string, customTo: string) {
  if (preset === 'custom') {
    if (!customFrom || !customTo) return null;
    const from = new Date(`${customFrom}T00:00:00`); const to = new Date(`${customTo}T00:00:00`); to.setDate(to.getDate() + 1);
    return Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > 90 * 24 * 60 * 60 * 1000 ? null : { from, to };
  }
  const hours = preset === '24h' ? 24 : preset === '7d' ? 7 * 24 : 30 * 24;
  const to = new Date(); return { from: new Date(to.getTime() - hours * 60 * 60 * 1000), to };
}

function localDate(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
function formatPercent(value: number) { return `${value.toFixed(value % 1 ? 1 : 0)}%`; }
function chartLabel(value: string, granularity: 'hour' | 'day') { return new Intl.DateTimeFormat(undefined, granularity === 'hour' ? { hour: 'numeric', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' }).format(new Date(value)); }

function FloorMap({ floor, spots, visibleIds, selectedId, onSelect }: { floor: FloorPlanFloor; spots: ParkingSpot[]; visibleIds: Set<string>; selectedId?: string; onSelect: (spot: ParkingSpot) => void }) {
  const byId = new Map(spots.map((spot) => [spot.id, spot]));
  const points = (items: { x: number; y: number }[]) => items.map((point) => `${point.x},${point.y}`).join(' ');
  const activate = (event: KeyboardEvent<SVGGElement>, spot: ParkingSpot) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(spot); } };
  return <div className="floor-map-wrap"><svg className="floor-map" viewBox={`0 -14 ${floor.canvas.width} ${floor.canvas.height + 14}`} aria-label={`${floor.name} interactive floor plan`}><rect className="map-background" x="0" y="-14" width={floor.canvas.width} height={floor.canvas.height + 14} /><polygon className="map-shell" points={points(floor.footprint.points)} />{floor.routes.map((route) => <g key={route.id}><polygon className={`map-route ${route.kind}`} points={points(route.geometry.points)} /><polyline className={`map-centreline ${route.direction}`} points={points(route.centerline)} /></g>)}{floor.bays.map((bay) => <g key={bay.id}><polygon className="map-bay" points={points(bay.geometry.points)} /><text className="map-bay-label" x={bay.labelAt.x} y={bay.labelAt.y}>{bay.name}</text></g>)}{floor.amenities.map((amenity) => <g key={amenity.id}><polygon className={`map-amenity ${amenity.type}`} points={points(amenity.geometry.points)} /><text className="map-amenity-label" x={amenity.geometry.points[0].x + 1} y={amenity.geometry.points[0].y + 2}>{amenity.label}</text></g>)}{floor.bays.flatMap((bay) => bay.spots).map((planSpot) => { const spot = byId.get(planSpot.id); if (!spot) return null; const geometry = planSpot.geometry; const cx = geometry.x + geometry.width / 2; const cy = geometry.y + geometry.height / 2; const hidden = !visibleIds.has(spot.id); const status = spot.status === 'available' ? 'available' : spot.occupancySource === 'manual' ? 'manual' : 'occupied'; return <g key={spot.id} className={`map-space ${planSpot.kind} ${status} ${hidden ? 'muted' : ''} ${selectedId === spot.id ? 'selected' : ''}`} transform={`rotate(${geometry.rotation} ${cx} ${cy})`} role="button" tabIndex={0} aria-label={`${planSpot.label}, ${status}`} onClick={() => onSelect(spot)} onKeyDown={(event) => activate(event, spot)}><rect x={geometry.x} y={geometry.y} width={geometry.width} height={geometry.height} rx="0.45" /><text x={cx} y={cy + 0.55}>{planSpot.label}</text></g>; })}{floor.gates.map((gate) => { const [a, b] = gate.opening; return <g key={gate.id}><line className={`map-gate ${gate.direction}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} /><text className="map-gate-label" x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 2}>{gate.direction === 'inbound' ? 'IN' : 'OUT'}</text></g>; })}<text className="map-title" x="4" y="-8">{floor.name}</text><text className="map-subtitle" x="4" y="-4.5">Level {floor.level} · live availability</text></svg></div>;
}

function SpotPanel({ spot, onClose, onCheckIn, onCheckOut }: { spot: ParkingSpot | null; onClose: () => void; onCheckIn: () => void; onCheckOut: () => void }) {
  if (!spot) return <aside className="spot-panel empty"><span className="panel-icon">⌖</span><h2>Select a space</h2><p>Click any spot on the map to inspect its live state and take the next action.</p></aside>;
  const manual = spot.occupancySource === 'manual';
  return <aside className="spot-panel"><button className="panel-close" onClick={onClose} aria-label="Close selected space">×</button><p className="eyebrow">{spot.floorId} · {spot.bayId}</p><h2>{spot.number}</h2><span className={`status-pill ${spot.status === 'available' ? 'available' : manual ? 'manual' : 'occupied'}`}>{spot.status === 'available' ? 'Available' : manual ? 'Manual hold' : 'Vehicle occupied'}</span><dl><div><dt>Space ID</dt><dd>{spot.id}</dd></div><div><dt>Source</dt><dd>{spot.occupancySource ?? '—'}</dd></div>{spot.manualReason && <div><dt>Reason</dt><dd>{spot.manualReason}</dd></div>}</dl>{spot.status === 'available' && <button className="button primary full-width" onClick={onCheckIn}>Check in here</button>}{spot.status === 'occupied' && spot.occupancySource === 'vehicle' && <button className="button primary full-width" onClick={onCheckOut}>Check out vehicle</button>}<p className="panel-note">Live status refreshes automatically every 30 seconds.</p></aside>;
}

function OperationDialog({ mode, selectedSpot, client, close, complete }: { mode: 'check-in' | 'check-out'; selectedSpot: ParkingSpot | null; client: ApiClient; close: () => void; complete: (message: string, spotId?: string) => Promise<void> }) {
  const [plate, setPlate] = useState(''); const [assignAutomatically, setAssignAutomatically] = useState(!selectedSpot); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(''); setSaving(true); try { if (mode === 'check-in') { const result = await client.checkIn(plate, assignAutomatically ? undefined : selectedSpot?.id); await complete(`${result.licensePlate} checked in at ${result.spotId}.`, result.spotId); } else { const session = selectedSpot ? await client.activeSessionForSpot(selectedSpot.id) : null; if (selectedSpot && !session) throw new Error(`No active vehicle session was found for ${selectedSpot.number}.`); const result = await client.checkOut(session ? { sessionId: session.id } : { licensePlate: plate }); await complete(`${result.licensePlate} checked out.`, result.spotId); } } catch (cause) { setError(errorMessage(cause)); } finally { setSaving(false); } };
  const checkIn = mode === 'check-in';
  return <div className="dialog-layer" role="presentation"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="operation-title"><button className="panel-close" onClick={close} aria-label="Close">×</button><p className="eyebrow">VEHICLE FLOW</p><h2 id="operation-title">{checkIn ? 'Check in vehicle' : 'Check out vehicle'}</h2><form onSubmit={submit} className="stack">{!selectedSpot || checkIn ? <label>License plate<input autoFocus placeholder="ABC 123" value={plate} onChange={(event) => setPlate(event.target.value)} /></label> : <p className="assignment">Checking out the active vehicle in <strong>{selectedSpot.number}</strong> · {selectedSpot.floorId}</p>}{checkIn && <><label className="check-row"><input type="checkbox" checked={assignAutomatically} onChange={(event) => setAssignAutomatically(event.target.checked)} /> Let the system assign a space</label>{!assignAutomatically && selectedSpot && <p className="assignment">Assigning to <strong>{selectedSpot.number}</strong> · {selectedSpot.floorId}</p>}</>}{error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" className="button secondary" onClick={close}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving…' : checkIn ? 'Check in' : 'Check out'}</button></div></form></section></div>;
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
