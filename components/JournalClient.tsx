'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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

// Local date — avoids timezone offset shifting to UTC yesterday
function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function firstNonEmpty(...fields: (string | null)[]): string {
  for (const f of fields) if (f?.trim()) return f.trim()
  return ''
}

const FIELD_COLORS = {
  gratitude: '#7aaa82',
  insight:   '#6a9ab8',
  stress:    '#c08080',
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export default function JournalClient({
  initialEntries,
  userId,
}: {
  initialEntries: JournalEntry[]
  userId: string
}) {
  const { t, lang } = useLanguage()
  const tj = t.journal
  const supabase = createClient()

  const [entries, setEntries]       = useState<JournalEntry[]>(initialEntries)
  const [modalEntry, setModalEntry] = useState<JournalEntry | null>(null)
  const [deleting, setDeleting]     = useState(false)

  const TODAY = todayLocal()
  const todayEntry = entries.find(e => e.date === TODAY)

  // ── Today's edit state ──────────────────────────────────────────
  const [editingToday, setEditingToday] = useState(!todayEntry) // edit if no entry yet
  const [gratitude, setGratitude]       = useState(todayEntry?.gratitude ?? '')
  const [insight, setInsight]           = useState(todayEntry?.insight ?? '')
  const [stressAction, setStressAction] = useState(todayEntry?.stress_action ?? '')
  const [saveStatus, setSaveStatus]     = useState<SaveStatus>('idle')
  const savedValuesRef = useRef({ gratitude: todayEntry?.gratitude ?? '', insight: todayEntry?.insight ?? '', stress: todayEntry?.stress_action ?? '' })
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync form when todayEntry first loads (e.g. after save)
  useEffect(() => {
    if (todayEntry) {
      savedValuesRef.current = { gratitude: todayEntry.gratitude ?? '', insight: todayEntry.insight ?? '', stress: todayEntry.stress_action ?? '' }
    }
  }, [todayEntry?.id])

  const hasContent = gratitude.trim() || insight.trim() || stressAction.trim()
  const isDirty = gratitude !== savedValuesRef.current.gratitude ||
                  insight   !== savedValuesRef.current.insight   ||
                  stressAction !== savedValuesRef.current.stress

  // ── Save function ────────────────────────────────────────────────
  const performSave = useCallback(async () => {
    if (!hasContent) return
    setSaveStatus('saving')
    const { data, error } = await supabase
      .from('journal_entries')
      .upsert(
        { user_id: userId, date: TODAY, gratitude: gratitude || null, insight: insight || null, stress_action: stressAction || null },
        { onConflict: 'user_id,date' }
      )
      .select().single()

    if (error) {
      setSaveStatus('error')
    } else if (data) {
      const entry = data as JournalEntry
      setEntries(prev => {
        const without = prev.filter(e => e.date !== TODAY)
        return [entry, ...without].sort((a, b) => b.date.localeCompare(a.date))
      })
      savedValuesRef.current = { gratitude: entry.gratitude ?? '', insight: entry.insight ?? '', stress: entry.stress_action ?? '' }
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }, [gratitude, insight, stressAction, hasContent, TODAY, userId, supabase])

  // ── Autosave: 2s debounce after typing ───────────────────────────
  useEffect(() => {
    if (!editingToday || !isDirty || !hasContent) return
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => { performSave() }, 2000)
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current) }
  }, [gratitude, insight, stressAction, editingToday, isDirty, hasContent, performSave])

  function startEdit() {
    // Re-load saved values into form
    setGratitude(savedValuesRef.current.gratitude)
    setInsight(savedValuesRef.current.insight)
    setStressAction(savedValuesRef.current.stress)
    setSaveStatus('idle')
    setEditingToday(true)
  }

  function cancelEdit() {
    // Restore to saved values
    setGratitude(savedValuesRef.current.gratitude)
    setInsight(savedValuesRef.current.insight)
    setStressAction(savedValuesRef.current.stress)
    setSaveStatus('idle')
    setEditingToday(false)
  }

  async function handleDeleteEntry(entry: JournalEntry) {
    if (!window.confirm(tj.deleteConfirm)) return
    setDeleting(true)
    const { error } = await supabase.from('journal_entries').delete().eq('id', entry.id)
    if (!error) {
      setEntries(prev => prev.filter(e => e.id !== entry.id))
      setModalEntry(null)
      if (entry.date === TODAY) {
        setGratitude(''); setInsight(''); setStressAction('')
        savedValuesRef.current = { gratitude: '', insight: '', stress: '' }
        setEditingToday(true)
      }
    }
    setDeleting(false)
  }

  const pastEntries = entries.filter(e => e.date !== TODAY).sort((a, b) => b.date.localeCompare(a.date))

  return (
    <>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-journal)', marginBottom: 24, letterSpacing: '-0.01em' }}>
        {tj.pageTitle}
      </h1>

      {/* ── Today's card ─────────────────────────────────────────── */}
      <div className="pixel-card card-journal" style={{ marginBottom: 24 }}>

        {/* Card header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-journal)' }}>{tj.todayLabel}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{formatDate(TODAY, lang)}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Save status */}
            {saveStatus === 'saving' && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Зберігаю...</span>}
            {saveStatus === 'saved'  && <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 500 }}>✓ {tj.saved}</span>}
            {saveStatus === 'error'  && <span style={{ fontSize: 11, color: 'var(--red)' }}>⚠ Помилка</span>}
            {/* Delete today's entry */}
            {todayEntry && !editingToday && (
              <button onClick={() => handleDeleteEntry(todayEntry)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, padding: '2px 4px', borderRadius: 6, lineHeight: 1 }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
              >×</button>
            )}
          </div>
        </div>

        {/* ── STATE B: Read mode (entry exists, not editing) ── */}
        {todayEntry && !editingToday && (
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
              {[
                { label: tj.gratitudeQ, value: todayEntry.gratitude, color: FIELD_COLORS.gratitude },
                { label: tj.insightQ,   value: todayEntry.insight,   color: FIELD_COLORS.insight },
                { label: tj.stressQ,    value: todayEntry.stress_action, color: FIELD_COLORS.stress },
              ].map(({ label, value, color }) => value?.trim() ? (
                <div key={label}>
                  <div style={{ fontSize: 12, fontWeight: 600, color, marginBottom: 6 }}>{label}</div>
                  <div style={{
                    fontSize: 14, lineHeight: 1.65, color: 'var(--text)',
                    background: 'var(--bg3)', borderRadius: 8, padding: '10px 14px',
                    borderLeft: `3px solid ${color}`, whiteSpace: 'pre-wrap',
                  }}>
                    {value}
                  </div>
                </div>
              ) : null)}
            </div>
            <button className="pixel-btn pixel-btn-primary" onClick={startEdit} style={{ fontSize: 13 }}>
              ✏ {lang === 'ua' ? 'Редагувати' : 'Edit'}
            </button>
          </div>
        )}

        {/* ── STATE A: Edit / new entry form ── */}
        {(!todayEntry || editingToday) && (
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 20 }}>
              <JournalField label={tj.gratitudeQ} value={gratitude} onChange={setGratitude} placeholder={tj.gratitudePh} color={FIELD_COLORS.gratitude} />
              <JournalField label={tj.insightQ}   value={insight}   onChange={setInsight}   placeholder={tj.insightPh}   color={FIELD_COLORS.insight} />
              <JournalField label={tj.stressQ}    value={stressAction} onChange={setStressAction} placeholder={tj.stressPh} color={FIELD_COLORS.stress} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={performSave}
                className="pixel-btn pixel-btn-warning"
                disabled={saveStatus === 'saving' || !hasContent}
                style={{ opacity: !hasContent ? 0.5 : 1, fontSize: 13 }}
              >
                {saveStatus === 'saving' ? tj.saving : tj.save}
              </button>
              {todayEntry && (
                <button onClick={cancelEdit} className="pixel-btn pixel-btn-secondary" style={{ fontSize: 13 }}>
                  {lang === 'ua' ? 'Скасувати' : 'Cancel'}
                </button>
              )}
              {isDirty && saveStatus === 'idle' && hasContent && (
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {lang === 'ua' ? 'Автозбереження через 2с...' : 'Autosaving in 2s...'}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Past entries list ─────────────────────────────────────── */}
      {pastEntries.length > 0 && (
        <div className="pixel-card card-journal" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg3)' }}>
            {tj.history}
          </div>
          {pastEntries.map((entry, idx) => {
            const preview = firstNonEmpty(entry.gratitude, entry.insight, entry.stress_action)
            return (
              <div key={entry.id} onClick={() => setModalEntry(entry)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: idx < pastEntries.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', transition: 'background 0.12s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
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

      {/* ── Past entry modal ─────────────────────────────────────── */}
      {modalEntry && (
        <div className="modal-overlay" onClick={() => setModalEntry(null)} style={{ alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: '16px 16px 0 0', padding: '20px 20px 32px',
            width: '100%', maxWidth: 560, maxHeight: '80vh', overflowY: 'auto',
            boxShadow: '0 -4px 32px rgba(0,0,0,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{formatDate(modalEntry.date, lang)}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{tj.readOnly}</div>
              </div>
              <button onClick={() => setModalEntry(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 20, padding: '2px 6px', borderRadius: 6 }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { label: tj.gratitudeQ, value: modalEntry.gratitude, color: FIELD_COLORS.gratitude },
                { label: tj.insightQ,   value: modalEntry.insight,   color: FIELD_COLORS.insight },
                { label: tj.stressQ,    value: modalEntry.stress_action, color: FIELD_COLORS.stress },
              ].map(({ label, value, color }) => value?.trim() ? (
                <div key={label}>
                  <div style={{ fontSize: 12, fontWeight: 600, color, marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--text)', background: 'var(--bg3)', borderRadius: 8, padding: '10px 14px', borderLeft: `3px solid ${color}`, whiteSpace: 'pre-wrap' }}>
                    {value}
                  </div>
                </div>
              ) : null)}
            </div>
            <button onClick={() => handleDeleteEntry(modalEntry)} disabled={deleting}
              className="pixel-btn pixel-btn-danger"
              style={{ marginTop: 24, width: '100%', justifyContent: 'center', fontSize: 13 }}>
              {deleting ? '...' : tj.deleteConfirm}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function JournalField({ label, value, onChange, placeholder, color }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; color: string
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
          resize: 'vertical', lineHeight: 1.6,
          borderColor: value.trim() ? color : undefined,
          boxShadow: value.trim() ? `0 0 0 3px ${color}22` : undefined,
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
      />
    </div>
  )
}
