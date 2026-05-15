import { createClient } from '@/lib/supabase/server'
import WeatherWidget from '@/components/WeatherWidget'
import DashboardDateHeader from '@/components/DashboardDateHeader'
import QuoteWidget from '@/components/QuoteWidget'

const CATEGORY_COLORS: Record<string, string> = {
  work:     '#3b82f6',
  workout:  '#4ade80',
  health:   '#f87171',
  personal: '#c084fc',
}

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const todayStr = new Date().toISOString().split('T')[0]

  const { data: weightData } = await supabase
    .from('weight_entries')
    .select('weight_kg, date')
    .eq('user_id', user!.id)
    .order('date', { ascending: false })
    .limit(2)

  const latestWeight = weightData?.[0] ?? null
  const prevWeight   = weightData?.[1] ?? null
  const weightDiff   = latestWeight && prevWeight
    ? (Number(latestWeight.weight_kg) - Number(prevWeight.weight_kg)).toFixed(1)
    : null

  const { data: events } = await supabase
    .from('events')
    .select('*')
    .eq('user_id', user!.id)
    .gte('event_date', todayStr)
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(5)

  return (
    <div style={{ padding: '28px', maxWidth: 1100 }}>
      <DashboardDateHeader />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>

        {/* Welcome */}
        <div className="pixel-card card-dash" style={{ gridColumn: '1 / -1' }}>
          <div className="widget-label" style={{ color: 'var(--c-dash)' }}>DAILY SUMMARY</div>
          <div style={{ fontSize: '20px', color: 'var(--text)' }}>
            Welcome to lifekafe! <span style={{ color: 'var(--c-dash)' }}>Have a great day.</span>
          </div>
        </div>

        {/* Quote */}
        <QuoteWidget />

        {/* Weather */}
        <WeatherWidget />

        {/* Weight */}
        <div className="pixel-card card-weight">
          <div className="widget-label" style={{ color: 'var(--c-weight)' }}>⚖ WEIGHT</div>
          {latestWeight ? (
            <>
              <div style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '22px',
                color: 'var(--text)',
                marginBottom: '6px',
              }}>
                {Number(latestWeight.weight_kg).toFixed(1)}
                <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '6px' }}>kg</span>
              </div>
              <div style={{ fontSize: '15px', color: 'var(--muted)' }}>{latestWeight.date}</div>
              {weightDiff !== null && (
                <div style={{
                  marginTop: '8px',
                  fontSize: '16px',
                  color: Number(weightDiff) > 0 ? 'var(--red)' : Number(weightDiff) < 0 ? 'var(--green)' : 'var(--muted)',
                }}>
                  {Number(weightDiff) > 0 ? '▲' : Number(weightDiff) < 0 ? '▼' : '—'} {Math.abs(Number(weightDiff))} kg vs prev
                </div>
              )}
            </>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: '16px' }}>No entries yet</div>
          )}
        </div>

        {/* Upcoming Events */}
        <div className="pixel-card card-planner" style={{ gridColumn: 'span 2' }}>
          <div className="widget-label" style={{ color: 'var(--c-planner)' }}>◫ UPCOMING EVENTS</div>
          {events && events.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {events.map((ev) => (
                <div key={ev.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 10px',
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ width: '8px', height: '8px', background: CATEGORY_COLORS[ev.category] ?? '#888', flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: '18px' }}>{ev.title}</div>
                  <div style={{ fontSize: '15px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {ev.event_date}{ev.start_time ? ` ${ev.start_time.slice(0,5)}` : ''}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: '16px' }}>No upcoming events</div>
          )}
        </div>

      </div>
    </div>
  )
}
