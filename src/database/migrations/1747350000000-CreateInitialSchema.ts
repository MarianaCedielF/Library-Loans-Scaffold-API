import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInitialSchema1747350000000 implements MigrationInterface {
  name = 'CreateInitialSchema1747350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enums ────────────────────────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'librarian', 'member')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."items_type_enum" AS ENUM('book', 'magazine', 'equipment')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."loans_status_enum" AS ENUM('active', 'returned', 'overdue', 'lost')`,
    );

    // ── users ────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
        "email"         VARCHAR(255) NOT NULL,
        "password_hash" VARCHAR(255) NOT NULL,
        "first_name"    VARCHAR(100) NOT NULL,
        "last_name"     VARCHAR(100) NOT NULL,
        "role"          "public"."users_role_enum" NOT NULL DEFAULT 'member',
        "is_active"     BOOLEAN      NOT NULL DEFAULT true,
        "created_at"    TIMESTAMP    NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMP    NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users"       PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_users_email" ON "users" ("email")`);

    // ── items ────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "items" (
        "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
        "code"       VARCHAR(32)  NOT NULL,
        "title"      VARCHAR(255) NOT NULL,
        "type"       "public"."items_type_enum" NOT NULL,
        "is_active"  BOOLEAN      NOT NULL DEFAULT true,
        "created_at" TIMESTAMP    NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP    NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_items_code" UNIQUE ("code"),
        CONSTRAINT "PK_items"      PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_items_code" ON "items" ("code")`);

    // ── loans ────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "loans" (
        "id"          UUID          NOT NULL DEFAULT gen_random_uuid(),
        "user_id"     UUID          NOT NULL,
        "item_id"     UUID          NOT NULL,
        "loaned_at"   TIMESTAMPTZ   NOT NULL,
        "due_at"      TIMESTAMPTZ   NOT NULL,
        "returned_at" TIMESTAMPTZ,
        "status"      "public"."loans_status_enum" NOT NULL DEFAULT 'active',
        "fine_amount" NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        "created_at"  TIMESTAMP     NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loans" PRIMARY KEY ("id"),
        CONSTRAINT "FK_loans_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_loans_item"
          FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_loans_item_status" ON "loans" ("item_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_loans_user_status" ON "loans" ("user_id", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_loans_user_status"`);
    await queryRunner.query(`DROP INDEX "IDX_loans_item_status"`);
    await queryRunner.query(`DROP TABLE "loans"`);
    await queryRunner.query(`DROP INDEX "IDX_items_code"`);
    await queryRunner.query(`DROP TABLE "items"`);
    await queryRunner.query(`DROP INDEX "IDX_users_email"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."loans_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."items_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
  }
}
