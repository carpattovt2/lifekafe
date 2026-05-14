import { createClient } from '@/lib/supabase/server'
import WeatherWidget from '@/components/WeatherWidget'

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const CATEGORY_COLORS: Record<string, string> = {
  work:     '#3b82f6',
  workout:  '#22c55e',
  health:   '#ef4444',
  personal: '#a855f7',
}

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const now = new Date()
  const dateStr = `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`

  // Latest weight
  const { data: weightData } = await supabase
    .from('weight_entries')
    .select('weight_kg, date')
    .eq('user_id', user!.id)
    .order('date', { ascending: false })
    .limit(2)

  const latestWeight = weightData?.[0] ?? null
  const prevWeight = weightData?.[1] ?? null
  const weightDiff = latestWeight && prevWeight
    ? (Number(latestWeight.weight_kg) - Number(prevWeight.weight_kg)).toFixed(1)
    : null

  // Upcoming events
  const todayStr = now.toISOString().split('T')[0]
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
      {/* Date header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: '13px',
          color: 'var(--accent2)',
          marginBottom: '6px',
          textShadow: '0 0 12px rgba(6,182,212,0.4)',
        }}>
          {dateStr}
        </h1>
        <div style={{ color: 'var(--muted)', fontSize: '16px' }}>
          &gt; SYSTEM READY<span className="blink">_</span>
        </div>
      </div>

      {/* Widgets grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>

        {/* Welcome */}
        <div className="pixel-card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '9px', color: 'var(--muted)', marginBottom: '10px' }}>
            DAILY SUMMARY
          </div>
          <div style={{ fontSize: '20px', color: 'var(--text)' }}>
            Welcome to lifekafe! <span style={{ color: 'var(--accent2)' }}>Have a great day.</span>
          </div>
        </div>

        {/* Weather */}
        <WeatherWidget />

        {/* Current Weight */}
        <div className="pixel-card">
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '9px', color: 'var(--muted)', marginBottom: '12px' }}>
            ⚖ WEIGHT
          </div>
          {latestWeight ? (
            <>
              <div style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '22px',
                color: 'var(--text)',
                marginBottom: '6px',
              }}>
                {Number(latestWeight.weight_kg).toFixed(1)}<span style={{ fontSize: '12px', color: 'var(--muted)', marginLeft: '6px' }}>kg</span>
              </div>
              <div style={{ fontSize: '15px', color: 'var(--muted)' }}>
                {latestWeight.date}
              </div>
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
        <div className="pixel-card" style={{ gridColumn: 'span 2' }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '9px', color: 'var(--muted)', marginBottom: '12px' }}>
            ◫ UPCOMING EVENTS
          </div>
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
                  <div style={{
                    width: '8px',
                    height: '8px',
                    background: CATEGORY_COLORS[ev.category] ?? '#888',
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, fontSize: '18px' }}>{ev.title}</div>
                  <div style={{ fontSize: '15px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {ev.event_date}
                    {ev.start_time && ` ${ev.start_time.slice(0,5)}`}
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
