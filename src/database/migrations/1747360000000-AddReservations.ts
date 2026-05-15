import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReservations1747360000000 implements MigrationInterface {
  name = 'AddReservations1747360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "reservations" (
        "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
        "user_id"      UUID        NOT NULL,
        "item_id"      UUID        NOT NULL,
        "fulfilled_at" TIMESTAMPTZ,
        "cancelled_at" TIMESTAMPTZ,
        "expires_at"   TIMESTAMPTZ,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reservations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_reservations_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_reservations_item"
          FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_reservations_item" ON "reservations" ("item_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_reservations_user" ON "reservations" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_reservations_user"`);
    await queryRunner.query(`DROP INDEX "IDX_reservations_item"`);
    await queryRunner.query(`DROP TABLE "reservations"`);
  }
}
