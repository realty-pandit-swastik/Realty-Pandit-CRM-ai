-- CreateTable
CREATE TABLE IF NOT EXISTS "inventory_counters" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "counter" INTEGER NOT NULL DEFAULT 20000,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_counters_pkey" PRIMARY KEY ("id")
);
