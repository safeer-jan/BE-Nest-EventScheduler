/** Claims issued by the Auth Service in its RS256 access tokens. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  roles?: string[];
  permissions?: string[];
  jti?: string;
  sessionId?: string;
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
}

/** What `request.user` holds after the JWT guard. `permissions` are intentionally unused here. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
  jti?: string;
  /** Raw bearer token, forwarded to the Auth Service when listing users (admin flow). */
  accessToken: string;
}
