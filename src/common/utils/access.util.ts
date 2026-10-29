import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/** True when the user holds the configured admin role (admins can see/manage all users' data). */
export function isAdmin(user: AuthenticatedUser, adminRole: string): boolean {
  return Array.isArray(user.roles) && user.roles.includes(adminRole);
}
