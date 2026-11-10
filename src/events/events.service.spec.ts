import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { AuthUsersClient } from '../users/auth-users.client';
import { MAX_RANGE_DAYS, EventsService } from './events.service';
import { Event, EventType } from './event.entity';

const USER: AuthenticatedUser = { id: 'u-1', email: 'a@b.c', roles: ['user'], accessToken: 't-user' };
const ADMIN: AuthenticatedUser = { id: 'u-admin', email: 'admin@b.c', roles: ['admin'], accessToken: 't-admin' };

function makeQb(result: Event[] = []) {
  const qb: Record<string, jest.Mock> = {};
  for (const m of ['where', 'andWhere', 'orderBy', 'addOrderBy']) qb[m] = jest.fn().mockReturnValue(qb);
  qb.getMany = jest.fn().mockResolvedValue(result);
  return qb;
}

function setup() {
  const qb = makeQb();
  const repo = {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    findOne: jest.fn(),
    create: jest.fn((x: any) => ({ ...x })),
    save: jest.fn(async (x: any) => ({ id: 'e-1', ...x })),
  };
  const authUsers = { assertUserExists: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn().mockReturnValue('admin') };
  const service = new EventsService(
    repo as never,
    authUsers as unknown as AuthUsersClient,
    config as unknown as ConfigService,
  );
  return { service, repo, qb, authUsers };
}

const base = {
  name: 'Scheduled Video',
  date: '2026-01-22',
  startAt: '2026-01-22T14:00:00.000Z',
  endAt: '2026-01-22T15:00:00.000Z',
  type: EventType.ONCE,
};

describe('EventsService.create', () => {
  it('stores the logical date separately from the absolute instants and sets the owner', async () => {
    const { service, repo } = setup();
    const saved = await service.create(USER, {
      ...base,
      date: '2026-01-22',
      startAt: '2026-01-22T20:00:00-08:00', // == 2026-01-23T04:00:00Z
      endAt: '2026-01-22T21:00:00-08:00',
    });
    expect(saved.date).toBe('2026-01-22');
    expect(saved.startAt.toISOString()).toBe('2026-01-23T04:00:00.000Z');
    expect(saved.endAt.toISOString()).toBe('2026-01-23T05:00:00.000Z');
    expect(saved.userId).toBe('u-1');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('rejects end <= start without saving', async () => {
    const { service, repo } = setup();
    await expect(
      service.create(USER, { ...base, endAt: '2026-01-22T14:00:00.000Z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('non-admins always create for themselves and cannot target another user', async () => {
    const { service, repo, authUsers } = setup();
    const saved = await service.create(USER, { ...base, userId: 'u-1' });
    expect(saved.userId).toBe('u-1');
    await expect(service.create(USER, { ...base, userId: 'u-other' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(authUsers.assertUserExists).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('admins can assign an event to another (existing) user', async () => {
    const { service, authUsers } = setup();
    const saved = await service.create(ADMIN, { ...base, userId: 'u-other' });
    expect(saved.userId).toBe('u-other');
    expect(authUsers.assertUserExists).toHaveBeenCalledWith('t-admin', 'u-other');
  });

  it('admins creating without userId get their own events', async () => {
    const { service, authUsers } = setup();
    const saved = await service.create(ADMIN, base);
    expect(saved.userId).toBe('u-admin');
    expect(authUsers.assertUserExists).not.toHaveBeenCalled();
  });

  it('does not save when the target user does not exist', async () => {
    const { service, repo, authUsers } = setup();
    authUsers.assertUserExists.mockRejectedValue(new BadRequestException('no such user'));
    await expect(service.create(ADMIN, { ...base, userId: 'u-ghost' })).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('does not block overlapping events (no overlap check exists)', async () => {
    const { service, repo } = setup();
    await service.create(USER, base);
    await service.create(USER, base);
    expect(repo.save).toHaveBeenCalledTimes(2);
  });
});

describe('EventsService.list', () => {
  it('requires date or a full range', async () => {
    const { service } = setup();
    await expect(service.list(USER, {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.list(USER, { startDate: '2026-01-01' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects date combined with a range', async () => {
    const { service } = setup();
    await expect(
      service.list(USER, { date: '2026-01-01', startDate: '2026-01-01', endDate: '2026-01-02' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an inverted range and a range over the maximum', async () => {
    const { service } = setup();
    await expect(
      service.list(USER, { startDate: '2026-02-01', endDate: '2026-01-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.list(USER, { startDate: '2026-01-01', endDate: '2027-12-31' }),
    ).rejects.toThrow(`${MAX_RANGE_DAYS}`);
  });

  it('allows a single-day range and an exactly-maximum range', async () => {
    const { service } = setup();
    await expect(service.list(USER, { startDate: '2026-01-01', endDate: '2026-01-01' })).resolves.toEqual([]);
    // 2026-01-01 .. 2027-02-04 is exactly 400 days inclusive
    await expect(service.list(USER, { startDate: '2026-01-01', endDate: '2027-02-04' })).resolves.toEqual([]);
  });

  it('filters by logical date column and restricts non-admins to their own events', async () => {
    const { service, qb } = setup();
    await service.list(USER, { date: '2026-01-22' });
    expect(qb.andWhere).toHaveBeenCalledWith('event.userId = :ownerId', { userId: 'u-1' });
    expect(qb.andWhere).toHaveBeenCalledWith('event.date = :date', { date: '2026-01-22' });
    expect(qb.orderBy).toHaveBeenCalledWith('event.startAt', 'ASC');
  });

  it('uses inclusive bounds for ranges', async () => {
    const { service, qb } = setup();
    await service.list(USER, { startDate: '2026-01-01', endDate: '2026-01-31' });
    expect(qb.andWhere).toHaveBeenCalledWith(
      'event.date >= :startDate AND event.date <= :endDate',
      { startDate: '2026-01-01', endDate: '2026-01-31' },
    );
  });

  it('does not restrict admins by owner', async () => {
    const { service, qb } = setup();
    await service.list(ADMIN, { date: '2026-01-22' });
    expect(qb.andWhere).not.toHaveBeenCalledWith('event.userId = :ownerId', expect.anything());
  });

  it('admins can filter by user; normal users cannot view other users', async () => {
    const { service, qb } = setup();
    await service.list(ADMIN, { date: '2026-01-22', userId: 'u-9' });
    expect(qb.andWhere).toHaveBeenCalledWith('event.userId = :userId', { userId: 'u-9' });
    await expect(service.list(USER, { date: '2026-01-22', userId: 'u-9' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('applies the type filter', async () => {
    const { service, qb } = setup();
    await service.list(USER, { date: '2026-01-22', type: EventType.WEEKEND });
    expect(qb.andWhere).toHaveBeenCalledWith('event.type = :type', { type: EventType.WEEKEND });
  });
});

describe('EventsService.findOneOrFail / update / remove', () => {
  const existing = (): Event =>
    ({
      id: 'e-1',
      userId: 'u-1',
      name: 'Old',
      description: 'desc',
      date: '2026-01-22',
      startAt: new Date('2026-01-22T14:00:00Z'),
      endAt: new Date('2026-01-22T15:00:00Z'),
      type: EventType.ONCE,
      isDeleted: false,
    }) as Event;

  it('scopes lookups to the owner for normal users and not for admins', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(existing());
    await service.findOneOrFail(USER, 'e-1');
    expect(repo.findOne).toHaveBeenLastCalledWith({ where: { id: 'e-1', isDeleted: false, userId: 'u-1' } });
    await service.findOneOrFail(ADMIN, 'e-1');
    expect(repo.findOne).toHaveBeenLastCalledWith({ where: { id: 'e-1', isDeleted: false } });
  });

  it('throws 404 when not found (or owned by someone else)', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOneOrFail(USER, 'e-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates only the supplied fields', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(existing());
    const saved = await service.update(USER, 'e-1', { name: 'New' });
    expect(saved.name).toBe('New');
    expect(saved.description).toBe('desc');
    expect(saved.date).toBe('2026-01-22');
  });

  it('re-validates timing against the merged values', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(existing());
    // existing start is 14:00Z, new end 13:00Z -> end before start
    await expect(
      service.update(USER, 'e-1', { endAt: '2026-01-22T13:00:00Z' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('clears description with null', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(existing());
    const saved = await service.update(USER, 'e-1', { description: null });
    expect(saved.description).toBeNull();
  });

  it('only admins can reassign an event to another user', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(existing());
    await expect(service.update(USER, 'e-1', { userId: 'u-other' })).rejects.toBeInstanceOf(ForbiddenException);
    const saved = await service.update(ADMIN, 'e-1', { userId: 'u-other' });
    expect(saved.userId).toBe('u-other');
  });

  it('rejects null for NOT NULL fields', async () => {
    const { service } = setup();
    await expect(service.update(USER, 'e-1', { name: null as never })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update(ADMIN, 'e-1', { userId: null as never })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('soft-deletes instead of removing the row', async () => {
    const { service, repo } = setup();
    repo.findOne.mockResolvedValue(existing());
    await service.remove(USER, 'e-1');
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'e-1', isDeleted: true }));
  });

  it('removeAllForUser hard-deletes every event of that user', async () => {
    const { service, repo } = setup();
    (repo as any).delete = jest.fn().mockResolvedValue(undefined);
    await service.removeAllForUser('u-1');
    expect((repo as any).delete).toHaveBeenCalledWith({ userId: 'u-1' });
  });
});
