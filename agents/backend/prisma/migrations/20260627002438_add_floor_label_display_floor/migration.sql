-- Floor display fields (2026-06-27): named/override floor display, keeps floor_number for sort.
ALTER TABLE "inventory" ADD COLUMN "floor_label" TEXT,
ADD COLUMN "display_floor" TEXT;
