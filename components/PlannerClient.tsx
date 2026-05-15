'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

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
  title: string
  category: string
  date: string
  start_time: string
  end_time: string
  is_all_day: boolean
  recurring: string
}

const CATEGORY_COLORS: Record<string, string> = {
  work:     '#3b82f6',
  workout:  '#4ade80',
  health:   '#f87171',
  personal: '#c084fc',
}

const CATEGORIES = [
  { value: 'work',     label: 'Work / Meetings' },
  { value: 'workout',  label: 'Workout' },
  { value: 'health',   label: 'Doctor / Health' },
  { value: 'personal', label: 'Personal' },
]

const RECUR = ['none','daily','weekly','monthly']

function today() {
  return new Date().toISOString().split('T')[0]
}

function isoWeekStart(d: Date) {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(new Date(d).setDate(diff))
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

function emptyForm(): EventForm {
  return { title: '', category: 'work', date: today(), start_time: '', end_time: '', is_all_day: false, recurring: 'none' }
}

export default function PlannerClient({ initialEvents, userId }: { initialEvents: CalEvent[], userId: string }) {
  const [events, setEvents] = useState<CalEvent[]>(initialEvents)
  const [view, setView] = useState<'day'|'week'|'month'>('week')
  const [cursor, setCursor] = useState(new Date())

  // Add modal
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState<EventForm>(emptyForm())
  const [addSaving, setAddSaving] = useState(false)

  // Detail/edit modal
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState<EventForm>(emptyForm())
  const [editSaving, setEditSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const supabase = createClient()

  // ---------- Add event ----------
  function setAddField(k: string, v: string | boolean) {
    setAddForm(f => ({ ...f, [k]: v }))
  }

  async function handleAddEvent(e: React.FormEvent) {
    e.preventDefault()
    setAddSaving(true)
    const { data, error } = await supabase.from('events').insert({
      user_id: userId,
      title: addForm.title,
      category: addForm.category,
      event_date: addForm.date,
      start_time: addForm.is_all_day ? null : (addForm.start_time || null),
      end_time:   addForm.is_all_day ? null : (addForm.end_time || null),
      is_all_day: addForm.is_all_day,
      recurring:  addForm.recurring,
    }).select().single()
    if (!error && data) {
      setEvents(prev => [...prev, data as CalEvent].sort((a, b) => a.event_date.localeCompare(b.event_date)))
      setShowAdd(false)
      setAddForm(emptyForm())
    }
    setAddSaving(false)
  }

  // ---------- Open detail ----------
  function openEvent(ev: CalEvent) {
    setSelectedEvent(ev)
    setEditMode(false)
    setConfirmDelete(false)
    setEditForm({
      title:      ev.title,
      category:   ev.category,
      date:       ev.event_date,
      start_time: ev.start_time ?? '',
      end_time:   ev.end_time ?? '',
      is_all_day: ev.is_all_day,
      recurring:  ev.recurring,
    })
  }

  function closeDetail() {
    setSelectedEvent(null)
    setEditMode(false)
    setConfirmDelete(false)
  }

  function setEditField(k: string, v: string | boolean) {
    setEditForm(f => ({ ...f, [k]: v }))
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedEvent) return
    setEditSaving(true)
    const { data, error } = await supabase.from('events').update({
      title:      editForm.title,
      category:   editForm.category,
      event_date: editForm.date,
      start_time: editForm.is_all_day ? null : (editForm.start_time || null),
      end_time:   editForm.is_all_day ? null : (editForm.end_time || null),
      is_all_day: editForm.is_all_day,
      recurring:  editForm.recurring,
    }).eq('id', selectedEvent.id).select().single()
    if (!error && data) {
      setEvents(prev =>
        prev.map(ev => ev.id === selectedEvent.id ? data as CalEvent : ev)
          .sort((a, b) => a.event_date.localeCompare(b.event_date))
      )
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

  // ---------- Calendar date helpers ----------
  function formatDs(d: Date) {
    const y = d.getFullYear()
    const m = String(d.getMonth()+1).padStart(2,'0')
    const day = String(d.getDate()).padStart(2,'0')
    return `${y}-${m}-${day}`
  }

  // ---------- Day view ----------
  function DayView() {
    const ds = formatDs(cursor)
    const dayEvents = events.filter(e => e.event_date === ds)
    return (
      <div>
        <NavBar
          label={ds}
          onPrev={() => { const d = new Date(cursor); d.setDate(d.getDate()-1); setCursor(d) }}
          onNext={() => { const d = new Date(cursor); d.setDate(d.getDate()+1); setCursor(d) }}
          onToday={() => setCursor(new Date())}
        />
        {dayEvents.length === 0
          ? <div style={{ color: 'var(--muted)', fontSize: '18px', padding: '20px 0' }}>No events today.</div>
          : dayEvents.map(ev => <EventChip key={ev.id} ev={ev} onClick={openEvent} />)
        }
      </div>
    )
  }

  // ---------- Week view ----------
  function WeekView() {
    const ws = isoWeekStart(cursor)
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ws)
      d.setDate(ws.getDate() + i)
      return d
    })
    return (
      <div>
        <NavBar
          label={`${MONTHS[ws.getMonth()]} ${ws.getFullYear()}`}
          onPrev={() => { const d = new Date(cursor); d.setDate(d.getDate()-7); setCursor(d) }}
          onNext={() => { const d = new Date(cursor); d.setDate(d.getDate()+7); setCursor(d) }}
          onToday={() => setCursor(new Date())}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
          {days.map((day, i) => {
            const ds = formatDs(day)
            const dayEvs = events.filter(e => e.event_date === ds)
            const isToday = ds === today()
            return (
              <div key={i} style={{
                background: 'var(--bg3)',
                border: `2px solid ${isToday ? 'var(--c-planner)' : 'var(--border)'}`,
                padding: '8px',
                minHeight: 120,
              }}>
                <div style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '8px',
                  color: isToday ? 'var(--c-planner)' : 'var(--muted)',
                  marginBottom: '6px',
                }}>
                  {DAYS_SHORT[i]}<br />{day.getDate()}
                </div>
                {dayEvs.map(ev => (
                  <EventPill key={ev.id} ev={ev} onClick={openEvent} />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ---------- Month view ----------
  function MonthView() {
    const year  = cursor.getFullYear()
    const month = cursor.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const offset = firstDay === 0 ? 6 : firstDay - 1
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    return (
      <div>
        <NavBar
          label={`${MONTHS[month]} ${year}`}
          onPrev={() => { const d = new Date(cursor); d.setMonth(d.getMonth()-1); setCursor(d) }}
          onNext={() => { const d = new Date(cursor); d.setMonth(d.getMonth()+1); setCursor(d) }}
          onToday={() => setCursor(new Date())}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '2px' }}>
          {DAYS_SHORT.map(d => (
            <div key={d} style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '7px',
              color: 'var(--muted)',
              padding: '6px',
              textAlign: 'center',
              background: 'var(--bg3)',
            }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
          {Array.from({ length: offset }).map((_, i) => (
            <div key={`e${i}`} style={{ background: 'var(--bg)', minHeight: 80 }} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1
            const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
            const dayEvs = events.filter(e => e.event_date === ds)
            const isToday = ds === today()
            return (
              <div key={day} style={{
                background: 'var(--bg2)',
                border: `1px solid ${isToday ? 'var(--c-planner)' : 'var(--border)'}`,
                padding: '6px',
                minHeight: 80,
              }}>
                <div style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '8px',
                  color: isToday ? 'var(--c-planner)' : 'var(--muted)',
                  marginBottom: '4px',
                }}>{day}</div>
                {dayEvs.slice(0, 3).map(ev => (
                  <EventPill key={ev.id} ev={ev} onClick={openEvent} />
                ))}
                {dayEvs.length > 3 && (
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>+{dayEvs.length-3} more</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '0' }}>
          {(['day','week','month'] as const).map(v => (
            <button key={v} className={`tab-btn ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
              {v.toUpperCase()}
            </button>
          ))}
        </div>
        <button className="pixel-btn pixel-btn-primary" onClick={() => setShowAdd(true)}>+ ADD EVENT</button>
      </div>

      {/* Calendar */}
      <div className="pixel-card card-planner" style={{ padding: '20px' }}>
        {view === 'day'   && <DayView />}
        {view === 'week'  && <WeekView />}
        {view === 'month' && <MonthView />}
      </div>

      {/* ---- Add Event Modal ---- */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="pixel-card card-planner" style={{ width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <ModalHeader title="ADD EVENT" color="var(--c-planner)" onClose={() => setShowAdd(false)} />
            <EventFormBody
              form={addForm}
              setField={setAddField}
              onSubmit={handleAddEvent}
              saving={addSaving}
              onCancel={() => setShowAdd(false)}
              submitLabel="SAVE EVENT"
            />
          </div>
        </div>
      )}

      {/* ---- Event Detail / Edit Modal ---- */}
      {selectedEvent && (
        <div className="modal-overlay" onClick={closeDetail}>
          <div className="pixel-card card-planner" style={{ width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            {editMode ? (
              <>
                <ModalHeader title="EDIT EVENT" color="var(--c-planner)" onClose={closeDetail} />
                <EventFormBody
                  form={editForm}
                  setField={setEditField}
                  onSubmit={handleSaveEdit}
                  saving={editSaving}
                  onCancel={() => setEditMode(false)}
                  submitLabel="SAVE CHANGES"
                />
              </>
            ) : (
              <>
                <ModalHeader title="EVENT DETAILS" color="var(--c-planner)" onClose={closeDetail} />
                <EventDetail
                  ev={selectedEvent}
                  confirmDelete={confirmDelete}
                  onEdit={() => setEditMode(true)}
                  onRequestDelete={() => setConfirmDelete(true)}
                  onCancelDelete={() => setConfirmDelete(false)}
                  onConfirmDelete={handleDeleteEvent}
                />
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ---- Sub-components ----

function NavBar({ label, onPrev, onNext, onToday }: {
  label: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
      <button className="pixel-btn pixel-btn-secondary" style={{ fontSize: '9px', padding: '6px 10px' }} onClick={onPrev}>◄ PREV</button>
      <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '10px', color: 'var(--text)', flex: 1, textAlign: 'center' }}>
        {label}
      </span>
      <button className="pixel-btn pixel-btn-secondary" style={{ fontSize: '9px', padding: '6px 10px' }} onClick={onNext}>NEXT ►</button>
      <button className="pixel-btn pixel-btn-secondary" style={{ fontSize: '9px', padding: '6px 10px' }} onClick={onToday}>TODAY</button>
    </div>
  )
}

function EventPill({ ev, onClick }: { ev: CalEvent, onClick: (ev: CalEvent) => void }) {
  return (
    <div
      onClick={e => { e.stopPropagation(); onClick(ev) }}
      title={ev.title}
      style={{
        background: CATEGORY_COLORS[ev.category] ?? '#888',
        color: '#fff',
        fontSize: '12px',
        padding: '3px 5px',
        marginBottom: '3px',
        cursor: 'pointer',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontFamily: "'VT323', monospace",
        transition: 'filter 0.1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.2)')}
      onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
    >
      {ev.title}
    </div>
  )
}

function EventChip({ ev, onClick }: { ev: CalEvent, onClick: (ev: CalEvent) => void }) {
  return (
    <div
      onClick={() => onClick(ev)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 14px',
        marginBottom: '8px',
        background: 'var(--bg3)',
        border: `2px solid ${CATEGORY_COLORS[ev.category] ?? '#888'}`,
        cursor: 'pointer',
        boxShadow: '2px 2px 0 rgba(0,0,0,0.5)',
        transition: 'filter 0.1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
      onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
    >
      <div style={{ width: 10, height: 10, background: CATEGORY_COLORS[ev.category] ?? '#888', flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: '18px' }}>{ev.title}</div>
      {ev.start_time && <div style={{ fontSize: '15px', color: 'var(--muted)' }}>{ev.start_time.slice(0,5)}</div>}
      <div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: "'Press Start 2P', monospace" }}>{ev.category}</div>
    </div>
  )
}

function ModalHeader({ title, color, onClose }: { title: string; color: string; onClose: () => void }) {
  return (
    <div style={{
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '10px',
      color,
      marginBottom: '20px',
      paddingBottom: '12px',
      borderBottom: '2px solid var(--border)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}>
      {title}
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>✕</button>
    </div>
  )
}

function EventDetail({ ev, confirmDelete, onEdit, onRequestDelete, onCancelDelete, onConfirmDelete }: {
  ev: CalEvent
  confirmDelete: boolean
  onEdit: () => void
  onRequestDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) {
  const color = CATEGORY_COLORS[ev.category] ?? '#888'
  const catLabel = CATEGORIES.find(c => c.value === ev.category)?.label ?? ev.category

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
        <div style={{ width: 12, height: 12, background: color, flexShrink: 0 }} />
        <div style={{ fontSize: '22px', color: 'var(--text)', flex: 1 }}>{ev.title}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
        <DetailRow label="CATEGORY" value={catLabel} color={color} />
        <DetailRow label="DATE" value={ev.event_date} />
        {!ev.is_all_day && ev.start_time && (
          <DetailRow label="TIME" value={`${ev.start_time.slice(0,5)}${ev.end_time ? ` → ${ev.end_time.slice(0,5)}` : ''}`} />
        )}
        {ev.is_all_day && <DetailRow label="DURATION" value="All day" />}
        {ev.recurring !== 'none' && <DetailRow label="RECURRING" value={ev.recurring} />}
      </div>

      {confirmDelete ? (
        <div style={{
          background: 'rgba(248,113,113,0.1)',
          border: '2px solid var(--red)',
          padding: '14px',
          marginBottom: '14px',
        }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '9px', color: 'var(--red)', marginBottom: '12px' }}>
            DELETE THIS EVENT?
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="pixel-btn pixel-btn-danger" style={{ flex: 1, justifyContent: 'center' }} onClick={onConfirmDelete}>
              YES, DELETE
            </button>
            <button className="pixel-btn pixel-btn-secondary" onClick={onCancelDelete}>
              CANCEL
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="pixel-btn pixel-btn-primary" onClick={onEdit} style={{ flex: 1, justifyContent: 'center' }}>
            EDIT
          </button>
          <button className="pixel-btn pixel-btn-danger" onClick={onRequestDelete}>
            DELETE
          </button>
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
      <div style={{
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '7px',
        color: 'var(--muted)',
        minWidth: 80,
        paddingTop: '3px',
      }}>
        {label}
      </div>
      <div style={{ fontSize: '18px', color: color ?? 'var(--text)' }}>{value}</div>
    </div>
  )
}

function EventFormBody({ form, setField, onSubmit, saving, onCancel, submitLabel }: {
  form: EventForm
  setField: (k: string, v: string | boolean) => void
  onSubmit: (e: React.FormEvent) => void
  saving: boolean
  onCancel: () => void
  submitLabel: string
}) {
  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <label className="pixel-label">Title *</label>
        <input className="pixel-input" value={form.title} onChange={e => setField('title', e.target.value)} required placeholder="Event title" />
      </div>
      <div>
        <label className="pixel-label">Category</label>
        <select className="pixel-input" value={form.category} onChange={e => setField('category', e.target.value)}>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <div>
        <label className="pixel-label">Date *</label>
        <input className="pixel-input" type="date" value={form.date} onChange={e => setField('date', e.target.value)} required />
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          type="checkbox"
          id="allday_form"
          checked={form.is_all_day}
          onChange={e => setField('is_all_day', e.target.checked)}
          style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }}
        />
        <label htmlFor="allday_form" style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '8px', color: 'var(--muted)', cursor: 'pointer' }}>
          ALL DAY
        </label>
      </div>
      {!form.is_all_day && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label className="pixel-label">Start Time</label>
            <input className="pixel-input" type="time" value={form.start_time} onChange={e => setField('start_time', e.target.value)} />
          </div>
          <div>
            <label className="pixel-label">End Time</label>
            <input className="pixel-input" type="time" value={form.end_time} onChange={e => setField('end_time', e.target.value)} />
          </div>
        </div>
      )}
      <div>
        <label className="pixel-label">Recurring</label>
        <select className="pixel-input" value={form.recurring} onChange={e => setField('recurring', e.target.value)}>
          {RECUR.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
        <button type="submit" className="pixel-btn pixel-btn-primary" disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
          {saving ? 'SAVING...' : submitLabel}
        </button>
        <button type="button" className="pixel-btn pixel-btn-secondary" onClick={onCancel}>CANCEL</button>
      </div>
    </form>
  )
}

