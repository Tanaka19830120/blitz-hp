-- Add photoUrl field to User model
-- Safe: nullable column, no data loss
ALTER TABLE "User" ADD COLUMN "photoUrl" TEXT;
