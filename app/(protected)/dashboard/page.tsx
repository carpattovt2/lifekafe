import { createClient } from '@/lib/supabase/server'
import DashboardDateHeader from '@/components/DashboardDateHeader'
import DashboardContent from '@/components/DashboardContent'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const todayStr = new Date().toISOString().split('T')[0]

  const [weightRes, eventsRes, journalRes] = await Promise.all([
    supabase
      .from('weight_entries')
      .select('weight_kg, date')
      .eq('user_id', user!.id)
      .order('date', { ascending: false })
      .limit(2),

    supabase
      .from('events')
      .select('id, title, category, event_date, start_time')
      .eq('user_id', user!.id)
      .gte('event_date', todayStr)
      .order('event_date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(5),

    supabase
      .from('journal_entries')
      .select('gratitude, insight, stress_action')
      .eq('user_id', user!.id)
      .eq('date', todayStr)
      .maybeSingle(),
  ])

  const latestWeight = weightRes.data?.[0] ?? null
  const prevWeight   = weightRes.data?.[1] ?? null
  const weightDiff   = latestWeight && prevWeight
    ? (Number(latestWeight.weight_kg) - Number(prevWeight.weight_kg)).toFixed(1)
    : null

  return (
    <div style={{ padding: '28px', maxWidth: 1100 }}>
      <DashboardDateHeader />
      <DashboardContent
        latestWeight={latestWeight}
        weightDiff={weightDiff}
        events={eventsRes.data ?? []}
        todayJournal={journalRes.data ?? null}
      />
    </div>
  )
}
