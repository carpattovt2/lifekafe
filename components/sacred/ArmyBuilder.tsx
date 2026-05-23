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
    unitCost: 1,
    color: '#c07070',
    desc: 'Ближній бій. Удар або щит. Шанс 33% бойового кличу союзнику.',
  },
  {
    key: 'archers' as const,
    icon: '🏹',
    label: 'Лучники',
    row: 'Дальній ряд',
    max: 3,
    unitCost: 1,
    color: '#c4a040',
    desc: 'Постріл або прицілення (+20% шанс бонусу на 3 ходи). Шанс 25% додаткового пострілу.',
  },
  {
    key: 'mages' as const,
    icon: '✨',
    label: 'Маги',
    row: 'Підтримка',
    max: 2,
    unitCost: 1,
    color: '#7ea8c4',
    desc: 'Закляття або зцілення. Шанс 20% накласти дебаф на ворога (вибір гравця).',
  },
  {
    key: 'catapults' as const,
    icon: '⚙',
    label: 'Катапульта',
    row: 'Дальній + Підтримка',
    max: 1,
    unitCost: 2,
    color: '#8060a8',
    desc: 'Займає 2 слоти. Бараж по площі або ремонт. Шанс 25% осколкового удару після барражу.',
  },
]

interface Props {
  onStart: (counts: ArmyCounts) => void
}

export default function ArmyBuilder({ onStart }: Props) {
  const [counts, setCounts] = useState<ArmyCounts>({ warriors: 2, archers: 2, mages: 1, catapults: 0 })

  const MAX_TOTAL = 6
  const total = counts.warriors + counts.archers + counts.mages + counts.catapults * 2

  function change(key: keyof ArmyCounts, delta: number) {
    setCounts(prev => {
      const prevTotal = prev.warriors + prev.archers + prev.mages + prev.catapults * 2
      const effectiveMax = key === 'archers' ? (prev.catapults > 0 ? 2 : 3)
        : CLASS_INFO.find(c => c.key === key)!.max
      const unitCost = CLASS_INFO.find(c => c.key === key)!.unitCost
      const prevCost = key === 'catapults' ? prev[key] * 2 : prev[key]
      const next = Math.max(0, Math.min(effectiveMax, prev[key] + delta))
      if (next === prev[key]) return prev
      const nextCost = key === 'catapults' ? next * 2 : next
      if (prevTotal - prevCost + nextCost > MAX_TOTAL) return prev
      const newCounts = { ...prev, [key]: next }
      if (key === 'catapults' && next > 0 && prev.archers > 2) newCounts.archers = 2
      return newCounts
    })
  }

  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', minHeight: '100vh',
      background: '#faf8f5', color: 'var(--text)',
      fontFamily: "'Inter', sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: '#fff' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#b07850', marginBottom: 2 }}>✦ Серафити — Склад армії</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Обери кількість бійців кожного класу</div>
      </div>

      {/* Class selectors */}
      <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {CLASS_INFO.map(info => {
          const count = counts[info.key]
          const effectiveMax = info.key === 'archers' ? (counts.catapults > 0 ? 2 : 3) : info.max
          const canAdd = count < effectiveMax && total + info.unitCost <= MAX_TOTAL
          return (
            <div key={info.key} style={{
              padding: '16px 18px',
              borderRadius: 12,
              border: `1px solid ${count > 0 ? info.color + '66' : 'rgba(0,0,0,0.08)'}`,
              background: count > 0 ? `${info.color}0f` : '#fff',
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
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                    {info.row} · max {effectiveMax}{info.unitCost > 1 ? ` · займає ${info.unitCost} слоти` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: count > 0 ? info.color : 'rgba(0,0,0,0.15)', fontVariantNumeric: 'tabular-nums', minWidth: 24, textAlign: 'right' }}>
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
                    border: `1px solid ${count > 0 ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.08)'}`,
                    background: count > 0 ? 'rgba(0,0,0,0.06)' : 'transparent',
                    color: count > 0 ? 'var(--text)' : 'rgba(0,0,0,0.2)',
                    fontSize: 20, cursor: count === 0 ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >−</button>

                <div style={{ display: 'flex', gap: 6, flex: 1, justifyContent: 'center' }}>
                  {Array.from({ length: effectiveMax }, (_, i) => {
                    const filled = i < count
                    return (
                      <div
                        key={i}
                        onClick={() => filled ? change(info.key, -(count - i)) : canAdd && change(info.key, i + 1 - count)}
                        style={{
                          width: 42, height: 42, borderRadius: 10,
                          border: `2px solid ${filled ? info.color : 'rgba(0,0,0,0.1)'}`,
                          background: filled ? `${info.color}20` : 'rgba(0,0,0,0.02)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: filled ? 18 : 13,
                          color: filled ? info.color : 'rgba(0,0,0,0.15)',
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
                  disabled={!canAdd}
                  style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    border: `1px solid ${canAdd ? info.color : 'rgba(0,0,0,0.1)'}`,
                    background: canAdd ? `${info.color}18` : 'transparent',
                    color: canAdd ? info.color : 'rgba(0,0,0,0.2)',
                    fontSize: 20, cursor: canAdd ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >+</button>
              </div>

              {/* Desc */}
              {count > 0 && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
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
          background: 'rgba(0,0,0,0.03)',
          border: '1px solid rgba(0,0,0,0.07)',
        }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Використано слотів</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: total === MAX_TOTAL ? '#5a9a6a' : total > 0 ? '#b07850' : 'rgba(0,0,0,0.2)' }}>
            {total} / {MAX_TOTAL}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', background: '#fff' }}>
        <button
          onClick={() => total > 0 && onStart(counts)}
          style={{
            width: '100%', padding: '14px', borderRadius: 10,
            background: total > 0 ? '#6fa67a' : 'rgba(0,0,0,0.04)',
            border: 'none',
            color: total > 0 ? '#fff' : 'rgba(0,0,0,0.2)',
            fontSize: 15, fontWeight: 700,
            cursor: total > 0 ? 'pointer' : 'not-allowed',
            transition: 'background 0.2s',
          }}
        >
          {total > 0 ? `⚔ До бою! (${counts.warriors + counts.archers + counts.mages + counts.catapults} юнітів)` : 'Додайте хоча б одного бійця'}
        </button>
      </div>
    </div>
  )
}
