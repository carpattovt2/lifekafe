import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ShoppingList from '@/components/ShoppingList'

export const dynamic = 'force-dynamic'

async function getOrCreateGroup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  userEmail: string,
): Promise<string> {
  const { data: membership } = await supabase
    .from('shopping_group_members')
    .select('group_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single()

  if (membership) return membership.group_id

  const { randomUUID } = await import('crypto')
  const newGroupId = randomUUID()

  const { error: groupErr } = await supabase
    .from('shopping_groups')
    .insert({ id: newGroupId, created_by: userId })
  if (groupErr) {
    console.error('shopping_groups insert failed:', groupErr)
    throw new Error('Failed to create group: ' + groupErr.message)
  }

  const { error: memberErr } = await supabase
    .from('shopping_group_members')
    .insert({ group_id: newGroupId, user_id: userId, email: userEmail.toLowerCase(), status: 'active' })
  if (memberErr) {
    console.error('shopping_group_members insert failed:', memberErr)
    throw new Error('Failed to create membership: ' + memberErr.message)
  }

  return newGroupId
}

export default async function ShoppingPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const groupId = await getOrCreateGroup(supabase, user.id, user.email!)

  const [itemsRes, membersRes, invitesRes] = await Promise.all([
    supabase
      .from('shopping_list')
      .select('id, text, checked, created_at, created_by_email')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false }),
    supabase
      .from('shopping_group_members')
      .select('id, email, status, invited_by_email')
      .eq('group_id', groupId)
      .eq('status', 'active'),
    supabase
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
