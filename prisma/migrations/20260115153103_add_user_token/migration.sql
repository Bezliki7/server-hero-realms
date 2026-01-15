-- DropForeignKey
ALTER TABLE "player" DROP CONSTRAINT "player_user_id_fkey";

-- CreateTable
CREATE TABLE "user_token" (
    "userId" INTEGER NOT NULL,
    "refreshToken" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "user_token_userId_key" ON "user_token"("userId");

-- AddForeignKey
ALTER TABLE "player" ADD CONSTRAINT "player_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_token" ADD CONSTRAINT "user_token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
