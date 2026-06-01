'use client'

import { useState } from 'react'
import type { GameUnit, ArmyCounts, Row, Side } from '@/lib/sacred/types'
import { buildCustomArmy, buildDefaultAIArmy } from '@/lib/sacred/game'

const ROW_LABEL: Record<number, string> = { 0: 'Передній ряд', 1: 'Дальній ряд' }
const ROW_SLOTS: Record<number, number> = { 0: 4, 1: 4 }

function getPortrait(unit: GameUnit): string {
  const lvl = unit.level ?? 1
  if (unit.class === 'warrior') return `/sacred/warriors/level${lvl}.jpg`
  if (unit.class === 'archer')  return `/sacred/archers/level${lvl}.jpg`
  if (unit.class === 'mage')
    return lvl === 1 || !unit.magePath ? '/sacred/mages/level1.jpg' : `/sacred/mages/${unit.magePath}/level${lvl}.jpg`
  if (unit.class === 'catapult')
    return lvl === 1 || !unit.catapultPath ? '/sacred/catapults/level1.jpg' : `/sacred/catapults/${unit.catapultPath}/level${lvl}.jpg`
  return '/sacred/warriors/level1.jpg'
}

function shortName(name: string) {
  return name.replace(/^Ворог\.\s*/i, '').replace(/^(Воїн|Лучник|Маг|Катапульта)\s+/i, '$1 ').trim()
}

interface Props {
  counts: ArmyCounts
  onStart: (playerUnits: GameUnit[]) => void
  onBack: () => void
}

export default function PlacementScreen({ counts, onStart, onBack }: Props) {
  const [playerUnits, setPlayerUnits] = useState<GameUnit[]>(() => buildCustomArmy(counts, 'player'))
  const aiUnits = buildDefaultAIArmy()
  const [selected, setSelected] = useState<string | null>(null)

  const hasCatapult = playerUnits.some(u => u.class === 'catapult')
  const catSlot = 3

  function handlePlayerSlotClick(row: Row, slot: number) {
    if (hasCatapult && row === 1 && slot === 3) return // catapult base
    const occupant = playerUnits.find(u => u.row === row && u.slot === slot)
    if (selected) {
      const selUnit = playerUnits.find(u => u.id === selected)!
      if (selUnit.row !== row) { setSelected(null); return } // same row only
      if (occupant && occupant.id !== selected) {
        setPlayerUnits(prev => prev.map(u => {
          if (u.id === selUnit.id) return { ...u, slot: occupant.slot }
          if (u.id === occupant.id) return { ...u, slot: selUnit.slot }
          return u
        }))
      } else if (!occupant) {
        setPlayerUnits(prev => prev.map(u => u.id === selUnit.id ? { ...u, slot } : u))
      }
      setSelected(null)
      return
    }
    if (occupant && occupant.class !== 'catapult') setSelected(occupant.id)
  }

  const CARD = 56
  const GAP  = 3

  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', minHeight: '100vh',
      background: '#0f0e09', color: '#f0e8d8',
      fontFamily: "'Inter', sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(240,232,216,0.1)', background: '#17150f' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#d4a85a', marginBottom: 2 }}>✦ Серафити — Розстановка</div>
        <div style={{ fontSize: 12, color: 'rgba(240,232,216,0.4)' }}>Натисни на юніта, потім на слот щоб переставити</div>
      </div>

      <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>

        {/* AI preview */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(192,112,112,0.7)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            Ворог (попередній перегляд)
          </div>
          {([1, 0] as Row[]).map(row => {
            const aiHasCat = aiUnits.some(u => u.class === 'catapult')
            const rowHasUnits = aiUnits.some(u => u.row === row)
            if (!rowHasUnits && !(aiHasCat && row === 1)) return null
            return (
              <div key={row} style={{ marginBottom: 5 }}>
                <div style={{ fontSize: 9, color: 'rgba(240,232,216,0.25)', marginBottom: 3 }}>{ROW_LABEL[row]}</div>
                <div style={{ display: 'flex', gap: GAP, justifyContent: 'center' }}>
                  {Array.from({ length: ROW_SLOTS[row] }, (_, i) => {
                    const isCatBase = row === 1 && i === 3 && aiHasCat
                    const unit = aiUnits.find(u => u.row === row && u.slot === i)
                    return (
                      <div key={i} style={{
                        width: CARD, height: CARD + 8, borderRadius: 8, flexShrink: 0,
                        background: isCatBase ? 'rgba(192,112,112,0.04)'
                          : unit ? 'rgba(192,112,112,0.08)' : 'rgba(240,232,216,0.02)',
                        border: `1.5px ${isCatBase ? 'dashed' : 'solid'} ${
                          isCatBase ? 'rgba(192,112,112,0.2)' : unit ? 'rgba(192,112,112,0.3)' : 'rgba(240,232,216,0.06)'
                        }`,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden', position: 'relative',
                      }}>
                        {isCatBase ? (
                          <span style={{ fontSize: 10, color: 'rgba(192,112,112,0.35)' }}>⚙</span>
                        ) : unit ? (
                          <>
                            <img src={getPortrait(unit)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', opacity: 0.6 }} />
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 40%, rgba(0,0,0,0.75) 100%)' }} />
                            <span style={{ position: 'relative', fontSize: 7, color: '#f0e8d8', fontWeight: 600, alignSelf: 'flex-end', padding: '0 3px 3px', lineHeight: 1 }}>{shortName(unit.name)}</span>
                          </>
                        ) : (
                          <span style={{ fontSize: 14, color: 'rgba(240,232,216,0.08)' }}>·</span>
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
        <div style={{ borderTop: '1px solid rgba(240,232,216,0.1)', position: 'relative', margin: '0 0 2px' }}>
          <div style={{
            position: 'absolute', left: '50%', top: -9, transform: 'translateX(-50%)',
            fontSize: 14, background: '#0f0e09', padding: '0 8px', color: 'rgba(240,232,216,0.3)',
          }}>⚔</div>
        </div>

        {/* Player side */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(111,166,122,0.8)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            Твоя армія — переставляй
          </div>
          {([0, 1] as Row[]).map(row => {
            const rowUnits = playerUnits.filter(u => u.row === row)
            return (
              <div key={row} style={{ marginBottom: 5 }}>
                <div style={{ fontSize: 9, color: 'rgba(240,232,216,0.25)', marginBottom: 3 }}>{ROW_LABEL[row]}</div>
                <div style={{ display: 'flex', gap: GAP, justifyContent: 'center' }}>
                  {Array.from({ length: ROW_SLOTS[row] }, (_, i) => {
                    const isCatBase  = row === 1 && i === 3 && hasCatapult
                    const unit       = rowUnits.find(u => u.slot === i)
                    const isSelected = unit?.id === selected
                    const isTarget   = selected != null && !unit && !isCatBase

                    if (isCatBase) {
                      return (
                        <div key={i} style={{
                          width: CARD, height: CARD + 8, borderRadius: 8, flexShrink: 0,
                          background: 'rgba(128,96,168,0.06)',
                          border: '1.5px dashed rgba(128,96,168,0.25)',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                        }}>
                          <span style={{ fontSize: 11, opacity: 0.35, color: '#8060a8' }}>⚙</span>
                          <span style={{ fontSize: 7, color: '#8060a8', opacity: 0.4 }}>База</span>
                        </div>
                      )
                    }

                    return (
                      <div
                        key={i}
                        onClick={() => handlePlayerSlotClick(row as Row, i)}
                        style={{
                          width: CARD, height: CARD + 8, borderRadius: 8, flexShrink: 0,
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(111,166,122,0.15)' : isTarget ? 'rgba(176,120,80,0.08)' : 'rgba(240,232,216,0.03)',
                          border: `2px solid ${
                            isSelected ? '#6fa67a'
                            : isTarget ? 'rgba(176,120,80,0.4)'
                            : unit?.class === 'catapult' ? 'rgba(128,96,168,0.4)'
                            : unit ? 'rgba(240,232,216,0.15)'
                            : 'rgba(240,232,216,0.07)'
                          }`,
                          borderStyle: isTarget ? 'dashed' : 'solid',
                          boxShadow: isSelected ? '0 0 0 2px rgba(111,166,122,0.3)' : 'none',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          overflow: 'hidden', position: 'relative', transition: 'all 0.12s',
                        }}
                      >
                        {unit ? (
                          <>
                            <img src={getPortrait(unit)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
                            <div style={{ position: 'absolute', inset: 0, background: isSelected ? 'rgba(111,166,122,0.3)' : 'linear-gradient(transparent 35%, rgba(0,0,0,0.72) 100%)' }} />
                            <div style={{ position: 'relative', zIndex: 1, alignSelf: 'stretch', marginTop: 'auto', padding: '0 3px 3px' }}>
                              <div style={{ fontSize: 7, fontWeight: 700, color: '#f0e8d8', textShadow: '0 1px 3px rgba(0,0,0,0.9)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shortName(unit.name)}</div>
                              {isSelected && <div style={{ fontSize: 6, color: '#7aaa82', fontWeight: 700 }}>ОБРАНИЙ</div>}
                            </div>
                          </>
                        ) : (
                          <span style={{ fontSize: selected ? 16 : 12, color: selected ? 'rgba(176,120,80,0.4)' : 'rgba(240,232,216,0.1)' }}>
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
          <div style={{ textAlign: 'center', fontSize: 12, color: '#d4a85a', padding: '4px 0' }}>
            Натисни на інший слот щоб переставити · або на юніта щоб поміняти місцями
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(240,232,216,0.1)', background: '#17150f', display: 'flex', gap: 10 }}>
        <button
          onClick={onBack}
          style={{
            padding: '12px 18px', borderRadius: 10,
            border: '1px solid rgba(240,232,216,0.1)',
            background: 'transparent', color: 'rgba(240,232,216,0.45)', fontSize: 14, cursor: 'pointer',
          }}
        >
          ← Назад
        </button>
        <button
          onClick={() => onStart(playerUnits)}
          style={{
            flex: 1, padding: '12px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #b07850, #8c5a38)',
            color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(176,120,80,0.35)',
          }}
        >
          ⚔ До бою!
        </button>
      </div>
    </div>
  )
}
