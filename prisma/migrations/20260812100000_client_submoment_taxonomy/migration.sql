WITH taxonomy("code", "name", "color", "requiresFieldLocation", "requiresGoalLocation", "defaultShortcut", "sortOrder") AS (
  VALUES
    ('PERDA', 'Perda da posse', '#ef4444', true, false, 'T', 1),
    ('GANHO_LATERAL', 'Ganho de lançamento lateral', '#06b6d4', true, false, NULL, 2),
    ('GANHO_LIVRE', 'Ganho de livre', '#8b5cf6', true, false, NULL, 3),
    ('GANHO_CANTO', 'Ganho de canto', '#ec4899', true, false, NULL, 4),
    ('ATAQUE_PROFUNDIDADE', 'Ataque à profundidade', '#f59e0b', true, false, NULL, 5),
    ('CRUZAMENTO', 'Cruzamento', '#38bdf8', true, false, 'C', 6),
    ('REMATE', 'Remate', '#facc15', true, true, 'S', 7),
    ('GOLO', 'Golo', '#22c55e', true, true, NULL, 8),
    ('RECUPERACAO', 'Recuperação da posse', '#22c55e', true, false, 'R', 9),
    ('CEDENCIA_LATERAL', 'Cedência de lançamento lateral', '#0ea5e9', true, false, NULL, 10),
    ('CEDENCIA_LIVRE', 'Cedência de livre', '#a78bfa', true, false, NULL, 11),
    ('CEDENCIA_CANTO', 'Cedência de canto', '#f472b6', true, false, NULL, 12),
    ('CRUZAMENTO_CONCEDIDO', 'Cruzamento concedido', '#fb7185', true, false, NULL, 13),
    ('REMATE_CONCEDIDO', 'Remate concedido', '#f97316', true, true, NULL, 14),
    ('GOLO_CONCEDIDO', 'Golo concedido', '#dc2626', true, true, NULL, 15)
)
INSERT INTO "SubMomentType" (
  "id", "workspaceId", "code", "name", "color", "requiresFieldLocation", "requiresGoalLocation", "defaultShortcut", "sortOrder", "active", "createdAt", "updatedAt"
)
SELECT
  workspace."id" || ':submoment:' || taxonomy."code",
  workspace."id",
  taxonomy."code",
  taxonomy."name",
  taxonomy."color",
  taxonomy."requiresFieldLocation",
  taxonomy."requiresGoalLocation",
  taxonomy."defaultShortcut",
  taxonomy."sortOrder",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Workspace" AS workspace
CROSS JOIN taxonomy
ON CONFLICT ("workspaceId", "code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "color" = EXCLUDED."color",
  "requiresFieldLocation" = EXCLUDED."requiresFieldLocation",
  "requiresGoalLocation" = EXCLUDED."requiresGoalLocation",
  "defaultShortcut" = EXCLUDED."defaultShortcut",
  "sortOrder" = EXCLUDED."sortOrder",
  "active" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

DELETE FROM "_MomentSubmomentTypes"
WHERE "A" IN (
  SELECT "id"
  FROM "MomentType"
  WHERE "code" IN ('ORG_OF', 'ORG_DEF', 'TRANS_OF', 'TRANS_DEF', 'SET_PIECES_OF', 'SET_PIECES_DEF')
);

WITH moment_family("code", "family") AS (
  VALUES
    ('ORG_OF', 'offensive'),
    ('TRANS_OF', 'offensive'),
    ('SET_PIECES_OF', 'offensive'),
    ('ORG_DEF', 'defensive'),
    ('TRANS_DEF', 'defensive'),
    ('SET_PIECES_DEF', 'defensive')
),
submoment_family("code", "family") AS (
  VALUES
    ('PERDA', 'offensive'),
    ('GANHO_LATERAL', 'offensive'),
    ('GANHO_LIVRE', 'offensive'),
    ('GANHO_CANTO', 'offensive'),
    ('ATAQUE_PROFUNDIDADE', 'offensive'),
    ('CRUZAMENTO', 'offensive'),
    ('REMATE', 'offensive'),
    ('GOLO', 'offensive'),
    ('RECUPERACAO', 'defensive'),
    ('CEDENCIA_LATERAL', 'defensive'),
    ('CEDENCIA_LIVRE', 'defensive'),
    ('CEDENCIA_CANTO', 'defensive'),
    ('CRUZAMENTO_CONCEDIDO', 'defensive'),
    ('REMATE_CONCEDIDO', 'defensive'),
    ('GOLO_CONCEDIDO', 'defensive')
)
INSERT INTO "_MomentSubmomentTypes" ("A", "B")
SELECT moment_type."id", submoment_type."id"
FROM "MomentType" AS moment_type
JOIN moment_family ON moment_family."code" = moment_type."code"
JOIN submoment_family ON submoment_family."family" = moment_family."family"
JOIN "SubMomentType" AS submoment_type
  ON submoment_type."workspaceId" = moment_type."workspaceId"
  AND submoment_type."code" = submoment_family."code"
ON CONFLICT DO NOTHING;

