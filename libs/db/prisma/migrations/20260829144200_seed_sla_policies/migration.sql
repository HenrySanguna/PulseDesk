-- Data-only migration: no schema change, seeds the four SlaPolicy rows this
-- repo needs exactly once (04-add-sla-jobs "Definición de terminado"). No
-- separate seed script/tooling exists in this repo — `prisma migrate
-- deploy` applying this file IS the seeding mechanism, same as every other
-- migration. Fixed UUIDs plus `ON CONFLICT ("id") DO NOTHING` make this
-- migration safely re-appliable (mirrors the idempotent-reapply proof used
-- for the schema migrations in this change).
INSERT INTO "SlaPolicy" ("id", "name", "priority", "firstResponseMinutes", "resolutionMinutes", "createdAt")
VALUES
  ('11111111-1111-4111-8111-111111111111', 'Urgent', 'URGENT', 15, 60, CURRENT_TIMESTAMP),
  ('22222222-2222-4222-8222-222222222222', 'High', 'HIGH', 30, 240, CURRENT_TIMESTAMP),
  ('33333333-3333-4333-8333-333333333333', 'Normal', 'NORMAL', 60, 480, CURRENT_TIMESTAMP),
  ('44444444-4444-4444-8444-444444444444', 'Low', 'LOW', 120, 1440, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
