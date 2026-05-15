import { createClient } from '@/lib/supabase/server'
import PlannerClient from '@/components/PlannerClient'

export default async function PlannerPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: events } = await supabase
    .from('events')
    .select('*')
    .eq('user_id', user!.id)
    .order('event_date', { ascending: true })

  return (
    <div style={{ padding: '28px', maxWidth: 1100 }}>
      <PlannerClient initialEvents={events ?? []} userId={user!.id} />
    </div>
  )
}
