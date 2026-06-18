'use client'

import { useState, useEffect, useRef } from 'react'
import {
  DISTRICTS_2, REGIONS_2,
  getAttackableDistricts, getMovableDistricts,
  getDailyIncome,
  isSlotUnlocked, MAP2_WIDTH, MAP2_HEIGHT, HIRE_COSTS,
  FORTRESS_NAMES, FORTRESS_UPGRADE_COST, SLOT_COSTS, getReviveCost,
} from '@/lib/sacred/territories2'
import type { TerritoryMap2State } from '@/lib/sacred/territories2'
import type { GameUnit, UnitClass } from '@/lib/sacred/types'

const HIRE_INFO: { cls: UnitClass; label: string; cost: number; desc: string }[] = [
  { cls: 'warrior',  label: 'Воїн',       cost: HIRE_COSTS.warrior,  desc: 'Передній ряд, щит, провокація' },
  { cls: 'archer',   label: 'Лучник',     cost: HIRE_COSTS.archer,   desc: 'Дальній ряд, постріл, прицілення' },
  { cls: 'mage',     label: 'Маг',        cost: HIRE_COSTS.mage,     desc: 'Дальній ряд, обирає шлях після lv1' },
  { cls: 'catapult', label: 'Катапульта', cost: HIRE_COSTS.catapult, desc: 'Важка артилерія, площинний урон' },
]

const ROW_LABEL: Record<number, string> = { 0: 'Передній ряд', 1: 'Дальній ряд' }
const CLASS_UA: Record<UnitClass, string> = { warrior: 'Воїн', archer: 'Лучник', mage: 'Маг', catapult: 'Катапульта' }

const REGION_COLORS: Record<string, string> = {
  terr_218: '#4a7a4a',
  terr_225: '#7a5a2a',
  terr_237: '#2a5a6a',
  terr_206: '#5a2a6a',
  terr_230: '#6a2a2a',
  terr_223: '#2a4a7a',
  terr_242: '#1a1a1a',
}

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
  mapState:          TerritoryMap2State
  playerUnits:       GameUnit[]
  deadUnits:         GameUnit[]
  onMove:            (districtId: string) => void
  onAttack:          (districtId: string) => void
  onFinalBattle:     (regionId: string) => void
  onEndTurn:         () => void
  onRest:            () => void
  onBack:            () => void
  onHireUnit:        (cls: UnitClass, row: number, slot: number) => void
  onReorderUnits:    (id1: string, id2: string) => void
  onMoveUnitSlot:    (id: string, row: number, slot: number) => void
  onUpgradeFortress: () => void
  onPurchaseSlot:    () => void
  onReviveUnit:      (id: string) => void
  battleResult?:     { gold: number; levelUps: string[] } | null
  onClearBattleResult?: () => void
}

type FortressTab = 'army' | 'upgrade' | 'revive'

const MIN_SCALE = 0.08
const MAX_SCALE = 4

export default function WorldMap2({
  mapState, playerUnits, deadUnits,
  onMove, onAttack, onFinalBattle, onEndTurn, onRest, onBack,
  onHireUnit, onReorderUnits, onMoveUnitSlot,
  onUpgradeFortress, onPurchaseSlot, onReviveUnit,
  battleResult, onClearBattleResult,
}: Props) {
  const [popupDistrictId, setPopupDistrictId] = useState<string | null>(null)
  const [fortressOpen,    setFortressOpen]    = useState(false)
  const [fortressTab,     setFortressTab]     = useState<FortressTab>('army')
  const [selectedUnitId,  setSelectedUnitId]  = useState<string | null>(null)
  const [hirePopup,       setHirePopup]       = useState<{ row: number; slot: number } | null>(null)

  useEffect(() => {
    if (fortressTab === 'revive' && deadUnits.length === 0) setFortressTab('army')
  }, [deadUnits.length])

  const {
    ownership, gold, turn, ap, armyNodeId,
    maxArmySlots, fortressLevel, restedThisTurn,
    activeRegionId, conqueredRegions, pendingFinalBattle,
  } = mapState

  const attackable     = getAttackableDistricts(ownership, armyNodeId, activeRegionId)
  const movable        = getMovableDistricts(ownership, armyNodeId)
  const atStart        = armyNodeId === 'terr_221'
  const dailyIncome    = getDailyIncome(ownership)
  const ownedCount     = Object.values(ownership).filter(o => o === 'player').length
  const totalDistricts = DISTRICTS_2.length
  const activeRegion   = REGIONS_2.find(r => r.id === activeRegionId)
  const activeDistricts = activeRegion?.districts ?? []
  const capturedInRegion = activeDistricts.filter(id => ownership[id] === 'player').length

  const popupDistrict = popupDistrictId ? DISTRICTS_2.find(d => d.id === popupDistrictId) : null

  useEffect(() => {
    if (!battleResult) return
    const t = setTimeout(() => onClearBattleResult?.(), 3500)
    return () => clearTimeout(t)
  }, [battleResult])

  // ── Pan / zoom ───────────────────────────────────────────────────────────────
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const transformRef    = useRef({ x: 0, y: 0, scale: 1 })
  const [mapTransform,  setMapTransform] = useState({ x: 0, y: 0, scale: 1 })
  const touchRef = useRef<{ t1: { clientX: number; clientY: number } | null; t2: { clientX: number; clientY: number } | null; dist: number }>({ t1: null, t2: null, dist: 0 })
  const dragRef  = useRef({ down: false, x: 0, y: 0, moved: false })

  function applyT(t: { x: number; y: number; scale: number }) {
    transformRef.current = t
    setMapTransform(t)
  }

  useEffect(() => {
    const el = mapContainerRef.current
    if (!el) return
    const fit = () => {
      const W = el.clientWidth, H = el.clientHeight
      if (!W || !H) return
      const s = Math.min(W / MAP2_WIDTH, H / MAP2_HEIGHT)
      applyT({ x: (W - MAP2_WIDTH * s) / 2, y: (H - MAP2_HEIGHT * s) / 2, scale: s })
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  useEffect(() => {
    const el = mapContainerRef.current
    if (!el) return
    function onTM(e: TouchEvent) {
      e.preventDefault()
      const ts = Array.from(e.touches)
      const prev = touchRef.current
      const cur = { ...transformRef.current }
      if (ts.length === 1 && prev.t1) {
        const dx = ts[0].clientX - prev.t1.clientX
        const dy = ts[0].clientY - prev.t1.clientY
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true
        cur.x += dx; cur.y += dy
      } else if (ts.length >= 2 && prev.t2) {
        const newDist = Math.hypot(ts[1].clientX - ts[0].clientX, ts[1].clientY - ts[0].clientY)
        const factor  = newDist / (prev.dist || newDist)
        const rect    = el!.getBoundingClientRect()
        const mx = (ts[0].clientX + ts[1].clientX) / 2 - rect.left
        const my = (ts[0].clientY + ts[1].clientY) / 2 - rect.top
        const ns = Math.max(MIN_SCALE, Math.min(MAX_SCALE, cur.scale * factor))
        const sf = ns / cur.scale
        cur.x = mx - (mx - cur.x) * sf; cur.y = my - (my - cur.y) * sf; cur.scale = ns
        touchRef.current.dist = newDist; dragRef.current.moved = true
      }
      touchRef.current.t1 = ts[0] ?? null; touchRef.current.t2 = ts[1] ?? null
      applyT(cur)
    }
    function onWH(e: WheelEvent) {
      e.preventDefault()
      const rect = el!.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const factor = e.deltaY < 0 ? 1.12 : 0.9
      const cur = { ...transformRef.current }
      const ns = Math.max(MIN_SCALE, Math.min(MAX_SCALE, cur.scale * factor))
      const sf = ns / cur.scale
      applyT({ x: mx - (mx - cur.x) * sf, y: my - (my - cur.y) * sf, scale: ns })
    }
    el.addEventListener('touchmove', onTM, { passive: false })
    el.addEventListener('wheel', onWH, { passive: false })
    return () => { el.removeEventListener('touchmove', onTM); el.removeEventListener('wheel', onWH) }
  }, [])

  function onMapTS(e: React.TouchEvent) {
    const ts = Array.from(e.touches)
    touchRef.current = { t1: ts[0] ?? null, t2: ts[1] ?? null, dist: ts.length >= 2 ? Math.hypot(ts[1].clientX - ts[0].clientX, ts[1].clientY - ts[0].clientY) : 0 }
    dragRef.current.moved = false
  }
  function onMapTE(e: React.TouchEvent) {
    const ts = Array.from(e.touches)
    touchRef.current.t1 = ts[0] ?? null; touchRef.current.t2 = ts[1] ?? null
  }
  function onMapMD(e: React.MouseEvent) { dragRef.current = { down: true, x: e.clientX, y: e.clientY, moved: false } }
  function onMapMM(e: React.MouseEvent) {
    if (!dragRef.current.down) return
    const dx = e.clientX - dragRef.current.x, dy = e.clientY - dragRef.current.y
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true
    const cur = { ...transformRef.current, x: transformRef.current.x + dx, y: transformRef.current.y + dy }
    dragRef.current.x = e.clientX; dragRef.current.y = e.clientY
    applyT(cur)
  }
  function onMapMU() { dragRef.current.down = false }

  function centerOnArmy() {
    const d = DISTRICTS_2.find(d => d.id === armyNodeId)
    if (!d || !mapContainerRef.current) return
    const [cx, cy] = polyCentroid(d.polygon)
    const W = mapContainerRef.current.clientWidth
    const H = mapContainerRef.current.clientHeight
    applyT({ x: W / 2 - cx * transformRef.current.scale, y: H / 2 - cy * transformRef.current.scale, scale: transformRef.current.scale })
  }

  function handleDistrictTap(districtId: string) {
    if (dragRef.current.moved) return
    if (movable.has(districtId)) {
      if (ap > 0) { onMove(districtId); setPopupDistrictId(null) }
      else setPopupDistrictId(districtId)
      return
    }
    if (attackable.has(districtId)) {
      setPopupDistrictId(prev => prev === districtId ? null : districtId)
      return
    }
    setPopupDistrictId(null)
  }

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

  // ── District fill color ──────────────────────────────────────────────────────
  function districtFill(d: typeof DISTRICTS_2[0]): string {
    if (ownership[d.id] === 'player') {
      if (d.id === armyNodeId) return '#d4a85a'
      return '#2d5a2d'
    }
    if (attackable.has(d.id)) return '#8b2020'
    const regionColor = REGION_COLORS[d.regionId] ?? '#3a3028'
    // Darken if not in active region
    if (d.regionId !== activeRegionId && !conqueredRegions.includes(d.regionId)) {
      return 'rgba(20,15,10,0.6)'
    }
    return regionColor
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#0f0e09' }}>
    <div style={{ maxWidth: 560, margin: '0 auto', height: '100%', color: '#f0e8d8', fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '8px 16px', background: '#17150f', borderBottom: '1px solid rgba(240,232,216,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 8 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'rgba(240,232,216,0.5)', cursor: 'pointer', fontSize: 20, padding: '0 8px 0 0' }}>←</button>
        <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.5)', fontWeight: 600 }}>{activeRegion?.name}</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#d4a85a', fontWeight: 700 }}>💰 {gold}<span style={{ fontSize: 10, color: 'rgba(212,168,90,0.6)', fontWeight: 400 }}> +{dailyIncome}</span></span>
          <ApDots ap={ap} />
          <span style={{ fontSize: 11, color: 'rgba(240,232,216,0.4)' }}>День {turn}</span>
          <span style={{ fontSize: 11, color: 'rgba(240,232,216,0.35)' }}>{capturedInRegion}/{activeDistricts.length}</span>
        </div>
      </div>

      {/* Map */}
      <div
        ref={mapContainerRef}
        style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', touchAction: 'none' }}
        onTouchStart={onMapTS} onTouchEnd={onMapTE}
        onMouseDown={onMapMD} onMouseMove={onMapMM}
        onMouseUp={onMapMU} onMouseLeave={onMapMU}
      >
        <div style={{
          position: 'absolute', top: 0, left: 0,
          width: MAP2_WIDTH, height: MAP2_HEIGHT,
          transform: `translate(${mapTransform.x}px,${mapTransform.y}px) scale(${mapTransform.scale})`,
          transformOrigin: '0 0', willChange: 'transform',
          background: '#2a1f14',
        }}>
          {/* SVG map */}
          <svg
            width={MAP2_WIDTH} height={MAP2_HEIGHT}
            style={{ position: 'absolute', top: 0, left: 0 }}
            onClick={e => { if (dragRef.current.moved) return; if ((e.target as SVGElement).tagName === 'svg') setPopupDistrictId(null) }}
          >
            <defs>
              <filter id="glow2">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {/* Territories */}
            {DISTRICTS_2.map(d => {
              const pts = d.polygon.map(([x, y]) => `${x},${y}`).join(' ')
              const isPlayer   = ownership[d.id] === 'player'
              const isArmy     = d.id === armyNodeId
              const isAttack   = attackable.has(d.id)
              const isMove     = movable.has(d.id)
              const isActive   = d.regionId === activeRegionId
              const isConq     = conqueredRegions.includes(d.regionId)
              const isSelected = popupDistrictId === d.id
              const opacity    = (!isActive && !isConq && !isPlayer) ? 0.35 : 1

              return (
                <g key={d.id} style={{ opacity }} onClick={() => handleDistrictTap(d.id)}>
                  <polygon
                    points={pts}
                    fill={districtFill(d)}
                    stroke={isSelected ? '#fff' : isArmy ? '#d4a85a' : isAttack ? '#cc4444' : isMove ? '#44aa44' : 'rgba(240,232,216,0.12)'}
                    strokeWidth={isSelected || isArmy ? 2.5 : isAttack || isMove ? 1.5 : 0.6}
                    style={{ cursor: (isAttack || isMove) ? 'pointer' : 'default', filter: isArmy ? 'url(#glow2)' : undefined }}
                  />
                  {/* Capital crown */}
                  {d.isCapital && isPlayer && (
                    <text x={polyCentroid(d.polygon)[0]} y={polyCentroid(d.polygon)[1] + 5} textAnchor="middle" fontSize="16" fill="#d4a85a" style={{ pointerEvents: 'none' }}>★</text>
                  )}
                  {/* District label */}
                  {(isActive || isConq) && (() => {
                    const [cx, cy] = polyCentroid(d.polygon)
                    return (
                      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="rgba(240,232,216,0.65)" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                        {d.name}
                      </text>
                    )
                  })()}
                </g>
              )
            })}

            {/* Army marker */}
            {(() => {
              const d = DISTRICTS_2.find(d => d.id === armyNodeId)
              if (!d) return null
              const [cx, cy] = polyCentroid(d.polygon)
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <circle cx={cx} cy={cy - 18} r={10} fill="#d4a85a" opacity={0.95} />
                  <text x={cx} y={cy - 14} textAnchor="middle" fontSize="12" fill="#0f0e09">⚔</text>
                </g>
              )
            })()}
          </svg>
        </div>

        {/* District popup */}
        {popupDistrict && attackable.has(popupDistrict.id) && (
          <div style={{
            position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
            background: '#1e1a12', border: '1px solid rgba(212,168,90,0.35)',
            borderRadius: 14, padding: '14px 18px', minWidth: 220, zIndex: 10,
          }}>
            <div style={{ fontWeight: 700, color: '#f0e8d8', marginBottom: 4 }}>{popupDistrict.name}</div>
            {popupDistrict.isCapital && <div style={{ fontSize: 11, color: '#d4a85a', marginBottom: 8 }}>★ Столиця</div>}
            <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.5)', marginBottom: 12 }}>
              Армія: {popupDistrict.army.length} юнітів
            </div>
            <button
              onClick={() => { onAttack(popupDistrict.id); setPopupDistrictId(null) }}
              disabled={ap <= 0}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 10,
                background: ap > 0 ? '#8b2020' : 'rgba(139,32,32,0.3)',
                color: ap > 0 ? '#f0e8d8' : 'rgba(240,232,216,0.35)',
                border: 'none', fontWeight: 700, fontSize: 13, cursor: ap > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              {ap > 0 ? '⚔ Атакувати' : 'Немає ходів'}
            </button>
          </div>
        )}

        {/* Battle result toast */}
        {battleResult && (
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            background: '#1e1a12', border: '1px solid rgba(212,168,90,0.4)',
            borderRadius: 12, padding: '10px 18px', zIndex: 20, textAlign: 'center',
          }}>
            {battleResult.gold > 0 && <div style={{ color: '#d4a85a', fontWeight: 700 }}>+{battleResult.gold} 💰</div>}
            {battleResult.levelUps.map(n => (
              <div key={n} style={{ color: '#f0e8d8', fontSize: 12 }}>{n} — ↑ рівень!</div>
            ))}
          </div>
        )}

        {/* Center button */}
        <button
          onClick={centerOnArmy}
          style={{
            position: 'absolute', bottom: 16, right: 16,
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(30,26,18,0.9)', border: '1px solid rgba(212,168,90,0.35)',
            color: '#d4a85a', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >⊙</button>
      </div>

      {/* Final battle prompt */}
      {pendingFinalBattle && pendingFinalBattle === activeRegionId && (
        <div style={{
          padding: '14px 16px', background: 'rgba(139,32,32,0.15)',
          borderTop: '2px solid rgba(139,32,32,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#f0e8d8' }}>⚔ Фінальний бій за {activeRegion?.name}!</div>
            <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.5)' }}>Всі райони захоплено</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => onFinalBattle(activeRegionId)}
              style={{ padding: '8px 14px', background: '#8b2020', border: 'none', borderRadius: 10, color: '#f0e8d8', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
            >Готовий</button>
            <button
              onClick={() => {}}
              style={{ padding: '8px 14px', background: 'rgba(240,232,216,0.08)', border: '1px solid rgba(240,232,216,0.15)', borderRadius: 10, color: 'rgba(240,232,216,0.6)', fontSize: 12, cursor: 'pointer' }}
            >Підготуватись</button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: '10px 16px', background: '#17150f', borderTop: '1px solid rgba(240,232,216,0.1)', display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={() => { setFortressOpen(true); setPopupDistrictId(null) }}
          style={{
            flex: 1, padding: '10px 0', borderRadius: 10,
            background: 'rgba(212,168,90,0.1)', border: '1px solid rgba(212,168,90,0.25)',
            color: '#d4a85a', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >🏰 {FORTRESS_NAMES[fortressLevel]}</button>
        <button
          onClick={onRest}
          disabled={restedThisTurn || (!atStart && gold < 1)}
          style={{
            flex: 1, padding: '10px 0', borderRadius: 10,
            background: restedThisTurn ? 'rgba(240,232,216,0.04)' : 'rgba(240,232,216,0.08)',
            border: '1px solid rgba(240,232,216,0.1)',
            color: restedThisTurn ? 'rgba(240,232,216,0.25)' : 'rgba(240,232,216,0.7)',
            fontSize: 12, cursor: restedThisTurn ? 'not-allowed' : 'pointer',
          }}
        >{atStart ? '💤 Відпочити' : '💤 Відпочити (1💰)'}</button>
        <button
          onClick={onEndTurn}
          style={{
            flex: 1, padding: '10px 0', borderRadius: 10,
            background: '#d4a85a', border: 'none',
            color: '#0f0e09', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
        >Хід →</button>
      </div>

      {/* Fortress panel */}
      {fortressOpen && (
        <div style={{
          position: 'absolute', inset: 0, background: '#12100c', zIndex: 50,
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(240,232,216,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 700, color: '#d4a85a' }}>🏰 {FORTRESS_NAMES[fortressLevel]}</div>
            <button onClick={closeFortress} style={{ background: 'none', border: 'none', color: 'rgba(240,232,216,0.5)', fontSize: 22, cursor: 'pointer' }}>×</button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(240,232,216,0.1)' }}>
            {(['army', 'upgrade', 'revive'] as FortressTab[]).map(tab => {
              const labels: Record<FortressTab, string> = { army: 'Армія', upgrade: 'Поліпшення', revive: 'Воскресити' }
              const disabled = tab === 'revive' && deadUnits.length === 0
              return (
                <button key={tab} onClick={() => !disabled && setFortressTab(tab)} style={{
                  flex: 1, padding: '10px 0', background: 'none',
                  border: 'none', borderBottom: fortressTab === tab ? '2px solid #d4a85a' : '2px solid transparent',
                  color: fortressTab === tab ? '#d4a85a' : disabled ? 'rgba(240,232,216,0.2)' : 'rgba(240,232,216,0.5)',
                  fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
                }}>{labels[tab]}</button>
              )
            })}
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px' }}>
            {/* Army tab */}
            {fortressTab === 'army' && (
              <div>
                <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.4)', marginBottom: 12 }}>💰 {gold} золота</div>
                {[0, 1].map(row => (
                  <div key={row} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: 'rgba(240,232,216,0.35)', marginBottom: 6 }}>{ROW_LABEL[row]}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                      {[0, 1, 2, 3].map(slot => {
                        const unlocked = isSlotUnlocked(row, slot, maxArmySlots)
                        const unit = playerUnits.find(u => u.row === row && u.slot === slot)
                        const isSel = unit?.id === selectedUnitId
                        return (
                          <div key={slot} onClick={() => unlocked && handleSlotClick(row, slot)} style={{
                            height: 72, borderRadius: 10, overflow: 'hidden',
                            border: isSel ? '2px solid #d4a85a' : '1px solid rgba(240,232,216,0.15)',
                            background: unlocked ? (unit ? 'transparent' : 'rgba(240,232,216,0.04)') : 'rgba(0,0,0,0.3)',
                            cursor: unlocked ? 'pointer' : 'not-allowed', position: 'relative',
                          }}>
                            {unit ? (
                              <img src={getPortrait(unit)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
                            ) : unlocked ? (
                              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: 'rgba(240,232,216,0.15)' }}>+</div>
                            ) : (
                              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'rgba(240,232,216,0.15)' }}>🔒</div>
                            )}
                            {unit && (
                              <div style={{ position: 'absolute', bottom: 2, right: 4, fontSize: 10, color: '#d4a85a', fontWeight: 700 }}>lv{unit.level}</div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {/* Hire popup */}
                {hirePopup && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.4)', marginBottom: 8 }}>Найняти юніта</div>
                    {HIRE_INFO.map(h => (
                      <button key={h.cls} onClick={() => { onHireUnit(h.cls, hirePopup.row, hirePopup.slot); setHirePopup(null) }}
                        disabled={gold < h.cost}
                        style={{
                          width: '100%', marginBottom: 6, padding: '10px 12px', borderRadius: 10,
                          background: gold >= h.cost ? 'rgba(212,168,90,0.08)' : 'rgba(240,232,216,0.03)',
                          border: '1px solid rgba(212,168,90,0.2)',
                          color: gold >= h.cost ? '#f0e8d8' : 'rgba(240,232,216,0.3)',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          cursor: gold >= h.cost ? 'pointer' : 'not-allowed', fontSize: 12,
                        }}>
                        <span>{h.label}</span><span style={{ color: '#d4a85a' }}>{h.cost} 💰</span>
                      </button>
                    ))}
                    <button onClick={() => setHirePopup(null)} style={{ width: '100%', padding: '8px 0', background: 'none', border: 'none', color: 'rgba(240,232,216,0.35)', cursor: 'pointer', fontSize: 12 }}>Скасувати</button>
                  </div>
                )}
              </div>
            )}

            {/* Upgrade tab */}
            {fortressTab === 'upgrade' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(212,168,90,0.06)', border: '1px solid rgba(212,168,90,0.15)' }}>
                  <div style={{ fontSize: 12, color: 'rgba(240,232,216,0.5)', marginBottom: 4 }}>Рівень фортеці</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#d4a85a' }}>{FORTRESS_NAMES[fortressLevel]}</div>
                </div>
                {fortressLevel < 5 && (
                  <button onClick={onUpgradeFortress} disabled={gold < FORTRESS_UPGRADE_COST[fortressLevel + 1]}
                    style={{
                      padding: '12px 0', borderRadius: 12,
                      background: gold >= FORTRESS_UPGRADE_COST[fortressLevel + 1] ? 'rgba(212,168,90,0.12)' : 'rgba(240,232,216,0.04)',
                      border: '1px solid rgba(212,168,90,0.25)', color: '#d4a85a',
                      fontSize: 13, fontWeight: 600, cursor: gold >= FORTRESS_UPGRADE_COST[fortressLevel + 1] ? 'pointer' : 'not-allowed',
                    }}>
                    Покращити → {FORTRESS_NAMES[(fortressLevel + 1) as 1|2|3|4|5]} ({FORTRESS_UPGRADE_COST[fortressLevel + 1]} 💰)
                  </button>
                )}
                {maxArmySlots < 8 && (
                  <button onClick={onPurchaseSlot} disabled={!SLOT_COSTS[maxArmySlots] || gold < SLOT_COSTS[maxArmySlots]}
                    style={{
                      padding: '12px 0', borderRadius: 12,
                      background: SLOT_COSTS[maxArmySlots] && gold >= SLOT_COSTS[maxArmySlots] ? 'rgba(212,168,90,0.08)' : 'rgba(240,232,216,0.04)',
                      border: '1px solid rgba(212,168,90,0.2)', color: '#d4a85a',
                      fontSize: 13, cursor: 'pointer',
                    }}>
                    + Слот армії ({SLOT_COSTS[maxArmySlots]} 💰)
                  </button>
                )}
              </div>
            )}

            {/* Revive tab */}
            {fortressTab === 'revive' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {deadUnits.map(u => {
                  const cost = getReviveCost(u)
                  return (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, background: 'rgba(240,232,216,0.04)', border: '1px solid rgba(240,232,216,0.1)' }}>
                      <img src={getPortrait(u)} alt="" style={{ width: 44, height: 52, borderRadius: 8, objectFit: 'cover', objectPosition: 'center top', opacity: 0.6 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(240,232,216,0.7)' }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.35)' }}>lv{u.level} {CLASS_UA[u.class]}</div>
                      </div>
                      <button onClick={() => onReviveUnit(u.id)} disabled={gold < cost}
                        style={{
                          padding: '8px 12px', borderRadius: 10,
                          background: gold >= cost ? 'rgba(212,168,90,0.12)' : 'rgba(240,232,216,0.04)',
                          border: '1px solid rgba(212,168,90,0.3)', color: '#d4a85a',
                          fontSize: 12, cursor: gold >= cost ? 'pointer' : 'not-allowed',
                        }}>{cost} 💰</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
    </div>
  )
}
