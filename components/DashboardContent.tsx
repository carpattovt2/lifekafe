'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/LanguageContext'
import { formatDate } from '@/lib/i18n'
import WeatherWidget from '@/components/WeatherWidget'
import QuoteWidget from '@/components/QuoteWidget'

const CATEGORY_COLORS: Record<string, string> = {
  work:     '#3b82f6',
  workout:  '#4ade80',
  health:   '#f87171',
  personal: '#c084fc',
}

type WeightEntry = { weight_kg: number; date: string }
type Event = { id: string; title: string; category: string; event_date: string; start_time: string | null }
type TodayJournal = { gratitude: string | null; insight: string | null; stress_action: string | null } | null

type Props = {
  latestWeight:  WeightEntry | null
  weightDiff:    string | null
  events:        Event[]
  todayJournal:  TodayJournal
}

function journalPreview(j: TodayJournal): string {
  if (!j) return ''
  const first = j.gratitude ?? j.insight ?? j.stress_action ?? ''
  return first.slice(0, 90) + (first.length > 90 ? '…' : '')
}

export default function DashboardContent({ latestWeight, weightDiff, events, todayJournal }: Props) {
  const { t, lang } = useLanguage()
  const preview = journalPreview(todayJournal)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>

      {/* Welcome */}
      <div className="pixel-card card-dash" style={{ gridColumn: '1 / -1' }}>
        <div className="widget-label" style={{ color: 'var(--c-dash)' }}>{t.dashboard.dailySummary}</div>
        <div style={{ fontSize: '20px', color: 'var(--text)' }}>
          {t.dashboard.welcome} <span style={{ color: 'var(--c-dash)' }}>{t.dashboard.haveGreatDay}</span>
        </div>
      </div>

      {/* Quote */}
      <QuoteWidget />

      {/* Weather */}
      <WeatherWidget />

      {/* Weight */}
      <div className="pixel-card card-weight">
        <div className="widget-label" style={{ color: 'var(--c-weight)' }}>{t.dashboard.weightTitle}</div>
        {latestWeight ? (
          <>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '22px', color: 'var(--text)', marginBottom: '6px' }}>
              {Number(latestWeight.weight_kg).toFixed(1)}
              <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '6px' }}>{t.dashboard.kgUnit}</span>
            </div>
            <div style={{ fontSize: '15px', color: 'var(--muted)' }}>{formatDate(latestWeight.date, lang)}</div>
            {weightDiff !== null && (
              <div style={{
                marginTop: '8px', fontSize: '16px',
                color: Number(weightDiff) > 0 ? 'var(--red)' : Number(weightDiff) < 0 ? 'var(--green)' : 'var(--muted)',
              }}>
                {Number(weightDiff) > 0 ? '▲' : Number(weightDiff) < 0 ? '▼' : '—'} {Math.abs(Number(weightDiff))} {t.dashboard.kgUnit} {t.dashboard.vsPrev}
              </div>
            )}
          </>
        ) : (
          <div style={{ color: 'var(--muted)', fontSize: '16px' }}>{t.dashboard.noWeight}</div>
        )}
      </div>

      {/* Upcoming Events */}
      <div className="pixel-card card-planner" style={{ gridColumn: 'span 2' }}>
        <div className="widget-label" style={{ color: 'var(--c-planner)' }}>{t.dashboard.eventsTitle}</div>
        {events.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {events.map(ev => (
              <div key={ev.id} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border)',
              }}>
                <div style={{ width: '8px', height: '8px', background: CATEGORY_COLORS[ev.category] ?? '#888', flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: '18px' }}>{ev.title}</div>
                <div style={{ fontSize: '15px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                  {formatDate(ev.event_date, lang)}
                  {ev.start_time ? ` ${ev.start_time.slice(0, 5)}` : ''}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: 'var(--muted)', fontSize: '16px' }}>{t.dashboard.noEvents}</div>
        )}
      </div>

      {/* Journal */}
      <div className="pixel-card card-journal">
        <div className="widget-label" style={{ color: 'var(--c-journal)' }}>{t.dashboard.journalTitle}</div>
        {todayJournal ? (
          <>
            <div style={{ fontSize: '16px', color: 'var(--green)', marginBottom: '8px' }}>
              {t.dashboard.journalWritten}
            </div>
            {preview && (
              <div style={{
                fontSize: '16px', color: 'var(--muted)', lineHeight: 1.5,
                borderLeft: '2px solid var(--c-journal)', paddingLeft: '10px', marginBottom: '12px',
              }}>
                {preview}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: '16px', color: 'var(--muted)', marginBottom: '12px' }}>
            {t.dashboard.journalEmpty}
          </div>
        )}
        <Link
          href="/journal"
          className="pixel-btn pixel-btn-warning"
          style={{ fontSize: '9px', padding: '7px 12px', textDecoration: 'none' }}
        >
          {t.dashboard.journalOpen}
        </Link>
      </div>

    </div>
  )
}
