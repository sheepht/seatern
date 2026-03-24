-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('wedding', 'banquet', 'corporate', 'other');

-- CreateEnum
CREATE TYPE "OwnerType" AS ENUM ('user', 'anonymous');

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('pending', 'confirmed', 'declined', 'modified');

-- CreateEnum
CREATE TYPE "EdgeType" AS ENUM ('mutual', 'one_way', 'same_group', 'inferred');

-- CreateEnum
CREATE TYPE "AssignedBy" AS ENUM ('host', 'guest');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TEXT,
    "type" "EventType" NOT NULL DEFAULT 'wedding',
    "categories" TEXT[] DEFAULT ARRAY['男方', '女方', '共同']::TEXT[],
    "ownerType" "OwnerType" NOT NULL DEFAULT 'anonymous',
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guest" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "relationScore" INTEGER NOT NULL DEFAULT 2,
    "rsvpStatus" "RsvpStatus" NOT NULL DEFAULT 'pending',
    "attendeeCount" INTEGER NOT NULL DEFAULT 1,
    "dietaryNote" TEXT,
    "specialNote" TEXT,
    "satisfactionScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "assignedTableId" TEXT,
    "isOverflow" BOOLEAN NOT NULL DEFAULT false,
    "isIsolated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Table" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 10,
    "positionX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "positionY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageSatisfaction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "color" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Edge" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "fromGuestId" TEXT NOT NULL,
    "toGuestId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "type" "EdgeType" NOT NULL DEFAULT 'same_group',

    CONSTRAINT "Edge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestTag" (
    "id" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "assignedBy" "AssignedBy" NOT NULL DEFAULT 'host',

    CONSTRAINT "GuestTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatPreference" (
    "id" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "preferredGuestId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "SeatPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvoidPair" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "guestAId" TEXT NOT NULL,
    "guestBId" TEXT NOT NULL,
    "reason" TEXT,

    CONSTRAINT "AvoidPair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatingSnapshot" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "averageSatisfaction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeatingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_ownerType_ownerId_idx" ON "Event"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "Guest_eventId_idx" ON "Guest"("eventId");

-- CreateIndex
CREATE INDEX "Guest_assignedTableId_idx" ON "Guest"("assignedTableId");

-- CreateIndex
CREATE INDEX "Table_eventId_idx" ON "Table"("eventId");

-- CreateIndex
CREATE INDEX "Edge_eventId_idx" ON "Edge"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Edge_fromGuestId_toGuestId_key" ON "Edge"("fromGuestId", "toGuestId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_eventId_name_key" ON "Tag"("eventId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "GuestTag_guestId_tagId_key" ON "GuestTag"("guestId", "tagId");

-- CreateIndex
CREATE INDEX "SeatPreference_guestId_idx" ON "SeatPreference"("guestId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatPreference_guestId_preferredGuestId_key" ON "SeatPreference"("guestId", "preferredGuestId");

-- CreateIndex
CREATE INDEX "AvoidPair_eventId_idx" ON "AvoidPair"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "AvoidPair_guestAId_guestBId_key" ON "AvoidPair"("guestAId", "guestBId");

-- CreateIndex
CREATE INDEX "SeatingSnapshot_eventId_idx" ON "SeatingSnapshot"("eventId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "event_user_fk" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_assignedTableId_fkey" FOREIGN KEY ("assignedTableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Edge" ADD CONSTRAINT "Edge_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Edge" ADD CONSTRAINT "Edge_fromGuestId_fkey" FOREIGN KEY ("fromGuestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Edge" ADD CONSTRAINT "Edge_toGuestId_fkey" FOREIGN KEY ("toGuestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestTag" ADD CONSTRAINT "GuestTag_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestTag" ADD CONSTRAINT "GuestTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatPreference" ADD CONSTRAINT "SeatPreference_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatPreference" ADD CONSTRAINT "SeatPreference_preferredGuestId_fkey" FOREIGN KEY ("preferredGuestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvoidPair" ADD CONSTRAINT "AvoidPair_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvoidPair" ADD CONSTRAINT "AvoidPair_guestAId_fkey" FOREIGN KEY ("guestAId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvoidPair" ADD CONSTRAINT "AvoidPair_guestBId_fkey" FOREIGN KEY ("guestBId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatingSnapshot" ADD CONSTRAINT "SeatingSnapshot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
