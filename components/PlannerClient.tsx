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

const CATEGORY_COLORS: Record<string, string> = {
  work:     '#3b82f6',
  workout:  '#22c55e',
  health:   '#ef4444',
  personal: '#a855f7',
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
  return new Date(d.setDate(diff))
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

export default function PlannerClient({ initialEvents, userId }: { initialEvents: CalEvent[], userId: string }) {
  const [events, setEvents] = useState<CalEvent[]>(initialEvents)
  const [view, setView] = useState<'day'|'week'|'month'>('week')
  const [cursor, setCursor] = useState(new Date())
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    title: '', category: 'work', date: today(),
    start_time: '', end_time: '', is_all_day: false, recurring: 'none',
  })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  function setFormField(k: string, v: string | boolean) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleAddEvent(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const payload = {
      user_id: userId,
      title: form.title,
      category: form.category,
      event_date: form.date,
      start_time: form.is_all_day ? null : (form.start_time || null),
      end_time: form.is_all_day ? null : (form.end_time || null),
      is_all_day: form.is_all_day,
      recurring: form.recurring,
    }
    const { data, error } = await supabase.from('events').insert(payload).select().single()
    if (!error && data) {
      setEvents(prev => [...prev, data as CalEvent].sort((a, b) => a.event_date.localeCompare(b.event_date)))
      setShowModal(false)
      setForm({ title: '', category: 'work', date: today(), start_time: '', end_time: '', is_all_day: false, recurring: 'none' })
    }
    setSaving(false)
  }

  async function handleDeleteEvent(id: string) {
    await supabase.from('events').delete().eq('id', id)
    setEvents(prev => prev.filter(e => e.id !== id))
  }

  // -- Day view --
  function DayView() {
    const ds = cursor.toISOString().split('T')[0]
    const dayEvents = events.filter(e => e.event_date === ds)
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <button className="pixel-btn pixel-btn-secondary" style={{ fontSize: '9px', padding: '6px 10px' }}
            onClick={() => { const d = new Date(cursor); d.setDate(d.getDate()-1); setCursor(d) }}>◄</button>
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '10px', color: 'var(--text)' }}>
            {ds}
          </span>
          <button className="pixel-btn pixel-btn-secondary" style={{ fontSize: '9px', padding: '6px 10px' }}
            onClick={() => { const d = new Date(cursor); d.setDate(d.getDate()+1); setCursor(d) }}>►</button>
          <button className="pixel-btn pixel-btn-secondary" style={{ fontSize: '9px', padding: '6px 10px' }}
            onClick={() => setCursor(new Date())}>TODAY</button>
        </div>
        {dayEvents.length === 0
          ? <div style={{ color: 'var(--muted)', fontSize: '18px', padding: '20px 0' }}>No events today.</div>
          : dayEvents.map(ev => <EventChip key={ev.id} ev={ev} onDelete={handleDeleteEvent} />)
        }
      </div>
    )
  }

  // -- Week view --
  function WeekView() {
    const ws = isoWeekStart(new Date(cursor))
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ws)
      d.setDate(ws.getDate() + i)
      return d
    })
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <button className="pixel-btn pixel-btn-secondary" style={{ fontSize: '9px', padding: '6px 10px' }}
            onClick={() => { const d = new Date(cursor); d.setDate(d.getDate()-7); setCursor(d) }}>◄ PREV</button>
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '10px', color: 'var(--text)' }}>
            {MONTHS[ws.getMonth()]} {ws.getFullYear()}
          </span>
          <button className="pixel-btn pixel-btn-secondary" style={{ fontSize: '9px', padding: '6px 10px' }}
            onClick={() => { const d = new Date(cursor); d.setDate(d.getDate()+7); setCursor(d) }}>NEXT ►</button>
          <button className="pixel-btn pixel-btn-secondary" style={{ fontSize: '9px', padding: '6px 10px' }}
            onClick={() => setCursor(new Date())}>TODAY</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
          {days.map((day, i) => {
            const ds = day.toISOString().split('T')[0]
            const dayEvs = events.filter(e => e.event_date === ds)
            const isToday = ds === today()
            return (
              <div key={i} style={{
                background: 'var(--bg2)',
                border: `2px solid ${isToday ? 'var(--accent2)' : 'var(--border)'}`,
                padding: '8px',
                minHeight: 120,
              }}>
                <div style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '8px',
                  color: isToday ? 'var(--accent2)' : 'var(--muted)',
                  marginBottom: '6px',
                }}>
                  {DAYS_SHORT[i]}<br />{day.getDate()}
                </div>
                {dayEvs.map(ev => (
                  <div
                    key={ev.id}
                    onClick={() => handleDeleteEvent(ev.id)}
                    title="Click to delete"
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
                    }}>
                    {ev.title}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // -- Month view --
  function MonthView() {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const offset = firstDay === 0 ? 6 : firstDay - 1
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <button className="pixel-btn pixel-btn-secondary" style={{ fontSize: '9px', padding: '6px 10px' }}
            onClick={() => { const d = new Date(cursor); d.setMonth(d.getMonth()-1); setCursor(d) }}>◄ PREV</button>
          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '10px', color: 'var(--text)' }}>
            {MONTHS[month]} {year}
          </span>
          <button className="pixel-btn pixel-btn-secondary" style={{ fontSize: '9px', padding: '6px 10px' }}
            onClick={() => { const d = new Date(cursor); d.setMonth(d.getMonth()+1); setCursor(d) }}>NEXT ►</button>
          <button className="pixel-btn pixel-btn-secondary" style={{ fontSize: '9px', padding: '6px 10px' }}
            onClick={() => setCursor(new Date())}>TODAY</button>
        </div>
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
                border: `1px solid ${isToday ? 'var(--accent2)' : 'var(--border)'}`,
                padding: '6px',
                minHeight: 80,
              }}>
                <div style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '8px',
                  color: isToday ? 'var(--accent2)' : 'var(--muted)',
                  marginBottom: '4px',
                }}>{day}</div>
                {dayEvs.slice(0, 3).map(ev => (
                  <div
                    key={ev.id}
                    onClick={() => handleDeleteEvent(ev.id)}
                    title="Click to delete"
                    style={{
                      background: CATEGORY_COLORS[ev.category] ?? '#888',
                      color: '#fff',
                      fontSize: '12px',
                      padding: '2px 4px',
                      marginBottom: '2px',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontFamily: "'VT323', monospace",
                    }}>
                    {ev.title}
                  </div>
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
        <button className="pixel-btn pixel-btn-primary" onClick={() => setShowModal(true)}>
          + ADD EVENT
        </button>
      </div>

      {/* Calendar */}
      <div className="pixel-card" style={{ padding: '20px' }}>
        {view === 'day' && <DayView />}
        {view === 'week' && <WeekView />}
        {view === 'month' && <MonthView />}
      </div>

      {/* Add Event Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="pixel-card" style={{ width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '10px',
              color: 'var(--accent2)',
              marginBottom: '20px',
              paddingBottom: '12px',
              borderBottom: '2px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
            }}>
              ADD EVENT
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '14px' }}>✕</button>
            </div>
            <form onSubmit={handleAddEvent} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="pixel-label">Title *</label>
                <input className="pixel-input" value={form.title} onChange={e => setFormField('title', e.target.value)} required placeholder="Event title" />
              </div>
              <div>
                <label className="pixel-label">Category</label>
                <select className="pixel-input" value={form.category} onChange={e => setFormField('category', e.target.value)}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="pixel-label">Date *</label>
                <input className="pixel-input" type="date" value={form.date} onChange={e => setFormField('date', e.target.value)} required />
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  id="allday"
                  checked={form.is_all_day}
                  onChange={e => setFormField('is_all_day', e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <label htmlFor="allday" style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '8px', color: 'var(--muted)', cursor: 'pointer' }}>
                  ALL DAY
                </label>
              </div>
              {!form.is_all_day && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label className="pixel-label">Start Time</label>
                    <input className="pixel-input" type="time" value={form.start_time} onChange={e => setFormField('start_time', e.target.value)} />
                  </div>
                  <div>
                    <label className="pixel-label">End Time</label>
                    <input className="pixel-input" type="time" value={form.end_time} onChange={e => setFormField('end_time', e.target.value)} />
                  </div>
                </div>
              )}
              <div>
                <label className="pixel-label">Recurring</label>
                <select className="pixel-input" value={form.recurring} onChange={e => setFormField('recurring', e.target.value)}>
                  {RECUR.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button type="submit" className="pixel-btn pixel-btn-primary" disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
                  {saving ? 'SAVING...' : 'SAVE EVENT'}
                </button>
                <button type="button" className="pixel-btn pixel-btn-secondary" onClick={() => setShowModal(false)}>
                  CANCEL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function EventChip({ ev, onDelete }: { ev: CalEvent, onDelete: (id: string) => void }) {
  return (
    <div
      onClick={() => onDelete(ev.id)}
      title="Click to delete"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 14px',
        marginBottom: '8px',
        background: 'var(--bg3)',
        border: `2px solid ${CATEGORY_COLORS[ev.category] ?? '#888'}`,
        cursor: 'pointer',
        boxShadow: '2px 2px 0 #000',
      }}>
      <div style={{ width: 10, height: 10, background: CATEGORY_COLORS[ev.category] ?? '#888', flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: '18px' }}>{ev.title}</div>
      {ev.start_time && (
        <div style={{ fontSize: '15px', color: 'var(--muted)' }}>{ev.start_time.slice(0,5)}</div>
      )}
      <div style={{ fontSize: '13px', color: 'var(--muted)', fontFamily: "'Press Start 2P', monospace" }}>
        {ev.category}
      </div>
    </div>
  )
}
