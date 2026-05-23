'use client'

import { useState } from 'react'
import type { GameUnit, ArmyCounts, Row, Side } from '@/lib/sacred/types'
import { buildCustomArmy, buildDefaultAIArmy } from '@/lib/sacred/game'

const SIDE_COLOR: Record<Side, string> = { player: '#6fa67a', ai: '#c07070' }
const CLASS_ICON: Record<string, string> = { warrior: '⚔', archer: '🏹', mage: '✨', catapult: '⚙' }
const CLASS_COLOR: Record<string, string> = { player: '#6fa67a', ai: '#c07070' }
const ROW_LABEL: Record<number, string> = { 0: 'Передній ряд', 1: 'Дальній ряд', 2: 'Підтримка' }
const ROW_SLOTS: Record<number, number> = { 0: 4, 1: 3, 2: 3 }

interface Props {
  counts: ArmyCounts
  onStart: (playerUnits: GameUnit[]) => void
  onBack: () => void
}

export default function PlacementScreen({ counts, onStart, onBack }: Props) {
  const [playerUnits, setPlayerUnits] = useState<GameUnit[]>(() =>
    buildCustomArmy(counts, 'player')
  )
  const aiUnits = buildDefaultAIArmy()
  const [selected, setSelected] = useState<string | null>(null)

  const hasCatapult = playerUnits.some(u => u.class === 'catapult')

  function handlePlayerSlotClick(row: Row, slot: number) {
    // catapult base visual at row 2 slot 2 — no-op
    if (row === 2 && slot === 2 && hasCatapult) return

    const occupant = playerUnits.find(u => u.row === row && u.slot === slot)

    // don't allow moving catapult
    if (occupant?.class === 'catapult') return

    if (selected) {
      const selUnit = playerUnits.find(u => u.id === selected)!
      // don't allow dropping into catapult slot (row 1 slot 2)
      if (!occupant && row === 1 && slot === 2 && hasCatapult) { setSelected(null); return }
      if (occupant) {
        // Swap
        setPlayerUnits(prev => prev.map(u => {
          if (u.id === selUnit.id) return { ...u, row: occupant.row, slot: occupant.slot }
          if (u.id === occupant.id) return { ...u, row: selUnit.row, slot: selUnit.slot }
          return u
        }))
      } else {
        // Move to empty slot
        setPlayerUnits(prev => prev.map(u =>
          u.id === selUnit.id ? { ...u, row, slot } : u
        ))
      }
      setSelected(null)
      return
    }

    if (occupant) setSelected(occupant.id)
  }

  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', minHeight: '100vh',
      background: '#faf8f5', color: 'var(--text)',
      fontFamily: "'Inter', sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: '#fff' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#b07850', marginBottom: 2 }}>✦ Серафити — Розстановка</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Натисни на юніта, потім на слот щоб переставити</div>
      </div>

      <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>

        {/* AI side (read-only preview) */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#c07070', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            Ворог (попередній перегляд)
          </div>
          {([2, 1, 0] as Row[]).map(row => {
            const aiHasCatapult = aiUnits.some(u => u.class === 'catapult')
            return (
              <div key={row} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 3 }}>{ROW_LABEL[row]}</div>
                <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                  {Array.from({ length: ROW_SLOTS[row] }, (_, i) => {
                    const isCatapultBase = row === 2 && i === 2 && aiHasCatapult
                    const unit = aiUnits.find(u => u.row === row && u.slot === i)
                    return (
                      <div key={i} style={{
                        width: 68, height: 72, borderRadius: 8, flexShrink: 0,
                        background: isCatapultBase ? 'rgba(192,112,112,0.05)'
                          : unit ? 'rgba(192,112,112,0.08)' : 'rgba(0,0,0,0.02)',
                        border: `1.5px ${isCatapultBase ? 'dashed' : 'solid'} ${
                          isCatapultBase ? '#c0707033' : unit ? '#c0707044' : 'rgba(0,0,0,0.08)'
                        }`,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        gap: 2,
                      }}>
                        {isCatapultBase ? (
                          <>
                            <span style={{ fontSize: 14, opacity: 0.4 }}>⚙</span>
                            <span style={{ fontSize: 7, color: '#c07070', opacity: 0.5 }}>База</span>
                          </>
                        ) : unit ? (
                          <>
                            <span style={{ fontSize: 16 }}>{CLASS_ICON[unit.class]}</span>
                            <span style={{ fontSize: 8, color: '#c07070' }}>{unit.name}</span>
                          </>
                        ) : (
                          <span style={{ fontSize: 16, color: 'rgba(0,0,0,0.1)' }}>·</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--border)', position: 'relative', margin: '0 0 2px' }}>
          <div style={{
            position: 'absolute', left: '50%', top: -9, transform: 'translateX(-50%)',
            fontSize: 14, background: '#faf8f5', padding: '0 8px', color: 'var(--muted)',
          }}>⚔</div>
        </div>

        {/* Player side (interactive) */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#6fa67a', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            Твоя армія — переставляй
          </div>
          {([0, 1, 2] as Row[]).map(row => {
            const rowUnits = playerUnits.filter(u => u.row === row)
            return (
              <div key={row} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 3 }}>{ROW_LABEL[row]}</div>
                <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                  {Array.from({ length: ROW_SLOTS[row] }, (_, i) => {
                    const isCatapultBase = row === 2 && i === 2 && hasCatapult
                    const isCatapultSlot = row === 1 && i === 2 && hasCatapult
                    const unit = rowUnits.find(u => u.slot === i)
                    const isSelected = unit?.id === selected
                    const isTargetSlot = selected != null && !unit && !isCatapultBase && !isCatapultSlot

                    if (isCatapultBase) {
                      return (
                        <div key={i} style={{
                          width: 68, height: 72, borderRadius: 8, flexShrink: 0,
                          background: 'rgba(128,96,168,0.05)',
                          border: '1.5px dashed rgba(128,96,168,0.25)',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          gap: 2,
                        }}>
                          <span style={{ fontSize: 14, opacity: 0.4, color: '#8060a8' }}>⚙</span>
                          <span style={{ fontSize: 7, color: '#8060a8', opacity: 0.5 }}>База</span>
                        </div>
                      )
                    }

                    return (
                      <div
                        key={i}
                        onClick={() => handlePlayerSlotClick(row, i)}
                        style={{
                          width: 68, height: 72, borderRadius: 8, flexShrink: 0,
                          cursor: isCatapultSlot ? 'default' : 'pointer',
                          background: isSelected
                            ? 'rgba(111,166,122,0.15)'
                            : isTargetSlot
                              ? 'rgba(176,120,80,0.08)'
                              : unit
                                ? '#fff'
                                : 'rgba(0,0,0,0.02)',
                          border: `2px solid ${
                            isSelected
                              ? '#6fa67a'
                              : isTargetSlot
                                ? '#b0785066'
                                : unit?.class === 'catapult'
                                  ? '#8060a866'
                                  : unit
                                    ? 'rgba(0,0,0,0.1)'
                                    : 'rgba(0,0,0,0.08)'
                          }`,
                          borderStyle: isTargetSlot ? 'dashed' : 'solid',
                          boxShadow: isSelected ? '0 0 0 2px #6fa67a44' : unit ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          gap: 2, transition: 'all 0.12s',
                        }}
                      >
                        {unit ? (
                          <>
                            <span style={{ fontSize: 18 }}>{CLASS_ICON[unit.class]}</span>
                            <span style={{ fontSize: 8, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.2 }}>{unit.name}</span>
                            {isSelected && <span style={{ fontSize: 7, color: '#6fa67a', fontWeight: 700 }}>ОБРАНИЙ</span>}
                            {unit.class === 'catapult' && <span style={{ fontSize: 7, color: '#8060a8', opacity: 0.7 }}>закріплена</span>}
                          </>
                        ) : (
                          <span style={{ fontSize: selected ? 18 : 14, color: selected ? '#b0785066' : 'rgba(0,0,0,0.1)' }}>
                            {selected ? '+' : '·'}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {selected && (
          <div style={{ textAlign: 'center', fontSize: 12, color: '#b07850', padding: '4px 0' }}>
            Натисни на інший слот щоб переставити · або на юніта щоб поміняти місцями
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: '#fff', display: 'flex', gap: 10 }}>
        <button
          onClick={onBack}
          style={{
            padding: '12px 20px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.1)',
            background: 'transparent', color: 'var(--muted)', fontSize: 14, cursor: 'pointer',
          }}
        >
          ← Назад
        </button>
        <button
          onClick={() => onStart(playerUnits)}
          style={{
            flex: 1, padding: '12px', borderRadius: 10, border: 'none',
            background: '#6fa67a', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}
        >
          ⚔ До бою!
        </button>
      </div>
    </div>
  )
}
