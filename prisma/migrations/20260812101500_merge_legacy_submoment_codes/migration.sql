WITH legacy_map("legacyCode", "targetCode") AS (
  VALUES
    ('TURNOVER', 'PERDA'),
    ('RECOVERY', 'RECUPERACAO'),
    ('CROSS', 'CRUZAMENTO'),
    ('SHOT', 'REMATE')
)
UPDATE "SubMoment" AS occurrence
SET "subMomentTypeId" = target."id"
FROM "SubMomentType" AS legacy
JOIN legacy_map ON legacy_map."legacyCode" = legacy."code"
JOIN "SubMomentType" AS target
  ON target."workspaceId" = legacy."workspaceId"
  AND target."code" = legacy_map."targetCode"
WHERE occurrence."subMomentTypeId" = legacy."id";

WITH legacy_map("legacyCode", "targetCode") AS (
  VALUES
    ('TURNOVER', 'PERDA'),
    ('RECOVERY', 'RECUPERACAO'),
    ('CROSS', 'CRUZAMENTO'),
    ('SHOT', 'REMATE')
)
INSERT INTO "_MomentSubmomentTypes" ("A", "B")
SELECT link."A", target."id"
FROM "_MomentSubmomentTypes" AS link
JOIN "SubMomentType" AS legacy ON legacy."id" = link."B"
JOIN legacy_map ON legacy_map."legacyCode" = legacy."code"
JOIN "SubMomentType" AS target
  ON target."workspaceId" = legacy."workspaceId"
  AND target."code" = legacy_map."targetCode"
ON CONFLICT DO NOTHING;

DELETE FROM "SubMomentType"
WHERE "code" IN ('TURNOVER', 'RECOVERY', 'CROSS', 'SHOT');

