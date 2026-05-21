'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/LanguageContext'
import { formatDate } from '@/lib/i18n'

type CalEvent = {
  id: string
  user_id: string
  title: string
  category: string
  event_date: string
  start_time: string | null
  end_time: string | null
  is_all_day: boolean
  recurring: string
  created_at: string
}

type EventForm = {
  title: string; category: string; date: string
  start_time: string; end_time: string; is_all_day: boolean; recurring: string
}

const CAT_COLORS: Record<string, string> = {
  work:     '#6a9ab8',
  workout:  '#7fb58a',
  health:   '#c07070',
  personal: '#a891c4',
}

const RECUR_KEYS = ['none', 'daily', 'weekly', 'monthly'] as const

const DAYS_SHORT_EN = ['Mo','Tu','We','Th','Fr','Sa','Su']
const DAYS_SHORT_UA = ['Пн','Вт','Ср','Чт','Пт','Сб','Нд']
const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_UA = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень']

function todayStr() { return new Date().toISOString().split('T')[0] }
function ds(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
function emptyForm(date: string): EventForm {
  return { title: '', category: 'work', date, start_time: '', end_time: '', is_all_day: false, recurring: 'none' }
}

export default function PlannerClient({ initialEvents, userId }: { initialEvents: CalEvent[], userId: string }) {
  const { t, lang } = useLanguage()
  const tp = t.planner
  const [events, setEvents]             = useState<CalEvent[]>(initialEvents)
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [calMonth, setCalMonth]         = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [showAdd, setShowAdd]           = useState(false)
  const [addForm, setAddForm]           = useState<EventForm>(emptyForm(todayStr()))
  const [addSaving, setAddSaving]       = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null)
  const [editMode, setEditMode]         = useState(false)
  const [editForm, setEditForm]         = useState<EventForm>(emptyForm(todayStr()))
  const [editSaving, setEditSaving]     = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const supabase = createClient()

  const DAYS_SHORT = lang === 'ua' ? DAYS_SHORT_UA : DAYS_SHORT_EN
  const MONTHS     = lang === 'ua' ? MONTHS_UA : MONTHS_EN

  const CATEGORIES = [
    { value: 'work',     label: tp.cat.work },
    { value: 'workout',  label: tp.cat.workout },
    { value: 'health',   label: tp.cat.health },
    { value: 'personal', label: tp.cat.personal },
  ]

  function catLabel(cat: string) { return CATEGORIES.find(c => c.value === cat)?.label ?? cat }

  // Events grouped by date for dot rendering
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {}
    events.forEach(ev => { if (!map[ev.event_date]) map[ev.event_date] = []; map[ev.event_date].push(ev) })
    return map
  }, [events])

  const selectedEvents = useMemo(() =>
    (eventsByDate[selectedDate] ?? []).sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? '')),
    [eventsByDate, selectedDate]
  )

  async function handleAddEvent(e: React.FormEvent) {
    e.preventDefault()
    setAddSaving(true)
    const { data, error } = await supabase.from('events').insert({
      user_id: userId, title: addForm.title, category: addForm.category,
      event_date: addForm.date,
      start_time: addForm.is_all_day ? null : (addForm.start_time || null),
      end_time:   addForm.is_all_day ? null : (addForm.end_time || null),
      is_all_day: addForm.is_all_day, recurring: addForm.recurring,
    }).select().single()
    if (!error && data) {
      setEvents(prev => [...prev, data as CalEvent].sort((a, b) => a.event_date.localeCompare(b.event_date)))
      setShowAdd(false)
      setAddForm(emptyForm(selectedDate))
    }
    setAddSaving(false)
  }

  function openEvent(ev: CalEvent) {
    setSelectedEvent(ev)
    setEditMode(false)
    setConfirmDelete(false)
    setEditForm({ title: ev.title, category: ev.category, date: ev.event_date,
      start_time: ev.start_time ?? '', end_time: ev.end_time ?? '',
      is_all_day: ev.is_all_day, recurring: ev.recurring })
  }

  function closeDetail() { setSelectedEvent(null); setEditMode(false); setConfirmDelete(false) }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedEvent) return
    setEditSaving(true)
    const { data, error } = await supabase.from('events').update({
      title: editForm.title, category: editForm.category, event_date: editForm.date,
      start_time: editForm.is_all_day ? null : (editForm.start_time || null),
      end_time:   editForm.is_all_day ? null : (editForm.end_time || null),
      is_all_day: editForm.is_all_day, recurring: editForm.recurring,
    }).eq('id', selectedEvent.id).select().single()
    if (!error && data) {
      setEvents(prev => prev.map(ev => ev.id === selectedEvent.id ? data as CalEvent : ev)
        .sort((a, b) => a.event_date.localeCompare(b.event_date)))
      closeDetail()
    }
    setEditSaving(false)
  }

  async function handleDeleteEvent() {
    if (!selectedEvent) return
    await supabase.from('events').delete().eq('id', selectedEvent.id)
    setEvents(prev => prev.filter(e => e.id !== selectedEvent.id))
    closeDetail()
  }

  // ── Mini calendar ──────────────────────────────────────────────────
  const { y, m } = calMonth
  const firstDayOfMonth = new Date(y, m, 1).getDay()
  const offset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const tStr = todayStr()

  const formatSelectedDate = () => {
    const d = new Date(selectedDate + 'T00:00:00')
    const dayNames = lang === 'ua'
      ? ['Нд','Пн','Вт','Ср','Чт','Пт','Сб']
      : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    return `${dayNames[d.getDay()]}, ${formatDate(selectedDate, lang)}`
  }

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Page title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-planner)', letterSpacing: '-0.01em', margin: 0 }}>
          {tp.pageTitle}
        </h1>
        <button
          className="pixel-btn pixel-btn-primary"
          onClick={() => { setAddForm(emptyForm(selectedDate)); setShowAdd(true) }}
          style={{ fontSize: 13 }}
        >
          + {tp.addEvent}
        </button>
      </div>

      {/* Hybrid layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 260px) 1fr', gap: 20, alignItems: 'start' }}
           className="planner-grid">

        {/* ── Mini Calendar ─────────────────────────────────────── */}
        <div className="pixel-card card-planner" style={{ padding: 16 }}>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <button onClick={() => setCalMonth(prev => {
              const d = new Date(prev.y, prev.m - 1, 1)
              return { y: d.getFullYear(), m: d.getMonth() }
            })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, padding: '0 4px', lineHeight: 1 }}>‹</button>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {MONTHS[m]} {y}
            </div>
            <button onClick={() => setCalMonth(prev => {
              const d = new Date(prev.y, prev.m + 1, 1)
              return { y: d.getFullYear(), m: d.getMonth() }
            })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, padding: '0 4px', lineHeight: 1 }}>›</button>
          </div>

          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
            {DAYS_SHORT.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--muted)', padding: '2px 0' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1
              const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
              const isToday = dateStr === tStr
              const isSelected = dateStr === selectedDate
              const dayEvents = eventsByDate[dateStr] ?? []

              return (
                <div
                  key={day}
                  onClick={() => setSelectedDate(dateStr)}
                  style={{
                    textAlign: 'center',
                    cursor: 'pointer',
                    borderRadius: 6,
                    padding: '4px 2px',
                    background: isSelected ? 'var(--c-planner)' : isToday ? 'color-mix(in srgb, var(--c-planner) 15%, transparent)' : 'transparent',
                    transition: 'background 0.1s',
                    position: 'relative',
                  }}
                  onMouseEnter={e => { if (!isSelected && !isToday) e.currentTarget.style.background = 'var(--bg3)' }}
                  onMouseLeave={e => { if (!isSelected && !isToday) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{
                    fontSize: 12,
                    fontWeight: isToday || isSelected ? 700 : 400,
                    color: isSelected ? '#fff' : isToday ? 'var(--c-planner)' : 'var(--text)',
                    lineHeight: 1.6,
                  }}>
                    {day}
                  </div>
                  {/* Event dots */}
                  {dayEvents.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 2, marginTop: 1 }}>
                      {dayEvents.slice(0, 3).map((ev, di) => (
                        <div key={di} style={{
                          width: 4, height: 4, borderRadius: '50%',
                          background: isSelected ? 'rgba(255,255,255,0.8)' : CAT_COLORS[ev.category] ?? 'var(--muted)',
                          flexShrink: 0,
                        }} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Today shortcut */}
          {selectedDate !== tStr && (
            <button
              onClick={() => { setSelectedDate(tStr); setCalMonth({ y: new Date().getFullYear(), m: new Date().getMonth() }) }}
              style={{ marginTop: 12, width: '100%', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 0', fontSize: 12, color: 'var(--muted)', cursor: 'pointer', transition: 'background 0.12s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg3)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              {tp.today}
            </button>
          )}
        </div>

        {/* ── Event list ──────────────────────────────────────────── */}
        <div>
          {/* Selected date header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                {formatSelectedDate()}
                {selectedDate === tStr && (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: 'var(--c-planner)', background: 'color-mix(in srgb, var(--c-planner) 12%, transparent)', padding: '2px 8px', borderRadius: 20 }}>
                    {tp.today}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {selectedEvents.length === 0 ? tp.noEvents : `${selectedEvents.length} ${selectedEvents.length === 1 ? 'event' : 'events'}`}
              </div>
            </div>
            <button
              className="pixel-btn"
              onClick={() => { setAddForm(emptyForm(selectedDate)); setShowAdd(true) }}
              style={{ fontSize: 12 }}
            >
              + {lang === 'ua' ? 'Додати' : 'Add'}
            </button>
          </div>

          {/* Events */}
          {selectedEvents.length === 0 ? (
            <div style={{
              padding: '40px 20px',
              textAlign: 'center',
              background: 'var(--bg2)',
              border: '1px dashed var(--border)',
              borderRadius: 12,
              color: 'var(--muted)',
              fontSize: 13,
            }}>
              {tp.noEvents}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedEvents.map(ev => {
                const color = CAT_COLORS[ev.category] ?? 'var(--muted)'
                return (
                  <div
                    key={ev.id}
                    onClick={() => openEvent(ev)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '12px 16px',
                      background: 'var(--bg2)',
                      border: '1px solid var(--border)',
                      borderLeft: `4px solid ${color}`,
                      borderRadius: '0 10px 10px 0',
                      cursor: 'pointer',
                      transition: 'background 0.12s, transform 0.1s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.transform = 'translateX(2px)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.transform = 'none' }}
                  >
                    {/* Time */}
                    <div style={{ minWidth: 48, flexShrink: 0, textAlign: 'right' }}>
                      {ev.is_all_day ? (
                        <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>
                          {lang === 'ua' ? 'Весь день' : 'All day'}
                        </div>
                      ) : ev.start_time ? (
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
                          {ev.start_time.slice(0,5)}
                        </div>
                      ) : null}
                    </div>

                    {/* Title + category */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.title}
                      </div>
                      <div style={{ fontSize: 11, color, marginTop: 2, fontWeight: 500 }}>
                        {catLabel(ev.category)}
                        {ev.recurring !== 'none' && <span style={{ marginLeft: 6, opacity: 0.7 }}>↻</span>}
                      </div>
                    </div>

                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted)', flexShrink: 0 }}>
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add Event Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="pixel-card card-planner" style={{ width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <ModalHeader title={tp.addTitle} onClose={() => setShowAdd(false)} />
            <EventFormBody form={addForm} setField={(k, v) => setAddForm(f => ({ ...f, [k]: v }))}
              onSubmit={handleAddEvent} saving={addSaving} onCancel={() => setShowAdd(false)}
              submitLabel={tp.saveEvent} categories={CATEGORIES} recurKeys={RECUR_KEYS}
              recurLabel={r => tp.recur[r as keyof typeof tp.recur]} t={tp} />
          </div>
        </div>
      )}

      {/* Event Detail / Edit Modal */}
      {selectedEvent && (
        <div className="modal-overlay" onClick={closeDetail}>
          <div className="pixel-card card-planner" style={{ width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            {editMode ? (
              <>
                <ModalHeader title={tp.editTitle} onClose={closeDetail} />
                <EventFormBody form={editForm} setField={(k, v) => setEditForm(f => ({ ...f, [k]: v }))}
                  onSubmit={handleSaveEdit} saving={editSaving} onCancel={() => setEditMode(false)}
                  submitLabel={tp.saveChanges} categories={CATEGORIES} recurKeys={RECUR_KEYS}
                  recurLabel={r => tp.recur[r as keyof typeof tp.recur]} t={tp} />
              </>
            ) : (
              <>
                <ModalHeader title={tp.detailTitle} onClose={closeDetail} />
                <EventDetail ev={selectedEvent} catLabel={catLabel(selectedEvent.category)}
                  confirmDelete={confirmDelete} onEdit={() => setEditMode(true)}
                  onRequestDelete={() => setConfirmDelete(true)} onCancelDelete={() => setConfirmDelete(false)}
                  onConfirmDelete={handleDeleteEvent} t={tp} lang={lang} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 20, padding: '0 4px', lineHeight: 1 }}>×</button>
    </div>
  )
}

function EventDetail({ ev, catLabel, confirmDelete, onEdit, onRequestDelete, onCancelDelete, onConfirmDelete, t, lang }: {
  ev: CalEvent; catLabel: string; confirmDelete: boolean
  onEdit: () => void; onRequestDelete: () => void; onCancelDelete: () => void; onConfirmDelete: () => void
  t: { detail: Record<string,string>; edit: string; delete: string; confirmDelete: string; yesDelete: string; cancel: string }
  lang: import('@/lib/i18n').Lang
}) {
  const color = CAT_COLORS[ev.category] ?? 'var(--muted)'
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 4, alignSelf: 'stretch', background: color, borderRadius: 2, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{ev.title}</div>
          <div style={{ fontSize: 12, color, fontWeight: 500 }}>{catLabel}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24, background: 'var(--bg3)', borderRadius: 10, padding: '12px 14px' }}>
        <DetailRow label={t.detail.date} value={formatDate(ev.event_date, lang)} />
        {!ev.is_all_day && ev.start_time && (
          <DetailRow label={t.detail.time} value={`${ev.start_time.slice(0,5)}${ev.end_time ? ` → ${ev.end_time.slice(0,5)}` : ''}`} />
        )}
        {ev.is_all_day && <DetailRow label={t.detail.duration} value={t.detail.allDay} />}
        {ev.recurring !== 'none' && <DetailRow label={t.detail.recurring} value={ev.recurring} />}
      </div>
      {confirmDelete ? (
        <div style={{ background: 'color-mix(in srgb, var(--red) 10%, transparent)', border: '1px solid var(--red)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 12 }}>{t.confirmDelete}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="pixel-btn pixel-btn-danger" style={{ flex: 1, justifyContent: 'center', fontSize: 13 }} onClick={onConfirmDelete}>{t.yesDelete}</button>
            <button className="pixel-btn pixel-btn-secondary" onClick={onCancelDelete} style={{ fontSize: 13 }}>{t.cancel}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="pixel-btn pixel-btn-primary" onClick={onEdit} style={{ flex: 1, justifyContent: 'center', fontSize: 13 }}>{t.edit}</button>
          <button className="pixel-btn pixel-btn-danger" onClick={onRequestDelete} style={{ fontSize: 13 }}>{t.delete}</button>
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', minWidth: 70, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{value}</div>
    </div>
  )
}

function EventFormBody({ form, setField, onSubmit, saving, onCancel, submitLabel, categories, recurKeys, recurLabel, t }: {
  form: EventForm
  setField: (k: string, v: string | boolean) => void
  onSubmit: (e: React.FormEvent) => void
  saving: boolean; onCancel: () => void; submitLabel: string
  categories: { value: string; label: string }[]
  recurKeys: readonly string[]
  recurLabel: (r: string) => string
  t: { fieldTitle: string; fieldCategory: string; fieldDate: string; allDay: string; startTime: string; endTime: string; fieldRecur: string; cancel: string }
}) {
  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label className="pixel-label">{t.fieldTitle}</label>
        <input className="pixel-input" value={form.title} onChange={e => setField('title', e.target.value)} required placeholder="..." />
      </div>
      <div>
        <label className="pixel-label">{t.fieldCategory}</label>
        <select className="pixel-input" value={form.category} onChange={e => setField('category', e.target.value)}>
          {categories.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="pixel-label">{t.fieldDate}</label>
        <input className="pixel-input" type="date" value={form.date} onChange={e => setField('date', e.target.value)} required />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" id="allday_f" checked={form.is_all_day} onChange={e => setField('is_all_day', e.target.checked)}
          style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }} />
        <label htmlFor="allday_f" style={{ fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>{t.allDay}</label>
      </div>
      {!form.is_all_day && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label className="pixel-label">{t.startTime}</label>
            <input className="pixel-input" type="time" value={form.start_time} onChange={e => setField('start_time', e.target.value)} />
          </div>
          <div>
            <label className="pixel-label">{t.endTime}</label>
            <input className="pixel-input" type="time" value={form.end_time} onChange={e => setField('end_time', e.target.value)} />
          </div>
        </div>
      )}
      <div>
        <label className="pixel-label">{t.fieldRecur}</label>
        <select className="pixel-input" value={form.recurring} onChange={e => setField('recurring', e.target.value)}>
          {recurKeys.map(r => <option key={r} value={r}>{recurLabel(r)}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button type="submit" className="pixel-btn pixel-btn-primary" disabled={saving} style={{ flex: 1, justifyContent: 'center', fontSize: 13 }}>
          {saving ? '...' : submitLabel}
        </button>
        <button type="button" className="pixel-btn pixel-btn-secondary" onClick={onCancel} style={{ fontSize: 13 }}>{t.cancel}</button>
      </div>
    </form>
  )
}
