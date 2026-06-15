'use client'

import { useReducer, useEffect, useRef, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  createInitialState, battleReducer, getMainActions, getValidTargets, ACTIONS,
  addUnitAtSlot, buildCustomArmy,
} from '@/lib/sacred/game'
import type { GameUnit, ActionKey, Side, Row, LogEntry, ArmyCounts, BattleEvent, BattleAction, MagePath, UnitClass, CatapultPath, WarriorPath } from '@/lib/sacred/types'
import { WARRIOR_LEVELS, WARRIOR_PATHS, ARCHER_LEVELS, MAGE_BASE, MAGE_PATHS, CATAPULT_PATHS } from '@/lib/sacred/types'
import ArmyBuilder from './ArmyBuilder'
import PlacementScreen from './PlacementScreen'
import FreeBattleSetup from './FreeBattleSetup'
import WorldMap from './WorldMap'
import {
  TERRITORIES, createInitialTerritoryState, getTerritoryById, buildArmyFromSpecs,
  HIRE_COSTS, FORTRESS_UPGRADE_COST, SLOT_COSTS, getReviveCost,
} from '@/lib/sacred/territories'
import type { TerritoryMapState } from '@/lib/sacred/territories'

type WorldBattleResult = { gold: number; levelUps: string[] }

const SIDE_COLOR: Record<Side, string> = { player: '#7aaa82', ai: '#c07070' }
const ROW_LABEL: Record<number, string> = { 0: 'Передній', 1: 'Дальній' }
const BUFF_ICON: Record<string, string> = {
  defense_up: '🛡',
  aimed: '🎯',
  morale_up: '📯',
  armor_break: '💔',
  poison: '🧪',
  burning: '🔥',
  frozen: '❄',
  accuracy_down: '🌀',
  accuracy_up: '🎯',
  regen: '💚',
  wind_shield: '💨',
  fortress_buff: '🏰',
  thorns: '🌿',
  initiative_up: '⚡',
  initiative_down: '🐢',
  cooldown: '⏳',
}

const MAGE_PATH_ICON: Record<MagePath, string> = { fire: '🔥', water: '💧', earth: '🌿', air: '💨' }
const MAGE_PATH_NAME: Record<MagePath, string> = { fire: 'Вогонь', water: 'Вода', earth: 'Земля', air: 'Повітря' }
const MAGE_PATH_COLOR: Record<MagePath, string> = { fire: '#c0392b', water: '#2980b9', earth: '#27ae60', air: '#8e44ad' }
const BUFF_LABEL: Record<string, string> = {
  defense_up: '+50% броні цей хід',
}
const FLOAT_COLOR: Record<BattleEvent['type'], string> = {
  damage: '#c0392b', crit: '#b07850', miss: '#9b9289',
  evade: '#4a86a8', heal: '#5a9a6a', buff: '#8060a8', debuff: '#c07070',
}

type CastEffectType = 'fire' | 'ice' | 'earth' | 'air' | 'holy' | 'physical'
const ACTION_EFFECT_MAP: Partial<Record<ActionKey, CastEffectType>> = {
  // fire
  fireball: 'fire', fire_orb: 'fire', armageddon: 'fire',
  // ice/water
  freeze: 'ice', blizzard: 'ice',
  // earth
  rock_throw: 'earth', stone_skin: 'earth', earthquake: 'earth', fortress_aura: 'earth',
  // air
  gust: 'air', tailwind: 'air', hurricane: 'air',
  // holy/warrior
  sacred_strike: 'holy', consecration: 'holy', battle_cry: 'holy', shield: 'holy',
  // physical
  strike: 'physical', shot: 'physical', aim: 'physical', double_shot: 'physical',
  poison_shot: 'physical', magic_bolt: 'physical', shkvall: 'physical',
  barrage: 'physical', grapeshot: 'physical', ballista_shot: 'physical',
  twin_bolt: 'physical', trebuchet_volley: 'physical', plague_volley: 'physical',
}

// ── SVG Avatars ────────────────────────────────────────────────────────────────
function WarriorSVG({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <path d="M5 8L14 5L23 8V15Q23 22 14 25Q5 22 5 15Z"
        fill={color} opacity="0.2" stroke={color} strokeWidth="1.5"/>
      <line x1="19" y1="5" x2="10" y2="23" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="13" y1="13" x2="20" y2="16.5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function ArcherSVG({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <path d="M7 5C3 11 3 17 7 23" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <line x1="7" y1="5" x2="7" y2="23" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
      <line x1="7" y1="14" x2="22" y2="14" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <path d="M18 11L23 14L18 17Z" fill={color}/>
      <path d="M7 14L4 11M7 14L4 17" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function MageSVG({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <line x1="14" y1="26" x2="14" y2="12" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="11" y1="26" x2="17" y2="26" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="14" cy="8" r="4" fill={color} opacity="0.15" stroke={color} strokeWidth="1.5"/>
      <path d="M14 4L15.2 7.2L18.5 7.2L15.9 9.2L17 12.5L14 10.6L11 12.5L12.1 9.2L9.5 7.2L12.8 7.2Z" fill={color}/>
    </svg>
  )
}

function CatapultSVG({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <circle cx="7" cy="23" r="3" fill={color} opacity="0.15" stroke={color} strokeWidth="1.5"/>
      <circle cx="21" cy="23" r="3" fill={color} opacity="0.15" stroke={color} strokeWidth="1.5"/>
      <line x1="4" y1="23" x2="24" y2="23" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <line x1="14" y1="23" x2="14" y2="17" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="6" y1="19" x2="22" y2="8" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="22" cy="7" r="3" fill={color} opacity="0.4" stroke={color} strokeWidth="1.5"/>
    </svg>
  )
}

function CatapultBaseSVG({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <circle cx="7" cy="18" r="5" fill={color} opacity="0.12" stroke={color} strokeWidth="1.5"/>
      <circle cx="21" cy="18" r="5" fill={color} opacity="0.12" stroke={color} strokeWidth="1.5"/>
      <line x1="2" y1="18" x2="26" y2="18" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="7" cy="18" r="1.5" fill={color} opacity="0.6"/>
      <circle cx="21" cy="18" r="1.5" fill={color} opacity="0.6"/>
      <line x1="7" y1="13" x2="21" y2="13" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
    </svg>
  )
}

type AvatarComponent = React.ComponentType<{ color: string; size?: number }>
const CLASS_SVG: Record<string, AvatarComponent> = {
  warrior: WarriorSVG, archer: ArcherSVG, mage: MageSVG, catapult: CatapultSVG,
}

function getPortraitSrc(unit: GameUnit): string | null {
  const lvl = unit.level ?? 1
  if (unit.class === 'warrior')
    return lvl >= 3 && unit.warriorPath === 'champion'
      ? `/sacred/warriors/champion/level${lvl}.jpg`
      : `/sacred/warriors/level${Math.min(lvl, 4)}.jpg`
  if (unit.class === 'archer')  return `/sacred/archers/level${lvl}.jpg`
  if (unit.class === 'mage')
    return lvl === 1 || !unit.magePath ? '/sacred/mages/level1.jpg' : `/sacred/mages/${unit.magePath}/level${lvl}.jpg`
  if (unit.class === 'catapult')
    return lvl === 1 || !unit.catapultPath ? '/sacred/catapults/level1.jpg' : `/sacred/catapults/${unit.catapultPath}/level${lvl}.jpg`
  return null
}

// ── Seraph Logo ────────────────────────────────────────────────────────────────
function SeraphLogo({ size = 108, color = '#b07850' }: { size?: number; color?: string }) {
  const c = color
  const cx = size / 2, cy = size / 2, r = size * 0.463
  const spokes = [0, 45, 90, 135, 180, 225, 270, 315]
  const scale = size / 108
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      <circle cx={cx} cy={cy} r={r} stroke={c} strokeWidth={1.5 * scale} opacity="0.4"/>
      <circle cx={cx} cy={cy} r={r * 0.84} stroke={c} strokeWidth={scale} opacity="0.18"/>
      {spokes.map((deg, i) => {
        const rad = (deg * Math.PI) / 180
        const isPrimary = i % 2 === 0
        const r1 = (isPrimary ? 38 : 40) * scale, r2 = (isPrimary ? 50 : 46) * scale
        return (
          <line key={deg}
            x1={cx + r1 * Math.sin(rad)} y1={cy - r1 * Math.cos(rad)}
            x2={cx + r2 * Math.sin(rad)} y2={cy - r2 * Math.cos(rad)}
            stroke={c} strokeWidth={isPrimary ? 2.5 * scale : 1.2 * scale}
            opacity={isPrimary ? 0.9 : 0.5} strokeLinecap="round"/>
        )
      })}
      <path d={`M${cx} ${27*scale+cy-54*scale}L${69*scale+cx-54*scale} ${33*scale+cy-54*scale}V${49*scale+cy-54*scale}Q${69*scale+cx-54*scale} ${64*scale+cy-54*scale} ${cx} ${69*scale+cy-54*scale}Q${39*scale+cx-54*scale} ${64*scale+cy-54*scale} ${39*scale+cx-54*scale} ${49*scale+cy-54*scale}V${33*scale+cy-54*scale}Z`}
        fill={c} opacity="0.15" stroke={c} strokeWidth={2 * scale}/>
      <line x1={cx} y1={34*scale+cy-54*scale} x2={cx} y2={59*scale+cy-54*scale} stroke={c} strokeWidth={3 * scale} strokeLinecap="round"/>
      <line x1={(48*scale+cx-54*scale)} y1={44*scale+cy-54*scale} x2={(60*scale+cx-54*scale)} y2={44*scale+cy-54*scale} stroke={c} strokeWidth={2 * scale} strokeLinecap="round"/>
      <path d={`M${51*scale+cx-54*scale} ${34*scale+cy-54*scale}L${cx} ${29*scale+cy-54*scale}L${57*scale+cx-54*scale} ${34*scale+cy-54*scale}Z`} fill={c}/>
    </svg>
  )
}

// ── HP bar ─────────────────────────────────────────────────────────────────────
function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = Math.max(0, hp / maxHp)
  const color = pct > 0.5 ? '#7aaa82' : pct > 0.25 ? '#c4a040' : '#c07070'
  return (
    <div style={{ width: '100%', height: 4, background: 'rgba(0,0,0,0.1)', borderRadius: 2, marginTop: 4 }}>
      <div style={{ width: `${pct * 100}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s' }} />
    </div>
  )
}

// ── Projectile layer ───────────────────────────────────────────────────────────
interface Projectile {
  id: number; x1: number; y1: number; x2: number; y2: number; type: BattleEvent['type']
}

function ProjectileLayer({ battlefieldRef, events }: {
  battlefieldRef: React.RefObject<HTMLDivElement>; events: BattleEvent[]
}) {
  const [projectiles, setProjectiles] = useState<Projectile[]>([])
  const seenIds = useRef(new Set<number>())

  useEffect(() => {
    if (!battlefieldRef.current) return
    const newProjs: Projectile[] = []
    for (const ev of events) {
      if (!ev.sourceId || seenIds.current.has(ev.id) || ev.sourceId === ev.unitId) continue
      seenIds.current.add(ev.id)
      const srcEl = battlefieldRef.current.querySelector(`[data-unit-id="${ev.sourceId}"]`) as HTMLElement | null
      const tgtEl = battlefieldRef.current.querySelector(`[data-unit-id="${ev.unitId}"]`) as HTMLElement | null
      if (!srcEl || !tgtEl) continue
      const bf = battlefieldRef.current.getBoundingClientRect()
      const s = srcEl.getBoundingClientRect()
      const t = tgtEl.getBoundingClientRect()
      newProjs.push({
        id: ev.id, type: ev.type,
        x1: s.left - bf.left + s.width / 2,
        y1: s.top  - bf.top  + s.height / 2,
        x2: t.left - bf.left + t.width / 2,
        y2: t.top  - bf.top  + t.height / 2,
      })
    }
    if (!newProjs.length) return
    setProjectiles(prev => [...prev, ...newProjs])
    const ids = new Set(newProjs.map(p => p.id))
    const timer = setTimeout(() => setProjectiles(prev => prev.filter(p => !ids.has(p.id))), 750)
    return () => clearTimeout(timer)
  }, [events, battlefieldRef])

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5, overflow: 'hidden' }}>
      {projectiles.map(p => {
        const color = FLOAT_COLOR[p.type]
        return (
          <div key={p.id} style={{
            position: 'absolute', left: p.x1, top: p.y1,
            width: 10, height: 10, borderRadius: '50%',
            background: color, boxShadow: `0 0 8px ${color}`,
            transform: 'translate(-50%, -50%)',
            animation: 'proj-fly 0.55s ease-in forwards',
            ...{ '--proj-dx': `${p.x2 - p.x1}px`, '--proj-dy': `${p.y2 - p.y1}px` },
          } as React.CSSProperties} />
        )
      })}
    </div>
  )
}

// ── Unit card ──────────────────────────────────────────────────────────────────
const DEBUFF_PRIORITY = ['frozen','burning','poison','accuracy_down','armor_break','initiative_down','cooldown'] as const
const BUFF_PRIORITY   = ['defense_up','fortress_buff','wind_shield','regen','aimed','morale_up','thorns','accuracy_up','initiative_up'] as const

function UnitCard({ unit, isActive, isTargetable, onSelect, onInfo, floats, castEffect }: {
  unit: GameUnit; isActive: boolean; isTargetable: boolean
  onSelect?: () => void; onInfo?: () => void
  floats: BattleEvent[]
  castEffect?: CastEffectType | null
}) {
  const [isShaking,  setIsShaking]  = useState(false)
  const [isDying,    setIsDying]    = useState(false)
  const [hitFlash,   setHitFlash]   = useState(false)
  const [missFlash,  setMissFlash]  = useState(false)
  const [evadeDodge, setEvadeDodge] = useState(false)
  const [buffGlow,   setBuffGlow]   = useState<string | null>(null)
  const lastDmgId    = useRef(0)
  const lastMissId   = useRef(0)
  const lastEvadeId  = useRef(0)
  const prevHp       = useRef(unit.hp)
  const seenBuffIds  = useRef<Set<string>>(new Set(unit.buffs.map(b => b.id)))
  const buffGlowTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const maxId = floats
      .filter(f => f.type === 'damage' || f.type === 'crit')
      .reduce((m, f) => Math.max(m, f.id), 0)
    if (maxId > lastDmgId.current) {
      lastDmgId.current = maxId
      setIsShaking(true)
      setHitFlash(true)
      const t = setTimeout(() => { setIsShaking(false); setHitFlash(false) }, 1050)
      return () => clearTimeout(t)
    }
  }, [floats])

  useEffect(() => {
    const maxId = floats.filter(f => f.type === 'miss').reduce((m, f) => Math.max(m, f.id), 0)
    if (maxId > lastMissId.current) {
      lastMissId.current = maxId
      setMissFlash(true)
      const t = setTimeout(() => setMissFlash(false), 1170)
      return () => clearTimeout(t)
    }
  }, [floats])

  useEffect(() => {
    const maxId = floats.filter(f => f.type === 'evade').reduce((m, f) => Math.max(m, f.id), 0)
    if (maxId > lastEvadeId.current) {
      lastEvadeId.current = maxId
      setEvadeDodge(true)
      const t = setTimeout(() => setEvadeDodge(false), 1050)
      return () => clearTimeout(t)
    }
  }, [floats])

  useEffect(() => {
    if (prevHp.current > 0 && unit.hp === 0) {
      setIsDying(true)
      const t = setTimeout(() => setIsDying(false), 1800)
      return () => clearTimeout(t)
    }
    prevHp.current = unit.hp
  }, [unit.hp])

  useEffect(() => {
    const newBuff = unit.buffs.find(b => b.type !== 'cooldown' && !seenBuffIds.current.has(b.id))
    if (newBuff) {
      unit.buffs.forEach(b => seenBuffIds.current.add(b.id))
      const glowType = BUFF_PRIORITY.find(bp => bp === newBuff.type) ?? null
      if (glowType) {
        setBuffGlow(glowType)
        clearTimeout(buffGlowTimer.current)
        buffGlowTimer.current = setTimeout(() => setBuffGlow(null), 4500)
      }
    }
  }, [unit.buffs])

  const alive = unit.hp > 0
  const color  = SIDE_COLOR[unit.side]
  const borderColor = isActive ? '#b07850' : isTargetable ? color : 'rgba(240,232,216,0.14)'
  const AvatarSVG = CLASS_SVG[unit.class]

  const dominantDebuff = alive ? DEBUFF_PRIORITY.find(d => unit.buffs.some(b => b.type === d)) ?? null : null
  const dominantBuff   = alive && !isActive ? BUFF_PRIORITY.find(b => unit.buffs.some(buf => buf.type === b)) ?? null : null
  const portraitAnimClass = hitFlash
    ? 'unit-hit-flash'
    : dominantDebuff
      ? `unit-portrait-${dominantDebuff}`
      : unit.class === 'catapult'
        ? 'unit-portrait-catapult'
        : 'unit-portrait-idle'
  const unitLevelName = unit.class === 'warrior' && (unit.level ?? 1) >= 3 && unit.warriorPath
                        ? WARRIOR_PATHS[unit.warriorPath][unit.level ?? 1]?.name
                      : unit.class === 'warrior' ? WARRIOR_LEVELS[unit.level ?? 1]?.name
                      : unit.class === 'archer'  ? ARCHER_LEVELS[unit.level ?? 1]?.name
                      : unit.class === 'mage' && unit.level && unit.level > 1 && unit.magePath
                        ? MAGE_PATHS[unit.magePath][unit.level]?.name
                        : unit.class === 'mage' ? MAGE_BASE.name
                        : undefined
  const portraitSrc = unit.level
    ? (unit.class === 'warrior'
        ? ((unit.level >= 3 && unit.warriorPath === 'champion')
            ? `/sacred/warriors/champion/level${unit.level}.jpg`
            : `/sacred/warriors/level${Math.min(unit.level, 4)}.jpg`)
     : unit.class === 'catapult'
       ? (unit.level === 1 || !unit.catapultPath
           ? `/sacred/catapults/level1.jpg`
           : `/sacred/catapults/${unit.catapultPath}/level${unit.level}.jpg`)
     : unit.class === 'archer'  ? `/sacred/archers/level${unit.level}.jpg`
     : unit.class === 'mage'
       ? (unit.level === 1 || !unit.magePath
           ? `/sacred/mages/level1.jpg`
           : `/sacred/mages/${unit.magePath}/level${unit.level}.jpg`)
       : null)
    : null

  const pulseClass = isActive
    ? (unit.side === 'player' ? 'unit-active-player' : 'unit-active-ai')
    : isDying ? 'unit-die' : ''

  function handleClick() {
    if (!alive) return
    if (isTargetable) onSelect?.()
    else onInfo?.()
  }

  const outerClass = [
    isShaking  ? 'unit-shake'     : '',
    evadeDodge ? 'unit-evade-dodge' : '',
    buffGlow   ? `unit-buff-${buffGlow}` : '',
  ].filter(Boolean).join(' ') || undefined

  return (
    <div
      data-unit-id={unit.id}
      className={outerClass}
      style={{ flexShrink: 0, width: 80, borderRadius: 8, position: 'relative' }}
    >
      {/* Floats live here — outside overflow:hidden so they show above the card */}
      {floats.filter(f => f.text).map(f => (
        <span key={f.id} className={`float-${f.type}`}>{f.text}</span>
      ))}
      <div
        onClick={handleClick}
        className={pulseClass}
        style={{
          width: 80, height: 88,
          background: portraitSrc ? 'transparent' : (alive ? 'rgba(240,232,216,0.06)' : 'rgba(240,232,216,0.02)'),
          border: `2px solid ${borderColor}`,
          borderRadius: 8,
          cursor: alive ? 'pointer' : 'default',
          opacity: isDying ? 1 : (alive ? 1 : 0.35),
          overflow: 'hidden',
          boxShadow: isTargetable && !isActive ? `0 0 10px 2px ${color}55` : '0 1px 3px rgba(0,0,0,0.08)',
          transition: 'border-color 0.25s, box-shadow 0.25s',
          position: 'relative',
        }}
      >

        {/* Damage card red flash overlay */}
        {hitFlash && (
          <div className="unit-damage-card-overlay"
            style={{ position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none', borderRadius: 6 }} />
        )}

        {/* Miss / evade flash overlay */}
        {(missFlash || evadeDodge) && (
          <div className={missFlash ? 'unit-miss-flash-overlay' : 'unit-evade-flash-overlay'}
            style={{ position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none', borderRadius: 6 }} />
        )}

        {!alive && !isDying && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3, pointerEvents: 'none' }}>
            <span style={{ fontSize: 26, opacity: 0.75, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.9))' }}>✝</span>
          </div>
        )}
        {portraitSrc ? (
          <>
            {/* Full-bleed portrait */}
            <img src={portraitSrc} alt="" className={alive || isDying ? portraitAnimClass : undefined} style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
              filter: (!alive && !isDying) ? 'grayscale(1)' : undefined,
            }} />
            {/* Cast eye glow + particles */}
            {castEffect && alive && (
              <>
                <div className={`cast-eye cast-eye-${castEffect}`} />
                {[0,1,2,3,4].map(i => (
                  <div key={i} className={`cast-spark cast-spark-${i} cast-spark-${castEffect}`} />
                ))}
              </>
            )}
            {/* Gradient overlay for text readability */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.22) 40%, rgba(0,0,0,0.72) 100%)',
            }} />
            {/* Content */}
            <div style={{
              position: 'relative', zIndex: 1, height: '100%',
              display: 'flex', flexDirection: 'column', padding: '5px 5px 5px',
            }}>
              {/* Top row: buff icons + ХОДА badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  {unit.buffs.some(b => b.type !== 'cooldown') && (
                    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                      {unit.buffs.filter(b => b.type !== 'cooldown').map(b => (
                        <span key={b.id} style={{ fontSize: 7, color: '#fff', background: 'rgba(0,0,0,0.45)', borderRadius: 2, padding: '1px 2px' }}>
                          {BUFF_ICON[b.type] ?? '✦'}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  {isActive && (
                    <span style={{ fontSize: 7, color: '#fff', fontWeight: 700, background: 'rgba(176,120,80,0.9)', borderRadius: 3, padding: '1px 4px' }}>
                      ХОДА
                    </span>
                  )}
                </div>
              </div>

              {/* Spacer */}
              <div style={{ flex: 1 }} />

              {/* Bottom: rank name + HP */}
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#fff', lineHeight: 1.2, marginBottom: 3, textShadow: '0 1px 3px rgba(0,0,0,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {unitLevelName ?? unit.name}
                </div>
                {/* HP bar */}
                <div style={{ width: '100%', height: 3, background: 'rgba(255,255,255,0.2)', borderRadius: 2 }}>
                  <div style={{
                    width: `${Math.max(0, unit.hp / unit.maxHp) * 100}%`, height: '100%', borderRadius: 2,
                    background: unit.hp / unit.maxHp > 0.5 ? '#7aaa82' : unit.hp / unit.maxHp > 0.25 ? '#c4a040' : '#c07070',
                    transition: 'width 0.3s',
                  }} />
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Normal card layout for non-warrior units */
          <div style={{ padding: '6px 6px 4px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
              <AvatarSVG color={alive ? color : '#aaa'} size={24} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                {isActive && <span style={{ fontSize: 8, color: '#b07850', fontWeight: 700 }}>ХОДА</span>}
                {isTargetable && !isActive && <span style={{ fontSize: 9, color, fontWeight: 700 }}>➜</span>}
              </div>
            </div>
            <div style={{ fontSize: 9, color: 'rgba(240,232,216,0.45)', lineHeight: 1.2, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {unit.name}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(240,232,216,0.45)', fontVariantNumeric: 'tabular-nums' }}>
              {unit.hp}/{unit.maxHp}
            </div>
            <HpBar hp={unit.hp} maxHp={unit.maxHp} />
            {unit.buffs.some(b => b.type !== 'cooldown') && (
              <div style={{ display: 'flex', gap: 2, marginTop: 3, flexWrap: 'wrap' }}>
                {unit.buffs.filter(b => b.type !== 'cooldown').map(b => (
                  <span key={b.id} style={{ fontSize: 8, padding: '1px 2px', borderRadius: 3, background: 'rgba(240,232,216,0.08)', color: 'rgba(240,232,216,0.5)' }}>
                    {BUFF_ICON[b.type] ?? '✦'}{b.turnsLeft}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Unit row ───────────────────────────────────────────────────────────────────
function UnitRow({ units, side, row, activeId, targetIds, maxSlots, floatsMap, castEffect, onSelectUnit, onInfoUnit }: {
  units: GameUnit[]; side: Side; row: Row; activeId: string | null
  targetIds: string[]; maxSlots: number; floatsMap: Map<string, BattleEvent[]>
  castEffect?: { unitId: string; type: CastEffectType } | null
  onSelectUnit: (id: string) => void; onInfoUnit: (id: string) => void
}) {
  const rowUnits = units.filter(u => u.side === side && u.row === row)
  const catapult = row === 1 ? units.find(u => u.side === side && u.class === 'catapult') : undefined
  const sideColor = SIDE_COLOR[side]

  return (
    <div style={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'center', minHeight: 92 }}>
      {Array.from({ length: maxSlots }, (_, i) => {
        if (catapult && i === 3) {
          const alive = catapult.hp > 0
          return (
            <div key={i} style={{
              width: 80, minHeight: 88, flexShrink: 0,
              border: `2px dashed ${alive ? sideColor + '44' : 'rgba(240,232,216,0.1)'}`,
              borderRadius: 8,
              background: alive ? `${sideColor}06` : 'rgba(240,232,216,0.02)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 4, opacity: alive ? 1 : 0.35,
            }}>
              <CatapultBaseSVG color={alive ? sideColor : '#888'} size={24} />
              <span style={{ fontSize: 7, color: 'rgba(240,232,216,0.35)', fontWeight: 600 }}>База</span>
            </div>
          )
        }
        const unit = rowUnits.find(u => u.slot === i)
        if (!unit) return (
          <div key={i} style={{ width: 80, height: 88, border: '1px dashed rgba(240,232,216,0.08)', borderRadius: 8, flexShrink: 0 }} />
        )
        return (
          <UnitCard key={unit.id} unit={unit}
            isActive={unit.id === activeId}
            isTargetable={targetIds.includes(unit.id)}
            floats={floatsMap.get(unit.id) ?? []}
            castEffect={castEffect?.unitId === unit.id ? castEffect.type : null}
            onSelect={() => onSelectUnit(unit.id)}
            onInfo={() => onInfoUnit(unit.id)}
          />
        )
      })}
    </div>
  )
}

// ── Turn queue ─────────────────────────────────────────────────────────────────
function TurnQueue({ queue, units, currentIdx }: { queue: string[]; units: GameUnit[]; currentIdx: number }) {
  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' } as React.CSSProperties}>
      <div style={{ display: 'flex', gap: 4, padding: '0 4px', width: 'max-content' }}>
        {queue.map((id, i) => {
          const u = units.find(x => x.id === id)
          if (!u || u.hp === 0) return null
          const isCurrent = i === currentIdx
          const portrait  = getPortraitSrc(u)
          const AvatarSVG = CLASS_SVG[u.class]
          return (
            <div key={`${id}-${i}`} style={{
              width: 26, height: 26, borderRadius: 6, flexShrink: 0,
              border: `2px solid ${isCurrent ? '#b07850' : u.side === 'player' ? '#6fa67a' : '#c07070'}`,
              overflow: 'hidden',
              opacity: isCurrent ? 1 : 0.5,
              transition: 'border-color 0.25s, box-shadow 0.25s, opacity 0.25s',
              background: 'rgba(240,232,216,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isCurrent ? '0 0 6px rgba(176,120,80,0.5)' : 'none',
            }}>
              {portrait
                ? <img src={portrait} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
                : <AvatarSVG color={isCurrent ? '#fff' : SIDE_COLOR[u.side]} size={13} />
              }
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Battle log ─────────────────────────────────────────────────────────────────
function BattleLog({ entries }: { entries: LogEntry[] }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [entries.length])

  const typeColor: Record<LogEntry['type'], string> = {
    attack: '#f0e8d8', miss: 'rgba(240,232,216,0.4)', evade: '#6aaed8', crit: '#d4a85a',
    heal: '#7aaa82', buff: '#a080c8', debuff: '#c07070', death: '#c0392b', info: 'rgba(240,232,216,0.28)',
  }

  return (
    <div style={{ height: 110, overflowY: 'auto', padding: '6px 14px', background: '#0a0906', borderTop: '1px solid rgba(240,232,216,0.08)' }}>
      {entries.slice(-40).map(e => (
        <div key={e.id} style={{ fontSize: 11, color: typeColor[e.type], lineHeight: 1.55, marginBottom: 1 }}>
          {e.text}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}

// ── Action button ──────────────────────────────────────────────────────────────
const COOLDOWN_ACTIONS = new Set<ActionKey>(['hurricane', 'armageddon', 'earthquake', 'fortress_aura', 'blizzard', 'fire_orb', 'shkvall', 'double_shot', 'twin_bolt', 'sacred_strike'])

function ActionBtn({ actionKey, selected, onSelect, disabled = false }: {
  actionKey: ActionKey; selected: boolean; onSelect: () => void; disabled?: boolean
}) {
  const def = ACTIONS[actionKey]
  const isUlt = COOLDOWN_ACTIONS.has(actionKey)
  const ultAvailable = isUlt && !disabled
  return (
    <button
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      style={{
        flex: '1 1 calc(50% - 3px)', padding: '8px 10px', borderRadius: 8, textAlign: 'left',
        background: selected ? 'rgba(176,120,80,0.22)' : ultAvailable ? 'rgba(180,40,40,0.15)' : 'rgba(240,232,216,0.05)',
        border: `1px solid ${selected ? '#b07850' : ultAvailable ? '#c03030' : 'rgba(240,232,216,0.1)'}`,
        boxShadow: ultAvailable ? '0 0 8px rgba(200,40,40,0.35)' : 'none',
        color: '#f0e8d8', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1, transition: 'all 0.12s',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600 }}>{def.label}</div>
    </button>
  )
}

// ── Unit info sheet ────────────────────────────────────────────────────────────
const ACTION_EXTRA: Partial<Record<ActionKey, string>> = {
  strike:         'Лише сусідні слоти в тому ж ряду. Переходить у перший доступний ряд ворога.',
  shield:         '+50% броні до кінця цього ходу.',
  battle_cry:     '+25% точності та +10 ініціативи всім союзникам на 1 хід. Стакується.',
  sacred_strike:  '100% влучання, ціль не може ухилитися, знімає всю броню на 3 ходи. Перезарядка 3 ходи.',
  consecration:   '+20–30 HP союзнику. 20% шанс зняти всі дебафи.',
  shot:           'Атакує будь-якого ворога на полі.',
  aim:            'Фіксує +25–40% точності та шанс крита на 2 ходи (крит зростає з рівнем).',
  poison_shot:    'Постріл + накладає отруту: 4 урону на початку кожного ходу цілі (3 ходи). Не стакується.',
  double_shot:    '2 стріли по 75% урону, 90% точн. Друга стріла тільки якщо перша влучила. Кд 3 ходи.',
  chain_lightning: 'Б\'є кожного живого ворога — повний урон кожному.',
  fireball:       '80% влучання. Пасивка: 33% підпал на 2 ходи (15% базового дмг/хід, стакується).',
  fire_orb:       '85% влучання, сплеш 50–75% урону сусідам цілі. Кд 2 ходи.',
  gust:           'Б\'є основну ціль 85% точн., блискавка відскакує з -20% урону. lv2: 1 отскок → lv5: 4 отскоки.',
  hurricane:      '85% влучання, 30–40 урону по ВСІХ ворогах. Кд 4 ходи.',
  barrage:        'Усі 8 сусідів цілі (±ряд, ±слот) отримують 25–50% урону якщо влучив.',
  grapeshot:      'Б\'є всіх ворогів у тому ж ряду що й ціль. Урон -40% для кожного.',
}

const CLASS_ACTIONS_INFO: Record<string, { key: ActionKey; extra?: string }[]> = {
  archer:   [{ key: 'shot' }, { key: 'aim' }],
  mage:     [{ key: 'chain_lightning' }, { key: 'fireball' }],
  catapult: [{ key: 'barrage' }, { key: 'grapeshot' }],
}

function getActionsForSheet(unit: GameUnit): { key: ActionKey; extra?: string }[] {
  if (unit.class === 'warrior') {
    const lvl = unit.level ?? 1
    const lvlActions = lvl >= 3 && unit.warriorPath
      ? WARRIOR_PATHS[unit.warriorPath][lvl]?.actions ?? ['strike']
      : WARRIOR_LEVELS[lvl]?.actions ?? ['strike', 'shield']
    return lvlActions.map(key => ({ key, extra: ACTION_EXTRA[key] }))
  }
  if (unit.class === 'archer') {
    const lvlActions = ARCHER_LEVELS[unit.level ?? 1]?.actions ?? ['shot', 'aim']
    return lvlActions.map(key => ({ key, extra: ACTION_EXTRA[key] }))
  }
  if (unit.class === 'mage') {
    const lvl = unit.level ?? 1
    const actions = lvl === 1 || !unit.magePath
      ? MAGE_BASE.actions
      : MAGE_PATHS[unit.magePath][lvl]?.actions ?? MAGE_BASE.actions
    return actions.map(key => ({ key, extra: ACTION_EXTRA[key] }))
  }
  return (CLASS_ACTIONS_INFO[unit.class] ?? []).map(a => ({ ...a, extra: ACTION_EXTRA[a.key] }))
}

function UnitInfoSheet({ unit, onClose }: { unit: GameUnit; onClose: () => void }) {
  const color = SIDE_COLOR[unit.side]
  const alive = unit.hp > 0
  const AvatarSVG = CLASS_SVG[unit.class]
  const actionsForSheet = getActionsForSheet(unit)
  const sheetPortrait = unit.level
    ? (unit.class === 'warrior'
        ? ((unit.level >= 3 && unit.warriorPath === 'champion')
            ? `/sacred/warriors/champion/level${unit.level}.jpg`
            : `/sacred/warriors/level${Math.min(unit.level, 4)}.jpg`)
     : unit.class === 'archer'  ? `/sacred/archers/level${unit.level}.jpg`
     : unit.class === 'mage'
       ? (unit.level === 1 || !unit.magePath
           ? `/sacred/mages/level1.jpg`
           : `/sacred/mages/${unit.magePath}/level${unit.level}.jpg`)
       : null)
    : null
  const levelName = unit.class === 'warrior' && (unit.level ?? 1) >= 3 && unit.warriorPath
                    ? WARRIOR_PATHS[unit.warriorPath][unit.level ?? 1]?.name
                  : unit.class === 'warrior' ? WARRIOR_LEVELS[unit.level ?? 1]?.name
                  : unit.class === 'archer'  ? ARCHER_LEVELS[unit.level ?? 1]?.name
                  : unit.class === 'mage' && unit.level && unit.level > 1 && unit.magePath
                    ? MAGE_PATHS[unit.magePath][unit.level]?.name
                    : unit.class === 'mage' ? MAGE_BASE.name
                    : undefined
  const maxLevel = unit.class === 'warrior' ? (unit.warriorPath === 'champion' ? 5 : 4) : unit.class === 'archer' ? 3 : unit.class === 'mage' ? 5 : 0
  const nextLvl = (unit.level ?? 1) + 1
  const nextLevelName = unit.class === 'warrior' && nextLvl >= 3 && unit.warriorPath
                        ? WARRIOR_PATHS[unit.warriorPath][nextLvl]?.name
                      : unit.class === 'warrior' ? WARRIOR_LEVELS[nextLvl]?.name
                      : unit.class === 'archer'  ? ARCHER_LEVELS[nextLvl]?.name
                      : unit.class === 'mage' && unit.magePath ? MAGE_PATHS[unit.magePath][nextLvl]?.name
                      : unit.class === 'mage' ? '?'
                      : undefined
  const stats: [string, string][] = [
    ['⚔ Урон', `${unit.minDmg}–${unit.maxDmg}`],
    ['🎯 Точність', `${Math.round(unit.accuracy * 100)}%`],
    ['🛡 Захист', `${Math.round(unit.defense * 100)}%`],
    ['⚡ Ініціатива', `${unit.initiative}`],
    ['👁 Ухилення', `${Math.round(unit.evasion * 100)}%`],
    ['💥 Крит', `${Math.round(unit.critChance * 100)}% ×${unit.critMult}`],
  ]

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 560, maxHeight: '88vh',
        background: '#17150f', borderRadius: '16px 16px 0 0',
        border: `1px solid ${color}44`, borderBottom: 'none',
        zIndex: 51, display: 'flex', flexDirection: 'column',
        fontFamily: "'Inter', sans-serif",
      }}>
        {/* Drag handle + header — fixed */}
        <div style={{ padding: '14px 20px 0', flexShrink: 0 }}>
          <div style={{ width: 36, height: 3, background: 'rgba(240,232,216,0.15)', borderRadius: 2, margin: '0 auto 14px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10, flexShrink: 0,
              background: `${color}18`, border: `1.5px solid ${color}55`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
              {sheetPortrait
                ? <img src={sheetPortrait} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <AvatarSVG color={color} size={26} />
              }
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color, display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                {unit.name}
                {unit.level && levelName && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#b07850' }}>
                    Lv.{unit.level} {levelName}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.4)', marginTop: 1 }}>
                {unit.side === 'player' ? 'Твій юніт' : 'Ворожий юніт'} · {ROW_LABEL[unit.row]} ряд
              </div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: alive ? '#7aaa82' : '#c07070', marginRight: 6 }}>
              {alive ? '● Живий' : '● Загинув'}
            </div>
            <button onClick={onClose} style={{
              width: 28, height: 28, borderRadius: 7, flexShrink: 0,
              background: 'rgba(240,232,216,0.06)', border: '1px solid rgba(240,232,216,0.12)',
              color: 'rgba(240,232,216,0.5)', cursor: 'pointer', fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', padding: '0 20px 36px', flex: 1 }}>

          {/* HP */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(240,232,216,0.45)', marginBottom: 4 }}>
              <span>HP</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{unit.hp} / {unit.maxHp}</span>
            </div>
            <HpBar hp={unit.hp} maxHp={unit.maxHp} />
          </div>

          {/* XP (warriors and archers) */}
          {maxLevel > 0 && (unit.level ?? 1) < maxLevel && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(240,232,216,0.45)', marginBottom: 4 }}>
                <span>XP → {nextLevelName ?? '—'}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{unit.xp ?? 0} / {unit.xpToNext ?? '?'}</span>
              </div>
              <div style={{ width: '100%', height: 4, background: 'rgba(176,120,80,0.15)', borderRadius: 2 }}>
                <div style={{
                  width: `${Math.min(100, ((unit.xp ?? 0) / (unit.xpToNext ?? 1)) * 100)}%`,
                  height: '100%', background: '#b07850', borderRadius: 2, transition: 'width 0.3s',
                }} />
              </div>
            </div>
          )}
          {maxLevel > 0 && (unit.level ?? 1) >= maxLevel && (
            <div style={{ marginBottom: 14, fontSize: 11, color: '#b07850', fontWeight: 600 }}>
              ⭐ Максимальний рівень
            </div>
          )}

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 14 }}>
            {stats.map(([label, value]) => (
              <div key={label} style={{ padding: '7px 10px', borderRadius: 8, background: 'rgba(240,232,216,0.05)', border: '1px solid rgba(240,232,216,0.09)' }}>
                <div style={{ fontSize: 10, color: 'rgba(240,232,216,0.4)' }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#f0e8d8', marginTop: 1 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          {actionsForSheet.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(240,232,216,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>
                Дії
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {actionsForSheet.map(({ key, extra }) => {
                  const def = ACTIONS[key]
                  return (
                    <div key={key} style={{
                      padding: '9px 12px', borderRadius: 9,
                      background: 'rgba(240,232,216,0.05)', border: '1px solid rgba(240,232,216,0.09)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: extra ? 3 : 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#f0e8d8' }}>{def.label}</span>
                        <span style={{ fontSize: 11, color: 'rgba(240,232,216,0.45)' }}>{def.desc}</span>
                      </div>
                      {extra && (
                        <div style={{ fontSize: 10, color: color, opacity: 0.8 }}>{extra}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}


          {/* Active buffs */}
          {unit.buffs.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(240,232,216,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>
                Активні ефекти
              </div>
              {(() => {
                const totalAccDown   = unit.buffs.filter(b => b.type === 'accuracy_down').reduce((s, b) => s + b.value, 0)
                const totalAccUp     = unit.buffs.filter(b => b.type === 'accuracy_up').reduce((s, b) => s + b.value, 0)
                const totalInitDown  = unit.buffs.filter(b => b.type === 'initiative_down').reduce((s, b) => s + b.value, 0)
                const totalInitUp    = unit.buffs.filter(b => b.type === 'initiative_up').reduce((s, b) => s + b.value, 0)
                const totalDefUp     = unit.buffs.filter(b => b.type === 'defense_up').reduce((s, b) => s + b.value, 0)
                const totalWindShield = unit.buffs.filter(b => b.type === 'wind_shield').reduce((s, b) => s + b.value, 0)
                const totalFortress  = unit.buffs.filter(b => b.type === 'fortress_buff').reduce((s, b) => s + b.value, 0)
                const effAcc  = Math.round(Math.min(0.97, unit.accuracy + totalAccUp - totalAccDown) * 100)
                const effInit = unit.initiative + totalInitUp - totalInitDown
                const effDef  = Math.round((unit.defense + totalDefUp + totalFortress) * 100)
                const effEva  = Math.round((unit.evasion + totalWindShield) * 100)
                const buffDesc = (b: typeof unit.buffs[0]) => {
                  switch (b.type) {
                    case 'accuracy_down':  return `−${Math.round(b.value * 100)}% точності → точність: ${effAcc}%`
                    case 'accuracy_up':    return `+${Math.round(b.value * 100)}% точності → точність: ${effAcc}%`
                    case 'initiative_down':return `−${b.value} ініціативи → ініціатива: ${effInit}`
                    case 'initiative_up':  return `+${b.value} ініціативи → ініціатива: ${effInit}`
                    case 'defense_up':     return `+${Math.round(b.value * 100)}% броні → захист: ${effDef}%`
                    case 'wind_shield':    return `+${Math.round(b.value * 100)}% ухил. → ухилення: ${effEva}%`
                    case 'fortress_buff':  return `+${Math.round(b.value * 100)}% броні (форт.) → захист: ${effDef}%`
                    case 'aimed':          return `Прицілення +${Math.round(b.value * 100)}% точн.`
                    case 'morale_up':      return `Бойовий клич: +${b.value} моралі → +${(b.value / 10).toFixed(1)}% точн./ухил.`
                    case 'armor_break':    return `Броня пробита −${Math.round(b.value * 100)}%`
                    case 'poison':         return `Отрута: −${b.value} HP/хід`
                    case 'burning':        return `Горіння: −${b.value} HP/хід`
                    case 'frozen':         return 'Заморожено: пропускає хід'
                    case 'regen':          return `Регенерація: +${b.value} HP/хід`
                    case 'thorns':         return `Тернії: ${b.value} урону у відповідь`
                    case 'cooldown':       return `Перезарядка: ${b.actionKey ?? 'дія'} недоступна`
                    default:               return BUFF_LABEL[b.type] ?? b.type
                  }
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {unit.buffs.map(b => (
                      <div key={b.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 10px', borderRadius: 8,
                        background: 'rgba(240,232,216,0.05)', border: '1px solid rgba(240,232,216,0.09)',
                      }}>
                        <span style={{ fontSize: 14 }}>{BUFF_ICON[b.type] ?? '✦'}</span>
                        <span style={{ fontSize: 12, color: '#f0e8d8', flex: 1 }}>{buffDesc(b)}</span>
                        <span style={{ fontSize: 11, color: 'rgba(240,232,216,0.45)' }}>{b.turnsLeft} хід.</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Landing screen ─────────────────────────────────────────────────────────────
const ALL_PORTRAITS = [
  '/sacred/warriors/level1.jpg',
  '/sacred/warriors/level2.jpg',
  '/sacred/warriors/level3.jpg',
  '/sacred/warriors/level4.jpg',
  '/sacred/warriors/champion/level3.jpg',
  '/sacred/warriors/champion/level4.jpg',
  '/sacred/warriors/champion/level5.jpg',
  '/sacred/archers/level1.jpg',
  '/sacred/archers/level2.jpg',
  '/sacred/archers/level3.jpg',
  '/sacred/mages/level1.jpg',
  '/sacred/mages/fire/level2.jpg',
  '/sacred/mages/fire/level3.jpg',
  '/sacred/mages/fire/level4.jpg',
  '/sacred/mages/fire/level5.jpg',
  '/sacred/mages/air/level2.jpg',
  '/sacred/mages/air/level3.jpg',
  '/sacred/mages/air/level4.jpg',
  '/sacred/mages/air/level5.jpg',
  '/sacred/mages/earth/level2.jpg',
  '/sacred/mages/earth/level3.jpg',
  '/sacred/mages/earth/level4.jpg',
  '/sacred/mages/earth/level5.jpg',
  '/sacred/mages/water/level2.jpg',
  '/sacred/mages/water/level3.jpg',
  '/sacred/mages/water/level4.jpg',
  '/sacred/mages/water/level5.jpg',
  '/sacred/catapults/level1.jpg',
  '/sacred/catapults/ballista/level2.jpg',
  '/sacred/catapults/ballista/level3.jpg',
  '/sacred/catapults/trebuchet/level2.jpg',
  '/sacred/catapults/trebuchet/level3.jpg',
]

function Landing({ onFreeBattle, onQuickTest, onWorldMap, onContinueCampaign, onMapEditor, hasCampaignSave }: {
  onFreeBattle: () => void
  onQuickTest: () => void
  onWorldMap: () => void
  onContinueCampaign: () => void
  onMapEditor: () => void
  hasCampaignSave: boolean
}) {
  const [heroSrc, setHeroSrc] = useState('/sacred/warriors/level4.jpg')
  const portraits = useMemo(() => {
    const arr = [...ALL_PORTRAITS]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }, [])

  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', minHeight: '100vh', background: '#111008',
      color: '#f0e8d8', fontFamily: "'Inter', sans-serif",
      display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
    }}>

      {/* Hero image section */}
      <div style={{ position: 'relative', height: '52vh', minHeight: 260, flexShrink: 0, overflow: 'hidden' }}>
        <img
          src={heroSrc}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(17,16,8,0.15) 0%, transparent 30%, transparent 55%, rgba(17,16,8,0.85) 85%, #111008 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 40%, rgba(17,16,8,0.5) 100%)' }} />

        {/* Logo — top right */}
        <div style={{
          position: 'absolute', top: 16, right: 16,
          filter: [
            'drop-shadow(0 0 72px rgba(212,168,90,0.95))',
            'drop-shadow(0 0 32px rgba(212,168,90,0.7))',
            'drop-shadow(0 0 14px rgba(212,168,90,0.55))',
            'drop-shadow(0 5px 18px rgba(0,0,0,0.98))',
          ].join(' '),
        }}>
          <SeraphLogo size={118} color="#d4a85a" />
        </div>
      </div>

      {/* Horizontal scroll showcase — all portraits, no labels */}
      <div style={{ padding: '14px 0 4px', flexShrink: 0 }}>
        <div style={{
          display: 'flex', gap: 8, overflowX: 'auto', padding: '0 20px 4px',
          scrollbarWidth: 'none', msOverflowStyle: 'none',
        } as React.CSSProperties}>
          {portraits.map((src, i) => (
            <div
              key={i}
              onClick={() => setHeroSrc(src)}
              style={{
                flexShrink: 0, width: 88,
                borderRadius: 10, overflow: 'hidden',
                border: `1px solid ${heroSrc === src ? 'rgba(212,168,90,0.6)' : 'rgba(212,168,90,0.13)'}`,
                cursor: 'pointer', transition: 'border-color 0.15s',
                boxShadow: heroSrc === src ? '0 0 0 2px rgba(212,168,90,0.3)' : 'none',
              }}
            >
              <img src={src} alt="" style={{ width: '100%', height: 112, objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
            </div>
          ))}
        </div>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Buttons */}
      <div style={{ padding: '12px 20px 32px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
        {hasCampaignSave ? (
          <>
            <button onClick={onContinueCampaign} style={{
              padding: '15px 0', fontSize: 15, fontWeight: 700,
              background: 'linear-gradient(135deg, #7a5a30, #4a3018)',
              color: '#f0e8d8', border: '1px solid rgba(212,168,90,0.3)', borderRadius: 12, cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(212,168,90,0.25)',
            }}>
              ✦ Продовжити кампанію
            </button>
            <button onClick={onWorldMap} style={{
              padding: '11px 0', fontSize: 13, fontWeight: 600,
              background: 'transparent', color: 'rgba(240,232,216,0.45)',
              border: '1px solid rgba(240,232,216,0.12)', borderRadius: 10, cursor: 'pointer',
            }}>
              Нова кампанія
            </button>
          </>
        ) : (
          <button onClick={onWorldMap} style={{
            padding: '15px 0', fontSize: 15, fontWeight: 700,
            background: 'linear-gradient(135deg, #7a5a30, #4a3018)',
            color: '#f0e8d8', border: '1px solid rgba(212,168,90,0.3)', borderRadius: 12, cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(212,168,90,0.25)',
          }}>
            ✦ Кампанія
          </button>
        )}
        <button onClick={onFreeBattle} style={{
          padding: '15px 0', fontSize: 15, fontWeight: 700,
          background: 'linear-gradient(135deg, #5a6aa8, #3a4a80)',
          color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(90,106,168,0.4)',
        }}>
          Вільний бій
        </button>
        <button onClick={onQuickTest} style={{
          padding: '10px 0', fontSize: 12, fontWeight: 600,
          background: 'rgba(240,232,216,0.04)',
          color: 'rgba(240,232,216,0.3)', border: '1px solid rgba(240,232,216,0.1)', borderRadius: 10, cursor: 'pointer',
        }}>
          ⚙ Тест-бій
        </button>
        <button onClick={onMapEditor} style={{
          padding: '10px 0', fontSize: 12, fontWeight: 600,
          background: 'rgba(212,168,90,0.06)',
          color: 'rgba(212,168,90,0.55)', border: '1px solid rgba(212,168,90,0.18)', borderRadius: 10, cursor: 'pointer',
        }}>
          🗺 Редактор карт
        </button>
        <div style={{ textAlign: 'center', fontSize: 10, color: 'rgba(240,232,216,0.2)', marginTop: 4 }}>
          v0.9.2
        </div>
      </div>
    </div>
  )
}

// ── Mage path choice modal ────────────────────────────────────────────────────
function MagePathModal({ unit, onChoose }: { unit: GameUnit; onChoose: (path: MagePath) => void }) {
  const paths: MagePath[] = ['fire', 'water', 'earth', 'air']
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 60 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 560, background: '#17150f',
        borderRadius: '18px 18px 0 0', zIndex: 61, padding: '20px 16px 32px',
        fontFamily: "'Inter', sans-serif",
      }}>
        <div style={{ width: 36, height: 3, background: 'rgba(240,232,216,0.15)', borderRadius: 2, margin: '0 auto 14px' }} />
        <div style={{ fontSize: 15, fontWeight: 800, color: '#d4a85a', textAlign: 'center', marginBottom: 16 }}>
          ⭐ {unit.name} — обери шлях
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {paths.map(path => (
            <button key={path} onClick={() => onChoose(path)} style={{
              flex: 1, height: 172, borderRadius: 12, overflow: 'hidden',
              position: 'relative', padding: 0, cursor: 'pointer',
              border: `1.5px solid ${MAGE_PATH_COLOR[path]}66`,
              background: '#0f0e09',
            }}>
              <img
                src={`/sacred/mages/${path}/level2.jpg`}
                alt=""
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }}
              />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 45%, rgba(0,0,0,0.88) 100%)' }} />
              <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center', padding: '0 4px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,1)', lineHeight: 1.3 }}>
                  {MAGE_PATHS[path][2].name}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

// ── Warrior path choice modal ─────────────────────────────────────────────────
function WarriorPathModal({ unit, onChoose }: { unit: GameUnit; onChoose: (path: WarriorPath) => void }) {
  const paths: { path: WarriorPath; label: string; subtitle: string; lvl3name: string; color: string; img: string }[] = [
    { path: 'paladin',  label: 'Шлях Паладіна',  subtitle: 'Захист, лікування, командування', lvl3name: 'Лицар',      color: '#d4a85a', img: '/sacred/warriors/level3.jpg' },
    { path: 'champion', label: 'Шлях Чемпіона',  subtitle: 'Мобільність, урон, контратака',   lvl3name: 'Звитяжець',  color: '#c07070', img: '/sacred/warriors/champion/level3.jpg' },
  ]
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 60 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 560, background: '#17150f',
        borderRadius: '18px 18px 0 0', zIndex: 61, padding: '20px 16px 32px',
        fontFamily: "'Inter', sans-serif",
      }}>
        <div style={{ width: 36, height: 3, background: 'rgba(240,232,216,0.15)', borderRadius: 2, margin: '0 auto 14px' }} />
        <div style={{ fontSize: 15, fontWeight: 800, color: '#d4a85a', textAlign: 'center', marginBottom: 4 }}>⭐ {unit.name} — обери шлях</div>
        <div style={{ fontSize: 12, color: 'rgba(240,232,216,0.4)', textAlign: 'center', marginBottom: 16 }}>Вибір визначає розвиток до lv5</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {paths.map(({ path, label, subtitle, lvl3name, color, img }) => (
            <button key={path} onClick={() => onChoose(path)} style={{
              flex: 1, height: 180, borderRadius: 12, overflow: 'hidden',
              position: 'relative', padding: 0, cursor: 'pointer',
              border: `1.5px solid ${color}55`, background: '#0f0e09',
            }}>
              <img src={img} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 35%, rgba(0,0,0,0.9) 100%)' }} />
              <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center', padding: '0 6px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,1)' }}>{lvl3name}</div>
                <div style={{ fontSize: 9, color: 'rgba(240,232,216,0.55)', marginTop: 2, lineHeight: 1.3 }}>{subtitle}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

// ── Catapult path choice modal ────────────────────────────────────────────────
function CatapultPathModal({ unit, onChoose }: { unit: GameUnit; onChoose: (path: CatapultPath) => void }) {
  const paths: { path: CatapultPath; label: string; subtitle: string; color: string; img: string }[] = [
    { path: 'ballista',  label: 'Балліста',  subtitle: 'Точність, прицільний постріл, Скорпіон б\'є двічі', color: '#4a86a8', img: '/sacred/catapults/ballista/level2.jpg' },
    { path: 'trebuchet', label: 'Требюше',   subtitle: 'Важка артилерія, залп по площі, отрута на lv3',    color: '#8060a8', img: '/sacred/catapults/trebuchet/level2.jpg' },
  ]
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 60 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 560, background: '#17150f',
        borderRadius: '18px 18px 0 0', zIndex: 61, padding: '20px 16px 32px',
        fontFamily: "'Inter', sans-serif",
      }}>
        <div style={{ width: 36, height: 3, background: 'rgba(240,232,216,0.15)', borderRadius: 2, margin: '0 auto 14px' }} />
        <div style={{ fontSize: 15, fontWeight: 800, color: '#d4a85a', textAlign: 'center', marginBottom: 4 }}>⭐ {unit.name} — Еволюція!</div>
        <div style={{ fontSize: 12, color: 'rgba(240,232,216,0.4)', textAlign: 'center', marginBottom: 16 }}>Обери напрямок — це вплине на всі наступні рівні</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {paths.map(({ path, label, subtitle, color, img }) => (
            <button key={path} onClick={() => onChoose(path)} style={{
              flex: 1, height: 180, borderRadius: 12, overflow: 'hidden',
              position: 'relative', padding: 0, cursor: 'pointer',
              border: `1.5px solid ${color}55`, background: '#0f0e09',
            }}>
              <img src={img} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 35%, rgba(0,0,0,0.9) 100%)' }} />
              <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center', padding: '0 6px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 2 }}>{CATAPULT_PATHS[path][2].name}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,1)' }}>{label}</div>
                <div style={{ fontSize: 9, color: 'rgba(240,232,216,0.55)', marginTop: 2, lineHeight: 1.3 }}>{subtitle}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}


const LS_CAMPAIGN_MAP   = 'sacred_campaign_map'
const LS_CAMPAIGN_UNITS = 'sacred_campaign_units'
const LS_CAMPAIGN_DEAD  = 'sacred_campaign_dead'

// ── Battle component ───────────────────────────────────────────────────────────
const ROW_SLOTS: Record<number, number> = { 0: 4, 1: 4 }

function Battle({ counts, playerUnits, prebuiltAiUnits, onRestart, onBattleEnd, fortressLevelCap }: {
  counts: ArmyCounts; playerUnits?: GameUnit[]; prebuiltAiUnits?: GameUnit[]; onRestart: () => void
  onBattleEnd?: (units: GameUnit[], won: boolean) => void
  fortressLevelCap?: number
}) {
  const [state, dispatch] = useReducer(
    battleReducer,
    undefined as unknown as ArmyCounts,
    () => createInitialState(counts, playerUnits, undefined, prebuiltAiUnits, fortressLevelCap),
  )
  const [floats, setFloats]         = useState<BattleEvent[]>([])
  const [infoUnit, setInfoUnit]     = useState<GameUnit | null>(null)
  const [bannerText, setBannerText]   = useState<string | null>(null)
  const [bannerFading, setBannerFading] = useState(false)
  const [toastText, setToastText]     = useState<string | null>(null)
  const [castEffect, setCastEffect]   = useState<{ unitId: string; type: CastEffectType } | null>(null)
  const castEffectTimer = useRef<ReturnType<typeof setTimeout>>()
  const battlefieldRef = useRef<HTMLDivElement>(null)
  const prevPhase  = useRef(state.phase)
  const prevRound  = useRef(state.round)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()

  const actorId = state.queue[state.queueIdx]
  const actor   = state.units.find(u => u.id === actorId && u.hp > 0) ?? null
  const mainActions = actor ? getMainActions(actor.class, actor.level, actor.magePath, actor.catapultPath, actor.warriorPath) : []

  const targetIds = actor && state.selectedAction
    ? getValidTargets(actor, state.selectedAction, state.units)
    : []

  // Accumulate floats
  useEffect(() => {
    if (!state.events.length) return
    const batch = state.events
    setFloats(prev => [...prev, ...batch])
    const ids = new Set(batch.map(e => e.id))
    const t = setTimeout(() => setFloats(prev => prev.filter(f => !ids.has(f.id))), 6000)
    return () => clearTimeout(t)
  }, [state.events])

  const floatsMap = floats.reduce((m, e) => {
    m.set(e.unitId, [...(m.get(e.unitId) ?? []), e])
    return m
  }, new Map<string, BattleEvent[]>())

  // Cast eye effects
  useEffect(() => {
    if (!state.events.length || !state.lastActorId || !state.lastActionKey) return
    const effectType = ACTION_EFFECT_MAP[state.lastActionKey]
    if (!effectType) return
    setCastEffect({ unitId: state.lastActorId, type: effectType })
    clearTimeout(castEffectTimer.current)
    castEffectTimer.current = setTimeout(() => setCastEffect(null), 2600)
  }, [state.events])

  // Turn change banner
  useEffect(() => {
    if (state.phase === 'game-over') { prevPhase.current = state.phase; prevRound.current = state.round; return }
    const phaseChanged = prevPhase.current !== state.phase
    const roundChanged = prevRound.current !== state.round
    prevPhase.current = state.phase
    prevRound.current = state.round
    if (phaseChanged || roundChanged) {
      setBannerFading(false)
      setBannerText(state.phase === 'player-turn' ? '🛡 Твоя черга' : '⚔ Хід ворога')
      const t1 = setTimeout(() => setBannerFading(true), 1800)
      const t2 = setTimeout(() => { setBannerText(null); setBannerFading(false) }, 2400)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
  }, [state.phase, state.round])

  // Toast: last log entry
  useEffect(() => {
    const last = state.log[state.log.length - 1]
    if (!last || last.type === 'info') return
    setToastText(last.text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastText(null), 4200)
  }, [state.log.length])

  // AI turn trigger
  useEffect(() => {
    if (state.phase !== 'ai-thinking') return
    // Block AI while player needs to choose a level-up path
    const pendingPlayerChoice =
      (state.pendingWarriorLevelUp  && state.units.find(u => u.id === state.pendingWarriorLevelUp)?.side  === 'player') ||
      (state.pendingMageLevelUp     && state.units.find(u => u.id === state.pendingMageLevelUp)?.side     === 'player') ||
      (state.pendingCatapultLevelUp && state.units.find(u => u.id === state.pendingCatapultLevelUp)?.side === 'player')
    if (pendingPlayerChoice) return
    const t = setTimeout(() => dispatch({ type: 'AI_TAKE_TURN' }), 1800)
    return () => clearTimeout(t)
  }, [state.phase, state.queueIdx, state.pendingWarriorLevelUp, state.pendingMageLevelUp, state.pendingCatapultLevelUp])

  function handleSelectAction(a: ActionKey) {
    if (state.selectedAction === a) { dispatch({ type: 'CANCEL_ACTION' }); return }
    dispatch({ type: 'SELECT_ACTION', action: a })
  }

  function handleUnitClick(id: string) {
    if (!state.needsTarget) return
    dispatch({ type: 'CONFIRM_TARGET', targetId: id })
  }

  function handleUnitInfo(id: string) {
    setInfoUnit(state.units.find(x => x.id === id) ?? null)
  }

  const isPlayerTurn = state.phase === 'player-turn'
  const bannerBg = state.phase === 'player-turn'
    ? 'rgba(111,166,122,0.95)' : 'rgba(192,112,112,0.95)'

  const pendingWarrior = state.pendingWarriorLevelUp && state.phase !== 'game-over'
    ? state.units.find(u => u.id === state.pendingWarriorLevelUp && u.side === 'player') ?? null
    : null
  const pendingMage = state.pendingMageLevelUp && state.phase !== 'game-over'
    ? state.units.find(u => u.id === state.pendingMageLevelUp && u.side === 'player') ?? null
    : null
  const pendingCatapult = state.pendingCatapultLevelUp && state.phase !== 'game-over'
    ? state.units.find(u => u.id === state.pendingCatapultLevelUp && u.side === 'player') ?? null
    : null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#0f0e09' }}>
    <div style={{
      maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column',
      height: '100%', overflow: 'hidden', color: '#f0e8d8',
      fontFamily: "'Inter', sans-serif",
    }}>

      {/* Turn change banner */}
      {bannerText && (
        <div style={{
          position: 'fixed', top: '42%', left: '50%', zIndex: 40,
          pointerEvents: 'none', padding: '12px 28px', borderRadius: 10,
          background: bannerBg, color: '#fff', fontSize: 17, fontWeight: 700,
          letterSpacing: '-0.01em', boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          animation: bannerFading
            ? 'sacred-banner-out 0.6s ease-in forwards'
            : 'sacred-banner-in 0.525s ease-out forwards',
        }}>
          {bannerText}
        </div>
      )}

      {/* Header — title row + turn queue */}
      <div style={{ borderBottom: '1px solid rgba(240,232,216,0.1)', background: '#17150f', flexShrink: 0 }}>
        <div style={{ padding: '8px 14px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#d4a85a' }}>✦ Серафити</div>
          <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.4)' }}>Раунд {state.round}</div>
        </div>
        <div style={{ padding: '0 14px 6px' }}>
          <TurnQueue queue={state.queue} units={state.units} currentIdx={state.queueIdx} />
        </div>
      </div>

      {/* Battlefield */}
      <div
        ref={battlefieldRef}
        style={{
          flex: 1, minHeight: 0, padding: '8px 10px', display: 'flex', flexDirection: 'column',
          justifyContent: 'center', gap: 4, position: 'relative', overflow: 'hidden',
        }}
      >
        <ProjectileLayer battlefieldRef={battlefieldRef} events={state.events} />

        {/* AI zone — label on left, rows on right, glow when AI is active (F) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            writingMode: 'vertical-lr', transform: 'rotate(180deg)',
            fontSize: 8, fontWeight: 700, letterSpacing: '0.1em',
            color: actor?.side === 'ai' ? 'rgba(192,112,112,0.9)' : 'rgba(192,112,112,0.35)',
            textTransform: 'uppercase', userSelect: 'none', flexShrink: 0,
            transition: 'color 0.4s',
          }}>
            Ворог
          </div>
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', gap: 3,
            borderRadius: 8, padding: '4px',
            boxShadow: actor?.side === 'ai'
              ? '0 0 0 1px rgba(192,112,112,0.25), 0 0 18px 0 rgba(192,112,112,0.18)'
              : 'none',
            transition: 'box-shadow 0.4s',
          }}>
            {([1, 0] as Row[]).map(row => {
              const hasUnits = state.units.some(u => u.side === 'ai' && u.row === row)
              if (!hasUnits) return null
              return (
                <UnitRow key={row}
                  units={state.units} side="ai" row={row}
                  activeId={actor?.side === 'ai' ? actorId : null}
                  targetIds={targetIds} maxSlots={ROW_SLOTS[row]}
                  floatsMap={floatsMap} castEffect={castEffect} onSelectUnit={handleUnitClick} onInfoUnit={handleUnitInfo}
                />
              )
            })}
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid rgba(240,232,216,0.08)', margin: '2px 0', position: 'relative' }}>
          <div style={{ position: 'absolute', left: '50%', top: -9, transform: 'translateX(-50%)', fontSize: 15, background: '#0f0e09', padding: '0 8px', color: 'rgba(240,232,216,0.2)' }}>
            ⚔
          </div>
          <div style={{
            position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 6,
            fontSize: 10, color: 'rgba(240,232,216,0.45)', whiteSpace: 'nowrap',
            pointerEvents: 'none', zIndex: 5,
            opacity: toastText ? 1 : 0, transition: 'opacity 0.35s',
          }}>
            {toastText ?? ' '}
          </div>
        </div>

        {/* Player zone — label on left, rows on right, glow when player is active (F) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            writingMode: 'vertical-lr', transform: 'rotate(180deg)',
            fontSize: 8, fontWeight: 700, letterSpacing: '0.1em',
            color: actor?.side === 'player' ? 'rgba(111,166,122,0.9)' : 'rgba(111,166,122,0.35)',
            textTransform: 'uppercase', userSelect: 'none', flexShrink: 0,
            transition: 'color 0.4s',
          }}>
            Армія
          </div>
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', gap: 3,
            borderRadius: 8, padding: '4px',
            boxShadow: actor?.side === 'player'
              ? '0 0 0 1px rgba(111,166,122,0.25), 0 0 18px 0 rgba(111,166,122,0.18)'
              : 'none',
            transition: 'box-shadow 0.4s',
          }}>
            {([0, 1] as Row[]).map(row => {
              const hasUnits = state.units.some(u => u.side === 'player' && u.row === row)
              if (!hasUnits) return null
              return (
                <UnitRow key={row}
                  units={state.units} side="player" row={row}
                  activeId={actor?.side === 'player' ? actorId : null}
                  targetIds={targetIds} maxSlots={ROW_SLOTS[row]}
                  floatsMap={floatsMap} castEffect={castEffect} onSelectUnit={handleUnitClick} onInfoUnit={handleUnitInfo}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* Bottom panel — part of normal flow, no scroll needed */}
      <div style={{
        flexShrink: 0,
        background: '#17150f', borderTop: '1px solid rgba(240,232,216,0.1)',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.4)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {/* Action area */}
        <div style={{
          height: 162, display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden',
        }}>
        {state.phase === 'game-over' ? (
            <div style={{ padding: '16px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: state.winner === 'player' ? '#7aaa82' : '#c07070', marginBottom: 12 }}>
                {state.winner === 'player' ? '🏆 Перемога!' : '💀 Поразка'}
              </div>
              {onBattleEnd ? (
                <button
                  onClick={() => onBattleEnd(state.units, state.winner === 'player')}
                  style={{ padding: '10px 28px', background: state.winner === 'player' ? '#7aaa82' : '#c07070', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  ← На карту
                </button>
              ) : (
                <button onClick={onRestart}
                  style={{ padding: '10px 28px', background: '#7aaa82', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Новий бій
                </button>
              )}
            </div>

        ) : isPlayerTurn && actor ? (
          <div style={{ padding: '10px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                border: `1.5px solid ${SIDE_COLOR[actor.side]}55`,
                overflow: 'hidden',
              }}>
                {(() => {
                  const src = getPortraitSrc(actor)
                  if (src) return <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
                  const AvatarSVG = CLASS_SVG[actor.class]
                  return AvatarSVG ? <AvatarSVG color={SIDE_COLOR[actor.side]} size={20} /> : null
                })()}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#f0e8d8' }}>{actor.name}</div>
                <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.45)' }}>HP {actor.hp}/{actor.maxHp}</div>
              </div>
              {state.needsTarget && (
                <div style={{ marginLeft: 'auto', fontSize: 12, color: '#b07850', fontWeight: 500 }}>
                  {state.selectedAction === 'twin_bolt' && state.pendingFirstTarget
                    ? 'Обери другу ціль →'
                    : 'Обери ціль →'}
                </div>
              )}
            </div>
            {!state.needsTarget ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <button
                  onClick={() => dispatch({ type: 'ADVANCE_QUEUE' })}
                  style={{ flex: '1 1 calc(50% - 3px)', padding: '8px 10px', background: 'rgba(240,232,216,0.05)', border: '1px solid rgba(240,232,216,0.12)', borderRadius: 8, color: 'rgba(240,232,216,0.4)', cursor: 'pointer', fontSize: 12 }}
                >
                  Пропустити
                </button>
                {mainActions.map(a => {
                  let disabled = false
                  if (a === 'aim' && actor) {
                    disabled = actor.buffs.some(b => b.type === 'aimed')
                  }
                  if (COOLDOWN_ACTIONS.has(a) && actor) {
                    disabled = actor.buffs.some(b => b.type === 'cooldown' && b.actionKey === a)
                  }
                  if (a === 'tailwind' && actor) {
                    disabled = state.units.some(u => u.side === actor.side && u.buffs.some(b => b.type === 'accuracy_up'))
                  }
                  if (a === 'tailwind' && actor) {
                    disabled = state.units.some(u => u.side === actor.side && u.buffs.some(b => b.type === 'accuracy_up'))
                  }
                  return (
                    <ActionBtn key={a} actionKey={a} selected={state.selectedAction === a}
                      onSelect={() => handleSelectAction(a)} disabled={disabled} />
                  )
                })}
              </div>
            ) : (
              <button onClick={() => dispatch({ type: 'CANCEL_ACTION' })}
                style={{ padding: '10px 20px', background: 'rgba(240,232,216,0.06)', border: '1px solid rgba(240,232,216,0.1)', borderRadius: 8, color: 'rgba(240,232,216,0.45)', cursor: 'pointer', fontSize: 13 }}>
                Скасувати
              </button>
            )}
          </div>

        ) : (
          <div style={{ textAlign: 'center', color: 'rgba(240,232,216,0.35)', fontSize: 13 }}>
            {state.phase === 'ai-thinking' ? `${actor?.name ?? 'Ворог'} думає...` : ''}
          </div>
        )}
        </div>

      </div>

      {infoUnit && <UnitInfoSheet unit={infoUnit} onClose={() => setInfoUnit(null)} />}
      {pendingWarrior && (
        <WarriorPathModal
          unit={pendingWarrior}
          onChoose={path => dispatch({ type: 'CHOOSE_WARRIOR_PATH', unitId: pendingWarrior.id, path })}
        />
      )}
      {pendingMage && (
        <MagePathModal
          unit={pendingMage}
          onChoose={path => dispatch({ type: 'CHOOSE_MAGE_PATH', unitId: pendingMage.id, path })}
        />
      )}
      {pendingCatapult && (
        <CatapultPathModal
          unit={pendingCatapult}
          onChoose={path => dispatch({ type: 'CHOOSE_CATAPULT_PATH', unitId: pendingCatapult.id, path })}
        />
      )}
    </div>
    </div>
  )
}


// ── Root component ─────────────────────────────────────────────────────────────
type RootScreen = 'landing' | 'army-builder' | 'placement' | 'battle' | 'free-battle' | 'world-map' | 'world-battle' | 'campaign-victory'

export default function SacredGame() {
  const router = useRouter()
  const [screen, setScreen] = useState<RootScreen>('landing')
  const [counts, setCounts] = useState<ArmyCounts | null>(null)
  const [playerUnits, setPlayerUnits] = useState<GameUnit[] | null>(null)
  const [freeBattleAiUnits, setFreeBattleAiUnits] = useState<GameUnit[] | null>(null)
  const [territoryState, setTerritoryState] = useState<TerritoryMapState>(createInitialTerritoryState)
  const [worldPlayerUnits, setWorldPlayerUnits] = useState<GameUnit[] | null>(null)
  const [worldDeadUnits, setWorldDeadUnits] = useState<GameUnit[]>([])
  const [worldFightTerritoryId, setWorldFightTerritoryId] = useState<string | null>(null)
  const [worldBattleResult, setWorldBattleResult] = useState<WorldBattleResult | null>(null)
  const [hasCampaignSave, setHasCampaignSave] = useState(false)
  const worldPreBattleUnits = useRef<GameUnit[] | null>(null)

  useEffect(() => {
    try {
      setHasCampaignSave(
        !!localStorage.getItem(LS_CAMPAIGN_MAP) && !!localStorage.getItem(LS_CAMPAIGN_UNITS)
      )
    } catch {}
  }, [])

  useEffect(() => {
    if (!worldPlayerUnits) return
    try {
      localStorage.setItem(LS_CAMPAIGN_MAP,   JSON.stringify(territoryState))
      localStorage.setItem(LS_CAMPAIGN_UNITS, JSON.stringify(worldPlayerUnits))
      localStorage.setItem(LS_CAMPAIGN_DEAD,  JSON.stringify(worldDeadUnits))
      setHasCampaignSave(true)
    } catch {}
  }, [territoryState, worldPlayerUnits, worldDeadUnits])

  function clearCampaignSave() {
    try {
      localStorage.removeItem(LS_CAMPAIGN_MAP)
      localStorage.removeItem(LS_CAMPAIGN_UNITS)
      localStorage.removeItem(LS_CAMPAIGN_DEAD)
    } catch {}
    setHasCampaignSave(false)
  }

  function handleContinueCampaign() {
    try {
      const mapData   = JSON.parse(localStorage.getItem(LS_CAMPAIGN_MAP)   ?? '')
      const unitsData = JSON.parse(localStorage.getItem(LS_CAMPAIGN_UNITS) ?? '')
      const deadData  = JSON.parse(localStorage.getItem(LS_CAMPAIGN_DEAD)  ?? '[]')
      if (!mapData.armyNodeId) mapData.armyNodeId = 'dans'
      if (!mapData.fortressLevel) mapData.fortressLevel = 1
      if (mapData.ap === undefined) mapData.ap = 2
      setTerritoryState(mapData)
      setWorldPlayerUnits(unitsData)
      setWorldDeadUnits(Array.isArray(deadData) ? deadData : [])
      setScreen('world-map')
    } catch {
      handleWorldMap()
    }
  }

  function handleFreeBattle() {
    setScreen('free-battle')
  }

  function handleQuickTest() {
    const pUnits = buildCustomArmy({ warriors: 2, archers: 1, mages: 1, catapults: 1 }, 'player')
    const aUnits = buildCustomArmy({ warriors: 3, archers: 1, mages: 1, catapults: 0 }, 'ai')
    setPlayerUnits(pUnits)
    setFreeBattleAiUnits(aUnits)
    setCounts({ warriors: 0, archers: 0, mages: 0, catapults: 0 })
    setScreen('battle')
  }

  function handleFreeBattleStart(pUnits: GameUnit[], aUnits: GameUnit[]) {
    setPlayerUnits(pUnits)
    setFreeBattleAiUnits(aUnits)
    setCounts({ warriors: 0, archers: 0, mages: 0, catapults: 0 })
    setScreen('battle')
  }

  function handleWorldMap() {
    clearCampaignSave()
    setTerritoryState(createInitialTerritoryState())
    setWorldPlayerUnits([])
    setWorldDeadUnits([])
    setScreen('world-map')
  }

  function handleTerritoryMove(territoryId: string) {
    setTerritoryState(prev => ({
      ...prev,
      armyNodeId: territoryId,
      ap: prev.ap - 1,
    }))
  }

  function handleTerritoryAttack(territoryId: string) {
    worldPreBattleUnits.current = worldPlayerUnits
    setWorldFightTerritoryId(territoryId)
    setTerritoryState(prev => ({ ...prev, ap: prev.ap - 1 }))
    setScreen('world-battle')
  }

  function handleTerritoryBattleEnd(units: GameUnit[], won: boolean) {
    const survived = units.filter(u => u.hp > 0 && u.side === 'player').map(u => ({ ...u, buffs: [] }))
    const fallen   = units.filter(u => u.hp <= 0 && u.side === 'player').map(u => ({ ...u, buffs: [] }))
    setWorldPlayerUnits(survived)
    setWorldDeadUnits(prev => [...prev, ...fallen])

    const territory  = worldFightTerritoryId ? getTerritoryById(worldFightTerritoryId) : null
    const goldGained = won ? (territory?.goldReward ?? 0) : 0

    const levelUps: string[] = []
    if (won && worldPreBattleUnits.current) {
      for (const u of survived) {
        const prev = worldPreBattleUnits.current.find(p => p.id === u.id)
        if (prev && (u.level ?? 1) > (prev.level ?? 1)) levelUps.push(u.name)
      }
    }

    const fightId = worldFightTerritoryId
    if (won && fightId) {
      setTerritoryState(prev => ({
        ...prev,
        ownership:  { ...prev.ownership, [fightId]: 'player' },
        gold:       prev.gold + goldGained,
        armyNodeId: fightId,
      }))
    }

    if (goldGained > 0 || levelUps.length > 0) {
      setWorldBattleResult({ gold: goldGained, levelUps })
    }

    worldPreBattleUnits.current = null
    setWorldFightTerritoryId(null)

    if (won && fightId === 'bebe') {
      setScreen('campaign-victory')
    } else {
      setScreen('world-map')
    }
  }

  function handleHireUnit(unitClass: UnitClass, row: number, slot: number) {
    if (!worldPlayerUnits) return
    const cost = HIRE_COSTS[unitClass]
    if (territoryState.gold < cost) return
    setWorldPlayerUnits(addUnitAtSlot(worldPlayerUnits, unitClass, row, slot))
    setTerritoryState(prev => ({ ...prev, gold: prev.gold - cost }))
  }

  function handleReorderWorldUnits(id1: string, id2: string) {
    setWorldPlayerUnits(prev => {
      if (!prev) return prev
      const u1 = prev.find(u => u.id === id1)
      const u2 = prev.find(u => u.id === id2)
      if (!u1 || !u2) return prev
      return prev.map(u => {
        if (u.id === id1) return { ...u, row: u2.row, slot: u2.slot }
        if (u.id === id2) return { ...u, row: u1.row, slot: u1.slot }
        return u
      })
    })
  }

  function handleMoveWorldUnitSlot(id: string, row: number, slot: number) {
    setWorldPlayerUnits(prev => {
      if (!prev) return prev
      return prev.map(u => u.id === id ? { ...u, row: row as Row, slot } : u)
    })
  }

  function handleRest() {
    const atDans = territoryState.armyNodeId === 'dans'
    if (!atDans && territoryState.gold < 1) return
    setWorldPlayerUnits(prev => prev?.map(u => ({ ...u, hp: u.maxHp })) ?? prev)
    setTerritoryState(prev => ({
      ...prev,
      gold:           atDans ? prev.gold : prev.gold - 1,
      restedThisTurn: true,
    }))
  }

  function handleUpgradeFortress() {
    const { fortressLevel, gold } = territoryState
    if (fortressLevel >= 5) return
    const cost = FORTRESS_UPGRADE_COST[fortressLevel + 1]
    if (gold < cost) return
    setTerritoryState(prev => ({
      ...prev,
      gold:          prev.gold - cost,
      fortressLevel: (prev.fortressLevel + 1) as 1 | 2 | 3 | 4 | 5,
    }))
  }

  function handlePurchaseSlot() {
    const { maxArmySlots, gold } = territoryState
    if (maxArmySlots >= 8) return
    const cost = SLOT_COSTS[maxArmySlots]
    if (!cost || gold < cost) return
    setTerritoryState(prev => ({ ...prev, gold: prev.gold - cost, maxArmySlots: prev.maxArmySlots + 1 }))
  }

  function handleReviveUnit(id: string) {
    const unit = worldDeadUnits.find(u => u.id === id)
    if (!unit) return
    const cost = getReviveCost(unit)
    if (territoryState.gold < cost) return
    setWorldDeadUnits(prev => prev.filter(u => u.id !== id))
    setWorldPlayerUnits(prev => prev ? [...prev, { ...unit, hp: Math.round(unit.maxHp * 0.5) }] : [{ ...unit, hp: Math.round(unit.maxHp * 0.5) }])
    setTerritoryState(prev => ({ ...prev, gold: prev.gold - cost }))
  }

  function handleWorldEndTurn() {
    const ownedCount = Object.values(territoryState.ownership).filter(o => o === 'player').length
    setTerritoryState(prev => ({
      ...prev,
      turn:           prev.turn + 1,
      ap:             2,
      restedThisTurn: false,
      gold:           prev.gold + ownedCount,
    }))
  }

  function handleArmyBuilt(c: ArmyCounts) {
    setCounts(c)
    setScreen('placement')
  }

  function handlePlacementDone(units: GameUnit[]) {
    setPlayerUnits(units)
    setScreen('battle')
  }

  if (screen === 'landing') return (
    <Landing
      onFreeBattle={handleFreeBattle}
      onQuickTest={handleQuickTest}
      onWorldMap={handleWorldMap}
      onContinueCampaign={handleContinueCampaign}
      onMapEditor={() => router.push('/sacred/map-editor')}
      hasCampaignSave={hasCampaignSave}
    />
  )
  if (screen === 'world-map') return (
    <WorldMap
      mapState={territoryState}
      playerUnits={worldPlayerUnits ?? []}
      deadUnits={worldDeadUnits}
      battleResult={worldBattleResult}
      onClearBattleResult={() => setWorldBattleResult(null)}
      onMove={handleTerritoryMove}
      onAttack={handleTerritoryAttack}
      onEndTurn={handleWorldEndTurn}
      onRest={handleRest}
      onBack={() => setScreen('landing')}
      onHireUnit={handleHireUnit}
      onReorderUnits={handleReorderWorldUnits}
      onMoveUnitSlot={handleMoveWorldUnitSlot}
      onUpgradeFortress={handleUpgradeFortress}
      onPurchaseSlot={handlePurchaseSlot}
      onReviveUnit={handleReviveUnit}
    />
  )
  if (screen === 'world-battle') {
    const territory = worldFightTerritoryId ? getTerritoryById(worldFightTerritoryId) : null
    if (territory && worldPlayerUnits) return (
      <Battle
        counts={{ warriors: 0, archers: 0, mages: 0, catapults: 0 }}
        playerUnits={worldPlayerUnits}
        prebuiltAiUnits={buildArmyFromSpecs(territory.army, 'ai')}
        fortressLevelCap={territoryState.fortressLevel}
        onRestart={() => handleTerritoryBattleEnd(worldPlayerUnits, false)}
        onBattleEnd={handleTerritoryBattleEnd}
      />
    )
    return null
  }
  if (screen === 'campaign-victory') {
    const playerCount = Object.values(territoryState.ownership).filter(o => o === 'player').length
    const alive = (worldPlayerUnits ?? []).length
    return (
      <div style={{
        maxWidth: 560, margin: '0 auto', minHeight: '100vh', background: '#0f0e09',
        color: '#f0e8d8', fontFamily: "'Inter', sans-serif",
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '32px 24px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🏆</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#d4a85a', marginBottom: 6 }}>Кампанію завершено!</div>
        <div style={{ fontSize: 13, color: 'rgba(240,232,216,0.45)', marginBottom: 32 }}>
          Бебе впало. Світ вільний.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%', maxWidth: 320, marginBottom: 32 }}>
          {[
            ['Ходів витрачено', territoryState.turn],
            ['Золото зібрано', `${territoryState.gold} 💰`],
            ['Регіонів захоплено', `${playerCount}/${TERRITORIES.length}`],
            ['Юнітів вижило', alive],
          ].map(([label, value]) => (
            <div key={label as string} style={{
              padding: '12px 14px', borderRadius: 10,
              background: 'rgba(212,168,90,0.08)', border: '1px solid rgba(212,168,90,0.2)',
            }}>
              <div style={{ fontSize: 10, color: 'rgba(240,232,216,0.4)', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#d4a85a' }}>{value}</div>
            </div>
          ))}
        </div>
        {(worldPlayerUnits ?? []).length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 32, justifyContent: 'center' }}>
            {(worldPlayerUnits ?? []).map(u => {
              const lvl = u.level ?? 1
              const src = u.class === 'warrior'
                ? (lvl >= 3 && u.warriorPath === 'champion'
                    ? `/sacred/warriors/champion/level${lvl}.jpg`
                    : `/sacred/warriors/level${Math.min(lvl, 4)}.jpg`)
                : u.class === 'archer' ? `/sacred/archers/level${lvl}.jpg`
                : u.class === 'mage' && u.magePath && lvl > 1 ? `/sacred/mages/${u.magePath}/level${lvl}.jpg`
                : '/sacred/mages/level1.jpg'
              return (
                <div key={u.id} style={{ width: 50, height: 58, borderRadius: 10, overflow: 'hidden', border: '1.5px solid rgba(212,168,90,0.35)' }}>
                  <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
                </div>
              )
            })}
          </div>
        )}
        <button
          onClick={() => { clearCampaignSave(); setTerritoryState(createInitialTerritoryState()); setWorldPlayerUnits(null); setScreen('landing') }}
          style={{
            padding: '14px 36px', background: '#d4a85a', color: '#0f0e09',
            border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}
        >
          ← До меню
        </button>
      </div>
    )
  }

  if (screen === 'free-battle') return (
    <FreeBattleSetup
      onStart={handleFreeBattleStart}
      onBack={() => setScreen('landing')}
    />
  )
  if (screen === 'army-builder') return (
    <ArmyBuilder onStart={handleArmyBuilt} />
  )
  if (screen === 'placement') return (
    <PlacementScreen
      counts={counts!}
      onStart={handlePlacementDone}
      onBack={() => setScreen('army-builder')}
    />
  )
  return <Battle counts={counts!} playerUnits={playerUnits ?? undefined} prebuiltAiUnits={freeBattleAiUnits ?? undefined} onRestart={() => setScreen('landing')} />
}
