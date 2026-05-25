-- Shopping v3: multi-list architecture
-- Run in Supabase SQL Editor

DROP TABLE IF EXISTS shopping_items CASCADE;
DROP TABLE IF EXISTS shopping_list_members CASCADE;
DROP TABLE IF EXISTS shopping_lists CASCADE;
DROP TABLE IF EXISTS shopping_list CASCADE;
DROP TABLE IF EXISTS shopping_group_members CASCADE;
DROP TABLE IF EXISTS shopping_groups CASCADE;

CREATE TABLE shopping_lists (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text NOT NULL DEFAULT 'Список покупок',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE shopping_list_members (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id          uuid REFERENCES shopping_lists(id) ON DELETE CASCADE NOT NULL,
  user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email            text NOT NULL,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active')),
  invited_by_email text,
  created_at       timestamptz DEFAULT now(),
  UNIQUE(list_id, email)
);

CREATE TABLE shopping_items (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id          uuid REFERENCES shopping_lists(id) ON DELETE CASCADE NOT NULL,
  text             text NOT NULL,
  checked          boolean DEFAULT false,
  created_at       timestamptz DEFAULT now(),
  created_by_email text
);

ALTER TABLE shopping_lists       ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_list_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_items       ENABLE ROW LEVEL SECURITY;

-- members: simple non-recursive policy
CREATE POLICY "slm_select" ON shopping_list_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR email = auth.email());
CREATE POLICY "slm_insert" ON shopping_list_members FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "slm_update" ON shopping_list_members FOR UPDATE TO authenticated
  USING (email = auth.email() OR user_id = auth.uid());
CREATE POLICY "slm_delete" ON shopping_list_members FOR DELETE TO authenticated
  USING (email = auth.email() OR user_id = auth.uid());

-- lists
CREATE POLICY "lists_select" ON shopping_lists FOR SELECT TO authenticated
  USING (id IN (
    SELECT list_id FROM shopping_list_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));
CREATE POLICY "lists_insert" ON shopping_lists FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "lists_delete" ON shopping_lists FOR DELETE TO authenticated
  USING (created_by = auth.uid());
CREATE POLICY "lists_update" ON shopping_lists FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

-- items
CREATE POLICY "items_select" ON shopping_items FOR SELECT TO authenticated
  USING (list_id IN (
    SELECT list_id FROM shopping_list_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));
CREATE POLICY "items_insert" ON shopping_items FOR INSERT TO authenticated
  WITH CHECK (list_id IN (
    SELECT list_id FROM shopping_list_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));
CREATE POLICY "items_update" ON shopping_items FOR UPDATE TO authenticated
  USING (list_id IN (
    SELECT list_id FROM shopping_list_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));
CREATE POLICY "items_delete" ON shopping_items FOR DELETE TO authenticated
  USING (list_id IN (
    SELECT list_id FROM shopping_list_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));
