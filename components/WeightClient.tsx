'use client'

import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/LanguageContext'
import { formatDate } from '@/lib/i18n'

type Entry = {
  id: string
  date: string
  weight_kg: number
  user_id: string
  created_at: string
}

const LBS_PER_KG = 2.2046
function lbsToKg(lbs: number) { return lbs / LBS_PER_KG }

function today() { return new Date().toISOString().split('T')[0] }

export default function WeightClient({ initialEntries, userId }: { initialEntries: Entry[], userId: string }) {
  const { t, lang } = useLanguage()
  const [entries, setEntries]   = useState<Entry[]>(initialEntries)
  const [date, setDate]         = useState(today())
  const [weight, setWeight]     = useState('')
  const [unit, setUnit]         = useState<'kg' | 'lbs'>('kg')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [editId, setEditId]     = useState<string | null>(null)
  const [editWeight, setEditWeight] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const supabase = createClient()

  const lbsPreview = unit === 'lbs' && weight && !isNaN(parseFloat(weight))
    ? `${parseFloat(weight).toFixed(1)} lbs = ${lbsToKg(parseFloat(weight)).toFixed(1)} kg`
    : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const rawValue = parseFloat(weight)
    const weight_kg = unit === 'lbs' ? lbsToKg(rawValue) : rawValue
    const { data, error: err } = await supabase
      .from('weight_entries')
      .insert({ user_id: userId, date, weight_kg: parseFloat(weight_kg.toFixed(2)) })
      .select().single()
    if (err) {
      setError(err.message)
    } else {
      setEntries([data as Entry, ...entries].sort((a, b) => b.date.localeCompare(a.date)))
      setWeight('')
    }
    setLoading(false)
  }

  async function handleDelete(id: string) {
    const { error: err } = await supabase.from('weight_entries').delete().eq('id', id)
    if (!err) setEntries(entries.filter(e => e.id !== id))
  }

  function startEdit(entry: Entry) {
    setEditId(entry.id)
    setEditWeight(String(Number(entry.weight_kg).toFixed(1)))
  }

  function cancelEdit() { setEditId(null); setEditWeight('') }

  async function saveEdit(id: string) {
    setEditSaving(true)
    const newKg = parseFloat(editWeight)
    const { error: err } = await supabase.from('weight_entries').update({ weight_kg: newKg }).eq('id', id)
    if (!err) {
      setEntries(prev => prev.map(e => e.id === id ? { ...e, weight_kg: newKg } : e))
      setEditId(null)
      setEditWeight('')
    }
    setEditSaving(false)
  }

  const chartData = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30)
    .map(e => ({ date: e.date.slice(5), kg: Number(Number(e.weight_kg).toFixed(1)) }))

  const yMin = chartData.length ? Math.floor(Math.min(...chartData.map(d => d.kg)) - 1) : 60
  const yMax = chartData.length ? Math.ceil(Math.max(...chartData.map(d => d.kg)) + 1) : 100

  return (
    <>
      {/* Page title */}
      <h1 style={{
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '12px',
        color: 'var(--c-weight)',
        marginBottom: '24px',
        textShadow: '0 0 12px rgba(74,222,128,0.35)',
      }}>
        {t.weight.pageTitle}
      </h1>

      {/* Form */}
      <div className="pixel-card card-weight" style={{ marginBottom: '20px' }}>
        <div className="widget-label" style={{ color: 'var(--c-weight)' }}>{t.weight.logEntry}</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1', minWidth: '160px' }}>
            <label className="pixel-label">{t.weight.date}</label>
            <input className="pixel-input" type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
          <div style={{ flex: '1', minWidth: '180px' }}>
            <label className="pixel-label">{t.weight.weightLabel} ({unit})</label>
            <div style={{ display: 'flex' }}>
              <input
                className="pixel-input"
                type="number" step="0.1"
                min={unit === 'lbs' ? '44' : '20'}
                max={unit === 'lbs' ? '1100' : '500'}
                value={weight} onChange={e => setWeight(e.target.value)}
                placeholder={unit === 'kg' ? '75.5' : '166.0'}
                required style={{ borderRight: 'none' }}
              />
              <div style={{ display: 'flex', flexShrink: 0 }}>
                {(['kg', 'lbs'] as const).map(u => (
                  <button key={u} type="button" onClick={() => { setUnit(u); setWeight('') }} style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '9px',
                    padding: '0 10px',
                    border: '2px solid var(--border)',
                    borderLeft: u === 'kg' ? '2px solid var(--border)' : 'none',
                    cursor: 'pointer',
                    background: unit === u ? 'var(--c-weight)' : 'var(--bg3)',
                    color: unit === u ? '#000' : 'var(--muted)',
                    transition: 'background 0.15s, color 0.15s',
                    whiteSpace: 'nowrap',
                  }}>{u}</button>
                ))}
              </div>
            </div>
            {lbsPreview && (
              <div style={{ marginTop: '5px', fontSize: '15px', color: 'var(--c-weight)', fontFamily: "'VT323', monospace" }}>
                ≈ {lbsPreview}
              </div>
            )}
          </div>
          <button type="submit" className="pixel-btn pixel-btn-success" disabled={loading} style={{ whiteSpace: 'nowrap' }}>
            {loading ? t.weight.saving : t.weight.logBtn}
          </button>
        </form>
        {error && <div style={{ color: 'var(--red)', fontSize: '15px', marginTop: '10px' }}>⚠ {error}</div>}
      </div>

      {/* Chart */}
      {chartData.length > 1 && (
        <div className="pixel-card card-weight" style={{ marginBottom: '20px', padding: '20px' }}>
          <div className="widget-label" style={{ color: 'var(--c-weight)' }}>{t.weight.history}</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="#2d3555" strokeDasharray="4 4" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontFamily: "'VT323', monospace", fontSize: 14 }}
                axisLine={{ stroke: '#2d3555' }} tickLine={false} interval="preserveStartEnd" />
              <YAxis domain={[yMin, yMax]} tick={{ fill: '#6b7280', fontFamily: "'VT323', monospace", fontSize: 14 }}
                axisLine={{ stroke: '#2d3555' }} tickLine={false} width={36} />
              <Tooltip
                contentStyle={{ background: '#1a1f2e', border: '2px solid #4ade80', borderRadius: 0, fontFamily: "'VT323', monospace", fontSize: 16, color: '#e2e8f0' }}
                cursor={{ stroke: '#4ade80', strokeWidth: 1 }}
                formatter={(v) => [`${v} kg`, t.weight.weightLabel]}
              />
              <Line type="monotone" dataKey="kg" stroke="#4ade80" strokeWidth={2}
                dot={{ fill: '#4ade80', r: 3, strokeWidth: 0 }}
                activeDot={{ fill: '#22d3ee', r: 5, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className="pixel-card card-weight" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="scroll-x">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', borderBottom: '2px solid var(--border)', minWidth: '480px' }}>
          {[t.weight.colDate, t.weight.colWeight, t.weight.colChange, ''].map((h, i) => (
            <div key={i} style={{
              fontFamily: "'Press Start 2P', monospace", fontSize: '8px', color: 'var(--muted)',
              padding: '12px 16px', borderRight: i < 3 ? '1px solid var(--border)' : 'none',
              background: 'var(--bg3)',
            }}>{h}</div>
          ))}
        </div>

        {entries.length === 0 && (
          <div style={{ padding: '24px 16px', color: 'var(--muted)', fontSize: '16px' }}>
            {t.weight.noEntries}
          </div>
        )}

        {entries.map((entry, idx) => {
          const prev    = entries[idx + 1]
          const diff    = prev ? (Number(entry.weight_kg) - Number(prev.weight_kg)).toFixed(1) : null
          const diffNum = diff !== null ? Number(diff) : null
          const isEditing = editId === entry.id

          return (
            <div key={entry.id} style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto',
              borderBottom: '1px solid var(--border)',
              background: isEditing ? 'rgba(74,222,128,0.05)' : 'transparent',
              minWidth: '480px',
            }}>
              <div style={{ padding: '10px 16px', fontSize: '18px', borderRight: '1px solid var(--border)' }}>
                {formatDate(entry.date, lang)}
              </div>
              <div style={{ padding: '6px 10px', borderRight: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
                {isEditing ? (
                  <input className="pixel-input" type="number" step="0.1" min="20" max="500"
                    value={editWeight} onChange={e => setEditWeight(e.target.value)}
                    autoFocus style={{ fontSize: '18px', padding: '4px 8px' }} />
                ) : (
                  <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '13px', color: 'var(--c-weight)' }}>
                    {Number(entry.weight_kg).toFixed(1)}
                  </span>
                )}
              </div>
              <div style={{
                padding: '10px 16px', fontSize: '18px', borderRight: '1px solid var(--border)',
                color: diffNum === null ? 'var(--muted)' : diffNum > 0 ? 'var(--red)' : diffNum < 0 ? 'var(--green)' : 'var(--muted)',
              }}>
                {diff === null || diffNum === null ? '—' : diffNum === 0 ? '±0.0' : diffNum > 0 ? `▲ +${diff}` : `▼ ${diff}`}
              </div>
              <div style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isEditing ? (
                  <>
                    <button className="pixel-btn pixel-btn-success" style={{ fontSize: '8px', padding: '5px 8px' }}
                      onClick={() => saveEdit(entry.id)} disabled={editSaving}>
                      {editSaving ? '...' : t.weight.save}
                    </button>
                    <button className="pixel-btn pixel-btn-secondary" style={{ fontSize: '8px', padding: '5px 8px' }}
                      onClick={cancelEdit}>✕</button>
                  </>
                ) : (
                  <>
                    <button className="pixel-btn pixel-btn-secondary" style={{ fontSize: '8px', padding: '5px 8px' }}
                      onClick={() => startEdit(entry)}>{t.weight.edit}</button>
                    <button className="pixel-btn pixel-btn-danger" style={{ fontSize: '8px', padding: '5px 8px' }}
                      onClick={() => handleDelete(entry.id)}>{t.weight.del}</button>
                  </>
                )}
              </div>
            </div>
          )
        })}
        </div>{/* end scroll-x */}
      </div>
    </>
  )
}
