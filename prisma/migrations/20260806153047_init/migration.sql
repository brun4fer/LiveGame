-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'analyst',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "opponentName" TEXT NOT NULL,
    "competition" TEXT,
    "season" TEXT,
    "roundName" TEXT,
    "matchDate" TIMESTAMP(3),
    "venue" TEXT,
    "notes" TEXT,
    "firstHalfStartSeconds" DOUBLE PRECISION,
    "firstHalfEndSeconds" DOUBLE PRECISION,
    "secondHalfStartSeconds" DOUBLE PRECISION,
    "secondHalfEndSeconds" DOUBLE PRECISION,
    "firstHalfAttackDirection" TEXT NOT NULL DEFAULT 'left_to_right',
    "secondHalfAttackDirection" TEXT NOT NULL DEFAULT 'right_to_left',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL,
    "mimeType" TEXT NOT NULL,
    "lastModified" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MomentType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "defaultShortcut" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MomentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubMomentType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "requiresFieldLocation" BOOLEAN NOT NULL DEFAULT true,
    "requiresGoalLocation" BOOLEAN NOT NULL DEFAULT false,
    "defaultShortcut" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubMomentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Moment" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "momentTypeId" TEXT NOT NULL,
    "startTimeSeconds" DOUBLE PRECISION NOT NULL,
    "endTimeSeconds" DOUBLE PRECISION NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL,
    "period" TEXT,
    "notes" TEXT,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Moment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubMoment" (
    "id" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "subMomentTypeId" TEXT NOT NULL,
    "timeSeconds" DOUBLE PRECISION,
    "fieldX" DOUBLE PRECISION,
    "fieldY" DOUBLE PRECISION,
    "goalX" DOUBLE PRECISION,
    "goalY" DOUBLE PRECISION,
    "foot" TEXT,
    "notes" TEXT,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubMoment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_MomentSubmomentTypes" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MomentSubmomentTypes_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Video_matchId_key" ON "Video"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "MomentType_code_key" ON "MomentType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SubMomentType_code_key" ON "SubMomentType"("code");

-- CreateIndex
CREATE INDEX "Moment_matchId_idx" ON "Moment"("matchId");

-- CreateIndex
CREATE INDEX "Moment_momentTypeId_idx" ON "Moment"("momentTypeId");

-- CreateIndex
CREATE INDEX "SubMoment_momentId_idx" ON "SubMoment"("momentId");

-- CreateIndex
CREATE INDEX "SubMoment_subMomentTypeId_idx" ON "SubMoment"("subMomentTypeId");

-- CreateIndex
CREATE INDEX "_MomentSubmomentTypes_B_index" ON "_MomentSubmomentTypes"("B");

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Moment" ADD CONSTRAINT "Moment_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Moment" ADD CONSTRAINT "Moment_momentTypeId_fkey" FOREIGN KEY ("momentTypeId") REFERENCES "MomentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubMoment" ADD CONSTRAINT "SubMoment_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "Moment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubMoment" ADD CONSTRAINT "SubMoment_subMomentTypeId_fkey" FOREIGN KEY ("subMomentTypeId") REFERENCES "SubMomentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MomentSubmomentTypes" ADD CONSTRAINT "_MomentSubmomentTypes_A_fkey" FOREIGN KEY ("A") REFERENCES "MomentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MomentSubmomentTypes" ADD CONSTRAINT "_MomentSubmomentTypes_B_fkey" FOREIGN KEY ("B") REFERENCES "SubMomentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

