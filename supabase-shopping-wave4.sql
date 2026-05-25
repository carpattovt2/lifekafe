-- Wave 4: item categories
-- Run in Supabase SQL Editor
ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other';
