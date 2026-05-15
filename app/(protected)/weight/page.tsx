import { createClient } from '@/lib/supabase/server'
import WeightClient from '@/components/WeightClient'

export default async function WeightPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: entries } = await supabase
    .from('weight_entries')
    .select('*')
    .eq('user_id', user!.id)
    .order('date', { ascending: false })

  return (
    <div style={{ padding: '28px', maxWidth: 800 }}>
      <WeightClient initialEntries={entries ?? []} userId={user!.id} />
    </div>
  )
}
