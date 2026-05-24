-- Shopping list: shared between all authenticated users
CREATE TABLE IF NOT EXISTS shopping_list (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  text             text NOT NULL,
  checked          boolean DEFAULT false,
  created_at       timestamp with time zone DEFAULT timezone('utc', now()),
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email text
);

ALTER TABLE shopping_list ENABLE ROW LEVEL SECURITY;

-- All authenticated users share one list (no per-user isolation)
CREATE POLICY "Auth users can select shopping list"
  ON shopping_list FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth users can insert shopping list"
  ON shopping_list FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users can update shopping list"
  ON shopping_list FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth users can delete shopping list"
  ON shopping_list FOR DELETE TO authenticated USING (true);

-- Enable realtime events for this table
ALTER PUBLICATION supabase_realtime ADD TABLE shopping_list;
