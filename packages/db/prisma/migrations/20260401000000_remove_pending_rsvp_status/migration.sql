-- Convert existing pending/modified guests to confirmed before removing enum values
UPDATE "Guest" SET "rsvpStatus" = 'confirmed' WHERE "rsvpStatus" IN ('pending', 'modified');

-- Create new enum without pending/modified
CREATE TYPE "RsvpStatus_new" AS ENUM ('confirmed', 'declined');

-- Alter column to use new enum
ALTER TABLE "Guest" ALTER COLUMN "rsvpStatus" DROP DEFAULT;
ALTER TABLE "Guest" ALTER COLUMN "rsvpStatus" TYPE "RsvpStatus_new" USING ("rsvpStatus"::text::"RsvpStatus_new");
ALTER TABLE "Guest" ALTER COLUMN "rsvpStatus" SET DEFAULT 'confirmed';

-- Drop old enum and rename
DROP TYPE "RsvpStatus";
ALTER TYPE "RsvpStatus_new" RENAME TO "RsvpStatus";
