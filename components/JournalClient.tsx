'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/LanguageContext'
import { formatDate } from '@/lib/i18n'

type JournalEntry = {
  id: string
  user_id: string
  date: string
  gratitude: string | null
  insight: string | null
  stress_action: string | null
  created_at: string
}

function today() { return new Date().toISOString().split('T')[0] }

function firstNonEmpty(...fields: (string | null)[]): string {
  for (const f of fields) if (f?.trim()) return f.trim()
  return ''
}

export default function JournalClient({
  initialEntries,
  userId,
}: {
  initialEntries: JournalEntry[]
  userId: string
}) {
  const { t, lang } = useLanguage()
  const [entries, setEntries] = useState<JournalEntry[]>(initialEntries)
  const [selectedDate, setSelectedDate] = useState(today())
  const [gratitude, setGratitude]       = useState('')
  const [insight, setInsight]           = useState('')
  const [stressAction, setStressAction] = useState('')
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)
  const [error, setError]               = useState('')
  const supabase = createClient()

  // Load entry for the selected date
  useEffect(() => {
    const entry = entries.find(e => e.date === selectedDate)
    setGratitude(entry?.gratitude ?? '')
    setInsight(entry?.insight ?? '')
    setStressAction(entry?.stress_action ?? '')
    setSaved(false)
    setError('')
  }, [selectedDate, entries])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)

    const { data, error: err } = await supabase
      .from('journal_entries')
      .upsert(
        {
          user_id:      userId,
          date:         selectedDate,
          gratitude:    gratitude || null,
          insight:      insight || null,
          stress_action: stressAction || null,
        },
        { onConflict: 'user_id,date' }
      )
      .select()
      .single()

    if (err) {
      setError(err.message)
    } else if (data) {
      const updated = data as JournalEntry
      setEntries(prev => {
        const without = prev.filter(e => e.date !== selectedDate)
        return [updated, ...without].sort((a, b) => b.date.localeCompare(a.date))
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  const isToday = selectedDate === today()
  const hasContent = gratitude.trim() || insight.trim() || stressAction.trim()

  const historyEntries = entries.filter(e => e.date !== today() || entries.some(x => x.date === today()))
    .sort((a, b) => b.date.localeCompare(a.date))

  return (
    <>
      {/* Page title */}
      <h1 style={{
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '12px',
        color: 'var(--c-journal)',
        marginBottom: '24px',
        textShadow: '0 0 12px rgba(251,146,60,0.35)',
      }}>
        {t.journal.pageTitle}
      </h1>

      {/* Form card */}
      <div className="pixel-card card-journal" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div className="widget-label" style={{ color: 'var(--c-journal)', marginBottom: 0 }}>
            {isToday ? t.journal.todayLabel : `${t.journal.entryFor} ${formatDate(selectedDate, lang)}`}
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{
              background: 'var(--bg)',
              border: '2px solid var(--border)',
              color: 'var(--muted)',
              fontFamily: "'VT323', monospace",
              fontSize: '16px',
              padding: '4px 8px',
              outline: 'none',
              cursor: 'pointer',
            }}
          />
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <JournalField
            label={t.journal.gratitudeQ}
            value={gratitude}
            onChange={setGratitude}
            placeholder={t.journal.gratitudePh}
            accentColor="var(--c-journal)"
          />
          <JournalField
            label={t.journal.insightQ}
            value={insight}
            onChange={setInsight}
            placeholder={t.journal.insightPh}
            accentColor="#fbbf24"
          />
          <JournalField
            label={t.journal.stressQ}
            value={stressAction}
            onChange={setStressAction}
            placeholder={t.journal.stressPh}
            accentColor="#f87171"
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', paddingTop: '4px' }}>
            <button
              type="submit"
              className="pixel-btn pixel-btn-warning"
              disabled={saving || !hasContent}
              style={{ opacity: !hasContent ? 0.5 : 1 }}
            >
              {saving ? t.journal.saving : t.journal.save}
            </button>
            {saved && (
              <span style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '9px',
                color: 'var(--green)',
              }}>
                {t.journal.saved}
              </span>
            )}
            {error && (
              <span style={{ fontSize: '15px', color: 'var(--red)' }}>⚠ {error}</span>
            )}
          </div>
        </form>
      </div>

      {/* History */}
      <div className="pixel-card card-journal" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: '8px',
          color: 'var(--muted)',
          padding: '12px 16px',
          borderBottom: '2px solid var(--border)',
          background: 'var(--bg3)',
        }}>
          {t.journal.history}
        </div>

        {historyEntries.length === 0 ? (
          <div style={{ padding: '24px 16px', color: 'var(--muted)', fontSize: '16px' }}>
            {t.journal.noEntries}
          </div>
        ) : (
          historyEntries.map(entry => {
            const preview = firstNonEmpty(entry.gratitude, entry.insight, entry.stress_action)
            const isSelected = entry.date === selectedDate
            return (
              <div
                key={entry.id}
                onClick={() => setSelectedDate(entry.date)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(251,146,60,0.07)' : 'transparent',
                  borderLeft: isSelected ? '3px solid var(--c-journal)' : '3px solid transparent',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg3)' }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ minWidth: 120 }}>
                  <div style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '8px',
                    color: isSelected ? 'var(--c-journal)' : 'var(--muted)',
                  }}>
                    {entry.date === today() ? '● TODAY' : formatDate(entry.date, lang)}
                  </div>
                </div>
                <div style={{
                  flex: 1,
                  fontSize: '16px',
                  color: 'var(--muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {preview
                    ? preview.slice(0, 100) + (preview.length > 100 ? '…' : '')
                    : <span style={{ fontStyle: 'italic' }}>{t.journal.noPreview}</span>
                  }
                </div>
              </div>
            )
          })
        )}
      </div>
    </>
  )
}

function JournalField({
  label, value, onChange, placeholder, accentColor,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  accentColor: string
}) {
  return (
    <div>
      <label style={{
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '8px',
        color: accentColor,
        display: 'block',
        marginBottom: '8px',
        lineHeight: 1.8,
      }}>
        {label}
      </label>
      <textarea
        className="pixel-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        style={{
          resize: 'vertical',
          lineHeight: '1.5',
          borderColor: value.trim() ? accentColor : undefined,
          boxShadow: value.trim() ? `0 0 6px ${accentColor}33` : undefined,
        }}
      />
    </div>
  )
}
