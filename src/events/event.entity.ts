import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Phase 1: a label only. No recurrence is generated from it. */
export enum EventType {
  DAILY = 'daily',
  ONCE = 'once',
  WEEKEND = 'weekend',
}

@Entity('events')
@Index('IDX_events_user_date', ['userId', 'date'], { where: '"is_deleted" = false' })
@Index('IDX_events_date', ['date'], { where: '"is_deleted" = false' })
@Index('IDX_events_start_at', ['startAt'])
@Check('CHK_events_time_order', '"end_at" > "start_at"')
@Check('CHK_events_type', `"type" IN ('daily', 'once', 'weekend')`)
export class Event {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_events_id' })
  id: string;

  /**
   * The user this event belongs to (Auth Service user id). Users create events for themselves;
   * admins may assign an event to any user. No FK: users live in the Auth Service database.
   */
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Logical calendar date ("YYYY-MM-DD"). Grouping/filtering uses THIS, never the UTC date. */
  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt: Date;

  @Column({ name: 'end_at', type: 'timestamptz' })
  endAt: Date;

  @Column({ type: 'varchar', length: 16 })
  type: EventType;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
