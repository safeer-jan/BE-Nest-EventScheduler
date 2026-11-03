import { isValidDateOnly, isValidTimestampWithOffset } from './date.validators';

describe('date validators', () => {
  describe('isValidDateOnly', () => {
    it.each(['2026-01-22', '2026-02-28', '2028-02-29', '2026-12-31', '2027-01-01'])(
      'accepts %s',
      (v) => expect(isValidDateOnly(v)).toBe(true),
    );
    it.each(['2026-02-30', '2027-02-29', '2026-13-01', '2026-00-10', '2026-1-1', '20260122', '', 'abc'])(
      'rejects %s',
      (v) => expect(isValidDateOnly(v)).toBe(false),
    );
    it('rejects non-strings', () => {
      expect(isValidDateOnly(null)).toBe(false);
      expect(isValidDateOnly(undefined)).toBe(false);
      expect(isValidDateOnly(20260122)).toBe(false);
    });
  });

  describe('isValidTimestampWithOffset', () => {
    it.each([
      '2026-01-22T14:00:00.000Z',
      '2026-01-22T14:00:00Z',
      '2026-01-22T14:00Z',
      '2026-01-22T19:00:00+05:00',
      '2026-01-22T04:00:00-08:00',
    ])('accepts %s', (v) => expect(isValidTimestampWithOffset(v)).toBe(true));

    it.each([
      '2026-01-22T14:00:00', // no offset: ambiguous, must be rejected
      '2026-01-22 14:00:00Z',
      '2026-01-22',
      '2026-02-30T10:00:00Z',
      '2026-01-22T24:00:00Z',
      '2026-01-22T14:60:00Z',
      '2026-01-22T14:00:00+5:00',
      'not-a-date',
      '',
    ])('rejects %s', (v) => expect(isValidTimestampWithOffset(v)).toBe(false));

    it('rejects non-strings', () => {
      expect(isValidTimestampWithOffset(undefined)).toBe(false);
      expect(isValidTimestampWithOffset(1700000000000)).toBe(false);
    });
  });
});
