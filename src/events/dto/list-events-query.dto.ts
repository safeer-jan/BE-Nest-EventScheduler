import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { IsDateOnly } from '../../common/validators/date.validators';
import { EventType } from '../event.entity';

/**
 * Provide EITHER `date` (day view) OR both `startDate` and `endDate` (month/range view).
 * Range bounds are inclusive on both ends and compare the logical `date` column.
 */
export class ListEventsQueryDto {
  @ApiPropertyOptional({ example: '2026-01-22', description: 'Exact logical date (day view).' })
  @IsOptional()
  @IsDateOnly()
  date?: string;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Range start, inclusive.' })
  @IsOptional()
  @IsDateOnly()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-01-31', description: 'Range end, inclusive.' })
  @IsOptional()
  @IsDateOnly()
  endDate?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'ADMIN only: show one user\'s events.' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ enum: EventType })
  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;
}
