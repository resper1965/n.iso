-- Migration: Add Confidentiality, Integrity, and Availability ratings to assets table
ALTER TABLE assets ADD COLUMN confidentiality_rating INTEGER DEFAULT 3;
ALTER TABLE assets ADD COLUMN integrity_rating INTEGER DEFAULT 3;
ALTER TABLE assets ADD COLUMN availability_rating INTEGER DEFAULT 3;
