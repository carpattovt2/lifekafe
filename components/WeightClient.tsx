'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Entry = {
  id: string
  date: string
  weight_kg: number
  user_id: string
  created_at: string
}

function today() {
  return new Date().toISOString().split('T')[0]
}

export default function WeightClient({ initialEntries, userId }: { initialEntries: Entry[], userId: string }) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries)
  const [date, setDate] = useState(today())
  const [weight, setWeight] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error: err } = await supabase
      .from('weight_entries')
      .insert({ user_id: userId, date, weight_kg: parseFloat(weight) })
      .select()
      .single()

    if (err) {
      setError(err.message)
    } else {
      const updated = [data as Entry, ...entries].sort((a, b) => b.date.localeCompare(a.date))
      setEntries(updated)
      setWeight('')
    }
    setLoading(false)
  }

  async function handleDelete(id: string) {
    const { error: err } = await supabase.from('weight_entries').delete().eq('id', id)
    if (!err) setEntries(entries.filter(e => e.id !== id))
  }

  return (
    <>
      {/* Form */}
      <div className="pixel-card" style={{ marginBottom: '24px' }}>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '9px', color: 'var(--muted)', marginBottom: '16px' }}>
          LOG ENTRY
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1', minWidth: '160px' }}>
            <label className="pixel-label">Date</label>
            <input
              className="pixel-input"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
            />
          </div>
          <div style={{ flex: '1', minWidth: '160px' }}>
            <label className="pixel-label">Weight (kg)</label>
            <input
              className="pixel-input"
              type="number"
              step="0.1"
              min="20"
              max="500"
              value={weight}
              onChange={e => setWeight(e.target.value)}
              placeholder="75.5"
              required
            />
          </div>
          <button
            type="submit"
            className="pixel-btn pixel-btn-primary"
            disabled={loading}
            style={{ whiteSpace: 'nowrap' }}
          >
            {loading ? 'SAVING...' : '+ LOG WEIGHT'}
          </button>
        </form>
        {error && (
          <div style={{ color: 'var(--red)', fontSize: '15px', marginTop: '10px' }}>⚠ {error}</div>
        )}
      </div>

      {/* Table */}
      <div className="pixel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr auto',
          gap: '0',
          borderBottom: '2px solid var(--border)',
        }}>
          {['DATE', 'WEIGHT (KG)', 'CHANGE', ''].map((h, i) => (
            <div key={i} style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '8px',
              color: 'var(--muted)',
              padding: '12px 16px',
              borderRight: i < 3 ? '1px solid var(--border)' : 'none',
              background: 'var(--bg3)',
            }}>{h}</div>
          ))}
        </div>

        {entries.length === 0 && (
          <div style={{ padding: '24px 16px', color: 'var(--muted)', fontSize: '16px' }}>
            No entries yet. Log your first weight!
          </div>
        )}

        {entries.map((entry, idx) => {
          const prev = entries[idx + 1]
          const diff = prev ? (Number(entry.weight_kg) - Number(prev.weight_kg)).toFixed(1) : null
          const diffNum = diff !== null ? Number(diff) : null

          return (
            <div key={entry.id} style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr auto',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ padding: '12px 16px', fontSize: '18px', borderRight: '1px solid var(--border)' }}>
                {entry.date}
              </div>
              <div style={{
                padding: '12px 16px',
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '14px',
                borderRight: '1px solid var(--border)',
                color: 'var(--accent2)',
              }}>
                {Number(entry.weight_kg).toFixed(1)}
              </div>
              <div style={{
                padding: '12px 16px',
                fontSize: '18px',
                borderRight: '1px solid var(--border)',
                color: diffNum === null ? 'var(--muted)' : diffNum > 0 ? 'var(--red)' : diffNum < 0 ? 'var(--green)' : 'var(--muted)',
              }}>
                {diff === null ? '—'
                  : diffNum === null ? '—'
                  : diffNum === 0 ? '±0.0'
                  : diffNum > 0 ? `▲ +${diff}` : `▼ ${diff}`}
              </div>
              <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center' }}>
                <button
                  onClick={() => handleDelete(entry.id)}
                  className="pixel-btn pixel-btn-danger"
                  style={{ fontSize: '9px', padding: '6px 10px' }}
                >
                  DEL
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
