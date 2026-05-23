'use client'

import { useState } from 'react'
import { UNIT_POOL } from '@/lib/sacred/game'
import type { UnitDef, Row, ArmySlot } from '@/lib/sacred/types'

const CLASS_ICON: Record<string, string> = { warrior: '⚔', archer: '🏹', mage: '✨' }
const CLASS_LABEL: Record<string, string> = { warrior: 'Воїни', archer: 'Лучники', mage: 'Маги' }
const ROW_LABEL: Record<number, string> = { 0: 'Передній', 1: 'Дальній', 2: 'Підтримка' }
const ROW_SHORT: Record<number, string> = { 0: 'П', 1: 'Д', 2: 'С' }
const ROW_MAX: Record<number, number> = { 0: 3, 1: 2, 2: 1 }

interface Props {
  onStart: (slots: ArmySlot[]) => void
}

export default function ArmyBuilder({ onStart }: Props) {
  const [step, setStep] = useState<'select' | 'formation'>('select')
  const [selected, setSelected] = useState<UnitDef[]>([])
  const [rowAssign, setRowAssign] = useState<Record<string, Row>>({})

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function defaultRow(def: UnitDef): Row {
    if (def.class === 'warrior') return 0
    if (def.class === 'archer') return 1
    return 2
  }

  function toggleUnit(def: UnitDef) {
    const isSelected = selected.some(u => u.defId === def.defId)
    if (isSelected) {
      setSelected(prev => prev.filter(u => u.defId !== def.defId))
      setRowAssign(prev => { const c = { ...prev }; delete c[def.defId]; return c })
    } else if (selected.length < 6) {
      setSelected(prev => [...prev, def])
      setRowAssign(prev => ({ ...prev, [def.defId]: defaultRow(def) }))
    }
  }

  function setRow(defId: string, row: Row) {
    setRowAssign(prev => ({ ...prev, [defId]: row }))
  }

  // ── Validation ────────────────────────────────────────────────────────────────
  const rowCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0 }
  selected.forEach(u => { rowCounts[rowAssign[u.defId] ?? 0]++ })

  const rowErrors: Record<number, boolean> = {
    0: rowCounts[0] > ROW_MAX[0],
    1: rowCounts[1] > ROW_MAX[1],
    2: rowCounts[2] > ROW_MAX[2],
  }
  const hasRowError = Object.values(rowErrors).some(Boolean)
  const canStart = selected.length === 6 && !hasRowError

  function handleStart() {
    if (!canStart) return
    const slots: ArmySlot[] = selected.map(def => ({ def, row: rowAssign[def.defId] ?? 0 }))
    onStart(slots)
  }

  // ── Step 1: Unit selection ────────────────────────────────────────────────────
  if (step === 'select') {
    const classes = ['warrior', 'archer', 'mage'] as const
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', minHeight: '100vh', background: '#0e0d0b', color: 'var(--text)', fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.5)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#ffd700', marginBottom: 4 }}>✦ Серафити — Вибір армії</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Оберіть 6 воїнів&nbsp;
            <span style={{ color: selected.length === 6 ? '#7aaa82' : 'var(--text)', fontWeight: 600 }}>
              {selected.length}/6
            </span>
          </div>
        </div>

        {/* Unit pool */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {classes.map(cls => (
            <div key={cls}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                {CLASS_ICON[cls]} {CLASS_LABEL[cls]}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {UNIT_POOL.filter(u => u.class === cls).map(def => {
                  const isSelected = selected.some(u => u.defId === def.defId)
                  const isFull = selected.length >= 6 && !isSelected
                  return (
                    <div
                      key={def.defId}
                      onClick={() => !isFull && toggleUnit(def)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: `2px solid ${isSelected ? '#ffd700' : 'rgba(255,255,255,0.10)'}`,
                        background: isSelected ? 'rgba(255,215,0,0.07)' : 'rgba(255,255,255,0.03)',
                        cursor: isFull ? 'not-allowed' : 'pointer',
                        opacity: isFull ? 0.4 : 1,
                        transition: 'border-color 0.15s, background 0.15s',
                        display: 'flex', alignItems: 'center', gap: 12,
                      }}
                    >
                      <div style={{ fontSize: 22, flexShrink: 0 }}>{CLASS_ICON[def.class]}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{def.name}</div>
                          {isSelected && <span style={{ fontSize: 14, color: '#ffd700' }}>✓</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{def.desc}</div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 5, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                          <span>HP {def.hp}</span>
                          <span>DMG {def.minDmg}–{def.maxDmg}</span>
                          <span>ACC {Math.round(def.accuracy * 100)}%</span>
                          <span>EVA {Math.round(def.evasion * 100)}%</span>
                          {def.counter > 0 && <span>CTR {Math.round(def.counter * 100)}%</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.6)' }}>
          <button
            onClick={() => selected.length === 6 && setStep('formation')}
            style={{
              width: '100%', padding: '13px', borderRadius: 10,
              background: selected.length === 6 ? '#7aaa82' : 'rgba(255,255,255,0.06)',
              border: 'none', color: selected.length === 6 ? '#fff' : 'var(--muted)',
              fontSize: 14, fontWeight: 600, cursor: selected.length === 6 ? 'pointer' : 'not-allowed',
              transition: 'background 0.2s',
            }}
          >
            {selected.length === 6 ? 'Далі — розставити по рядах →' : `Оберіть ще ${6 - selected.length} воїн${6 - selected.length === 1 ? 'а' : 'ів'}`}
          </button>
        </div>
      </div>
    )
  }

  // ── Step 2: Formation ─────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 560, margin: '0 auto', minHeight: '100vh', background: '#0e0d0b', color: 'var(--text)', fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setStep('select')}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1 }}
          >
            ←
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#ffd700' }}>✦ Серафити — Розташування</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>Призначте кожному воїну ряд</div>
          </div>
        </div>
      </div>

      {/* Formation preview */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {([0, 1, 2] as Row[]).map(row => {
          const inRow = selected.filter(u => (rowAssign[u.defId] ?? 0) === row)
          const isOver = rowErrors[row]
          return (
            <div key={row} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 70, fontSize: 10, color: isOver ? '#c07070' : 'rgba(255,255,255,0.3)', fontWeight: 600, flexShrink: 0 }}>
                {ROW_LABEL[row]}
              </div>
              <div style={{ display: 'flex', gap: 5, flex: 1 }}>
                {Array.from({ length: ROW_MAX[row] }, (_, i) => {
                  const u = inRow[i]
                  return (
                    <div key={i} style={{
                      width: 44, height: 34, borderRadius: 6, flexShrink: 0,
                      border: `1px solid ${isOver ? '#c07070' : u ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)'}`,
                      background: u ? 'rgba(255,255,255,0.07)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: u ? 14 : 11, color: u ? 'var(--text)' : 'rgba(255,255,255,0.15)',
                    }}>
                      {u ? CLASS_ICON[u.class] : '·'}
                    </div>
                  )
                })}
              </div>
              <div style={{ fontSize: 10, color: isOver ? '#c07070' : 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                {inRow.length}/{ROW_MAX[row]}
              </div>
            </div>
          )
        })}
        {hasRowError && (
          <div style={{ fontSize: 11, color: '#c07070', marginTop: 4 }}>
            ⚠ Перевищено ліміт ряду — перерозподіліть воїнів
          </div>
        )}
      </div>

      {/* Unit row assignment list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {selected.map(def => {
          const assignedRow = rowAssign[def.defId] ?? 0
          return (
            <div key={def.defId} style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.03)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ fontSize: 18, flexShrink: 0 }}>{CLASS_ICON[def.class]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{def.name}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>HP {def.hp} · DMG {def.minDmg}–{def.maxDmg}</div>
              </div>
              {/* Row selector */}
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {([0, 1, 2] as Row[]).map(row => {
                  const active = assignedRow === row
                  return (
                    <button
                      key={row}
                      onClick={() => setRow(def.defId, row)}
                      title={ROW_LABEL[row]}
                      style={{
                        width: 30, height: 30, borderRadius: 6,
                        border: `1px solid ${active ? '#ffd700' : 'rgba(255,255,255,0.15)'}`,
                        background: active ? 'rgba(255,215,0,0.18)' : 'transparent',
                        color: active ? '#ffd700' : 'var(--muted)',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.12s',
                      }}
                    >
                      {ROW_SHORT[row]}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.6)' }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 8, display: 'flex', gap: 16 }}>
          <span>[П] Передній · max {ROW_MAX[0]}</span>
          <span>[Д] Дальній · max {ROW_MAX[1]}</span>
          <span>[С] Підтримка · max {ROW_MAX[2]}</span>
        </div>
        <button
          onClick={handleStart}
          style={{
            width: '100%', padding: '13px', borderRadius: 10,
            background: canStart ? '#7aaa82' : 'rgba(255,255,255,0.06)',
            border: 'none', color: canStart ? '#fff' : 'var(--muted)',
            fontSize: 14, fontWeight: 600, cursor: canStart ? 'pointer' : 'not-allowed',
            transition: 'background 0.2s',
          }}
        >
          {canStart ? '⚔ До бою!' : hasRowError ? 'Виправте розташування' : 'Розставте всіх воїнів'}
        </button>
      </div>
    </div>
  )
}
