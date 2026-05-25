-- Wave 3: drag-to-reorder + archive
-- Run in Supabase SQL Editor

ALTER TABLE shopping_list_members ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;
