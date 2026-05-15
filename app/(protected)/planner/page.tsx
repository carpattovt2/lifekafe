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
      <h1 style={{
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '13px',
        color: 'var(--c-planner)',
        marginBottom: '24px',
        textShadow: '0 0 12px rgba(192,132,252,0.35)',
      }}>
        ◫ PLANNER
      </h1>
      <PlannerClient initialEvents={events ?? []} userId={user!.id} />
    </div>
  )
}
