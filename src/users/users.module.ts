import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { AuthClientModule } from './auth-client.module';
import { UsersController } from './users.controller';

@Module({
  imports: [AuthClientModule, EventsModule],
  controllers: [UsersController],
})
export class UsersModule {}
