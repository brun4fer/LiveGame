UPDATE "MomentType"
SET "defaultShortcut" = NULL
WHERE "code" IN ('SET_PIECES_OF', 'SET_PIECES_DEF');

UPDATE "MomentType"
SET "defaultShortcut" = '5', "sortOrder" = 5, "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'SET_PIECES_OF';

UPDATE "MomentType"
SET "defaultShortcut" = '6', "sortOrder" = 6, "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'SET_PIECES_DEF';

