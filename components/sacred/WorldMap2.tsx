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
import type { UnitSpec2 } from '@/lib/sacred/territories2'
import { HERO_REVIVE_COST, HERO_HIRE_COST } from '@/lib/sacred/heroes'
import type { HeroId } from '@/lib/sacred/heroes'

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

// Districts that touch at least one district from a different region
const BOUNDARY_DISTRICT_IDS = new Set(
  DISTRICTS_2.filter(d =>
    d.adjacentTo.some(adjId => {
      const adj = DISTRICTS_2.find(x => x.id === adjId)
      return adj !== undefined && adj.regionId !== d.regionId
    })
  ).map(d => d.id)
)

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

function getSpec2Portrait(spec: UnitSpec2): string {
  const lvl = spec.level ?? 1
  if (spec.class === 'warrior') {
    if (spec.warriorPath === 'champion' && lvl >= 3) return `/sacred/warriors/champion/level${lvl}.jpg`
    return `/sacred/warriors/level${Math.min(lvl, 4)}.jpg`
  }
  if (spec.class === 'archer')  return `/sacred/archers/level${Math.min(lvl, 3)}.jpg`
  if (spec.class === 'mage')
    return lvl > 1 && spec.magePath ? `/sacred/mages/${spec.magePath}/level${lvl}.jpg` : '/sacred/mages/level1.jpg'
  if (spec.class === 'catapult')
    return lvl > 1 && spec.catapultPath ? `/sacred/catapults/${spec.catapultPath}/level${lvl}.jpg` : '/sacred/catapults/level1.jpg'
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
  mapState:             TerritoryMap2State
  playerUnits:          GameUnit[]   // army 1 (Артан) regular units (no heroes)
  deadUnits:            GameUnit[]
  army2Units:           GameUnit[]   // army 2 (Сивілла) regular units
  army2DeadUnits:       GameUnit[]
  activeArmy:           1 | 2
  onSwitchArmy:         (army: 1 | 2) => void
  onReviveHero:         (heroId: HeroId) => void
  onHireHero:           (heroId: HeroId) => void
  onMove:               (districtId: string) => void
  onAttack:             (districtId: string) => void
  onFinalBattle:        (regionId: string) => void
  onEndTurn:            () => void
  onRest:               () => void
  onBack:               () => void
  onHireUnit:           (cls: UnitClass, row: number, slot: number) => void
  onReorderUnits:       (id1: string, id2: string) => void
  onMoveUnitSlot:       (id: string, row: number, slot: number) => void
  onUpgradeFortress:    () => void
  onPurchaseSlot:       () => void
  onReviveUnit:         (id: string) => void
  onDismissUnit:        (id: string) => void
  battleResult?:        { gold: number; levelUps: string[] } | null
  onClearBattleResult?: () => void
  botMessage?:          string | null
  onClearBotMessage?:   () => void
}

type FortressTab = 'army' | 'upgrade' | 'revive' | 'tavern'

const MIN_SCALE = 0.08
const MAX_SCALE = 4

function isSlotUnlockedForArmy(
  row: number, slot: number,
  unlockedSlots: { row: 0|1; slot: number }[],
  heroRow: number, heroSlot: number,
): boolean {
  if (row === heroRow && slot === heroSlot) return true
  return unlockedSlots.some(s => s.row === row && s.slot === slot)
}

export default function WorldMap2({
  mapState, playerUnits, deadUnits, army2Units, army2DeadUnits,
  activeArmy, onSwitchArmy, onReviveHero, onHireHero,
  onMove, onAttack, onFinalBattle, onEndTurn, onRest, onBack,
  onHireUnit, onReorderUnits, onMoveUnitSlot,
  onUpgradeFortress, onPurchaseSlot, onReviveUnit, onDismissUnit,
  battleResult, onClearBattleResult,
  botMessage, onClearBotMessage,
}: Props) {
  const [popupDistrictId, setPopupDistrictId] = useState<string | null>(null)
  const [fortressOpen,    setFortressOpen]    = useState(false)
  const [fortressTab,     setFortressTab]     = useState<FortressTab>('army')
  const [selectedUnitId,  setSelectedUnitId]  = useState<string | null>(null)
  const [hirePopup,       setHirePopup]       = useState<{ row: number; slot: number } | null>(null)

  const activeRegularUnits = activeArmy === 1 ? playerUnits : army2Units
  const activeDeadUnits    = activeArmy === 1 ? deadUnits   : army2DeadUnits
  const activeAp           = activeArmy === 1 ? mapState.ap : mapState.army2Ap
  const activeUnlockedSlots = activeArmy === 1 ? mapState.army1UnlockedSlots : mapState.army2UnlockedSlots
  const activeRested       = activeArmy === 1 ? mapState.restedThisTurn : mapState.army2RestedThisTurn
  const activeHero         = activeArmy === 1 ? mapState.heroes?.artan : mapState.heroes?.sybilla
  const activeHeroId: HeroId = activeArmy === 1 ? 'artan' : 'sybilla'
  const activeHeroRow      = activeArmy === 1 ? 0 : 1
  const activeHeroSlot     = 0

  useEffect(() => {
    if (fortressTab === 'revive' && activeDeadUnits.length === 0 && !(!activeHero?.isAlive)) setFortressTab('army')
  }, [activeDeadUnits.length, activeHero?.isAlive])

  const {
    ownership, gold, turn, ap, armyNodeId,
    fortressLevel, restedThisTurn,
    activeRegionId, conqueredRegions, pendingFinalBattle,
  } = mapState

  const attackable     = getAttackableDistricts(ownership, armyNodeId, activeRegionId)
  const movable        = getMovableDistricts(ownership, armyNodeId)
  const atStart        = armyNodeId === 'terr_221'
  const dailyIncome    = getDailyIncome(ownership)
  const ownedCount     = Object.values(ownership).filter(o => o === 'player').length
  const botCount       = Object.values(ownership).filter(o => o === 'bot').length
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
    const W = el.clientWidth, H = el.clientHeight
    if (!W || !H) return
    const regionDistricts = DISTRICTS_2.filter(d => d.regionId === activeRegionId)
    if (regionDistricts.length > 0) {
      const allPoints = regionDistricts.flatMap(d => d.polygon)
      const minX = Math.min(...allPoints.map(([x]) => x))
      const maxX = Math.max(...allPoints.map(([x]) => x))
      const minY = Math.min(...allPoints.map(([, y]) => y))
      const maxY = Math.max(...allPoints.map(([, y]) => y))
      const pad = 80
      const s   = Math.min(W / (maxX - minX + pad * 2), H / (maxY - minY + pad * 2), 2.5)
      const cx  = (minX + maxX) / 2
      const cy  = (minY + maxY) / 2
      applyT({ x: W / 2 - cx * s, y: H / 2 - cy * s, scale: s })
    } else {
      const s = Math.min(W / MAP2_WIDTH, H / MAP2_HEIGHT)
      applyT({ x: (W - MAP2_WIDTH * s) / 2, y: (H - MAP2_HEIGHT * s) / 2, scale: s })
    }
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
      if (activeAp > 0) { onMove(districtId); setPopupDistrictId(null) }
      else setPopupDistrictId(districtId)
      return
    }
    const o = ownership[districtId]
    if (attackable.has(districtId) || o === 'enemy' || o === 'bot') {
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
    if (!activeHero) return  // no hero hired — army is inactive
    // Hero occupies fixed slot — not interactive
    if (row === activeHeroRow && slot === activeHeroSlot && activeHero) return
    if (!isSlotUnlockedForArmy(row, slot, activeUnlockedSlots, activeHeroRow, activeHeroSlot)) return
    // Catapult occupies column 3 (row 0 slot 3 + row 1 slot 3 visually)
    const hasCatapult = activeRegularUnits.some(u => u.class === 'catapult')
    if (hasCatapult && slot === 3 && row === 1) return  // back slot 3 reserved for catapult base
    const occupant = activeRegularUnits.find(u => u.row === row && u.slot === slot)
    if (selectedUnitId) {
      const selUnit = activeRegularUnits.find(u => u.id === selectedUnitId)
      if (!selUnit || selUnit.row !== row) { setSelectedUnitId(null); return }
      if (occupant && occupant.id !== selectedUnitId) onReorderUnits(selectedUnitId, occupant.id)
      else if (!occupant) onMoveUnitSlot(selectedUnitId, row, slot)
      setSelectedUnitId(null)
      return
    }
    if (occupant) { setSelectedUnitId(occupant.id); return }
    setHirePopup({ row, slot })
  }


  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 210, background: '#0f0e09', paddingTop: 'env(safe-area-inset-top)' }}>
    <div style={{ maxWidth: 560, margin: '0 auto', height: '100%', color: '#f0e8d8', fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '8px 16px', background: '#17150f', borderBottom: '1px solid rgba(240,232,216,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 8 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'rgba(240,232,216,0.5)', cursor: 'pointer', fontSize: 20, padding: '0 8px 0 0' }}>←</button>
        <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.5)', fontWeight: 600 }}>{activeRegion?.name}</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#d4a85a', fontWeight: 700 }}>💰 {gold}<span style={{ fontSize: 10, color: 'rgba(212,168,90,0.6)', fontWeight: 400 }}> +{dailyIncome}</span></span>
          <span style={{ fontSize: 10, color: 'rgba(240,232,216,0.4)' }}>А1</span><ApDots ap={ap} />
          <span style={{ fontSize: 10, color: 'rgba(240,232,216,0.4)' }}>А2</span><ApDots ap={mapState.army2Ap} />
          <span style={{ fontSize: 11, color: 'rgba(240,232,216,0.4)' }}>День {turn}</span>
          <span style={{ fontSize: 11, color: 'rgba(240,232,216,0.35)' }}>{capturedInRegion}/{activeDistricts.length}</span>
          <span style={{ fontSize: 11, color: '#9a5aaa', fontWeight: 600 }}>👁 {botCount} <span style={{ color: 'rgba(154,90,170,0.7)', fontWeight: 400 }}>⚔{mapState.botArmy.length}{mapState.botHero?.isAlive ? ` ★${mapState.botHero.level}` : ''}</span></span>
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
        }}>
          <img
            src="/sacred/map2.png" alt=""
            draggable={false}
            style={{ position: 'absolute', top: 0, left: 0, width: MAP2_WIDTH, height: MAP2_HEIGHT, display: 'block', userSelect: 'none' }}
          />
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

            {/* Pass 2 — fill + dashed border */}
            {DISTRICTS_2.map(d => {
              const pts        = d.polygon.map(([x, y]) => `${x},${y}`).join(' ')
              const isPlayer   = ownership[d.id] === 'player'
              const isBot      = ownership[d.id] === 'bot'
              const isArmy     = d.id === armyNodeId
              const isAttack   = attackable.has(d.id)
              const isMove     = movable.has(d.id)
              const isActive   = d.regionId === activeRegionId
              const isConq     = conqueredRegions.includes(d.regionId)
              const isSelected = popupDistrictId === d.id
              const isSpecial  = isSelected || isArmy || isAttack || isMove

              const color       = isPlayer ? '#6fa67a' : isBot ? '#8a3a9a' : isAttack ? '#c07070' : isMove ? '#88ccff' : REGION_COLORS[d.regionId] ?? '#8a7a60'
              const fillOpacity = isSelected ? 0.55 : isAttack ? 0.4 : isMove ? 0.4 : isPlayer ? 0.3 : isBot ? 0.3 : (!isActive && !isConq) ? 0.1 : 0.15
              const strokeColor = isSelected ? '#fff' : isArmy ? '#d4a85a' : isAttack ? '#ffd700' : isMove ? '#88ccff' : color
              const strokeW     = isSpecial ? 2 : 1
              const strokeOp    = isSpecial ? 1 : (isPlayer || isBot) ? 0.75 : (!isActive && !isConq) ? 0.45 : 0.65

              return (
                <polygon
                  key={`dst-${d.id}`}
                  points={pts}
                  fill={color}
                  fillOpacity={fillOpacity}
                  stroke={strokeColor}
                  strokeWidth={strokeW}
                  strokeOpacity={strokeOp}
                  strokeDasharray={isSpecial ? undefined : '15 10'}
                  vectorEffect="non-scaling-stroke"
                  onClick={() => handleDistrictTap(d.id)}
                  style={{ cursor: (isAttack || isMove) ? 'pointer' : 'default', filter: isArmy ? 'url(#glow2)' : undefined }}
                />
              )
            })}

            {/* Pass 3 — region boundary dashes (gold, thicker) */}
            {DISTRICTS_2.filter(d => BOUNDARY_DISTRICT_IDS.has(d.id)).map(d => {
              const pts      = d.polygon.map(([x, y]) => `${x},${y}`).join(' ')
              const isActive = d.regionId === activeRegionId
              const isConq   = conqueredRegions.includes(d.regionId)
              const opacity  = isActive ? 0.9 : isConq ? 0.65 : 0.4
              return (
                <polygon
                  key={`rb-${d.id}`}
                  points={pts}
                  fill="none"
                  stroke="#c8a040"
                  strokeWidth={2.5}
                  strokeOpacity={opacity}
                  strokeDasharray="25 15"
                  vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: 'none' }}
                />
              )
            })}

            {/* Pass 3 — labels + capitals + army (always on top) */}
            {DISTRICTS_2.map(d => {
              const isPlayer   = ownership[d.id] === 'player'
              const isActive   = d.regionId === activeRegionId
              const isConq     = conqueredRegions.includes(d.regionId)
              const [cx, cy]   = polyCentroid(d.polygon)
              const labelOpacity = isActive ? 0.9 : isConq ? 0.75 : 0.5
              return (
                <g key={`lbl-${d.id}`} style={{ pointerEvents: 'none' }}>
                  {d.isCapital && isPlayer && (
                    <text x={cx} y={cy + 5} textAnchor="middle" fontSize="16" fill="#d4a85a">★</text>
                  )}
                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize="9"
                    fill="#f0e8d8" opacity={labelOpacity}
                    style={{ userSelect: 'none', filter: 'drop-shadow(0 0 5px rgba(0,0,0,1)) drop-shadow(0 0 3px rgba(0,0,0,1))' }}>
                    {d.name}
                  </text>
                </g>
              )
            })}

            {/* Region name labels */}
            {REGIONS_2.map(region => {
              if (region.isBoss) return null
              const rDistricts = DISTRICTS_2.filter(d => region.districts.includes(d.id))
              if (rDistricts.length === 0) return null
              const allPts = rDistricts.flatMap(d => d.polygon)
              const cx = allPts.reduce((s, [x]) => s + x, 0) / allPts.length
              const cy = allPts.reduce((s, [, y]) => s + y, 0) / allPts.length
              const isActiveReg = region.id === activeRegionId
              const isConqReg   = conqueredRegions.includes(region.id)
              const opacity     = isActiveReg ? 1 : isConqReg ? 0.65 : 0.5
              const fill        = isConqReg ? '#6fa67a' : isActiveReg ? '#d4a85a' : '#f0e8d8'
              return (
                <text key={region.id} x={cx} y={cy - 14}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="13" fontWeight="bold" fill={fill} opacity={opacity}
                  style={{ pointerEvents: 'none', userSelect: 'none', filter: 'drop-shadow(0 0 6px rgba(0,0,0,1)) drop-shadow(0 0 4px rgba(0,0,0,1))' }}>
                  {region.name}
                </text>
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
        {popupDistrict && (ownership[popupDistrict.id] === 'enemy' || ownership[popupDistrict.id] === 'bot') && (
          <div style={{
            position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
            background: '#1e1a12', border: `1px solid ${ownership[popupDistrict.id] === 'bot' ? 'rgba(138,58,154,0.5)' : 'rgba(212,168,90,0.35)'}`,
            borderRadius: 14, padding: '14px 18px', minWidth: 240, zIndex: 10,
          }}>
            <div style={{ fontWeight: 700, color: '#f0e8d8', marginBottom: 4 }}>
              {popupDistrict.name}
              {popupDistrict.id === 'terr_229' && ownership[popupDistrict.id] === 'bot' && (
                <span style={{ marginLeft: 8, fontSize: 13 }}>👑</span>
              )}
            </div>
            {popupDistrict.isCapital && <div style={{ fontSize: 11, color: '#d4a85a', marginBottom: 6 }}>★ Столиця</div>}
            {popupDistrict.id === 'terr_229' && ownership[popupDistrict.id] === 'bot' && (
              <div style={{ fontSize: 11, color: '#9a5aaa', marginBottom: 6, fontWeight: 600 }}>👑 Столиця Темного Барона</div>
            )}
            {/* Unit portraits */}
            {(() => {
              const isBot = ownership[popupDistrict.id] === 'bot'
              const heroHere = isBot && mapState.botHero?.isAlive && mapState.botHeroNodeId === popupDistrict.id
              const armyToShow = isBot ? mapState.botArmy : popupDistrict.army
              if (armyToShow.length === 0 && !heroHere) {
                return <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.4)', marginBottom: 12 }}>Армія відсутня</div>
              }
              return (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {heroHere && mapState.botHero && (
                    <div style={{ position: 'relative', width: 44, height: 52 }}>
                      <div style={{
                        width: 44, height: 52, borderRadius: 8,
                        background: 'linear-gradient(135deg, #5a2070, #8a3a9a)',
                        border: '1px solid rgba(212,168,90,0.6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, color: '#f0e8d8',
                      }}>☠</div>
                      <div style={{
                        position: 'absolute', bottom: 2, right: 3,
                        fontSize: 9, color: '#d4a85a', fontWeight: 700,
                        background: 'rgba(0,0,0,0.7)', borderRadius: 4, padding: '1px 3px',
                      }}>★{mapState.botHero.level}</div>
                    </div>
                  )}
                  {armyToShow.map((spec, i) => (
                    <div key={i} style={{ position: 'relative', width: 44, height: 52 }}>
                      <img
                        src={getSpec2Portrait(spec)}
                        alt=""
                        style={{ width: 44, height: 52, borderRadius: 8, objectFit: 'cover', objectPosition: 'center top' }}
                      />
                      <div style={{
                        position: 'absolute', bottom: 2, right: 3,
                        fontSize: 9, color: '#d4a85a', fontWeight: 700,
                        background: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: '1px 3px',
                      }}>lv{spec.level}</div>
                    </div>
                  ))}
                </div>
              )
            })()}
            {attackable.has(popupDistrict.id) ? (
              <button
                onClick={() => { onAttack(popupDistrict.id); setPopupDistrictId(null) }}
                disabled={activeAp <= 0 || !activeHero}
                style={{
                  width: '100%', padding: '10px 0', borderRadius: 10,
                  background: activeAp > 0 && activeHero ? '#8b2020' : 'rgba(139,32,32,0.3)',
                  color: activeAp > 0 && activeHero ? '#f0e8d8' : 'rgba(240,232,216,0.35)',
                  border: 'none', fontWeight: 700, fontSize: 13, cursor: activeAp > 0 && activeHero ? 'pointer' : 'not-allowed',
                }}
              >
                {!activeHero ? 'Найміть героя щоб атакувати' : activeAp > 0 ? `⚔ Атакувати (Армія ${activeArmy})` : 'Немає ходів у активної армії'}
              </button>
            ) : (
              <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.35)', textAlign: 'center' }}>
                Не в зоні досяжності
              </div>
            )}
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

        {/* Bot message toast */}
        {botMessage && (
          <div
            onClick={onClearBotMessage}
            style={{
              position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(80,20,90,0.92)', border: '1px solid rgba(138,58,154,0.6)',
              borderRadius: 12, padding: '10px 18px', zIndex: 20, textAlign: 'center',
              color: '#e0b0f0', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
              cursor: 'pointer',
            }}
          >
            {botMessage}
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
              disabled={!activeHero}
              style={{ padding: '8px 14px', background: activeHero ? '#8b2020' : 'rgba(139,32,32,0.3)', border: 'none', borderRadius: 10, color: activeHero ? '#f0e8d8' : 'rgba(240,232,216,0.35)', fontWeight: 700, fontSize: 12, cursor: activeHero ? 'pointer' : 'not-allowed' }}
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
          {/* City image header */}
          <div style={{ position: 'relative', height: 170, flexShrink: 0 }}>
            <img
              src={`/sacred/fortress/fortress-${fortressLevel}.jpg`}
              alt=""
              draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
            />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(18,16,12,0.88) 100%)' }} />
            <button
              onClick={closeFortress}
              style={{ position: 'absolute', top: 10, right: 12, background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(240,232,216,0.2)', borderRadius: 20, color: '#f0e8d8', fontSize: 18, width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >×</button>
            <div style={{ position: 'absolute', bottom: 14, left: 16 }}>
              <div style={{ fontSize: 10, color: 'rgba(240,232,216,0.5)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>Рівень фортеці</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#d4a85a' }}>🏰 {FORTRESS_NAMES[fortressLevel]}</div>
            </div>
          </div>

          {/* Army switcher */}
          <div style={{ display: 'flex', padding: '8px 16px', gap: 8, borderBottom: '1px solid rgba(240,232,216,0.08)' }}>
            {([1, 2] as (1|2)[]).map(army => (
              <button key={army} onClick={() => { onSwitchArmy(army); setSelectedUnitId(null); setHirePopup(null) }}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: activeArmy === army ? 'rgba(212,168,90,0.12)' : 'none',
                  border: activeArmy === army ? '1px solid rgba(212,168,90,0.4)' : '1px solid rgba(240,232,216,0.1)',
                  color: activeArmy === army ? '#d4a85a' : 'rgba(240,232,216,0.4)',
                }}>
                {army === 1 ? '⚔ Артан' : '✨ Сивілла'}
                <span style={{ fontSize: 10, marginLeft: 6, opacity: 0.6 }}>
                  {army === 1 ? `${mapState.ap}AP` : `${mapState.army2Ap}AP`}
                </span>
              </button>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(240,232,216,0.1)' }}>
            {(['army', 'upgrade', 'tavern', 'revive'] as FortressTab[]).map(tab => {
              const labels: Record<FortressTab, string> = { army: 'Армія', upgrade: 'Поліпшення', tavern: 'Таверна', revive: 'Воскресити' }
              const artanHero   = mapState.heroes?.artan
              const sybillaHero = mapState.heroes?.sybilla
              const tavernNeedsAction =
                !artanHero || (artanHero && !artanHero.isAlive) ||
                !sybillaHero || (sybillaHero && !sybillaHero.isAlive)
              const showBadge = tab === 'tavern' && tavernNeedsAction
              const disabled  = tab === 'revive' && activeDeadUnits.length === 0
              return (
                <button key={tab} onClick={() => !disabled && setFortressTab(tab)} style={{
                  flex: 1, padding: '10px 0', background: 'none',
                  border: 'none', borderBottom: fortressTab === tab ? '2px solid #d4a85a' : '2px solid transparent',
                  color: fortressTab === tab ? '#d4a85a' : disabled ? 'rgba(240,232,216,0.2)' : 'rgba(240,232,216,0.5)',
                  fontSize: 11, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
                  position: 'relative',
                }}>
                  {labels[tab]}
                  {showBadge && (
                    <span style={{
                      position: 'absolute', top: 6, right: '50%', marginRight: -28,
                      width: 8, height: 8, borderRadius: '50%', background: '#cc7070',
                      boxShadow: '0 0 4px rgba(204,112,112,0.6)',
                    }} />
                  )}
                </button>
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
                        const isHeroSlot  = row === activeHeroRow && slot === activeHeroSlot
                        const unlocked    = isSlotUnlockedForArmy(row, slot, activeUnlockedSlots, activeHeroRow, activeHeroSlot)
                        const unit        = activeRegularUnits.find(u => u.row === row && u.slot === slot)
                        const isSel       = unit?.id === selectedUnitId
                        const heroNotHired = isHeroSlot && !activeHero
                        const heroAlive    = isHeroSlot && activeHero?.isAlive
                        const heroDead     = isHeroSlot && activeHero && !activeHero.isAlive
                        return (
                          <div key={slot} onClick={() => !isHeroSlot && unlocked && handleSlotClick(row, slot)} style={{
                            height: 72, borderRadius: 10, overflow: 'hidden',
                            border: isHeroSlot
                              ? `2px solid ${heroAlive ? 'rgba(212,168,90,0.6)' : heroDead ? 'rgba(180,50,50,0.4)' : 'rgba(240,232,216,0.18)'}`
                              : isSel ? '2px solid #d4a85a' : '1px solid rgba(240,232,216,0.15)',
                            background: unlocked ? (unit || isHeroSlot ? 'transparent' : 'rgba(240,232,216,0.04)') : 'rgba(0,0,0,0.3)',
                            cursor: isHeroSlot ? 'default' : unlocked ? 'pointer' : 'not-allowed',
                            position: 'relative',
                          }}>
                            {isHeroSlot ? (
                              heroAlive ? (
                                <img
                                  src={`/sacred/heroes/${activeHeroId}.jpg`}
                                  alt=""
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }}
                                />
                              ) : heroDead ? (
                                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, background: 'rgba(180,50,50,0.08)' }}>
                                  <span style={{ fontSize: 18, opacity: 0.5 }}>☠</span>
                                  <span style={{ fontSize: 9, color: '#c07070' }}>Загинув</span>
                                </div>
                              ) : (
                                <div style={{ position: 'relative', height: '100%' }}>
                                  <img
                                    src={`/sacred/heroes/${activeHeroId}.jpg`}
                                    alt=""
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', opacity: 0.18, filter: 'grayscale(1)' }}
                                  />
                                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
                                    <span style={{ fontSize: 8, color: 'rgba(212,168,90,0.7)', textAlign: 'center', lineHeight: 1.2, textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                                      Найміть<br/>у Таверні
                                    </span>
                                  </div>
                                </div>
                              )
                            ) : unit ? (
                              <img src={getPortrait(unit)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
                            ) : unlocked ? (
                              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: 'rgba(240,232,216,0.15)' }}>+</div>
                            ) : (
                              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'rgba(240,232,216,0.15)' }}>🔒</div>
                            )}
                            {heroAlive && (
                              <div style={{ position: 'absolute', bottom: 2, right: 4, fontSize: 10, color: '#d4a85a', fontWeight: 700 }}>lv{activeHero?.level}</div>
                            )}
                            {!isHeroSlot && unit && (
                              <div style={{ position: 'absolute', bottom: 2, right: 4, fontSize: 10, color: '#d4a85a', fontWeight: 700 }}>lv{unit.level}</div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {/* Selected unit actions */}
                {selectedUnitId && (() => {
                  const su = activeRegularUnits.find(u => u.id === selectedUnitId)
                  if (!su) return null
                  return (
                    <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12, background: 'rgba(212,168,90,0.07)', border: '1px solid rgba(212,168,90,0.25)' }}>
                      <div style={{ fontSize: 11, color: '#d4a85a', fontWeight: 700, marginBottom: 4 }}>
                        {CLASS_UA[su.class]} lv{su.level}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(240,232,216,0.4)', marginBottom: 10 }}>
                        Натисніть інший слот у тому ж ряді щоб поміняти місцями
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => { onDismissUnit(selectedUnitId); setSelectedUnitId(null) }}
                          style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: 'rgba(180,50,50,0.15)', border: '1px solid rgba(180,50,50,0.4)', color: '#e07070', fontSize: 12, cursor: 'pointer' }}
                        >Демобілізувати</button>
                        <button
                          onClick={() => setSelectedUnitId(null)}
                          style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: 'none', border: '1px solid rgba(240,232,216,0.15)', color: 'rgba(240,232,216,0.5)', fontSize: 12, cursor: 'pointer' }}
                        >Скасувати</button>
                      </div>
                    </div>
                  )
                })()}

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
                <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.35)', marginTop: 4 }}>
                  Слоти армії обираються гравцем при підвищенні рівня героя (lv{activeHero?.level ?? 1}, відкрито: {activeUnlockedSlots.length})
                </div>
              </div>
            )}

            {/* Tavern tab — both heroes (army-independent) */}
            {fortressTab === 'tavern' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {(['artan', 'sybilla'] as HeroId[]).map(hid => {
                  const hero = mapState.heroes?.[hid] ?? null
                  const heroName = hid === 'artan' ? 'Артан' : 'Сивілла'
                  const heroRole = hid === 'artan' ? 'Воїн · Армія 1' : 'Цілителька · Армія 2'
                  const alive = hero?.isAlive ?? false
                  const dead  = hero && !hero.isAlive
                  const borderColor = !hero ? 'rgba(212,168,90,0.25)' : alive ? 'rgba(212,168,90,0.2)' : 'rgba(180,50,50,0.3)'
                  return (
                    <div key={hid} style={{
                      padding: 12, borderRadius: 12,
                      background: 'rgba(240,232,216,0.04)',
                      border: `1px solid ${borderColor}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <img
                          src={`/sacred/heroes/${hid}.jpg`}
                          alt=""
                          style={{
                            width: 56, height: 68, borderRadius: 8,
                            objectFit: 'cover', objectPosition: 'center top',
                            opacity: alive ? 1 : !hero ? 0.4 : 0.4,
                            filter: !hero ? 'grayscale(0.6)' : undefined,
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: alive ? '#f0e8d8' : 'rgba(240,232,216,0.55)' }}>
                            {heroName}
                            {dead && <span style={{ fontSize: 11, color: '#c07070', marginLeft: 8 }}>☠ Загинув</span>}
                          </div>
                          <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.4)', marginTop: 2 }}>
                            {heroRole}
                          </div>
                          {hero && (
                            <>
                              <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.45)', marginTop: 4 }}>
                                Рівень {hero.level} · {hero.hp}/{hero.maxHp} HP
                              </div>
                              <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.35)', marginTop: 1 }}>
                                XP: {hero.xp}/{hero.xpToNext === Infinity ? '∞' : hero.xpToNext}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      {!hero && (
                        <button
                          onClick={() => onHireHero(hid)}
                          disabled={gold < HERO_HIRE_COST}
                          style={{
                            width: '100%', marginTop: 12, padding: '10px 0', borderRadius: 10,
                            background: gold >= HERO_HIRE_COST ? 'rgba(212,168,90,0.12)' : 'rgba(240,232,216,0.04)',
                            border: '1px solid rgba(212,168,90,0.3)', color: '#d4a85a',
                            fontSize: 13, fontWeight: 600, cursor: gold >= HERO_HIRE_COST ? 'pointer' : 'not-allowed',
                          }}>
                          Найняти ({HERO_HIRE_COST} 💰)
                        </button>
                      )}
                      {dead && (
                        <button
                          onClick={() => onReviveHero(hid)}
                          disabled={gold < HERO_REVIVE_COST}
                          style={{
                            width: '100%', marginTop: 12, padding: '10px 0', borderRadius: 10,
                            background: gold >= HERO_REVIVE_COST ? 'rgba(212,168,90,0.12)' : 'rgba(240,232,216,0.04)',
                            border: '1px solid rgba(212,168,90,0.3)', color: '#d4a85a',
                            fontSize: 13, fontWeight: 600, cursor: gold >= HERO_REVIVE_COST ? 'pointer' : 'not-allowed',
                          }}>
                          Воскресити ({HERO_REVIVE_COST} 💰)
                        </button>
                      )}
                      {alive && hero!.chosenPerks.length > 0 && (
                        <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(240,232,216,0.35)' }}>
                          Перки: {hero!.chosenPerks.join(', ')}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Revive tab */}
            {fortressTab === 'revive' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeDeadUnits.map(u => {
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
