CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE "invoices"
SET
  "public_token" = encode(gen_random_bytes(20), 'hex'),
  "public_token_expires_at" = now() + interval '90 days'
WHERE "status" IN ('sent', 'viewed', 'paid', 'overdue')
  AND "public_token" IS NULL;