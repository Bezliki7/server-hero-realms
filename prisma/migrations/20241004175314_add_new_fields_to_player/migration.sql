-- AlterTable
ALTER TABLE "player" ADD COLUMN     "losses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "victories" INTEGER NOT NULL DEFAULT 0;
