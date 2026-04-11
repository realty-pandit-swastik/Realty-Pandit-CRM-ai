-- Add buyer demand fields to contacts table
ALTER TABLE "contacts" ADD COLUMN "demand_bhk" INTEGER;
ALTER TABLE "contacts" ADD COLUMN "demand_main_category" TEXT;
