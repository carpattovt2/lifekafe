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

const FIELD_COLORS = {
  gratitude: '#7aaa82',   // greenish
  insight:   '#6a9ab8',   // bluish
  stress:    '#c08080',   // reddish
}

export default function JournalClient({
  initialEntries,
  userId,
}: {
  initialEntries: JournalEntry[]
  userId: string
}) {
  const { t, lang } = useLanguage()
  const tj = t.journal
  const [entries, setEntries] = useState<JournalEntry[]>(initialEntries)
  const [gratitude, setGratitude]       = useState('')
  const [insight, setInsight]           = useState('')
  const [stressAction, setStressAction] = useState('')
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)
  const [error, setError]               = useState('')
  const [modalEntry, setModalEntry]     = useState<JournalEntry | null>(null)
  const [deleting, setDeleting]         = useState(false)
  const supabase = createClient()

  const todayStr = today()
  const todayEntry = entries.find(e => e.date === todayStr)

  // Load today's saved content into the form
  useEffect(() => {
    setGratitude(todayEntry?.gratitude ?? '')
    setInsight(todayEntry?.insight ?? '')
    setStressAction(todayEntry?.stress_action ?? '')
  }, [todayEntry?.id])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(''); setSaved(false)

    const { data, error: err } = await supabase
      .from('journal_entries')
      .upsert(
        { user_id: userId, date: todayStr, gratitude: gratitude || null, insight: insight || null, stress_action: stressAction || null },
        { onConflict: 'user_id,date' }
      )
      .select().single()

    if (err) {
      setError(err.message)
    } else if (data) {
      setEntries(prev => {
        const without = prev.filter(e => e.date !== todayStr)
        return [data as JournalEntry, ...without].sort((a, b) => b.date.localeCompare(a.date))
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  async function handleDelete(entry: JournalEntry) {
    if (!window.confirm(tj.deleteConfirm)) return
    setDeleting(true)
    const { error: err } = await supabase.from('journal_entries').delete().eq('id', entry.id)
    if (!err) {
      setEntries(prev => prev.filter(e => e.id !== entry.id))
      setModalEntry(null)
      if (entry.date === todayStr) { setGratitude(''); setInsight(''); setStressAction('') }
    }
    setDeleting(false)
  }

  const hasContent = gratitude.trim() || insight.trim() || stressAction.trim()
  const pastEntries = entries.filter(e => e.date !== todayStr).sort((a, b) => b.date.localeCompare(a.date))

  return (
    <>
      {/* Page title */}
      <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-journal)', marginBottom: 24, letterSpacing: '-0.01em' }}>
        {tj.pageTitle}
      </h1>

      {/* Today's entry form */}
      <div className="pixel-card card-journal" style={{ marginBottom: 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-journal)' }}>
              {tj.todayLabel}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {formatDate(todayStr, lang)}
            </div>
          </div>
          {todayEntry && (
            <button
              onClick={() => handleDelete(todayEntry)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, padding: '2px 6px', borderRadius: 6, transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
              title="Delete today's entry"
            >
              ×
            </button>
          )}
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <JournalField
            label={tj.gratitudeQ}
            value={gratitude}
            onChange={setGratitude}
            placeholder={tj.gratitudePh}
            color={FIELD_COLORS.gratitude}
          />
          <JournalField
            label={tj.insightQ}
            value={insight}
            onChange={setInsight}
            placeholder={tj.insightPh}
            color={FIELD_COLORS.insight}
          />
          <JournalField
            label={tj.stressQ}
            value={stressAction}
            onChange={setStressAction}
            placeholder={tj.stressPh}
            color={FIELD_COLORS.stress}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="submit"
              className="pixel-btn pixel-btn-warning"
              disabled={saving || !hasContent}
              style={{ opacity: !hasContent ? 0.5 : 1, fontSize: 13 }}
            >
              {saving ? tj.saving : tj.save}
            </button>
            {saved && <span style={{ fontSize: 12, color: 'var(--green)' }}>{tj.saved}</span>}
            {error && <span style={{ fontSize: 12, color: 'var(--red)' }}>⚠ {error}</span>}
          </div>
        </form>
      </div>

      {/* Past entries list */}
      {pastEntries.length > 0 && (
        <div className="pixel-card card-journal" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg3)' }}>
            {tj.history}
          </div>

          {pastEntries.map((entry, idx) => {
            const preview = firstNonEmpty(entry.gratitude, entry.insight, entry.stress_action)
            return (
              <div
                key={entry.id}
                onClick={() => setModalEntry(entry)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '12px 16px',
                  borderBottom: idx < pastEntries.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', minWidth: 90, flexShrink: 0 }}>
                  {formatDate(entry.date, lang)}
                </div>
                <div style={{ flex: 1, fontSize: 13, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {preview ? preview.slice(0, 80) + (preview.length > 80 ? '…' : '') : <em>{tj.noPreview}</em>}
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted)', flexShrink: 0 }}>
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </div>
            )
          })}
        </div>
      )}

      {entries.length === 0 && (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          {tj.noEntries}
        </div>
      )}

      {/* Past entry modal */}
      {modalEntry && (
        <div
          className="modal-overlay"
          onClick={() => setModalEntry(null)}
          style={{ alignItems: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderRadius: '16px 16px 0 0',
              padding: '20px 20px 32px',
              width: '100%',
              maxWidth: 560,
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 -4px 32px rgba(0,0,0,0.15)',
            }}
          >
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                  {formatDate(modalEntry.date, lang)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{tj.readOnly}</div>
              </div>
              <button
                onClick={() => setModalEntry(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 20, padding: '2px 6px', borderRadius: 6 }}
              >
                ×
              </button>
            </div>

            {/* Read-only fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { label: tj.gratitudeQ, value: modalEntry.gratitude, color: FIELD_COLORS.gratitude },
                { label: tj.insightQ,   value: modalEntry.insight,   color: FIELD_COLORS.insight },
                { label: tj.stressQ,    value: modalEntry.stress_action, color: FIELD_COLORS.stress },
              ].map(({ label, value, color }) => value?.trim() ? (
                <div key={label}>
                  <div style={{ fontSize: 12, fontWeight: 600, color, marginBottom: 6 }}>{label}</div>
                  <div style={{
                    fontSize: 14, lineHeight: 1.6, color: 'var(--text)',
                    background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px',
                    borderLeft: `3px solid ${color}`,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {value}
                  </div>
                </div>
              ) : null)}
            </div>

            {/* Delete button */}
            <button
              onClick={() => handleDelete(modalEntry)}
              disabled={deleting}
              className="pixel-btn pixel-btn-danger"
              style={{ marginTop: 24, width: '100%', justifyContent: 'center', fontSize: 13 }}
            >
              {deleting ? '...' : tj.deleteConfirm}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function JournalField({
  label, value, onChange, placeholder, color,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  color: string
}) {
  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, color, display: 'block', marginBottom: 8, lineHeight: 1.5 }}>
        {label}
      </label>
      <textarea
        className="pixel-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        style={{
          resize: 'vertical',
          lineHeight: 1.6,
          borderColor: value.trim() ? color : undefined,
          boxShadow: value.trim() ? `0 0 0 3px ${color}22` : undefined,
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
      />
    </div>
  )
}
