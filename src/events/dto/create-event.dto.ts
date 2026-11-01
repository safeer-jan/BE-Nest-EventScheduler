import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { IsDateOnly, IsTimestampWithOffset } from '../../common/validators/date.validators';
import { EventType } from '../event.entity';

export class CreateEventDto {
  @ApiProperty({ example: 'Scheduled Video', maxLength: 200 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Example scheduled item', maxLength: 5000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiProperty({
    example: '2026-01-22',
    description: 'Logical calendar date chosen by the user (YYYY-MM-DD). Used for grouping/filtering.',
  })
  @IsDateOnly()
  date: string;

  @ApiProperty({
    example: '2026-01-22T14:00:00.000Z',
    description: 'Absolute start instant, ISO-8601 WITH an explicit offset ("Z" or "+05:00").',
  })
  @IsTimestampWithOffset()
  startAt: string;

  @ApiProperty({
    example: '2026-01-22T15:00:00.000Z',
    description: 'Absolute end instant, ISO-8601 WITH an explicit offset. Must be later than startAt.',
  })
  @IsTimestampWithOffset()
  endAt: string;

  @ApiProperty({ enum: EventType, example: EventType.ONCE, description: 'Label only in Phase 1: no recurrence is generated.' })
  @IsEnum(EventType)
  type: EventType;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'ADMIN only: the user this event belongs to (pick from GET /users). Omit to create for yourself. ' +
      'Normal users must omit it (or send their own id).',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
