UPDATE "MomentType"
SET "code" = 'SET_PIECES_DEF',
    "name" = 'Defensive Set Pieces',
    "color" = '#a78bfa',
    "defaultShortcut" = '5',
    "sortOrder" = 5,
    "active" = true,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'BOLA_PARADA';

UPDATE "MomentType"
SET "color" = '#f59e0b', "defaultShortcut" = '3', "sortOrder" = 3, "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'TRANS_OF';

UPDATE "MomentType"
SET "color" = '#ef4444', "defaultShortcut" = '4', "sortOrder" = 4, "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'TRANS_DEF';

INSERT INTO "MomentType" ("id", "name", "code", "color", "defaultShortcut", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('moment_type_set_pieces_of', 'Offensive Set Pieces', 'SET_PIECES_OF', '#ec4899', '6', 6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "color" = EXCLUDED."color",
    "defaultShortcut" = EXCLUDED."defaultShortcut",
    "sortOrder" = EXCLUDED."sortOrder",
    "active" = true,
    "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "_MomentSubmomentTypes" ("A", "B")
SELECT moment_type."id", submoment_type."id"
FROM "MomentType" AS moment_type
CROSS JOIN "SubMomentType" AS submoment_type
WHERE moment_type."code" IN ('SET_PIECES_DEF', 'SET_PIECES_OF')
ON CONFLICT ("A", "B") DO NOTHING;

