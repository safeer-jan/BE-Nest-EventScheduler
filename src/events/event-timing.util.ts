import { BadRequestException } from '@nestjs/common';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Cross-field timing rules for an event, shared by create and update.
 *
 *  1. endAt must be strictly later than startAt.
 *  2. The logical `date` must be plausible for startAt. Real-world UTC offsets range from
 *     UTC-12:00 to UTC+14:00, so the local calendar date of an instant can differ from its UTC date
 *     by at most one day in either direction. A larger gap means the client sent a date that cannot
 *     belong to the timestamp (typically a bug) and is rejected.
 *
 * The backend does NOT recompute `date` from the timestamp: the logical date is the user's choice
 * and is stored as-is (see README "Timezone policy").
 */
export function assertValidEventTiming(date: string, startAt: Date, endAt: Date): void {
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw new BadRequestException('startAt and endAt must be valid timestamps');
  }
  if (endAt.getTime() <= startAt.getTime()) {
    throw new BadRequestException('endAt must be later than startAt');
  }

  const logicalDayMs = Date.parse(`${date}T00:00:00.000Z`);
  const startUtcDayMs = Date.UTC(
    startAt.getUTCFullYear(),
    startAt.getUTCMonth(),
    startAt.getUTCDate(),
  );
  const dayDiff = Math.round((logicalDayMs - startUtcDayMs) / MS_PER_DAY);
  if (Number.isNaN(dayDiff) || Math.abs(dayDiff) > 1) {
    throw new BadRequestException(
      'date is inconsistent with startAt: the logical date can differ from the UTC date of startAt by at most one day',
    );
  }
}
