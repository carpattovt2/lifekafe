-- 1. Drop everything
DROP TABLE IF EXISTS shopping_list CASCADE;
DROP TABLE IF EXISTS shopping_group_members CASCADE;
DROP TABLE IF EXISTS shopping_groups CASCADE;

-- 2. Create all tables first (no policies yet)
CREATE TABLE shopping_groups (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT timezone('utc', now())
);

CREATE TABLE shopping_group_members (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id         uuid REFERENCES shopping_groups(id) ON DELETE CASCADE NOT NULL,
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email            text NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'active')),
  invited_by_email text,
  created_at       timestamptz DEFAULT timezone('utc', now()),
  UNIQUE(group_id, email)
);

CREATE TABLE shopping_list (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id         uuid REFERENCES shopping_groups(id) ON DELETE CASCADE NOT NULL,
  text             text NOT NULL,
  checked          boolean DEFAULT false,
  created_at       timestamptz DEFAULT timezone('utc', now()),
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email text
);

-- 3. Enable RLS
ALTER TABLE shopping_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_list ENABLE ROW LEVEL SECURITY;

-- 4. Policies for shopping_groups
CREATE POLICY "groups_select" ON shopping_groups FOR SELECT TO authenticated
  USING (id IN (
    SELECT group_id FROM shopping_group_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));
CREATE POLICY "groups_insert" ON shopping_groups FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "groups_delete" ON shopping_groups FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- 5. Policies for shopping_group_members
CREATE POLICY "members_select" ON shopping_group_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR email = auth.email()
    OR group_id IN (
      SELECT group_id FROM shopping_group_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );
CREATE POLICY "members_insert" ON shopping_group_members FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "members_update" ON shopping_group_members FOR UPDATE TO authenticated
  USING (email = auth.email() OR user_id = auth.uid());
CREATE POLICY "members_delete" ON shopping_group_members FOR DELETE TO authenticated
  USING (
    email = auth.email()
    OR user_id = auth.uid()
    OR group_id IN (
      SELECT group_id FROM shopping_group_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- 6. Policies for shopping_list
CREATE POLICY "list_select" ON shopping_list FOR SELECT TO authenticated
  USING (group_id IN (
    SELECT group_id FROM shopping_group_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));
CREATE POLICY "list_insert" ON shopping_list FOR INSERT TO authenticated
  WITH CHECK (group_id IN (
    SELECT group_id FROM shopping_group_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));
CREATE POLICY "list_update" ON shopping_list FOR UPDATE TO authenticated
  USING (group_id IN (
    SELECT group_id FROM shopping_group_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));
CREATE POLICY "list_delete" ON shopping_list FOR DELETE TO authenticated
  USING (group_id IN (
    SELECT group_id FROM shopping_group_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));
