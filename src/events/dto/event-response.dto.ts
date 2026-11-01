import { ApiProperty } from '@nestjs/swagger';
import { EventType } from '../event.entity';

/** Swagger-only description of an event as returned by the API. */
export class EventResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid', description: 'User the event belongs to' }) userId: string;
  @ApiProperty({ example: 'Scheduled Video' }) name: string;
  @ApiProperty({ nullable: true, type: String }) description: string | null;
  @ApiProperty({ example: '2026-01-22', description: 'Logical calendar date' }) date: string;
  @ApiProperty({ example: '2026-01-22T14:00:00.000Z' }) startAt: Date;
  @ApiProperty({ example: '2026-01-22T15:00:00.000Z' }) endAt: Date;
  @ApiProperty({ enum: EventType }) type: EventType;
  @ApiProperty() isDeleted: boolean;
  @ApiProperty({ example: '2026-01-22T10:00:00.000Z' }) createdAt: Date;
  @ApiProperty({ example: '2026-01-22T10:00:00.000Z' }) updatedAt: Date;
}
