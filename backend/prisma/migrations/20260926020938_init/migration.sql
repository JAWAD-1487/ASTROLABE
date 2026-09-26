-- CreateEnum
CREATE TYPE "RepositoryStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "status" "RepositoryStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "lineCount" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "imports" JSONB NOT NULL DEFAULT '[]',
    "exports" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Repository_sessionId_idx" ON "Repository"("sessionId");

-- CreateIndex
CREATE INDEX "File_repoId_idx" ON "File"("repoId");

-- CreateIndex
CREATE INDEX "File_repoId_path_idx" ON "File"("repoId", "path");

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
