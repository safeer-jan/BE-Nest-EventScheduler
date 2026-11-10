import { BadRequestException } from '@nestjs/common';
import { assertValidEventTiming } from './event-timing.util';

const d = (s: string) => new Date(s);

describe('assertValidEventTiming', () => {
  it('accepts a normal same-day event', () => {
    expect(() =>
      assertValidEventTiming('2026-01-22', d('2026-01-22T14:00:00Z'), d('2026-01-22T15:00:00Z')),
    ).not.toThrow();
  });

  it('rejects end equal to start', () => {
    expect(() =>
      assertValidEventTiming('2026-01-22', d('2026-01-22T14:00:00Z'), d('2026-01-22T14:00:00Z')),
    ).toThrow(BadRequestException);
  });

  it('rejects end before start', () => {
    expect(() =>
      assertValidEventTiming('2026-01-22', d('2026-01-22T14:00:00Z'), d('2026-01-22T13:00:00Z')),
    ).toThrow('endAt must be later than startAt');
  });

  it('rejects invalid Date objects', () => {
    expect(() =>
      assertValidEventTiming('2026-01-22', new Date('nope'), d('2026-01-22T13:00:00Z')),
    ).toThrow(BadRequestException);
  });

  // ---- logical date vs UTC date ----
  it('accepts an evening event (UTC-8) whose UTC date is the NEXT day: logical date stays Jan 22', () => {
    // 20:00 on Jan 22 in UTC-8 == 04:00Z on Jan 23
    expect(() =>
      assertValidEventTiming('2026-01-22', d('2026-01-22T20:00:00-08:00'), d('2026-01-22T21:00:00-08:00')),
    ).not.toThrow();
    expect(d('2026-01-22T20:00:00-08:00').toISOString()).toBe('2026-01-23T04:00:00.000Z');
  });

  it('accepts an early-morning event (UTC+14) whose UTC date is the PREVIOUS day', () => {
    // 01:00 on Jan 22 in UTC+14 == 11:00Z on Jan 21
    expect(() =>
      assertValidEventTiming('2026-01-22', d('2026-01-22T01:00:00+14:00'), d('2026-01-22T02:00:00+14:00')),
    ).not.toThrow();
  });

  it('accepts Karachi (UTC+5) midnight events', () => {
    // 00:00 Jan 22 PKT == 19:00Z Jan 21
    expect(() =>
      assertValidEventTiming('2026-01-22', d('2026-01-22T00:00:00+05:00'), d('2026-01-22T00:30:00+05:00')),
    ).not.toThrow();
  });

  it('accepts month boundary (Jan 31 evening UTC-5 -> Feb 1 UTC)', () => {
    expect(() =>
      assertValidEventTiming('2026-01-31', d('2026-01-31T22:00:00-05:00'), d('2026-01-31T23:00:00-05:00')),
    ).not.toThrow();
  });

  it('accepts year boundary (Dec 31 evening UTC-8 -> Jan 1 UTC)', () => {
    expect(() =>
      assertValidEventTiming('2026-12-31', d('2026-12-31T23:00:00-08:00'), d('2027-01-01T00:30:00-08:00')),
    ).not.toThrow();
  });

  it('accepts a leap day', () => {
    expect(() =>
      assertValidEventTiming('2028-02-29', d('2028-02-29T10:00:00Z'), d('2028-02-29T11:00:00Z')),
    ).not.toThrow();
  });

  it('rejects a date more than one day away from the UTC date of startAt', () => {
    expect(() =>
      assertValidEventTiming('2026-01-20', d('2026-01-22T14:00:00Z'), d('2026-01-22T15:00:00Z')),
    ).toThrow(/inconsistent/);
    expect(() =>
      assertValidEventTiming('2026-01-24', d('2026-01-22T14:00:00Z'), d('2026-01-22T15:00:00Z')),
    ).toThrow(/inconsistent/);
  });
});
