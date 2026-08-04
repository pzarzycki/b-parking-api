import { describe, expect, it } from 'vitest';
import { occupancyHistory } from './history.js';

const date = (value: string) => new Date(`2026-01-01T${value}:00.000Z`);

describe('occupancyHistory', () => {
  it('aggregates vehicle and manual occupancy across a bay and its hourly event counts', () => {
    const result = occupancyHistory({
      spotIds: ['A01', 'A02'],
      sessions: [{ spotId: 'A01', checkedInAt: date('00:30'), checkedOutAt: date('01:30') }],
      manualEvents: [
        { spotId: 'A02', action: 'spot_manually_occupied', occurredAt: date('00:00') },
        { spotId: 'A02', action: 'spot_manually_released', occurredAt: date('02:00') }
      ],
      from: date('00:00'), to: date('03:00'), granularity: 'hour'
    });

    expect(result.summary).toMatchObject({ averageOccupancy: 50, peakOccupancy: 100, checkIns: 1, checkOuts: 1, manualHolds: 1, manualReleases: 1 });
    expect(result.points).toEqual(expect.arrayContaining([
      expect.objectContaining({ occupancyPercent: 75, checkIns: 1, checkOuts: 0, manualHolds: 1, manualReleases: 0 }),
      expect.objectContaining({ occupancyPercent: 75, checkIns: 0, checkOuts: 1, manualHolds: 0, manualReleases: 0 }),
      expect.objectContaining({ occupancyPercent: 0, manualReleases: 1 })
    ]));
  });

  it('clips active and pre-range manual occupancy to a single-stall reporting range', () => {
    const result = occupancyHistory({
      spotIds: ['A01'],
      sessions: [{ spotId: 'A01', checkedInAt: date('00:30'), checkedOutAt: null }],
      manualEvents: [{ spotId: 'A02', action: 'spot_manually_occupied', occurredAt: date('00:00') }],
      from: date('01:00'), to: date('03:00'), granularity: 'hour'
    });

    expect(result.summary).toMatchObject({ averageOccupancy: 100, peakOccupancy: 100, checkIns: 0, checkOuts: 0 });
  });

  it('reconstructs a manual hold that starts before the reporting range', () => {
    const result = occupancyHistory({
      spotIds: ['A01'],
      sessions: [],
      manualEvents: [
        { spotId: 'A01', action: 'spot_manually_occupied', occurredAt: date('00:00') },
        { spotId: 'A01', action: 'spot_manually_released', occurredAt: date('02:00') }
      ],
      from: date('01:00'), to: date('03:00'), granularity: 'hour'
    });

    expect(result.summary).toMatchObject({ averageOccupancy: 50, peakOccupancy: 100, manualHolds: 0, manualReleases: 1 });
  });
});
