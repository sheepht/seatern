-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "planExpiresAt" TIMESTAMP(3),
ADD COLUMN     "planStatus" TEXT,
ADD COLUMN     "planType" TEXT;
