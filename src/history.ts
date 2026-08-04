export type HistorySession = {
  spotId: string;
  checkedInAt: Date;
  checkedOutAt: Date | null;
};

export type ManualOccupancyEvent = {
  spotId: string;
  action: 'spot_manually_occupied' | 'spot_manually_released';
  occurredAt: Date;
};

export type HistoryEventCounts = {
  checkIns: number;
  checkOuts: number;
  manualHolds: number;
  manualReleases: number;
};

export type OccupancyPoint = HistoryEventCounts & {
  startsAt: Date;
  endsAt: Date;
  occupancyPercent: number;
};

type Interval = { startsAt: Date; endsAt: Date };

export function occupancyHistory(input: {
  spotIds: string[];
  sessions: HistorySession[];
  manualEvents: ManualOccupancyEvent[];
  from: Date;
  to: Date;
  granularity: 'hour' | 'day';
}) {
  const { spotIds, sessions, manualEvents, from, to, granularity } = input;
  const manualIntervals = manualOccupancyIntervals(spotIds, manualEvents, to);
  const intervals = [...sessions.map((session) => ({ startsAt: session.checkedInAt, endsAt: session.checkedOutAt ?? to })), ...manualIntervals]
    .flatMap((interval) => clipInterval(interval, from, to) ?? []);
  const counts = eventCounts(sessions, manualEvents, from, to);
  const bucketMilliseconds = granularity === 'hour' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const points: OccupancyPoint[] = [];

  for (let startsAt = from.getTime(); startsAt < to.getTime(); startsAt += bucketMilliseconds) {
    const endsAt = new Date(Math.min(startsAt + bucketMilliseconds, to.getTime()));
    const pointStart = new Date(startsAt);
    points.push({
      startsAt: pointStart,
      endsAt,
      occupancyPercent: occupancyPercent(intervals, pointStart, endsAt, spotIds.length),
      ...eventCounts(sessions, manualEvents, pointStart, endsAt)
    });
  }

  return {
    summary: {
      averageOccupancy: occupancyPercent(intervals, from, to, spotIds.length),
      peakOccupancy: peakOccupancyPercent(intervals, from, to, spotIds.length),
      ...counts
    },
    points
  };
}

function manualOccupancyIntervals(spotIds: string[], events: ManualOccupancyEvent[], to: Date): Interval[] {
  const starts = new Map<string, Date>();
  const intervals: Interval[] = [];
  const selected = new Set(spotIds);
  for (const event of [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())) {
    if (!selected.has(event.spotId)) continue;
    if (event.action === 'spot_manually_occupied') starts.set(event.spotId, event.occurredAt);
    else {
      const startsAt = starts.get(event.spotId);
      if (startsAt && startsAt < event.occurredAt) intervals.push({ startsAt, endsAt: event.occurredAt });
      starts.delete(event.spotId);
    }
  }
  for (const startsAt of starts.values()) if (startsAt < to) intervals.push({ startsAt, endsAt: to });
  return intervals;
}

function clipInterval(interval: Interval, from: Date, to: Date): Interval | null {
  const startsAt = new Date(Math.max(interval.startsAt.getTime(), from.getTime()));
  const endsAt = new Date(Math.min(interval.endsAt.getTime(), to.getTime()));
  return startsAt < endsAt ? { startsAt, endsAt } : null;
}

function occupancyPercent(intervals: Interval[], from: Date, to: Date, capacity: number) {
  if (!capacity || from >= to) return 0;
  const occupiedMilliseconds = intervals.reduce((total, interval) => total + Math.max(0, Math.min(interval.endsAt.getTime(), to.getTime()) - Math.max(interval.startsAt.getTime(), from.getTime())), 0);
  return roundPercentage(occupiedMilliseconds / ((to.getTime() - from.getTime()) * capacity));
}

function peakOccupancyPercent(intervals: Interval[], from: Date, to: Date, capacity: number) {
  if (!capacity || from >= to) return 0;
  const deltas = new Map<number, number>();
  for (const interval of intervals) {
    const startsAt = Math.max(interval.startsAt.getTime(), from.getTime());
    const endsAt = Math.min(interval.endsAt.getTime(), to.getTime());
    deltas.set(startsAt, (deltas.get(startsAt) ?? 0) + 1);
    deltas.set(endsAt, (deltas.get(endsAt) ?? 0) - 1);
  }
  let occupied = 0;
  let peak = 0;
  for (const delta of [...deltas.entries()].sort(([a], [b]) => a - b).map(([, value]) => value)) {
    occupied += delta;
    peak = Math.max(peak, occupied);
  }
  return roundPercentage(peak / capacity);
}

function eventCounts(sessions: HistorySession[], manualEvents: ManualOccupancyEvent[], from: Date, to: Date): HistoryEventCounts {
  const within = (value: Date | null) => value !== null && value >= from && value < to;
  return {
    checkIns: sessions.filter((session) => within(session.checkedInAt)).length,
    checkOuts: sessions.filter((session) => within(session.checkedOutAt)).length,
    manualHolds: manualEvents.filter((event) => event.action === 'spot_manually_occupied' && within(event.occurredAt)).length,
    manualReleases: manualEvents.filter((event) => event.action === 'spot_manually_released' && within(event.occurredAt)).length
  };
}

function roundPercentage(value: number) {
  return Math.round(value * 10_000) / 100;
}
