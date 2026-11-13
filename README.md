# Calendar & Timeline Scheduler — Backend (Phase 1)

Standalone NestJS + TypeORM + PostgreSQL REST API for a Google-Calendar-style scheduler.
Events belong to users: admins pick a user from a dropdown; normal users only create their own.
Authentication is **delegated to your existing Auth Service** (RS256 JWT, verify-only).
Phase 1 only: scheduling data. No FFmpeg/SRS/HLS/playback/broadcast logic exists in this codebase.

> ## ⚠️ Verification status
> This code was written in a sandbox **without network access, npm packages or PostgreSQL**, so it has
> **not been compiled or executed**. I only ran a syntax-level TypeScript parse (no syntax errors).
> The unit tests and e2e tests are written but **have never been run**. Run the checklist below on your
> machine before relying on it, and expect that you may need to fix small typing/runtime issues.
>
> ```bash
> npm install && npm run build && npm test          # compile + unit tests (no DB needed)
> npm run db:setup && npm run test:e2e              # real PostgreSQL + migrations + HTTP tests
> ```

## Stack
NestJS 10 · TypeScript · PostgreSQL 16 · TypeORM (migrations only, `synchronize` is hard-wired `false`) ·
class-validator/transformer · Swagger · Passport-JWT (RS256) · optional Redis revocation check · Jest/Supertest.
Versions match your Auth Service's `package.json`.

## Quick start
```bash
npm install
cp .env.example .env        # hidden file; a visible copy is env.example.txt

# 1) Auth integration (see 'Auth: step by step'): copy the Auth Service's PUBLIC key (never the private one)
cp "<auth-service>/keys/public.pem" keys/public.pem
#    and make JWT_ISSUER / JWT_AUDIENCE in .env equal the Auth Service's values

# 2) Database (new, empty). Starts Postgres on host port 5433 and runs migrations.
npm run db:setup
#    (own Postgres instead? create an empty database, set DB_* in .env, then: npm run migration:run)

# 3) Run
npm run start:dev
```
* API: `http://localhost:4000/api/v1`  ·  Swagger: `http://localhost:4000/api/docs`  ·  Health: `GET /api/v1/health`

### Using Swagger with your Auth Service
1. Start the Auth Service and call `POST http://localhost:3000/api/v1/auth/login` (e.g. the seeded admin).
2. Copy `accessToken` from the response.
3. In this API's Swagger click **Authorize**, paste the token (no `Bearer ` prefix), and try the endpoints.

## How authentication works here
* This service **never signs tokens and has no users table**. Register/login/refresh/logout/password flows live in the Auth Service.
* Every route except `GET /health` requires `Authorization: Bearer <accessToken>` (global guard).
* Verified: RS256 signature (public key only, algorithm pinned to RS256), expiry, `iss`, `aud`.
* Used claims: `sub` (user id → event `user_id`), `email`, `roles`. The `permissions` claim is **intentionally ignored** (per your instruction).
* **Ownership:** each user sees/edits only their own events. Users with the role named by `ADMIN_ROLE` (default `admin`) see and manage everything. Other users' records return `404` (not `403`) so existence isn't leaked.
* **Optional logout enforcement:** set `REDIS_HOST` (same Redis as the Auth Service) and tokens whose `jti` is in `blacklist:<jti>` are rejected. Without it, a logged-out token stays valid until it expires (default 15 min). `REDIS_FAIL_OPEN=true` accepts tokens if Redis is down; `false` returns 503.
* Roles/ids are read from the token, so role changes take effect after the user logs in again (same as the Auth Service itself).

## Auth: step by step
1. Run the Auth Service (port 3000) and this API (port 4000).
2. Log in on the **Auth Service**: `POST http://localhost:3000/api/v1/auth/login` → get `accessToken`.
3. Call this API with `Authorization: Bearer <accessToken>`.
4. This API checks the token locally with the Auth Service's **public key** (signature, expiry, issuer, audience). No call to the Auth Service per request.
5. `sub` = user id, `roles` contains `admin` → admin. Everyone else = normal user.
6. Only the admin dropdown (`GET /users`) calls the Auth Service (`GET /users`), forwarding the admin's token. That admin needs the Auth Service permission `users:read`.

**`JWT_ISSUER` / `JWT_AUDIENCE`:** the Auth Service puts these two values inside every token. They must be identical in this API's `.env` (copy them from the Auth Service's `.env`), otherwise every token is rejected with 401.

## Environment variables
See `.env.example` (all commented). Key ones: `DB_*`, `JWT_PUBLIC_KEY_PATH`, `JWT_ISSUER`, `JWT_AUDIENCE`, `ADMIN_ROLE`, `AUTH_SERVICE_URL` (default `http://localhost:3000/api/v1`), optional `REDIS_HOST`.
The app refuses to boot on invalid config or an unreadable public key.

## API (`/api/v1`)
| Method | Path | Description |
|---|---|---|
| GET | `/health` | public; checks DB connectivity |
| GET | `/events` | **requires** `date=YYYY-MM-DD` **or** `startDate`+`endDate` (inclusive); optional `type`, `userId` (admin only). Ordered by `startAt`. Max 400 days |
| GET | `/events/:id` | one event |
| POST | `/events` | create. Normal user → for self. Admin → optional `userId` |
| PATCH | `/events/:id` | partial update (admin may change `userId`) |
| DELETE | `/events/:id` | soft delete → `204` |
| GET | `/users` | **admin only**: users for the dropdown (from Auth Service) |
| DELETE | `/users/:userId/events` | **admin only**: permanently delete ALL events of a user |

Create payload:
```json
{ "name": "Scheduled Video", "description": "optional", "date": "2026-01-22",
  "startAt": "2026-01-22T14:00:00.000Z", "endAt": "2026-01-22T15:00:00.000Z",
  "type": "once", "userId": "<uuid, admin only, optional>" }
```
`type` ∈ `daily | once | weekend` — **labels only** in Phase 1 (no repeating events are generated yet).
Errors always look like `{ statusCode, error, message (string|string[]), path, timestamp }`.

## Timezone policy (important)
* `date` = **logical calendar date** the user picked (`DATE` column). All calendar grouping/filtering uses it — never the UTC date of `startAt`.
* `startAt` / `endAt` = **absolute instants** (`TIMESTAMPTZ`), always returned as ISO-8601 UTC with `Z`.
* The server **rejects timestamps without an explicit offset** (`2026-01-22T14:00:00` → 400). It never guesses a timezone and never builds a timestamp from `date + time`. Offsets like `+05:00` are accepted and normalised to UTC.
* The server does not recompute `date`; it only sanity-checks that `date` is within ±1 day of the UTC date of `startAt` (real offsets span UTC−12…UTC+14), so impossible combinations are rejected.
* The **frontend** converts the chosen local date/time in the user's timezone (browser TZ, extensible to IANA like `Asia/Karachi`) to an instant and sends `date` separately.
* Example: Jan 22, 20:00 in UTC−8 → `date: "2026-01-22"`, stored instant `2026-01-23T04:00:00Z`; it is returned for `?date=2026-01-22` and **not** for `?date=2026-01-23`.

## Data model
```
events
  id uuid PK, user_id uuid (Auth user), name varchar(200), description text null
  date DATE, start_at TIMESTAMPTZ, end_at TIMESTAMPTZ
  type varchar(16) CHECK in (daily, once, weekend)
  is_deleted, created_at, updated_at
```
* `user_id` has no foreign key (users live in the Auth Service database).
* Checks: `end_at > start_at`, valid `type`. Overlapping events are allowed.
* Indexes: `(user_id, date)` and `(date)` (partial, not deleted), `(start_at)`.
* Event delete = soft delete. **User cleanup** (`DELETE /users/:userId/events`) = hard delete of all their events. This API cannot detect on its own that a user was deleted in the Auth Service, so the admin calls this endpoint.

## Migrations
The new database starts empty; the schema is created only by migrations (`src/database/migrations/`).
```bash
npm run migration:run        # apply pending
npm run migration:show       # list applied / pending
npm run migration:revert     # undo the last one  (⚠ reverting InitSchema DROPs both tables and their data)
npm run migration:create src/database/migrations/AddSomething      # blank migration
npm run migration:generate -- src/database/migrations/AddSomething # diff from entities (REVIEW the SQL)
npm run build && npm run migration:run:prod                        # production (compiled JS)
```
Notes: IDs use `gen_random_uuid()` (PostgreSQL ≥ 13, no extension needed). Take a `pg_dump` before running migrations in production. Because some indexes are partial, always review generated migrations before committing them.

## Tests
```bash
npm test            # unit tests (no DB): validators, timing rules, services, JWT strategy
npm run test:cov
npm run test:e2e    # needs Postgres (npm run db:up creates `scheduler_test` too); applies migrations, runs HTTP tests
npm run lint
```
E2E covers: migrations, health, Swagger, token rejection cases, event CRUD + soft delete, validation, the **UTC-boundary timezone case**, month/year boundaries, per-user isolation, admin user assignment/filter, delete-user-events, DB constraints. (The Auth Service user list is faked in tests.)

## Decisions
* Channels were removed; events link to **users** instead.
* Per-user ownership; admin sees all. No permission checks here (only the `admin` role).
* Auth endpoints (login, logout, refresh) live in the Auth Service only.
* Rate limiting is in-memory (single instance).

## Phase 2 integration points (not implemented)
Add new modules beside `events/` (e.g. `playback/`, `streaming/`) that reference `events.id`; add execution fields (priority, playback state) through new migrations; keep `date/start_at/end_at` semantics unchanged so the calendar needs no redesign. `type` is already a `varchar` + CHECK, so changing types needs only a migration.

## Project structure
```
src/
  main.ts, app.setup.ts, app.module.ts
  config/            configuration + Joi validation
  auth/              JWT (RS256, verify-only) strategy, global guard, optional Redis revocation
  common/            decorators, exception filter, date validators, access helper
  users/             admin user list (Auth Service client) + delete-user-events
  events/            entity, DTOs, service, controller, timing rules
  health/            DB-aware health check
  database/          data-source.ts (CLI) + migrations/
test/                e2e tests + env setup
docker-compose.yml   Postgres 16 (host port 5433) · docker/init-test-db.sql creates scheduler_test
```
