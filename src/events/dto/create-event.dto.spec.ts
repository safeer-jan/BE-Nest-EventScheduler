import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEventDto } from './create-event.dto';
import { ListEventsQueryDto } from './list-events-query.dto';
import { UpdateEventDto } from './update-event.dto';

const valid = {
  name: 'Scheduled Video',
  description: 'Example scheduled item',
  date: '2026-01-22',
  startAt: '2026-01-22T14:00:00.000Z',
  endAt: '2026-01-22T15:00:00.000Z',
  type: 'once',
};

async function errorsFor<T extends object>(cls: new () => T, plain: object): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, plain), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((e) => e.property);
}

describe('CreateEventDto', () => {
  it('accepts a valid payload', async () => {
    expect(await errorsFor(CreateEventDto, valid)).toEqual([]);
  });

  it('accepts all three event types', async () => {
    for (const type of ['daily', 'once', 'weekend']) {
      expect(await errorsFor(CreateEventDto, { ...valid, type })).toEqual([]);
    }
  });

  it('accepts optional fields omitted', async () => {
    const { description: _d, ...rest } = valid;
    expect(await errorsFor(CreateEventDto, rest)).toEqual([]);
  });

  it('rejects a missing or blank name (whitespace is trimmed)', async () => {
    expect(await errorsFor(CreateEventDto, { ...valid, name: '' })).toContain('name');
    expect(await errorsFor(CreateEventDto, { ...valid, name: '   ' })).toContain('name');
    const { name: _n, ...rest } = valid;
    expect(await errorsFor(CreateEventDto, rest)).toContain('name');
  });

  it('rejects an over-long name', async () => {
    expect(await errorsFor(CreateEventDto, { ...valid, name: 'x'.repeat(201) })).toContain('name');
  });

  it('rejects an unsupported type', async () => {
    expect(await errorsFor(CreateEventDto, { ...valid, type: 'video' })).toContain('type');
  });

  it('rejects invalid dates', async () => {
    expect(await errorsFor(CreateEventDto, { ...valid, date: '2026-02-30' })).toContain('date');
    expect(await errorsFor(CreateEventDto, { ...valid, date: '22/01/2026' })).toContain('date');
  });

  it('rejects timestamps without an explicit offset or that are malformed', async () => {
    expect(await errorsFor(CreateEventDto, { ...valid, startAt: '2026-01-22T14:00:00' })).toContain('startAt');
    expect(await errorsFor(CreateEventDto, { ...valid, endAt: 'tomorrow' })).toContain('endAt');
    expect(await errorsFor(CreateEventDto, { ...valid, startAt: undefined })).toContain('startAt');
  });

  it('rejects a non-UUID userId', async () => {
    expect(await errorsFor(CreateEventDto, { ...valid, userId: '123' })).toContain('userId');
    expect(
      await errorsFor(CreateEventDto, { ...valid, userId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
    ).toEqual([]);
  });

  it('rejects unknown properties', async () => {
    expect(await errorsFor(CreateEventDto, { ...valid, isDeleted: true })).toContain('isDeleted');
    expect(await errorsFor(CreateEventDto, { ...valid, ownerId: 'x' })).toContain('ownerId');
    expect(await errorsFor(CreateEventDto, { ...valid, type: 'ad' })).toContain('type');
  });
});

describe('UpdateEventDto', () => {
  it('accepts a partial payload and an empty payload', async () => {
    expect(await errorsFor(UpdateEventDto, { name: 'Renamed' })).toEqual([]);
    expect(await errorsFor(UpdateEventDto, {})).toEqual([]);
  });

  it('still validates the fields that are present', async () => {
    expect(await errorsFor(UpdateEventDto, { endAt: 'bad' })).toContain('endAt');
    expect(await errorsFor(UpdateEventDto, { type: 'video' })).toContain('type');
  });

  it('accepts null to clear description', async () => {
    expect(await errorsFor(UpdateEventDto, { description: null })).toEqual([]);
  });
});

describe('ListEventsQueryDto', () => {
  it('accepts date, or a range, with filters', async () => {
    expect(await errorsFor(ListEventsQueryDto, { date: '2026-01-22' })).toEqual([]);
    expect(
      await errorsFor(ListEventsQueryDto, { startDate: '2026-01-01', endDate: '2026-01-31', type: 'daily' }),
    ).toEqual([]);
  });

  it('rejects malformed dates, types and user ids', async () => {
    expect(await errorsFor(ListEventsQueryDto, { date: '2026-1-2' })).toContain('date');
    expect(await errorsFor(ListEventsQueryDto, { type: 'x' })).toContain('type');
    expect(await errorsFor(ListEventsQueryDto, { userId: 'x' })).toContain('userId');
  });
});
