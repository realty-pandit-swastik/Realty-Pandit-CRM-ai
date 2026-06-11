ALTER TABLE "agents"
  ADD COLUMN "gender" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "preferred_language" TEXT NOT NULL DEFAULT 'hi_en';
