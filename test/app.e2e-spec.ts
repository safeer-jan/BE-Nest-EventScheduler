import { BadRequestException, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AuthUsersClient } from '../src/users/auth-users.client';
import { configureApp } from '../src/app.setup';

/**
 * Full HTTP + PostgreSQL integration tests.
 * Requires a reachable PostgreSQL with the database from .env.test / test/setup-env.ts
 * (docker compose creates `scheduler_test` automatically). Migrations are applied at boot.
 */
describe('Scheduler API (e2e)', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request.agent>;
  let ds: DataSource;
  const jwt = new JwtService({});

  const userA = { id: randomUUID(), email: 'a@example.com', roles: ['user'] };
  const userB = { id: randomUUID(), email: 'b@example.com', roles: ['user'] };
  const admin = { id: randomUUID(), email: 'admin@example.com', roles: ['admin'] };

  const tokenFor = (
    u: { id: string; email: string; roles: string[] },
    overrides: Record<string, unknown> = {},
    signOpts: Record<string, unknown> = {},
  ) =>
    jwt.sign(
      { sub: u.id, email: u.email, roles: u.roles, permissions: [], jti: randomUUID(), ...overrides },
      {
        privateKey: process.env.TEST_JWT_PRIVATE_KEY,
        algorithm: 'RS256',
        issuer: 'test-issuer',
        audience: 'test-audience',
        expiresIn: 600,
        ...signOpts,
      },
    );

  const auth = (u = userA) => ({ Authorization: `Bearer ${tokenFor(u)}` });

  const eventBody = (over: Record<string, unknown> = {}) => ({
    name: 'Scheduled Video',
    description: 'Example',
    date: '2026-01-22',
    startAt: '2026-01-22T14:00:00.000Z',
    endAt: '2026-01-22T15:00:00.000Z',
    type: 'once',
    ...over,
  });

  beforeAll(async () => {
    // The Auth Service is not running in tests: replace its user-list client with a fake.
    const fakeUsers = [userA, userB, admin].map((u) => ({
      id: u.id,
      email: u.email,
      firstName: null,
      lastName: null,
    }));
    const authUsersFake = {
      listUsers: async () => fakeUsers,
      assertUserExists: async (_token: string, id: string) => {
        if (!fakeUsers.some((u) => u.id === id)) {
          throw new BadRequestException('userId does not reference an existing user');
        }
      },
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthUsersClient)
      .useValue(authUsersFake)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    http = request.agent(app.getHttpServer());
    ds = app.get(DataSource);
  });

  beforeEach(async () => {
    await ds.query('TRUNCATE TABLE "events" RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------- infrastructure
  describe('migrations & health', () => {
    it('created the expected tables, column types and indexes', async () => {
      const cols = await ds.query(
        `SELECT table_name, column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'events'`,
      );
      const type = (t: string, c: string) =>
        cols.find((r: any) => r.table_name === t && r.column_name === c)?.data_type;
      expect(type('events', 'date')).toBe('date');
      expect(type('events', 'start_at')).toBe('timestamp with time zone');
      expect(type('events', 'end_at')).toBe('timestamp with time zone');
      expect(type('events', 'id')).toBe('uuid');

      const idx = await ds.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'events'`);
      const names = idx.map((r: any) => r.indexname);
      expect(names).toEqual(
        expect.arrayContaining(['IDX_events_user_date', 'IDX_events_date', 'IDX_events_start_at']),
      );
    });

    it('GET /health is public and reports the database', async () => {
      const res = await http.get('/api/v1/health').expect(200);
      expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
    });

    it('serves Swagger UI and the OpenAPI document', async () => {
      const ui = await http.get('/api/docs');
      expect([200, 301, 302]).toContain(ui.status);
      const json = await http.get('/api/docs-json').expect(200);
      expect(Object.keys(json.body.paths)).toEqual(
        expect.arrayContaining(['/api/v1/events', '/api/v1/events/{id}', '/api/v1/users']),
      );
    });
  });

  // ---------------------------------------------------------------- authentication
  describe('authentication', () => {
    it('rejects requests without a token', async () => {
      await http.get('/api/v1/events?date=2026-01-22').expect(401);
      await http.get('/api/v1/users').expect(401);
    });

    it('rejects garbage, wrong-key, wrong-issuer, wrong-audience and expired tokens', async () => {
      const { generateKeyPairSync } = await import('crypto');
      const other = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      const q = '/api/v1/events?date=2026-01-22';

      await http.get(q).set('Authorization', 'Bearer not.a.token').expect(401);
      const wrongKey = jwt.sign(
        { sub: userA.id, email: userA.email },
        { privateKey: other.privateKey, algorithm: 'RS256', issuer: 'test-issuer', audience: 'test-audience' },
      );
      await http.get(q).set('Authorization', `Bearer ${wrongKey}`).expect(401);
      await http.get(q).set('Authorization', `Bearer ${tokenFor(userA, {}, { issuer: 'evil' })}`).expect(401);
      await http.get(q).set('Authorization', `Bearer ${tokenFor(userA, {}, { audience: 'evil' })}`).expect(401);
      await http.get(q).set('Authorization', `Bearer ${tokenFor(userA, {}, { expiresIn: -10 })}`).expect(401);
    });

    it('rejects HS256 tokens signed with the public key (algorithm-confusion attack)', async () => {
      const forged = jwt.sign(
        { sub: userA.id, email: userA.email },
        { secret: process.env.JWT_PUBLIC_KEY, algorithm: 'HS256', issuer: 'test-issuer', audience: 'test-audience' },
      );
      await http.get('/api/v1/events?date=2026-01-22').set('Authorization', `Bearer ${forged}`).expect(401);
    });

    it('accepts a valid Auth Service token', async () => {
      await http.get('/api/v1/events?date=2026-01-22').set(auth()).expect(200);
    });
  });

  // ---------------------------------------------------------------- events CRUD
  describe('events CRUD', () => {
    it('creates, reads, updates and soft-deletes an event', async () => {
      const created = await http.post('/api/v1/events').set(auth()).send(eventBody()).expect(201);
      expect(created.body).toMatchObject({
        name: 'Scheduled Video',
        date: '2026-01-22',
        startAt: '2026-01-22T14:00:00.000Z',
        endAt: '2026-01-22T15:00:00.000Z',
        type: 'once',
        userId: userA.id,
        isDeleted: false,
      });
      const id = created.body.id;

      const got = await http.get(`/api/v1/events/${id}`).set(auth()).expect(200);
      expect(got.body.id).toBe(id);

      const patched = await http
        .patch(`/api/v1/events/${id}`)
        .set(auth())
        .send({ name: 'Renamed', type: 'daily', description: null })
        .expect(200);
      expect(patched.body).toMatchObject({ name: 'Renamed', type: 'daily', description: null });
      expect(patched.body.date).toBe('2026-01-22');

      await http.delete(`/api/v1/events/${id}`).set(auth()).expect(204);
      await http.get(`/api/v1/events/${id}`).set(auth()).expect(404);
      const list = await http.get('/api/v1/events?date=2026-01-22').set(auth()).expect(200);
      expect(list.body).toHaveLength(0);

      // soft delete: the row is still in the table
      const rows = await ds.query(`SELECT is_deleted FROM events WHERE id = $1`, [id]);
      expect(rows).toEqual([{ is_deleted: true }]);
      await http.delete(`/api/v1/events/${id}`).set(auth()).expect(404);
    });

    it('allows overlapping events', async () => {
      await http.post('/api/v1/events').set(auth()).send(eventBody()).expect(201);
      await http.post('/api/v1/events').set(auth()).send(eventBody({ name: 'Overlap' })).expect(201);
      const list = await http.get('/api/v1/events?date=2026-01-22').set(auth()).expect(200);
      expect(list.body).toHaveLength(2);
    });

    it('returns 400 for a malformed id', async () => {
      await http.get('/api/v1/events/not-a-uuid').set(auth()).expect(400);
    });

    it('returns 404 for an unknown id', async () => {
      await http.get(`/api/v1/events/${randomUUID()}`).set(auth()).expect(404);
    });
  });

  // ---------------------------------------------------------------- validation
  describe('validation', () => {
    const invalid: Array<[string, Record<string, unknown>]> = [
      ['missing name', { name: undefined }],
      ['blank name', { name: '   ' }],
      ['bad date', { date: '2026-02-30' }],
      ['timestamp without offset', { startAt: '2026-01-22T14:00:00' }],
      ['garbage timestamp', { endAt: 'tomorrow' }],
      ['end before start', { endAt: '2026-01-22T13:00:00.000Z' }],
      ['end equal to start', { endAt: '2026-01-22T14:00:00.000Z' }],
      ['unsupported type', { type: 'movie' }],
      ['non-uuid userId', { userId: 'abc' }],
      ['removed type', { type: 'video' }],
      ['date far from startAt', { date: '2026-01-10' }],
      ['unknown property', { isDeleted: true }],
    ];
    it.each(invalid)('POST rejects: %s', async (_label, over) => {
      const res = await http.post('/api/v1/events').set(auth()).send(eventBody(over)).expect(400);
      expect(res.body).toHaveProperty('statusCode', 400);
      expect(res.body).toHaveProperty('message');
      expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts/); // no stack traces
    });

    it('PATCH re-validates the merged timing and rejects nulling required fields', async () => {
      const { body } = await http.post('/api/v1/events').set(auth()).send(eventBody()).expect(201);
      await http.patch(`/api/v1/events/${body.id}`).set(auth()).send({ endAt: '2026-01-22T13:00:00.000Z' }).expect(400);
      await http.patch(`/api/v1/events/${body.id}`).set(auth()).send({ name: null }).expect(400);
    });

    it('list requires date or a full valid range', async () => {
      await http.get('/api/v1/events').set(auth()).expect(400);
      await http.get('/api/v1/events?startDate=2026-01-01').set(auth()).expect(400);
      await http.get('/api/v1/events?date=2026-01-01&startDate=2026-01-01&endDate=2026-01-02').set(auth()).expect(400);
      await http.get('/api/v1/events?startDate=2026-02-01&endDate=2026-01-01').set(auth()).expect(400);
      await http.get('/api/v1/events?startDate=2026-01-01&endDate=2028-01-01').set(auth()).expect(400);
      await http.get('/api/v1/events?date=2026-13-45').set(auth()).expect(400);
    });
  });

  // ---------------------------------------------------------------- timezone & filtering
  describe('logical date vs UTC (critical timezone behaviour)', () => {
    it('keeps an evening event on its logical date even though its UTC date is the next day', async () => {
      // 20:00-21:00 on Jan 22 in UTC-8  ==  04:00-05:00Z on Jan 23
      const res = await http
        .post('/api/v1/events')
        .set(auth())
        .send(eventBody({ date: '2026-01-22', startAt: '2026-01-22T20:00:00-08:00', endAt: '2026-01-22T21:00:00-08:00' }))
        .expect(201);
      expect(res.body.date).toBe('2026-01-22');
      expect(res.body.startAt).toBe('2026-01-23T04:00:00.000Z');
      expect(res.body.endAt).toBe('2026-01-23T05:00:00.000Z');

      // DB stores the correct absolute instant and the logical date independently
      const [row] = await ds.query(
        `SELECT to_char(date, 'YYYY-MM-DD') AS d,
                to_char(start_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS s
         FROM events WHERE id = $1`,
        [res.body.id],
      );
      expect(row.d).toBe('2026-01-22');
      expect(row.s).toBe('2026-01-23T04:00:00Z');

      const onJan22 = await http.get('/api/v1/events?date=2026-01-22').set(auth()).expect(200);
      expect(onJan22.body.map((e: any) => e.id)).toEqual([res.body.id]);
      const onJan23 = await http.get('/api/v1/events?date=2026-01-23').set(auth()).expect(200);
      expect(onJan23.body).toHaveLength(0);
    });

    it('handles a Karachi (UTC+5) midnight event', async () => {
      const res = await http
        .post('/api/v1/events')
        .set(auth())
        .send(eventBody({ date: '2026-01-22', startAt: '2026-01-22T00:00:00+05:00', endAt: '2026-01-22T01:00:00+05:00' }))
        .expect(201);
      expect(res.body.startAt).toBe('2026-01-21T19:00:00.000Z');
      const list = await http.get('/api/v1/events?date=2026-01-22').set(auth()).expect(200);
      expect(list.body).toHaveLength(1);
    });

    it('groups correctly across month and year boundaries with inclusive ranges', async () => {
      const mk = (name: string, date: string, startAt: string, endAt: string) =>
        http.post('/api/v1/events').set(auth()).send(eventBody({ name, date, startAt, endAt })).expect(201);
      await mk('jan-31-evening', '2026-01-31', '2026-01-31T22:00:00-05:00', '2026-01-31T23:00:00-05:00');
      await mk('feb-01-early', '2026-02-01', '2026-02-01T00:30:00Z', '2026-02-01T01:00:00Z');
      await mk('dec-31-evening', '2026-12-31', '2026-12-31T23:00:00-08:00', '2027-01-01T00:30:00-08:00');
      await mk('jan-01-2027', '2027-01-01', '2027-01-01T10:00:00Z', '2027-01-01T11:00:00Z');

      const jan = await http.get('/api/v1/events?startDate=2026-01-01&endDate=2026-01-31').set(auth()).expect(200);
      expect(jan.body.map((e: any) => e.name)).toEqual(['jan-31-evening']);
      const feb = await http.get('/api/v1/events?startDate=2026-02-01&endDate=2026-02-28').set(auth()).expect(200);
      expect(feb.body.map((e: any) => e.name)).toEqual(['feb-01-early']);
      const both = await http.get('/api/v1/events?startDate=2026-01-31&endDate=2026-02-01').set(auth()).expect(200);
      // ordered by absolute instant: 00:30Z Feb 1 comes before 03:00Z Feb 1 (= 22:00 Jan 31 UTC-5)
      expect(both.body.map((e: any) => e.name)).toEqual(['feb-01-early', 'jan-31-evening']);
      const y2026 = await http.get('/api/v1/events?startDate=2026-12-31&endDate=2026-12-31').set(auth()).expect(200);
      expect(y2026.body.map((e: any) => e.name)).toEqual(['dec-31-evening']);
    });

    it('orders a day by absolute start time and supports type filtering', async () => {
      const mk = (name: string, h: number, type: string) =>
        http
          .post('/api/v1/events')
          .set(auth())
          .send(eventBody({ name, type, startAt: `2026-01-22T${String(h).padStart(2, '0')}:00:00Z`, endAt: `2026-01-22T${String(h).padStart(2, '0')}:30:00Z` }))
          .expect(201);
      await mk('late', 18, 'weekend');
      await mk('early', 8, 'once');
      await mk('mid', 12, 'weekend');
      const day = await http.get('/api/v1/events?date=2026-01-22').set(auth()).expect(200);
      expect(day.body.map((e: any) => e.name)).toEqual(['early', 'mid', 'late']);
      const ads = await http.get('/api/v1/events?date=2026-01-22&type=weekend').set(auth()).expect(200);
      expect(ads.body.map((e: any) => e.name)).toEqual(['mid', 'late']);
    });

    it('a PATCH that changes only the date or times still returns timestamps consistently', async () => {
      const { body } = await http.post('/api/v1/events').set(auth()).send(eventBody()).expect(201);
      const res = await http
        .patch(`/api/v1/events/${body.id}`)
        .set(auth())
        .send({ date: '2026-01-23', startAt: '2026-01-23T09:00:00.000Z', endAt: '2026-01-23T10:00:00.000Z' })
        .expect(200);
      expect(res.body.date).toBe('2026-01-23');
      expect(res.body.startAt).toBe('2026-01-23T09:00:00.000Z');
      const old = await http.get('/api/v1/events?date=2026-01-22').set(auth()).expect(200);
      expect(old.body).toHaveLength(0);
      const moved = await http.get('/api/v1/events?date=2026-01-23').set(auth()).expect(200);
      expect(moved.body).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------- ownership
  describe('per-user ownership', () => {
    it('hides other users\' events (404) and excludes them from lists', async () => {
      const a = await http.post('/api/v1/events').set(auth(userA)).send(eventBody({ name: 'A' })).expect(201);
      await http.post('/api/v1/events').set(auth(userB)).send(eventBody({ name: 'B' })).expect(201);

      const listA = await http.get('/api/v1/events?date=2026-01-22').set(auth(userA)).expect(200);
      expect(listA.body.map((e: any) => e.name)).toEqual(['A']);

      await http.get(`/api/v1/events/${a.body.id}`).set(auth(userB)).expect(404);
      await http.patch(`/api/v1/events/${a.body.id}`).set(auth(userB)).send({ name: 'hack' }).expect(404);
      await http.delete(`/api/v1/events/${a.body.id}`).set(auth(userB)).expect(404);
      await http.get(`/api/v1/events/${a.body.id}`).set(auth(userA)).expect(200);
    });

    it('lets admins see and manage every user\'s events', async () => {
      const a = await http.post('/api/v1/events').set(auth(userA)).send(eventBody({ name: 'A' })).expect(201);
      await http.post('/api/v1/events').set(auth(userB)).send(eventBody({ name: 'B' })).expect(201);

      const all = await http.get('/api/v1/events?date=2026-01-22').set(auth(admin)).expect(200);
      expect(all.body.map((e: any) => e.name).sort()).toEqual(['A', 'B']);
      await http.patch(`/api/v1/events/${a.body.id}`).set(auth(admin)).send({ name: 'edited by admin' }).expect(200);
      await http.delete(`/api/v1/events/${a.body.id}`).set(auth(admin)).expect(204);
    });

    it('rejects a client-supplied owner', async () => {
      await http.post('/api/v1/events').set(auth(userA)).send(eventBody({ ownerId: userB.id })).expect(400);
    });
  });

  // ---------------------------------------------------------------- users (admin flow)
  describe('users & assignment', () => {
    it('GET /users: admin gets the list, normal users get 403', async () => {
      const res = await http.get('/api/v1/users').set(auth(admin)).expect(200);
      expect(res.body.map((u: any) => u.id)).toEqual(expect.arrayContaining([userA.id, userB.id]));
      await http.get('/api/v1/users').set(auth(userA)).expect(403);
      await http.get('/api/v1/users').expect(401);
    });

    it('a normal user creates only for themselves (no user dropdown)', async () => {
      const own = await http.post('/api/v1/events').set(auth(userA)).send(eventBody()).expect(201);
      expect(own.body.userId).toBe(userA.id);
      await http.post('/api/v1/events').set(auth(userA)).send(eventBody({ userId: userA.id })).expect(201);
      await http.post('/api/v1/events').set(auth(userA)).send(eventBody({ userId: userB.id })).expect(403);
    });

    it('an admin assigns an event to a chosen user; only that user (and admins) see it', async () => {
      const res = await http.post('/api/v1/events').set(auth(admin)).send(eventBody({ userId: userA.id })).expect(201);
      expect(res.body.userId).toBe(userA.id);
      expect((await http.get('/api/v1/events?date=2026-01-22').set(auth(userA)).expect(200)).body).toHaveLength(1);
      expect((await http.get('/api/v1/events?date=2026-01-22').set(auth(userB)).expect(200)).body).toHaveLength(0);
      const mine = await http.post('/api/v1/events').set(auth(admin)).send(eventBody()).expect(201);
      expect(mine.body.userId).toBe(admin.id);
    });

    it('rejects an unknown target user', async () => {
      await http.post('/api/v1/events').set(auth(admin)).send(eventBody({ userId: randomUUID() })).expect(400);
    });

    it('admin can filter by user; normal users cannot', async () => {
      await http.post('/api/v1/events').set(auth(userA)).send(eventBody({ name: 'A' })).expect(201);
      await http.post('/api/v1/events').set(auth(userB)).send(eventBody({ name: 'B' })).expect(201);
      const onlyB = await http.get(`/api/v1/events?date=2026-01-22&userId=${userB.id}`).set(auth(admin)).expect(200);
      expect(onlyB.body.map((e: any) => e.name)).toEqual(['B']);
      await http.get(`/api/v1/events?date=2026-01-22&userId=${userB.id}`).set(auth(userA)).expect(403);
    });

    it('only admins can reassign an event', async () => {
      const ev = await http.post('/api/v1/events').set(auth(userA)).send(eventBody()).expect(201);
      await http.patch(`/api/v1/events/${ev.body.id}`).set(auth(userA)).send({ userId: userB.id }).expect(403);
      const moved = await http.patch(`/api/v1/events/${ev.body.id}`).set(auth(admin)).send({ userId: userB.id }).expect(200);
      expect(moved.body.userId).toBe(userB.id);
      await http.patch(`/api/v1/events/${ev.body.id}`).set(auth(admin)).send({ userId: null }).expect(400);
    });

    it('DELETE /users/:id/events permanently removes all of that user\'s events (admin only)', async () => {
      await http.post('/api/v1/events').set(auth(userA)).send(eventBody({ name: 'A1' })).expect(201);
      await http.post('/api/v1/events').set(auth(userA)).send(eventBody({ name: 'A2' })).expect(201);
      await http.post('/api/v1/events').set(auth(userB)).send(eventBody({ name: 'B1' })).expect(201);

      await http.delete(`/api/v1/users/${userA.id}/events`).set(auth(userA)).expect(403);
      await http.delete(`/api/v1/users/${userA.id}/events`).set(auth(admin)).expect(204);

      const [{ count: aCount }] = await ds.query(`SELECT count(*)::int AS count FROM events WHERE user_id = $1`, [userA.id]);
      const [{ count: bCount }] = await ds.query(`SELECT count(*)::int AS count FROM events WHERE user_id = $1`, [userB.id]);
      expect(aCount).toBe(0); // hard delete: rows are gone, not just flagged
      expect(bCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------- database constraints
  describe('database constraints (defence in depth)', () => {
    it('rejects end <= start and unknown types even when bypassing the API', async () => {
      await expect(
        ds.query(
          `INSERT INTO events (user_id, name, date, start_at, end_at, type)
           VALUES ($1, 'x', '2026-01-22', '2026-01-22T10:00:00Z', '2026-01-22T09:00:00Z', 'once')`,
          [userA.id],
        ),
      ).rejects.toThrow();
      await expect(
        ds.query(
          `INSERT INTO events (user_id, name, date, start_at, end_at, type)
           VALUES ($1, 'x', '2026-01-22', '2026-01-22T10:00:00Z', '2026-01-22T11:00:00Z', 'movie')`,
          [userA.id],
        ),
      ).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------- types smoke
  it('exposes the app as an INestApplication', () => {
    const typed: INestApplication = app;
    expect(typed).toBeDefined();
  });
});
