'use client'

import { useState } from 'react'
import type { ArmyCounts } from '@/lib/sacred/types'

const CLASS_INFO = [
  {
    key: 'warriors' as const,
    icon: '⚔',
    label: 'Воїни',
    row: 'Передній ряд',
    max: 4,
    color: '#c07070',
    desc: 'Ближній бій. Удар або щит. Шанс 33% бойового кличу союзнику.',
  },
  {
    key: 'archers' as const,
    icon: '🏹',
    label: 'Лучники',
    row: 'Дальній ряд',
    max: 3,
    color: '#c4a040',
    desc: 'Постріл або прицілення (+20% шанс бонусу на 3 ходи). Шанс 25% додаткового пострілу.',
  },
  {
    key: 'mages' as const,
    icon: '✨',
    label: 'Маги',
    row: 'Підтримка',
    max: 2,
    color: '#7ea8c4',
    desc: 'Закляття або зцілення. Шанс 20% накласти дебаф на ворога (вибір гравця).',
  },
]

interface Props {
  onStart: (counts: ArmyCounts) => void
}

export default function ArmyBuilder({ onStart }: Props) {
  const [counts, setCounts] = useState<ArmyCounts>({ warriors: 2, archers: 2, mages: 1 })

  const MAX_TOTAL = 6
  const total = counts.warriors + counts.archers + counts.mages

  function change(key: keyof ArmyCounts, delta: number) {
    const info = CLASS_INFO.find(c => c.key === key)!
    setCounts(prev => {
      const next = Math.max(0, Math.min(info.max, prev[key] + delta))
      const newTotal = total - prev[key] + next
      if (delta > 0 && newTotal > MAX_TOTAL) return prev
      return { ...prev, [key]: next }
    })
  }

  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', minHeight: '100vh',
      background: '#0e0d0b', color: 'var(--text)',
      fontFamily: "'Inter', sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#ffd700', marginBottom: 2 }}>✦ Серафити — Склад армії</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Обери кількість бійців кожного класу</div>
      </div>

      {/* Class selectors */}
      <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {CLASS_INFO.map(info => {
          const count = counts[info.key]
          return (
            <div key={info.key} style={{
              padding: '16px 18px',
              borderRadius: 12,
              border: `1px solid ${count > 0 ? info.color + '44' : 'rgba(255,255,255,0.08)'}`,
              background: count > 0 ? `${info.color}08` : 'rgba(255,255,255,0.02)',
              transition: 'border-color 0.2s, background 0.2s',
            }}>
              {/* Top row: icon + label + count */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                  background: count > 0 ? `${info.color}28` : `${info.color}10`,
                  border: `1px solid ${count > 0 ? info.color + '66' : info.color + '22'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, transition: 'all 0.2s',
                }}>
                  {info.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: count > 0 ? info.color : 'var(--text)' }}>
                    {info.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginTop: 1 }}>{info.row} · max {info.max}</div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: count > 0 ? info.color : 'rgba(255,255,255,0.15)', fontVariantNumeric: 'tabular-nums', minWidth: 24, textAlign: 'right' }}>
                  {count}
                </div>
              </div>

              {/* Slot icons row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => change(info.key, -1)}
                  disabled={count === 0}
                  style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    border: `1px solid ${count > 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)'}`,
                    background: count > 0 ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: count > 0 ? 'var(--text)' : 'rgba(255,255,255,0.15)',
                    fontSize: 20, cursor: count === 0 ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >−</button>

                <div style={{ display: 'flex', gap: 6, flex: 1, justifyContent: 'center' }}>
                  {Array.from({ length: info.max }, (_, i) => {
                    const filled = i < count
                    return (
                      <div
                        key={i}
                        onClick={() => filled ? change(info.key, -(count - i)) : (total < MAX_TOTAL || count > i) && change(info.key, i + 1 - count)}
                        style={{
                          width: 42, height: 42, borderRadius: 10,
                          border: `2px solid ${filled ? info.color : 'rgba(255,255,255,0.1)'}`,
                          background: filled ? `${info.color}25` : 'rgba(255,255,255,0.02)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: filled ? 18 : 13,
                          color: filled ? info.color : 'rgba(255,255,255,0.12)',
                          transition: 'all 0.15s',
                          cursor: 'pointer',
                          boxShadow: filled ? `0 0 10px ${info.color}33` : 'none',
                        }}
                      >
                        {filled ? info.icon : '·'}
                      </div>
                    )
                  })}
                </div>

                <button
                  onClick={() => change(info.key, +1)}
                  disabled={count >= info.max || total >= MAX_TOTAL}
                  style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    border: `1px solid ${count < info.max && total < MAX_TOTAL ? info.color + '88' : 'rgba(255,255,255,0.07)'}`,
                    background: count < info.max && total < MAX_TOTAL ? `${info.color}22` : 'transparent',
                    color: count < info.max && total < MAX_TOTAL ? info.color : 'rgba(255,255,255,0.15)',
                    fontSize: 20, cursor: count >= info.max || total >= MAX_TOTAL ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >+</button>
              </div>

              {/* Desc */}
              {count > 0 && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 8, lineHeight: 1.5 }}>
                  {info.desc}
                </div>
              )}
            </div>
          )
        })}

        {/* Total */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px',
          borderRadius: 10,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Загалом бійців</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: total === MAX_TOTAL ? '#7aaa82' : total > 0 ? '#ffd700' : 'rgba(255,255,255,0.2)' }}>
            {total} / {MAX_TOTAL}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.6)' }}>
        <button
          onClick={() => total > 0 && onStart(counts)}
          style={{
            width: '100%', padding: '14px', borderRadius: 10,
            background: total > 0 ? '#7aaa82' : 'rgba(255,255,255,0.05)',
            border: 'none',
            color: total > 0 ? '#fff' : 'rgba(255,255,255,0.2)',
            fontSize: 15, fontWeight: 700,
            cursor: total > 0 ? 'pointer' : 'not-allowed',
            transition: 'background 0.2s',
          }}
        >
          {total > 0 ? `⚔ До бою! (${total} бійців)` : 'Додайте хоча б одного бійця'}
        </button>
      </div>
    </div>
  )
}
