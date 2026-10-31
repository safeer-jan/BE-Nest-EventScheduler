import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema: events.
 *  - `date`      DATE         logical calendar date chosen by the user (never derived from UTC)
 *  - `start_at`  TIMESTAMPTZ  absolute instant
 *  - `end_at`    TIMESTAMPTZ  absolute instant (> start_at, enforced by CHECK)
 * `user_id` is the Auth Service user id. No foreign key: users live in another service.
 * gen_random_uuid() is built into PostgreSQL 13+.
 */
export class InitSchema1760000000000 implements MigrationInterface {
  name = 'InitSchema1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "name" character varying(200) NOT NULL,
        "description" text,
        "date" date NOT NULL,
        "start_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "end_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "type" character varying(16) NOT NULL,
        "series_id" uuid,
        "is_deleted" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_events_time_order" CHECK ("end_at" > "start_at"),
        CONSTRAINT "CHK_events_type" CHECK ("type" IN ('daily', 'once', 'weekend'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_events_user_date" ON "events" ("user_id", "date") WHERE "is_deleted" = false`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_events_date" ON "events" ("date") WHERE "is_deleted" = false`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_events_start_at" ON "events" ("start_at")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_events_series" ON "events" ("series_id") WHERE "series_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "events"`);
  }
}
