import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { isAdmin } from '../common/utils/access.util';
import { EventsService } from '../events/events.service';
import { AuthUsersClient, UserSummary } from './auth-users.client';
import { UserResponseDto } from './user-response.dto';

@ApiTags('users (admin)')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Missing, invalid, expired or revoked token' })
@ApiForbiddenResponse({ description: 'Admin role required' })
@Controller('users')
export class UsersController {
  private readonly adminRole: string;

  constructor(
    private readonly authUsers: AuthUsersClient,
    private readonly events: EventsService,
    config: ConfigService,
  ) {
    this.adminRole = config.get<string>('auth.adminRole') ?? 'admin';
  }

  private assertAdmin(user: AuthenticatedUser): void {
    if (!isAdmin(user, this.adminRole)) throw new ForbiddenException('Admin role required');
  }

  @Get()
  @ApiOperation({ summary: '[admin] Users for the "assign to user" dropdown (from the Auth Service)' })
  @ApiOkResponse({ type: [UserResponseDto] })
  list(@CurrentUser() user: AuthenticatedUser): Promise<UserSummary[]> {
    this.assertAdmin(user);
    return this.authUsers.listUsers(user.accessToken);
  }

  @Delete(':userId/events')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '[admin] Permanently delete ALL events of a user',
    description: 'Use when a user is removed. This is a hard delete and cannot be undone.',
  })
  @ApiNoContentResponse({ description: 'Events deleted' })
  async removeUserEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<void> {
    this.assertAdmin(user);
    await this.events.removeAllForUser(userId);
  }
}
