import { Module } from '@nestjs/common';
import { AuthUsersClient } from './auth-users.client';

@Module({ providers: [AuthUsersClient], exports: [AuthUsersClient] })
export class AuthClientModule {}
