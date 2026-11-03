import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ISO-8601 instant that MUST carry an explicit UTC offset ("Z" or "+05:00").
 * Local strings such as "2026-01-22T14:00:00" are ambiguous and are rejected, never guessed.
 */
const TIMESTAMP_WITH_OFFSET_REGEX =
  /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,3})?)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/;

/** True for a real calendar date in strict YYYY-MM-DD form (rejects 2026-02-30, 2026-13-01, ...). */
export function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_ONLY_REGEX.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** True for an ISO-8601 timestamp with an explicit offset whose date part is a real calendar date. */
export function isValidTimestampWithOffset(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = TIMESTAMP_WITH_OFFSET_REGEX.exec(value);
  if (!match || !isValidDateOnly(match[1])) return false;
  return !Number.isNaN(Date.parse(value));
}

export function IsDateOnly(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isDateOnly',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => isValidDateOnly(value),
        defaultMessage: (args: ValidationArguments) =>
          `${args.property} must be a valid calendar date in YYYY-MM-DD format`,
      },
    });
}

export function IsTimestampWithOffset(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isTimestampWithOffset',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => isValidTimestampWithOffset(value),
        defaultMessage: (args: ValidationArguments) =>
          `${args.property} must be an ISO-8601 timestamp with an explicit UTC offset, e.g. 2026-01-22T14:00:00.000Z or 2026-01-22T19:00:00+05:00`,
      },
    });
}
