import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInitialSchema1747350000000 implements MigrationInterface {
  name = 'CreateInitialSchema1747350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
        "email"      VARCHAR(255) NOT NULL,
        "password"   VARCHAR(255) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "items" (
        "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
        "title"             VARCHAR(255) NOT NULL,
        "author"            VARCHAR(255) NOT NULL,
        "isbn"              VARCHAR(20),
        "description"       TEXT,
        "total_copies"      INTEGER NOT NULL DEFAULT 1,
        "available_copies"  INTEGER NOT NULL DEFAULT 1,
        "created_at"        TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_items_isbn" UNIQUE ("isbn"),
        CONSTRAINT "PK_items" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "loans" (
        "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
        "user_id"      UUID NOT NULL,
        "item_id"      UUID NOT NULL,
        "borrowed_at"  DATE NOT NULL,
        "due_date"     DATE NOT NULL,
        "returned_at"  DATE,
        "fine_amount"  NUMERIC(10,2) NOT NULL DEFAULT 0,
        "status"       VARCHAR(10) NOT NULL DEFAULT 'active',
        "created_at"   TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loans" PRIMARY KEY ("id"),
        CONSTRAINT "FK_loans_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_loans_item"
          FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "loans"`);
    await queryRunner.query(`DROP TABLE "items"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
