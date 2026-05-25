import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { randomUUID } from 'crypto'
import ShoppingPage from '@/components/ShoppingPage'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams?: { list?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Get all lists user is active member of
  const { data: memberships } = await admin
    .from('shopping_list_members')
    .select('list_id, shopping_lists(id, name, created_by)')
    .eq('user_id', user.id)
    .eq('status', 'active')

  let lists = (memberships ?? [])
    .map((m: any) => m.shopping_lists)
    .filter(Boolean) as { id: string; name: string; created_by: string | null }[]

  // Create personal list if user has none
  if (lists.length === 0) {
    const id = randomUUID()
    await admin.from('shopping_lists').insert({ id, name: 'Список покупок', created_by: user.id })
    await admin.from('shopping_list_members').insert({
      list_id: id, user_id: user.id,
      email: user.email!.toLowerCase(), status: 'active',
    })
    lists = [{ id, name: 'Список покупок', created_by: user.id }]
  }

  // Determine selected list
  const selectedListId = (searchParams?.list && lists.find(l => l.id === searchParams?.list))
    ? searchParams!.list!
    : lists[0].id

  // Fetch data for selected list
  const [itemsRes, membersRes, pendingRes] = await Promise.all([
    admin
      .from('shopping_items')
      .select('id, text, checked, created_at, created_by_email')
      .eq('list_id', selectedListId)
      .order('created_at', { ascending: false }),
    admin
      .from('shopping_list_members')
      .select('id, email, user_id, status, invited_by_email')
      .eq('list_id', selectedListId)
      .eq('status', 'active'),
    admin
      .from('shopping_list_members')
      .select('list_id, invited_by_email, shopping_lists(name)')
      .eq('email', user.email!.toLowerCase())
      .eq('status', 'pending'),
  ])

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
      />
    </div>
  )
}
