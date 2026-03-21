-- AlterTable: make email optional and add phone for vendor users
ALTER TABLE "vendor_users" ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "vendor_users" ADD COLUMN "phone" VARCHAR(20);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_users_phone_key" ON "vendor_users"("phone");
