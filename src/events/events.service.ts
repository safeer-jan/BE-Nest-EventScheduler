import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { isAdmin } from '../common/utils/access.util';
import { AuthUsersClient } from '../users/auth-users.client';
import { CreateEventDto } from './dto/create-event.dto';
import { ListEventsQueryDto } from './dto/list-events-query.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { assertValidEventTiming } from './event-timing.util';
import { Event } from './event.entity';

/** Upper bound for a single range query (a month view needs ~42 days; this leaves headroom). */
export const MAX_RANGE_DAYS = 400;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Fields that are NOT NULL in the database: PATCH may omit them but may not null them. */
const NON_NULLABLE_FIELDS = ['name', 'date', 'startAt', 'endAt', 'type', 'userId'] as const;

@Injectable()
export class EventsService {
  private readonly adminRole: string;

  constructor(
    @InjectRepository(Event) private readonly repo: Repository<Event>,
    private readonly authUsers: AuthUsersClient,
    config: ConfigService,
  ) {
    this.adminRole = config.get<string>('auth.adminRole') ?? 'admin';
  }

  private admin(user: AuthenticatedUser): boolean {
    return isAdmin(user, this.adminRole);
  }

  /** Decides which user an event belongs to. Only admins may target someone else. */
  private async resolveTargetUser(user: AuthenticatedUser, requested?: string): Promise<string> {
    if (!requested || requested === user.id) return user.id;
    if (!this.admin(user)) {
      throw new ForbiddenException('Only admins can assign events to other users');
    }
    await this.authUsers.assertUserExists(user.accessToken, requested);
    return requested;
  }

  async list(user: AuthenticatedUser, query: ListEventsQueryDto): Promise<Event[]> {
    const { date, startDate, endDate, userId, type } = query;

    if (date && (startDate || endDate)) {
      throw new BadRequestException('Use either "date" or "startDate"+"endDate", not both');
    }
    if (!date && !(startDate && endDate)) {
      throw new BadRequestException('Provide "date", or both "startDate" and "endDate"');
    }
    if (startDate && endDate) {
      if (startDate > endDate) {
        throw new BadRequestException('startDate must not be after endDate');
      }
      const days =
        (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) /
          MS_PER_DAY +
        1;
      if (days > MAX_RANGE_DAYS) {
        throw new BadRequestException(`Date range must not exceed ${MAX_RANGE_DAYS} days`);
      }
    }
    if (userId && userId !== user.id && !this.admin(user)) {
      throw new ForbiddenException('Only admins can view other users\' events');
    }

    const qb = this.repo
      .createQueryBuilder('event')
      .where('event.isDeleted = :deleted', { deleted: false });

    if (!this.admin(user)) {
      qb.andWhere('event.userId = :ownerId', { ownerId: user.id });
    } else if (userId) {
      qb.andWhere('event.userId = :userId', { userId });
    }
    if (date) {
      qb.andWhere('event.date = :date', { date });
    } else {
      qb.andWhere('event.date >= :startDate AND event.date <= :endDate', { startDate, endDate });
    }
    if (type) qb.andWhere('event.type = :type', { type });

    // Real chronological order comes from the absolute instants, not from the logical date.
    return qb.orderBy('event.startAt', 'ASC').addOrderBy('event.createdAt', 'ASC').getMany();
  }

  async findOneOrFail(user: AuthenticatedUser, id: string): Promise<Event> {
    const event = await this.repo.findOne({
      where: this.admin(user)
        ? { id, isDeleted: false }
        : { id, isDeleted: false, userId: user.id },
    });
    // Foreign events are reported as 404 (not 403) so their existence is not leaked.
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async create(user: AuthenticatedUser, dto: CreateEventDto): Promise<Event> {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    assertValidEventTiming(dto.date, startAt, endAt);

    const userId = await this.resolveTargetUser(user, dto.userId);

    const event = this.repo.create({
      userId,
      name: dto.name,
      description: dto.description ?? null,
      date: dto.date,
      startAt,
      endAt,
      type: dto.type,
      isDeleted: false,
    });
    return this.repo.save(event);
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateEventDto): Promise<Event> {
    for (const field of NON_NULLABLE_FIELDS) {
      if ((dto as Record<string, unknown>)[field] === null) {
        throw new BadRequestException(`${field} cannot be null`);
      }
    }

    const event = await this.findOneOrFail(user, id);

    const date = dto.date ?? event.date;
    const startAt = dto.startAt ? new Date(dto.startAt) : event.startAt;
    const endAt = dto.endAt ? new Date(dto.endAt) : event.endAt;
    assertValidEventTiming(date, startAt, endAt);

    if (dto.userId !== undefined) {
      event.userId = await this.resolveTargetUser(user, dto.userId);
    }

    event.date = date;
    event.startAt = startAt;
    event.endAt = endAt;
    if (dto.name !== undefined) event.name = dto.name;
    if (dto.description !== undefined) event.description = dto.description;
    if (dto.type !== undefined) event.type = dto.type;

    return this.repo.save(event);
  }

  /** Soft delete: the row is kept but excluded from every query. */
  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    const event = await this.findOneOrFail(user, id);
    event.isDeleted = true;
    await this.repo.save(event);
  }

  /** Admin cleanup: permanently deletes every event of a user (hard delete). */
  async removeAllForUser(userId: string): Promise<void> {
    await this.repo.delete({ userId });
  }
}
