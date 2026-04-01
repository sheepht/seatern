-- DropForeignKey
ALTER TABLE "GuestTag" DROP CONSTRAINT "GuestTag_guestId_fkey";

-- DropForeignKey
ALTER TABLE "GuestTag" DROP CONSTRAINT "GuestTag_tagId_fkey";

-- DropForeignKey
ALTER TABLE "Tag" DROP CONSTRAINT "Tag_eventId_fkey";

-- AlterTable
ALTER TABLE "Guest" ADD COLUMN     "subcategoryId" TEXT;

-- DropTable
DROP TABLE "GuestTag";

-- DropTable
DROP TABLE "Tag";

-- DropEnum
DROP TYPE "AssignedBy";

-- CreateTable
CREATE TABLE "Subcategory" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,

    CONSTRAINT "Subcategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subcategory_eventId_name_key" ON "Subcategory"("eventId", "name");

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
