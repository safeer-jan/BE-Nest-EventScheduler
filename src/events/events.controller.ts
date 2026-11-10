import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { CreateEventDto } from './dto/create-event.dto';
import { EventResponseDto } from './dto/event-response.dto';
import { ListEventsQueryDto } from './dto/list-events-query.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { Event } from './event.entity';
import { EventsService } from './events.service';

@ApiTags('events')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Missing, invalid, expired or revoked token' })
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @ApiOperation({
    summary: 'List events by logical date or date range',
    description:
      'Provide `date` (day view) OR `startDate`+`endDate` (month/range view, both inclusive). ' +
      'Filtering uses the logical `date` field, never the UTC date of `startAt`. ' +
      'Results are ordered by `startAt`. Users see only their own events; admins see all (optionally filter with `userId`).',
  })
  @ApiOkResponse({ type: [EventResponseDto] })
  @ApiBadRequestResponse({ description: 'Invalid or missing date filters' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListEventsQueryDto,
  ): Promise<Event[]> {
    return this.events.list(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one event' })
  @ApiOkResponse({ type: EventResponseDto })
  @ApiNotFoundResponse({ description: 'Event not found' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Event> {
    return this.events.findOneOrFail(user, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create an event/task',
    description:
      'Scheduling record only. Users create events for themselves; admins may pass `userId` ' +
      'to create an event for another user. Overlapping events are allowed.',
  })
  @ApiCreatedResponse({ type: EventResponseDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEventDto): Promise<Event> {
    return this.events.create(user, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an event/task (partial)' })
  @ApiOkResponse({ type: EventResponseDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiNotFoundResponse({ description: 'Event not found' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEventDto,
  ): Promise<Event> {
    return this.events.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an event/task' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiNotFoundResponse({ description: 'Event not found' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.events.remove(user, id);
  }
}
