-- Wave 3.5: item drag-to-reorder
-- Run in Supabase SQL Editor
ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
