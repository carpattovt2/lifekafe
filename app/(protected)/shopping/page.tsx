import { createClient } from '@/lib/supabase/server'
import ShoppingList from '@/components/ShoppingList'

export const dynamic = 'force-dynamic'

export default async function ShoppingPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: items } = await supabase
    .from('shopping_list')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <ShoppingList
        initialItems={items ?? []}
        userEmail={user?.email ?? ''}
      />
    </div>
  )
}
