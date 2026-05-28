'use client'

import { useState } from 'react'
import type { ArmyCounts } from '@/lib/sacred/types'

const CLASS_INFO = [
  {
    key: 'warriors' as const,
    portrait: '/sacred/warriors/level1.jpg',
    label: 'Воїни',
    row: 'Передній ряд',
    max: 4,
    unitCost: 1,
    color: '#c07070',
    desc: 'Ближній бій. Удар або щит. Шанс 33% бойового кличу союзнику.',
  },
  {
    key: 'archers' as const,
    portrait: '/sacred/archers/level1.jpg',
    label: 'Лучники',
    row: 'Дальній ряд',
    max: 4,
    unitCost: 1,
    color: '#c4a040',
    desc: 'Постріл або прицілення (+20% шанс бонусу на 3 ходи). Шанс 25% додаткового пострілу.',
  },
  {
    key: 'mages' as const,
    portrait: '/sacred/mages/level1.jpg',
    label: 'Маги',
    row: 'Підтримка',
    max: 4,
    unitCost: 1,
    color: '#7ea8c4',
    desc: 'Закляття або зцілення. Шанс 20% накласти дебаф на ворога (вибір гравця).',
  },
  {
    key: 'catapults' as const,
    portrait: '/sacred/catapults/level1.jpg',
    label: 'Катапульта',
    row: 'Дальній + Підтримка',
    max: 1,
    unitCost: 2,
    color: '#8060a8',
    desc: 'Займає 2 слоти. Бараж по площі або картеч. Шанс 25% осколкового удару після барражу.',
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
      const effectiveMax = (key === 'archers' || key === 'mages') && prev.catapults > 0 ? 3
        : CLASS_INFO.find(c => c.key === key)!.max
      const prevCost = key === 'catapults' ? prev[key] * 2 : prev[key]
      const next = Math.max(0, Math.min(effectiveMax, prev[key] + delta))
      if (next === prev[key]) return prev
      const nextCost = key === 'catapults' ? next * 2 : next
      if (prevTotal - prevCost + nextCost > MAX_TOTAL) return prev
      const newCounts = { ...prev, [key]: next }
      if (key === 'catapults' && next > 0 && prev.archers > 3) newCounts.archers = 3
      if (key === 'catapults' && next > 0 && prev.mages > 3)   newCounts.mages = 3
      return newCounts
    })
  }

  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', minHeight: '100vh',
      background: '#0f0e09', color: '#f0e8d8',
      fontFamily: "'Inter', sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(240,232,216,0.1)', background: '#17150f' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#d4a85a', marginBottom: 2 }}>✦ Серафити — Склад армії</div>
        <div style={{ fontSize: 12, color: 'rgba(240,232,216,0.4)' }}>Обери кількість бійців кожного класу</div>
      </div>

      {/* Class selectors */}
      <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {CLASS_INFO.map(info => {
          const count = counts[info.key]
          const effectiveMax = (info.key === 'archers' || info.key === 'mages') && counts.catapults > 0 ? 3 : info.max
          const canAdd = count < effectiveMax && total + info.unitCost <= MAX_TOTAL
          const isCatapult = info.key === 'catapults'

          return (
            <div key={info.key} style={{
              padding: '14px 16px',
              borderRadius: 12,
              border: `1px solid ${count > 0 ? info.color + '44' : 'rgba(240,232,216,0.08)'}`,
              background: count > 0 ? `${info.color}0d` : '#17150f',
              transition: 'border-color 0.2s, background 0.2s',
            }}>
              {/* Top row: portrait + label + count */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                  border: `1.5px solid ${count > 0 ? info.color + '66' : info.color + '22'}`,
                  overflow: 'hidden',
                }}>
                  <img src={info.portrait} alt={info.label}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: count > 0 ? info.color : '#f0e8d8' }}>
                    {info.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.38)', marginTop: 1 }}>
                    {info.row} · max {effectiveMax}{info.unitCost > 1 ? ` · займає ${info.unitCost} слоти` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: count > 0 ? info.color : 'rgba(240,232,216,0.15)', fontVariantNumeric: 'tabular-nums', minWidth: 24, textAlign: 'right' }}>
                  {count}
                </div>
              </div>

              {/* Slot row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => change(info.key, -1)}
                  disabled={count === 0}
                  style={{
                    width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                    border: `1px solid ${count > 0 ? 'rgba(240,232,216,0.2)' : 'rgba(240,232,216,0.06)'}`,
                    background: count > 0 ? 'rgba(240,232,216,0.08)' : 'transparent',
                    color: count > 0 ? '#f0e8d8' : 'rgba(240,232,216,0.2)',
                    fontSize: 20, cursor: count === 0 ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >−</button>

                {isCatapult ? (
                  <div style={{ display: 'flex', gap: 6, flex: 1, justifyContent: 'center' }}>
                    {(['Дальн.', 'Підтр.'] as const).map((rowLabel, i) => {
                      const filled = count > 0
                      return (
                        <div key={i}
                          onClick={() => filled ? change(info.key, -1) : (canAdd && change(info.key, 1))}
                          style={{
                            width: 64, height: 42, borderRadius: 10, cursor: 'pointer',
                            border: `2px solid ${filled ? info.color : 'rgba(240,232,216,0.1)'}`,
                            background: filled ? `${info.color}1a` : 'rgba(240,232,216,0.03)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            gap: 2,
                            boxShadow: filled ? `0 0 8px ${info.color}33` : 'none',
                            transition: 'all 0.15s',
                          }}>
                          <span style={{ fontSize: filled ? 16 : 11, color: filled ? info.color : 'rgba(240,232,216,0.15)' }}>
                            {filled ? (i === 0 ? '⚙' : '◉') : '·'}
                          </span>
                          <span style={{ fontSize: 7, color: filled ? info.color : 'rgba(240,232,216,0.2)', opacity: 0.8 }}>
                            {rowLabel}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 5, flex: 1, justifyContent: 'center' }}>
                    {Array.from({ length: effectiveMax }, (_, i) => {
                      const filled = i < count
                      return (
                        <div
                          key={i}
                          onClick={() => filled ? change(info.key, -(count - i)) : (canAdd && change(info.key, i + 1 - count))}
                          style={{
                            width: 40, height: 40, borderRadius: 9, overflow: 'hidden',
                            border: `2px solid ${filled ? info.color : 'rgba(240,232,216,0.1)'}`,
                            background: filled ? `${info.color}20` : 'rgba(240,232,216,0.03)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, color: 'rgba(240,232,216,0.15)',
                            cursor: 'pointer',
                            boxShadow: filled ? `0 0 8px ${info.color}33` : 'none',
                            transition: 'all 0.15s',
                          }}
                        >
                          {filled
                            ? <img src={info.portrait} alt=""
                                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
                            : '·'
                          }
                        </div>
                      )
                    })}
                  </div>
                )}

                <button
                  onClick={() => change(info.key, +1)}
                  disabled={!canAdd}
                  style={{
                    width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                    border: `1px solid ${canAdd ? info.color : 'rgba(240,232,216,0.08)'}`,
                    background: canAdd ? `${info.color}18` : 'transparent',
                    color: canAdd ? info.color : 'rgba(240,232,216,0.2)',
                    fontSize: 20, cursor: canAdd ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >+</button>
              </div>

              {count > 0 && (
                <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.38)', marginTop: 8, lineHeight: 1.5 }}>
                  {info.desc}
                </div>
              )}
            </div>
          )
        })}

        {/* Total */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '11px 14px', borderRadius: 10,
          background: 'rgba(240,232,216,0.04)',
          border: '1px solid rgba(240,232,216,0.08)',
        }}>
          <div style={{ fontSize: 13, color: 'rgba(240,232,216,0.45)' }}>Використано слотів</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: total === MAX_TOTAL ? '#7aaa82' : total > 0 ? '#d4a85a' : 'rgba(240,232,216,0.2)' }}>
            {total} / {MAX_TOTAL}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(240,232,216,0.1)', background: '#17150f' }}>
        <button
          onClick={() => total > 0 && onStart(counts)}
          style={{
            width: '100%', padding: '14px', borderRadius: 10, border: 'none',
            background: total > 0 ? 'linear-gradient(135deg, #b07850, #8c5a38)' : 'rgba(240,232,216,0.06)',
            color: total > 0 ? '#fff' : 'rgba(240,232,216,0.2)',
            fontSize: 15, fontWeight: 700,
            cursor: total > 0 ? 'pointer' : 'not-allowed',
            transition: 'background 0.2s',
            boxShadow: total > 0 ? '0 4px 16px rgba(176,120,80,0.35)' : 'none',
          }}
        >
          {total > 0
            ? `⚔ До бою! (${counts.warriors + counts.archers + counts.mages + counts.catapults} юнітів)`
            : 'Додайте хоча б одного бійця'}
        </button>
      </div>
    </div>
  )
}
