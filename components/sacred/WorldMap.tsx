'use client'

import { useState, useEffect } from 'react'
import {
  TERRITORIES, getAttackableTerritories, getMovableTerritories,
  isSlotUnlocked, MAP_WIDTH, MAP_HEIGHT, HIRE_COSTS,
  FORTRESS_NAMES, FORTRESS_UPGRADE_COST, SLOT_COSTS, getReviveCost,
} from '@/lib/sacred/territories'
import type { TerritoryMapState } from '@/lib/sacred/territories'
import type { GameUnit, UnitClass } from '@/lib/sacred/types'

const HIRE_INFO: { cls: UnitClass; label: string; cost: number; desc: string }[] = [
  { cls: 'warrior',  label: 'Воїн',       cost: HIRE_COSTS.warrior,  desc: 'Передній ряд, щит, провокація' },
  { cls: 'archer',   label: 'Лучник',     cost: HIRE_COSTS.archer,   desc: 'Дальній ряд, постріл, прицілення' },
  { cls: 'mage',     label: 'Маг',        cost: HIRE_COSTS.mage,     desc: 'Дальній ряд, обирає шлях після lv1' },
  { cls: 'catapult', label: 'Катапульта', cost: HIRE_COSTS.catapult, desc: 'Важка артилерія, площинний урон' },
]

const ROW_LABEL: Record<number, string> = { 0: 'Передній ряд', 1: 'Дальній ряд' }
const CLASS_UA:  Record<UnitClass, string> = { warrior: 'Воїн', archer: 'Лучник', mage: 'Маг', catapult: 'Катапульта' }

function getPortrait(unit: GameUnit): string {
  const lvl = unit.level ?? 1
  if (unit.class === 'warrior') {
    if (unit.warriorPath === 'champion' && lvl >= 3) return `/sacred/warriors/champion/level${lvl}.jpg`
    return `/sacred/warriors/level${Math.min(lvl, 4)}.jpg`
  }
  if (unit.class === 'archer')  return `/sacred/archers/level${Math.min(lvl, 3)}.jpg`
  if (unit.class === 'mage')
    return lvl > 1 && unit.magePath ? `/sacred/mages/${unit.magePath}/level${lvl}.jpg` : '/sacred/mages/level1.jpg'
  if (unit.class === 'catapult')
    return lvl > 1 && unit.catapultPath ? `/sacred/catapults/${unit.catapultPath}/level${lvl}.jpg` : '/sacred/catapults/level1.jpg'
  return ''
}

function polyCentroid(poly: [number, number][]): [number, number] {
  return [
    poly.reduce((s, [x]) => s + x, 0) / poly.length,
    poly.reduce((s, [, y]) => s + y, 0) / poly.length,
  ]
}

// ── AP dots ───────────────────────────────────────────────────────────────────
function ApDots({ ap }: { ap: number }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {[0, 1].map(i => (
        <div key={i} style={{
          width: 10, height: 10, borderRadius: '50%',
          background: i < ap ? '#d4a85a' : 'rgba(212,168,90,0.2)',
          border: '1px solid rgba(212,168,90,0.4)',
        }} />
      ))}
    </div>
  )
}

interface Props {
  mapState:             TerritoryMapState
  playerUnits:          GameUnit[]
  deadUnits:            GameUnit[]
  onMove:               (territoryId: string) => void
  onAttack:             (territoryId: string) => void
  onEndTurn:            () => void
  onRest:               () => void
  onBack:               () => void
  onHireUnit:           (cls: UnitClass, row: number, slot: number) => void
  onReorderUnits:       (id1: string, id2: string) => void
  onMoveUnitSlot:       (id: string, row: number, slot: number) => void
  onUpgradeFortress:    () => void
  onPurchaseSlot:       () => void
  onReviveUnit:         (id: string) => void
  battleResult?:        { gold: number; levelUps: string[] } | null
  onClearBattleResult?: () => void
}

type FortressTab = 'army' | 'hire' | 'upgrade' | 'revive'

export default function WorldMap({
  mapState, playerUnits, deadUnits,
  onMove, onAttack, onEndTurn, onRest, onBack,
  onHireUnit, onReorderUnits, onMoveUnitSlot,
  onUpgradeFortress, onPurchaseSlot, onReviveUnit,
  battleResult, onClearBattleResult,
}: Props) {
  const [selectedId,    setSelectedId]    = useState<string | null>(null)
  const [fortressOpen,  setFortressOpen]  = useState(false)
  const [fortressTab,   setFortressTab]   = useState<FortressTab>('army')
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [hirePopup,     setHirePopup]     = useState<{ row: number; slot: number } | null>(null)

  const { ownership, gold, turn, ap, armyNodeId, maxArmySlots, fortressLevel, restedThisTurn } = mapState
  const attackable  = getAttackableTerritories(ownership, armyNodeId)
  const movable     = getMovableTerritories(ownership, armyNodeId)
  const atDans      = armyNodeId === 'dans'
  const playerCount = Object.values(ownership).filter(o => o === 'player').length
  const selectedTerritory = selectedId ? TERRITORIES.find(t => t.id === selectedId) : null
  const isAttackable = !!selectedId && attackable.has(selectedId)
  const isMovable    = !!selectedId && movable.has(selectedId)

  useEffect(() => {
    if (!battleResult) return
    const t = setTimeout(() => onClearBattleResult?.(), 3500)
    return () => clearTimeout(t)
  }, [battleResult])

  function closeFortress() {
    setFortressOpen(false)
    setHirePopup(null)
    setSelectedUnitId(null)
  }

  function handleSlotClick(row: number, slot: number) {
    if (!isSlotUnlocked(row, slot, maxArmySlots)) return
    const occupant = playerUnits.find(u => u.row === row && u.slot === slot)
    if (selectedUnitId) {
      const selUnit = playerUnits.find(u => u.id === selectedUnitId)
      if (!selUnit || selUnit.row !== row) { setSelectedUnitId(null); return }
      if (occupant && occupant.id !== selectedUnitId) onReorderUnits(selectedUnitId, occupant.id)
      else if (!occupant) onMoveUnitSlot(selectedUnitId, row, slot)
      setSelectedUnitId(null)
      return
    }
    if (occupant) { setSelectedUnitId(occupant.id); return }
    setHirePopup({ row, slot })
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 560, margin: '0 auto', minHeight: '100vh', background: '#0f0e09', color: '#f0e8d8', fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '10px 16px', background: '#17150f', borderBottom: '1px solid rgba(240,232,216,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'rgba(240,232,216,0.5)', cursor: 'pointer', fontSize: 20, padding: '0 8px 0 0' }}>←</button>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#d4a85a', fontWeight: 700 }}>💰 {gold}</span>
          <ApDots ap={ap} />
          <span style={{ fontSize: 11, color: 'rgba(240,232,216,0.4)' }}>День {turn}</span>
          <span style={{ fontSize: 11, color: 'rgba(240,232,216,0.35)' }}>{playerCount}/{TERRITORIES.length}</span>
        </div>
      </div>

      {/* Map */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 260 }}>
        <img
          src="/sacred/world-map.jpg" alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
        />
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          preserveAspectRatio="xMidYMid slice"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          {TERRITORIES.map(t => {
            const isPlayer   = ownership[t.id] === 'player'
            const isSelected = selectedId === t.id
            const isAtk      = attackable.has(t.id)
            const isMov      = movable.has(t.id)
            const isArmy     = armyNodeId === t.id
            const [cx, cy]   = polyCentroid(t.polygon)
            const pts        = t.polygon.map(([x, y]) => `${x},${y}`).join(' ')

            const fillColor   = isPlayer ? '#6fa67a' : '#c07070'
            const fillOpacity = isSelected ? 0.6 : isAtk ? 0.45 : isMov ? 0.4 : 0.15
            const strokeColor = isSelected ? '#ffffff' : isAtk ? '#ffd700' : isMov ? '#88ccff' : (isPlayer ? '#8fd49a' : '#e08080')
            const strokeW     = isSelected ? 4 : (isAtk || isMov) ? 3 : 2
            const strokeOpacity = isSelected ? 1 : (isAtk || isMov) ? 1 : 0.75

            // Banner width estimate (~26px per Ukrainian char + padding)
            const bannerW  = t.name.length * 28 + 28
            const bannerH  = 52
            const bannerX  = cx - bannerW / 2
            const bannerY  = cy - 56

            return (
              <g key={t.id} onClick={() => setSelectedId(prev => prev === t.id ? null : t.id)} style={{ cursor: 'pointer' }}>
                <polygon
                  points={pts}
                  fill={fillColor}
                  fillOpacity={fillOpacity}
                  stroke={strokeColor}
                  strokeWidth={strokeW}
                  strokeOpacity={strokeOpacity}
                  vectorEffect="non-scaling-stroke"
                />
                {/* Label banner */}
                <rect
                  x={bannerX} y={bannerY}
                  width={bannerW} height={bannerH}
                  rx={8}
                  fill="rgba(0,0,0,0.55)"
                />
                <text
                  x={cx} y={cy - 24}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={40} fontWeight="700"
                  fill="#fff"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {t.name}
                </text>
                {/* Army marker */}
                {isArmy && (
                  <text x={cx} y={cy + 55} textAnchor="middle" dominantBaseline="middle" fontSize={58} style={{ pointerEvents: 'none' }}>⚔</text>
                )}
                {t.isBoss && !isArmy && (
                  <text x={cx} y={cy + 55} textAnchor="middle" dominantBaseline="middle" fontSize={58} style={{ pointerEvents: 'none' }}>💀</text>
                )}
                {t.isStart && !isArmy && (
                  <text x={cx} y={cy + 55} textAnchor="middle" dominantBaseline="middle" fontSize={58} style={{ pointerEvents: 'none' }}>🏰</text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Bottom panel */}
      <div style={{ background: '#17150f', borderTop: '1px solid rgba(240,232,216,0.1)', flexShrink: 0 }}>
        {selectedTerritory ? (
          <div style={{ padding: '14px 16px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: selectedTerritory.isBoss ? '#c07070' : ownership[selectedTerritory.id] === 'player' ? '#6fa67a' : '#f0e8d8' }}>
                  {selectedTerritory.isBoss ? '💀 ' : ''}{selectedTerritory.name}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.4)', marginTop: 2 }}>
                  {ownership[selectedTerritory.id] === 'player' ? '🟢 Твій регіон' : '🔴 Ворожий регіон'}
                  {selectedTerritory.goldReward > 0 ? ` · 💰 +${selectedTerritory.goldReward} за перемогу` : ''}
                </div>
                {ownership[selectedTerritory.id] === 'enemy' && selectedTerritory.army.length > 0 && (
                  <div style={{ fontSize: 10, color: 'rgba(240,232,216,0.3)', marginTop: 4, lineHeight: 1.5 }}>
                    {selectedTerritory.army.map(u => `${CLASS_UA[u.class]} lv${u.level}`).join(' · ')}
                  </div>
                )}
              </div>
              <button onClick={() => setSelectedId(null)} style={{ background: 'none', border: 'none', color: 'rgba(240,232,216,0.4)', cursor: 'pointer', fontSize: 18, padding: '0 0 0 12px', flexShrink: 0 }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {isAttackable && (
                <button
                  onClick={() => { onAttack(selectedId!); setSelectedId(null) }}
                  disabled={ap <= 0}
                  style={{
                    flex: 1, padding: '11px 0', borderRadius: 10, fontSize: 13, fontWeight: 700,
                    background: ap <= 0 ? 'rgba(192,112,112,0.12)' : 'linear-gradient(135deg, #c07070, #8a3030)',
                    color: ap <= 0 ? 'rgba(240,232,216,0.25)' : '#fff',
                    border: `1px solid ${ap <= 0 ? 'rgba(192,112,112,0.2)' : '#c07070'}`,
                    cursor: ap <= 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {ap <= 0 ? 'Немає AP' : `⚔ Атакувати`}
                </button>
              )}
              {isMovable && (
                <button
                  onClick={() => { onMove(selectedId!); setSelectedId(null) }}
                  disabled={ap <= 0}
                  style={{
                    flex: 1, padding: '11px 0', borderRadius: 10, fontSize: 13, fontWeight: 700,
                    background: ap <= 0 ? 'rgba(136,204,255,0.08)' : 'rgba(136,204,255,0.12)',
                    color: ap <= 0 ? 'rgba(240,232,216,0.25)' : '#88ccff',
                    border: `1px solid ${ap <= 0 ? 'rgba(136,204,255,0.1)' : 'rgba(136,204,255,0.35)'}`,
                    cursor: ap <= 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {ap <= 0 ? 'Немає AP' : `→ Перемістити армію`}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setFortressOpen(true); setFortressTab('army') }}
                style={{ flex: 1, padding: '11px 0', borderRadius: 10, fontSize: 12, fontWeight: 600, background: 'rgba(240,232,216,0.06)', border: '1px solid rgba(240,232,216,0.12)', color: '#f0e8d8', cursor: 'pointer' }}
              >
                🏰 {FORTRESS_NAMES[fortressLevel]} ({playerUnits.length})
              </button>
              <button
                onClick={() => {
                  if (!restedThisTurn && (atDans || gold >= 1)) onRest()
                }}
                disabled={restedThisTurn || (!atDans && gold < 1)}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: 10, fontSize: 12, fontWeight: 600,
                  background: restedThisTurn || (!atDans && gold < 1) ? 'rgba(240,232,216,0.03)' : 'rgba(111,166,122,0.12)',
                  border: `1px solid ${restedThisTurn || (!atDans && gold < 1) ? 'rgba(240,232,216,0.07)' : 'rgba(111,166,122,0.3)'}`,
                  color: restedThisTurn || (!atDans && gold < 1) ? 'rgba(240,232,216,0.22)' : '#6fa67a',
                  cursor: restedThisTurn || (!atDans && gold < 1) ? 'not-allowed' : 'pointer',
                }}
              >
                {restedThisTurn ? '😴 Вже відпочили' : atDans ? '😴 Відпочити' : `😴 Відпочити (-1💰)`}
              </button>
            </div>
            <button
              onClick={onEndTurn}
              style={{ width: '100%', padding: '12px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, background: 'linear-gradient(135deg, #7a5a30, #4a3018)', border: '1px solid rgba(212,168,90,0.3)', color: '#f0e8d8', cursor: 'pointer' }}
            >
              Кінець дня → (+{Object.values(ownership).filter(o => o === 'player').length}💰)
            </button>
            {ap > 0 && attackable.size > 0 && (
              <div style={{ fontSize: 11, color: '#ffd700', textAlign: 'center' }}>
                ⚔ Можна атакувати: {Array.from(attackable).map(id => TERRITORIES.find(t => t.id === id)?.name).filter(Boolean).join(', ')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fortress sheet */}
      {fortressOpen && (
        <>
          <div onClick={closeFortress} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40 }} />
          <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 560, background: '#17150f', borderRadius: '16px 16px 0 0', border: '1px solid rgba(240,232,216,0.12)', borderBottom: 'none', zIndex: 41, maxHeight: '82vh', overflowY: 'auto' }}>
            <div style={{ padding: '14px 16px 0' }}>
              <div style={{ width: 36, height: 3, background: 'rgba(240,232,216,0.15)', borderRadius: 2, margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>🏰 {FORTRESS_NAMES[fortressLevel]}</div>
                  <div style={{ fontSize: 10, color: 'rgba(240,232,216,0.35)', marginTop: 2 }}>
                    Рівень {fortressLevel} · юніти до lv{fortressLevel}
                  </div>
                </div>
                <button onClick={closeFortress} style={{ background: 'none', border: 'none', color: 'rgba(240,232,216,0.4)', cursor: 'pointer', fontSize: 18 }}>✕</button>
              </div>
              {/* Tabs */}
              <div style={{ display: 'flex', gap: 2, marginBottom: 14 }}>
                {(['army', 'hire', 'upgrade', 'revive'] as FortressTab[]).map(tab => {
                  const labels: Record<FortressTab, string> = { army: 'Армія', hire: 'Найняти', upgrade: 'Апгрейд', revive: `Воскресити (${deadUnits.length})` }
                  return (
                    <button key={tab} onClick={() => setFortressTab(tab)} style={{
                      flex: 1, padding: '7px 0', borderRadius: 6, fontSize: 10, fontWeight: 600,
                      background: fortressTab === tab ? 'rgba(212,168,90,0.18)' : 'rgba(240,232,216,0.05)',
                      border: `1px solid ${fortressTab === tab ? 'rgba(212,168,90,0.4)' : 'rgba(240,232,216,0.08)'}`,
                      color: fortressTab === tab ? '#d4a85a' : 'rgba(240,232,216,0.45)',
                      cursor: 'pointer',
                    }}>
                      {labels[tab]}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ padding: '0 16px 40px' }}>
              {/* Army tab */}
              {fortressTab === 'army' && ([0, 1] as const).map(row => (
                <div key={row} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(240,232,216,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                    {ROW_LABEL[row]}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {Array.from({ length: 4 }, (_, slot) => {
                      const unlocked = isSlotUnlocked(row, slot, maxArmySlots)
                      const unit     = playerUnits.find(u => u.row === row && u.slot === slot)
                      const isSel    = unit?.id === selectedUnitId
                      if (!unlocked) return (
                        <div key={slot} style={{ flex: 1, height: 74, borderRadius: 8, background: 'rgba(240,232,216,0.02)', border: '1px dashed rgba(240,232,216,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 14, color: 'rgba(240,232,216,0.15)' }}>🔒</span>
                        </div>
                      )
                      if (!unit) return (
                        <div key={slot} onClick={() => { setFortressTab('hire'); setHirePopup({ row, slot }) }} style={{ flex: 1, height: 74, borderRadius: 8, background: 'rgba(240,232,216,0.04)', border: '1px dashed rgba(240,232,216,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                          <span style={{ fontSize: 20, color: 'rgba(240,232,216,0.22)' }}>+</span>
                        </div>
                      )
                      return (
                        <div key={slot} onClick={() => handleSlotClick(row, slot)} style={{ flex: 1, height: 74, borderRadius: 8, overflow: 'hidden', border: `2px solid ${isSel ? '#d4a85a' : 'rgba(240,232,216,0.12)'}`, cursor: 'pointer', position: 'relative' }}>
                          <img src={getPortrait(unit)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)', padding: '4px 4px 3px', fontSize: 8, color: '#fff', fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>
                            {unit.name}<br />lv{unit.level ?? 1}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
              {fortressTab === 'army' && selectedUnitId && (
                <div style={{ fontSize: 11, color: '#b07850', textAlign: 'center', marginTop: 4 }}>
                  Натисни інший слот у тому ж ряду для переставлення
                </div>
              )}

              {/* Hire tab */}
              {fortressTab === 'hire' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {hirePopup && (
                    <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.35)', marginBottom: 4 }}>
                      Ряд: {ROW_LABEL[hirePopup.row]} · Слот {hirePopup.slot + 1}
                    </div>
                  )}
                  {HIRE_INFO
                    .filter(h => !hirePopup || (hirePopup.row === 0 ? h.cls === 'warrior' || h.cls === 'catapult' : h.cls !== 'warrior'))
                    .map(h => {
                      if (hirePopup) {
                        const hasCat     = playerUnits.some(u => u.class === 'catapult')
                        const catBlocked = h.cls === 'catapult' && (hasCat || playerUnits.some(u => u.row === 0 && u.slot === 3))
                        if (catBlocked) return null
                      }
                      const canAfford = gold >= h.cost
                      return (
                        <button
                          key={h.cls}
                          disabled={!canAfford}
                          onClick={() => {
                            if (!canAfford || !hirePopup) return
                            onHireUnit(h.cls, hirePopup.row, hirePopup.slot)
                            setHirePopup(null)
                            setFortressTab('army')
                          }}
                          style={{ padding: '11px 14px', borderRadius: 9, background: canAfford ? 'rgba(240,232,216,0.06)' : 'rgba(240,232,216,0.02)', border: `1px solid ${canAfford ? 'rgba(240,232,216,0.14)' : 'rgba(240,232,216,0.05)'}`, color: canAfford ? '#f0e8d8' : 'rgba(240,232,216,0.25)', cursor: canAfford ? 'pointer' : 'not-allowed', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        >
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{h.label}</div>
                            <div style={{ fontSize: 10, color: 'rgba(240,232,216,0.4)', marginTop: 1 }}>{h.desc}</div>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: canAfford ? '#d4a85a' : 'rgba(240,232,216,0.2)' }}>💰 {h.cost}</div>
                        </button>
                      )
                    })}
                  {!hirePopup && (
                    <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.3)', textAlign: 'center', marginTop: 8 }}>
                      Перейди на вкладку Армія і натисни порожній слот
                    </div>
                  )}
                </div>
              )}

              {/* Upgrade tab */}
              {fortressTab === 'upgrade' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(240,232,216,0.5)', padding: '4px 0' }}>
                    <span>Рівень {fortressLevel} — {FORTRESS_NAMES[fortressLevel]}</span>
                    <span>Юніти до lv{fortressLevel}</span>
                  </div>
                  {fortressLevel < 5 ? (
                    <>
                      <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.35)' }}>
                        Апгрейд до {FORTRESS_NAMES[fortressLevel + 1]} (lv{fortressLevel + 1} юніти)
                      </div>
                      <button
                        disabled={gold < FORTRESS_UPGRADE_COST[fortressLevel + 1]}
                        onClick={() => { onUpgradeFortress(); }}
                        style={{
                          padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                          background: gold >= FORTRESS_UPGRADE_COST[fortressLevel + 1] ? 'rgba(212,168,90,0.15)' : 'rgba(240,232,216,0.04)',
                          border: `1px solid ${gold >= FORTRESS_UPGRADE_COST[fortressLevel + 1] ? 'rgba(212,168,90,0.4)' : 'rgba(240,232,216,0.08)'}`,
                          color: gold >= FORTRESS_UPGRADE_COST[fortressLevel + 1] ? '#d4a85a' : 'rgba(240,232,216,0.2)',
                          cursor: gold >= FORTRESS_UPGRADE_COST[fortressLevel + 1] ? 'pointer' : 'not-allowed',
                        }}
                      >
                        🏰 Апгрейд · 💰 {FORTRESS_UPGRADE_COST[fortressLevel + 1]}
                      </button>
                    </>
                  ) : (
                    <div style={{ fontSize: 13, color: '#d4a85a', textAlign: 'center', padding: '12px 0' }}>⭐ Максимальний рівень</div>
                  )}
                  <div style={{ borderTop: '1px solid rgba(240,232,216,0.08)', paddingTop: 10, marginTop: 4 }}>
                    <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.35)', marginBottom: 8 }}>
                      Слоти армії ({maxArmySlots}/8)
                    </div>
                    {maxArmySlots < 8 ? (
                      <button
                        disabled={!SLOT_COSTS[maxArmySlots] || gold < SLOT_COSTS[maxArmySlots]}
                        onClick={onPurchaseSlot}
                        style={{
                          width: '100%', padding: '11px', borderRadius: 9, fontSize: 12, fontWeight: 600,
                          background: gold >= (SLOT_COSTS[maxArmySlots] ?? 999) ? 'rgba(111,166,122,0.1)' : 'rgba(240,232,216,0.04)',
                          border: `1px solid ${gold >= (SLOT_COSTS[maxArmySlots] ?? 999) ? 'rgba(111,166,122,0.3)' : 'rgba(240,232,216,0.08)'}`,
                          color: gold >= (SLOT_COSTS[maxArmySlots] ?? 999) ? '#6fa67a' : 'rgba(240,232,216,0.2)',
                          cursor: gold >= (SLOT_COSTS[maxArmySlots] ?? 999) ? 'pointer' : 'not-allowed',
                        }}
                      >
                        + Розблокувати слот · 💰 {SLOT_COSTS[maxArmySlots] ?? '—'}
                      </button>
                    ) : (
                      <div style={{ fontSize: 12, color: '#6fa67a', textAlign: 'center' }}>✓ Всі слоти відкриті</div>
                    )}
                  </div>
                </div>
              )}

              {/* Revive tab */}
              {fortressTab === 'revive' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {deadUnits.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'rgba(240,232,216,0.3)', textAlign: 'center', padding: '16px 0' }}>
                      Немає загиблих юнітів
                    </div>
                  ) : deadUnits.map(u => {
                    const cost     = getReviveCost(u)
                    const canAfford = gold >= cost
                    const mustBeAtDans = armyNodeId !== 'dans'
                    return (
                      <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, background: 'rgba(240,232,216,0.04)', border: '1px solid rgba(240,232,216,0.08)' }}>
                        <img src={getPortrait(u)} alt="" style={{ width: 44, height: 52, borderRadius: 6, objectFit: 'cover', objectPosition: 'center top', opacity: 0.6 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(240,232,216,0.7)' }}>{u.name}</div>
                          <div style={{ fontSize: 10, color: 'rgba(240,232,216,0.3)', marginTop: 1 }}>{CLASS_UA[u.class]} lv{u.level ?? 1}</div>
                          {mustBeAtDans && <div style={{ fontSize: 9, color: '#c07070', marginTop: 2 }}>Треба бути в Данс</div>}
                        </div>
                        <button
                          disabled={!canAfford || mustBeAtDans}
                          onClick={() => onReviveUnit(u.id)}
                          style={{ padding: '7px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600, background: canAfford && !mustBeAtDans ? 'rgba(212,168,90,0.15)' : 'rgba(240,232,216,0.04)', border: `1px solid ${canAfford && !mustBeAtDans ? 'rgba(212,168,90,0.4)' : 'rgba(240,232,216,0.08)'}`, color: canAfford && !mustBeAtDans ? '#d4a85a' : 'rgba(240,232,216,0.2)', cursor: canAfford && !mustBeAtDans ? 'pointer' : 'not-allowed' }}
                        >
                          💰 {cost}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Battle result toast */}
      {battleResult && (
        <div style={{ position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)', background: '#1a3a1a', border: '1px solid rgba(111,166,122,0.5)', borderRadius: 10, padding: '12px 22px', zIndex: 60, textAlign: 'center', minWidth: 180, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
          {battleResult.gold > 0 && <div style={{ fontSize: 14, color: '#7aaa82', fontWeight: 700 }}>+💰 {battleResult.gold} золота</div>}
          {battleResult.levelUps.map(name => (
            <div key={name} style={{ fontSize: 12, color: '#d4a85a', marginTop: 3 }}>⭐ {name} підвищив рівень!</div>
          ))}
        </div>
      )}
    </div>
  )
}
