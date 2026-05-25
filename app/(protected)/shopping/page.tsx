import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { randomUUID } from 'crypto'
import ShoppingList from '@/components/ShoppingList'

export const dynamic = 'force-dynamic'

async function getOrCreateGroup(userId: string, userEmail: string): Promise<string> {
  const admin = createAdminClient()

  const { data: rows } = await admin
    .from('shopping_group_members')
    .select('group_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)

  if (rows && rows.length > 0) return rows[0].group_id

  const newGroupId = randomUUID()
  await admin.from('shopping_groups').insert({ id: newGroupId, created_by: userId })
  await admin.from('shopping_group_members').insert({
    group_id: newGroupId,
    user_id: userId,
    email: userEmail.toLowerCase(),
    status: 'active',
  })

  return newGroupId
}

export default async function ShoppingPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const groupId = await getOrCreateGroup(user.id, user.email!)

  const [itemsRes, membersRes, invitesRes] = await Promise.all([
    admin
      .from('shopping_list')
      .select('id, text, checked, created_at, created_by_email')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false }),
    admin
      .from('shopping_group_members')
      .select('id, email, status, invited_by_email')
      .eq('group_id', groupId)
      .eq('status', 'active'),
    admin
      .from('shopping_group_members')
      .select('group_id, invited_by_email')
      .eq('email', user.email!.toLowerCase())
      .eq('status', 'pending'),
  ])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <ShoppingList
        initialItems={itemsRes.data ?? []}
        userEmail={user.email!}
        groupId={groupId}
        groupMembers={(membersRes.data ?? []).filter(m => m.email !== user.email!.toLowerCase())}
        pendingInvites={invitesRes.data ?? []}
      />
    </div>
  )
}
