ALTER TABLE "tenants" ALTER COLUMN "credits_balance" SET DEFAULT 250;

UPDATE "tenants"
SET "credits_balance" = 250
WHERE "tier" = 'free'
  AND "credits_balance" = 0
  AND "credits_used" = 0
  AND "is_active" = true;
