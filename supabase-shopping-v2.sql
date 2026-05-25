-- ============================================================
-- Shopping List v2: household groups system
-- Run this in Supabase SQL Editor (replaces v1 if you ran it)
-- ============================================================

DROP TABLE IF EXISTS shopping_list CASCADE;
DROP TABLE IF EXISTS shopping_group_members CASCADE;
DROP TABLE IF EXISTS shopping_groups CASCADE;

-- ── Groups ────────────────────────────────────────────────────
CREATE TABLE shopping_groups (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT timezone('utc', now())
);

ALTER TABLE shopping_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "See own group"
  ON shopping_groups FOR SELECT TO authenticated
  USING (id IN (
    SELECT group_id FROM shopping_group_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "Create group"
  ON shopping_groups FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Delete own group"
  ON shopping_groups FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- ── Group members ─────────────────────────────────────────────
CREATE TABLE shopping_group_members (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id         uuid REFERENCES shopping_groups(id) ON DELETE CASCADE NOT NULL,
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email            text NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'active')),
  invited_by_email text,
  created_at       timestamp with time zone DEFAULT timezone('utc', now()),
  UNIQUE(group_id, email)
);

ALTER TABLE shopping_group_members ENABLE ROW LEVEL SECURITY;

-- Can see: own records, pending invites for me, same-group members
CREATE POLICY "See members"
  ON shopping_group_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR email = auth.email()
    OR group_id IN (
      SELECT group_id FROM shopping_group_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Insert members"
  ON shopping_group_members FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Update own invite"
  ON shopping_group_members FOR UPDATE TO authenticated
  USING (email = auth.email() OR user_id = auth.uid());

CREATE POLICY "Delete membership"
  ON shopping_group_members FOR DELETE TO authenticated
  USING (
    email = auth.email()
    OR user_id = auth.uid()
    OR group_id IN (
      SELECT group_id FROM shopping_group_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ── Shopping list ─────────────────────────────────────────────
CREATE TABLE shopping_list (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id         uuid REFERENCES shopping_groups(id) ON DELETE CASCADE NOT NULL,
  text             text NOT NULL,
  checked          boolean DEFAULT false,
  created_at       timestamp with time zone DEFAULT timezone('utc', now()),
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email text
);

ALTER TABLE shopping_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members select"
  ON shopping_list FOR SELECT TO authenticated
  USING (group_id IN (
    SELECT group_id FROM shopping_group_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "Group members insert"
  ON shopping_list FOR INSERT TO authenticated
  WITH CHECK (group_id IN (
    SELECT group_id FROM shopping_group_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "Group members update"
  ON shopping_list FOR UPDATE TO authenticated
  USING (group_id IN (
    SELECT group_id FROM shopping_group_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "Group members delete"
  ON shopping_list FOR DELETE TO authenticated
  USING (group_id IN (
    SELECT group_id FROM shopping_group_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

-- ── Realtime ──────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE shopping_list;
ALTER PUBLICATION supabase_realtime ADD TABLE shopping_group_members;
