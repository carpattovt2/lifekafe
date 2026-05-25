import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ShoppingPage from '@/components/ShoppingPage'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams?: { list?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const { data: memberships } = await admin
    .from('shopping_list_members')
    .select('list_id, shopping_lists(id, name, created_by)')
    .eq('user_id', user.id)
    .eq('status', 'active')

  const lists = (memberships ?? [])
    .map((m: any) => m.shopping_lists)
    .filter(Boolean) as { id: string; name: string; created_by: string | null }[]

  const pendingRes = await admin
    .from('shopping_list_members')
    .select('list_id, invited_by_email, shopping_lists(name)')
    .eq('email', user.email!.toLowerCase())
    .eq('status', 'pending')

  if (lists.length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <ShoppingPage
          lists={[]}
          selectedListId=""
          initialItems={[]}
          members={[]}
          pendingInvites={(pendingRes.data ?? []) as any}
          userEmail={user.email!}
          userId={user.id}
          uncheckedCounts={{}}
          membersByList={{}}
        />
      </div>
    )
  }

  const selectedListId = (searchParams?.list && lists.find(l => l.id === searchParams?.list))
    ? searchParams!.list!
    : lists[0].id

  const listIds = lists.map(l => l.id)

  const [itemsRes, membersRes, allMembersRes, uncheckedRes] = await Promise.all([
    admin.from('shopping_items').select('id, text, checked, created_at, created_by_email')
      .eq('list_id', selectedListId).order('created_at', { ascending: false }),
    admin.from('shopping_list_members').select('id, email, user_id, status, invited_by_email')
      .eq('list_id', selectedListId).eq('status', 'active'),
    admin.from('shopping_list_members').select('list_id, email')
      .in('list_id', listIds).eq('status', 'active'),
    admin.from('shopping_items').select('list_id').in('list_id', listIds).eq('checked', false),
  ])

  const uncheckedCounts: Record<string, number> = {}
  for (const item of uncheckedRes.data ?? []) {
    uncheckedCounts[item.list_id] = (uncheckedCounts[item.list_id] ?? 0) + 1
  }

  const membersByList: Record<string, string[]> = {}
  for (const m of allMembersRes.data ?? []) {
    if (m.email.toLowerCase() !== user.email!.toLowerCase()) {
      if (!membersByList[m.list_id]) membersByList[m.list_id] = []
      membersByList[m.list_id].push(m.email)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <ShoppingPage
        lists={lists}
        selectedListId={selectedListId}
        initialItems={itemsRes.data ?? []}
        members={membersRes.data ?? []}
        pendingInvites={(pendingRes.data ?? []) as any}
        userEmail={user.email!}
        userId={user.id}
        uncheckedCounts={uncheckedCounts}
        membersByList={membersByList}
      />
    </div>
  )
}
