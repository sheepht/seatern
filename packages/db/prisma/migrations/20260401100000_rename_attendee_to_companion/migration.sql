-- RenameColumn
ALTER TABLE "Guest" RENAME COLUMN "attendeeCount" TO "companionCount";

-- Change default from 1 to 0
ALTER TABLE "Guest" ALTER COLUMN "companionCount" SET DEFAULT 0;

-- Convert existing data: attendeeCount (1-based, includes self) → companionCount (0-based, companions only)
UPDATE "Guest" SET "companionCount" = "companionCount" - 1;
