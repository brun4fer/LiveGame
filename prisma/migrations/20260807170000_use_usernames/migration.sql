ALTER TABLE "User" ADD COLUMN "username" TEXT;

WITH ranked_users AS (
  SELECT
    "id",
    LOWER(COALESCE(NULLIF(SPLIT_PART("email", '@', 1), ''), 'user')) AS base_username,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(COALESCE(NULLIF(SPLIT_PART("email", '@', 1), ''), 'user'))
      ORDER BY "createdAt", "id"
    ) AS duplicate_number
  FROM "User"
)
UPDATE "User" AS target
SET "username" = ranked_users.base_username ||
  CASE WHEN ranked_users.duplicate_number = 1 THEN '' ELSE '_' || ranked_users.duplicate_number::TEXT END
FROM ranked_users
WHERE target."id" = ranked_users."id";

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

