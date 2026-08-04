-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'attendant');

-- CreateEnum
CREATE TYPE "SpotStatus" AS ENUM ('available', 'occupied');

-- CreateEnum
CREATE TYPE "OccupancySource" AS ENUM ('vehicle', 'manual');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GarageLayout" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "yaml" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" UUID NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "GarageLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Floor" (
    "id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bay" (
    "id" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Bay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkingSpot" (
    "id" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "bayId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "SpotStatus" NOT NULL DEFAULT 'available',
    "occupancySource" "OccupancySource",
    "manualReason" TEXT,

    CONSTRAINT "ParkingSpot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkingSession" (
    "id" UUID NOT NULL,
    "licensePlate" TEXT NOT NULL,
    "spotId" TEXT NOT NULL,
    "checkedInAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedOutAt" TIMESTAMPTZ(6),

    CONSTRAINT "ParkingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Floor_level_key" ON "Floor"("level");

-- CreateIndex
CREATE UNIQUE INDEX "ParkingSpot_bayId_number_key" ON "ParkingSpot"("bayId", "number");

-- A vehicle may have one active visit and an active visit owns exactly one spot.
CREATE UNIQUE INDEX "ParkingSession_active_license_plate_key"
  ON "ParkingSession"("licensePlate") WHERE "checkedOutAt" IS NULL;
CREATE UNIQUE INDEX "ParkingSession_active_spot_key"
  ON "ParkingSession"("spotId") WHERE "checkedOutAt" IS NULL;

-- Keep the persisted current-state representation internally coherent.
ALTER TABLE "ParkingSpot" ADD CONSTRAINT "ParkingSpot_manual_reason_check"
  CHECK (("occupancySource" = 'manual' AND "manualReason" IS NOT NULL)
      OR ("occupancySource" <> 'manual' AND "manualReason" IS NULL)
      OR "occupancySource" IS NULL);

-- AddForeignKey
ALTER TABLE "Bay" ADD CONSTRAINT "Bay_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingSpot" ADD CONSTRAINT "ParkingSpot_bayId_fkey" FOREIGN KEY ("bayId") REFERENCES "Bay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingSession" ADD CONSTRAINT "ParkingSession_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "ParkingSpot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
