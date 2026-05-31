'use client'

import { useReducer, useEffect, useRef, useState, useMemo } from 'react'
import {
  createInitialState, battleReducer, getMainActions, getValidTargets, ACTIONS, buildCustomArmy,
  generateRecruitOptions, addUnitToArmy,
} from '@/lib/sacred/game'
import type { GameUnit, ActionKey, Side, Row, LogEntry, ArmyCounts, BattleEvent, BattleAction, TowerFloor, MagePath, UnitClass, CatapultPath } from '@/lib/sacred/types'
import { WARRIOR_LEVELS, ARCHER_LEVELS, MAGE_BASE, MAGE_PATHS, CATAPULT_PATHS, TOWER_FLOORS } from '@/lib/sacred/types'
import ArmyBuilder from './ArmyBuilder'
import PlacementScreen from './PlacementScreen'
import FreeBattleSetup from './FreeBattleSetup'
import WorldMap from './WorldMap'
import { createInitialMapState, getPathCost, WORLD_NODES } from '@/lib/sacred/worldMap'
import type { WorldMapState } from '@/lib/sacred/worldMap'

type WorldBattleResult = { gold: number; levelUps: string[] }

const SIDE_COLOR: Record<Side, string> = { player: '#7aaa82', ai: '#c07070' }
const ROW_LABEL: Record<number, string> = { 0: 'Передній', 1: 'Дальній', 2: 'Підтримка' }
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
  taunt: '🗣',
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
  if (unit.class === 'warrior') return `/sacred/warriors/level${lvl}.jpg`
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
function UnitCard({ unit, isActive, isTargetable, onSelect, onInfo, floats }: {
  unit: GameUnit; isActive: boolean; isTargetable: boolean
  onSelect?: () => void; onInfo?: () => void
  floats: BattleEvent[]
}) {
  const [isShaking, setIsShaking] = useState(false)
  const [isDying,   setIsDying]   = useState(false)
  const lastDmgId = useRef(0)
  const prevHp    = useRef(unit.hp)

  useEffect(() => {
    const maxId = floats
      .filter(f => f.type === 'damage' || f.type === 'crit')
      .reduce((m, f) => Math.max(m, f.id), 0)
    if (maxId > lastDmgId.current) {
      lastDmgId.current = maxId
      setIsShaking(true)
      const t = setTimeout(() => setIsShaking(false), 450)
      return () => clearTimeout(t)
    }
  }, [floats])

  useEffect(() => {
    if (prevHp.current > 0 && unit.hp === 0) setIsDying(true)
    prevHp.current = unit.hp
  }, [unit.hp])

  const alive = unit.hp > 0
  const color  = SIDE_COLOR[unit.side]
  const borderColor = isActive ? '#b07850' : isTargetable ? color : 'rgba(240,232,216,0.14)'
  const AvatarSVG = CLASS_SVG[unit.class]
  const unitLevelName = unit.class === 'warrior' ? WARRIOR_LEVELS[unit.level ?? 1]?.name
                      : unit.class === 'archer'  ? ARCHER_LEVELS[unit.level ?? 1]?.name
                      : unit.class === 'mage' && unit.level && unit.level > 1 && unit.magePath
                        ? MAGE_PATHS[unit.magePath][unit.level]?.name
                        : unit.class === 'mage' ? MAGE_BASE.name
                        : undefined
  const portraitSrc = unit.level
    ? (unit.class === 'warrior' ? `/sacred/warriors/level${unit.level}.jpg`
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

  return (
    <div
      data-unit-id={unit.id}
      className={isShaking ? 'unit-shake' : ''}
      style={{ flexShrink: 0, width: 68 }}
    >
      <div
        onClick={handleClick}
        className={pulseClass}
        style={{
          width: 68, height: 80,
          background: portraitSrc ? 'transparent' : (alive ? 'rgba(240,232,216,0.06)' : 'rgba(240,232,216,0.02)'),
          border: `2px solid ${borderColor}`,
          borderRadius: 8,
          cursor: alive ? 'pointer' : 'default',
          opacity: alive ? 1 : 0.35,
          overflow: 'hidden',
          transform: isActive ? 'scale(1.06)' : isTargetable ? 'scale(1.03)' : 'scale(1)',
          boxShadow: isTargetable && !isActive ? `0 2px 8px ${color}44` : '0 1px 3px rgba(0,0,0,0.08)',
          transition: 'border-color 0.15s, transform 0.1s',
          position: 'relative',
        }}
      >
        {floats.map(f => (
          <span key={f.id} className={`float-${f.type}`}>{f.text}</span>
        ))}

        {portraitSrc ? (
          <>
            {/* Full-bleed portrait */}
            <img src={portraitSrc} alt="" style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
            }} />
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
                  {unit.buffs.length > 0 && (
                    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                      {unit.buffs.map(b => (
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
                {/* XP bar */}
                {unit.xpToNext !== undefined && unit.xpToNext !== Infinity && (
                  <div style={{ width: '100%', height: 3, background: 'rgba(176,120,80,0.3)', borderRadius: 2, marginTop: 2 }}>
                    <div style={{
                      width: `${Math.min(100, ((unit.xp ?? 0) / (unit.xpToNext ?? 1)) * 100)}%`,
                      height: '100%', background: '#b07850', borderRadius: 2, transition: 'width 0.4s',
                      boxShadow: '0 0 4px rgba(176,120,80,0.6)',
                    }} />
                  </div>
                )}
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
            {unit.buffs.length > 0 && (
              <div style={{ display: 'flex', gap: 2, marginTop: 3, flexWrap: 'wrap' }}>
                {unit.buffs.map(b => (
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
function UnitRow({ units, side, row, activeId, targetIds, maxSlots, floatsMap, onSelectUnit, onInfoUnit }: {
  units: GameUnit[]; side: Side; row: Row; activeId: string | null
  targetIds: string[]; maxSlots: number; floatsMap: Map<string, BattleEvent[]>
  onSelectUnit: (id: string) => void; onInfoUnit: (id: string) => void
}) {
  const rowUnits = units.filter(u => u.side === side && u.row === row)
  const catapult = row === 2 ? units.find(u => u.side === side && u.class === 'catapult') : undefined
  const sideColor = SIDE_COLOR[side]

  return (
    <div style={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'center', minHeight: 82 }}>
      {Array.from({ length: maxSlots }, (_, i) => {
        if (catapult && i === 2) {
          const alive = catapult.hp > 0
          return (
            <div key={i} style={{
              width: 68, minHeight: 76, flexShrink: 0,
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
          <div key={i} style={{ width: 68, height: 76, border: '1px dashed rgba(240,232,216,0.08)', borderRadius: 8, flexShrink: 0 }} />
        )
        return (
          <UnitCard key={unit.id} unit={unit}
            isActive={unit.id === activeId}
            isTargetable={targetIds.includes(unit.id)}
            floats={floatsMap.get(unit.id) ?? []}
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
              width: 32, height: 32, borderRadius: 7, flexShrink: 0,
              border: `2px solid ${isCurrent ? '#b07850' : u.side === 'player' ? '#6fa67a' : '#c07070'}`,
              overflow: 'hidden',
              opacity: isCurrent ? 1 : 0.55,
              transform: isCurrent ? 'scale(1.2)' : 'scale(1)',
              transition: 'transform 0.2s',
              background: 'rgba(240,232,216,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isCurrent ? '0 0 8px rgba(176,120,80,0.5)' : 'none',
            }}>
              {portrait
                ? <img src={portrait} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
                : <AvatarSVG color={isCurrent ? '#fff' : SIDE_COLOR[u.side]} size={16} />
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
function ActionBtn({ actionKey, selected, onSelect, disabled = false }: {
  actionKey: ActionKey; selected: boolean; onSelect: () => void; disabled?: boolean
}) {
  const def = ACTIONS[actionKey]
  return (
    <button
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      style={{
        flex: '1 1 calc(50% - 4px)', padding: '9px 11px', borderRadius: 8, textAlign: 'left',
        background: selected ? 'rgba(176,120,80,0.22)' : 'rgba(240,232,216,0.05)',
        border: `1px solid ${selected ? '#b07850' : 'rgba(240,232,216,0.1)'}`,
        color: '#f0e8d8', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1, transition: 'all 0.12s',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{def.label}</div>
      <div style={{ fontSize: 9, color: 'rgba(240,232,216,0.45)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{def.desc}</div>
    </button>
  )
}

// ── Unit info sheet ────────────────────────────────────────────────────────────
const ACTION_EXTRA: Partial<Record<ActionKey, string>> = {
  strike:         'Лише сусідні слоти в тому ж ряду. Переходить у перший доступний ряд ворога.',
  shield:         '+50% броні до кінця цього ходу.',
  battle_cry:     '+15 моралі всім союзникам на 2 ходи. +1% точн./ухил. на кожні 10 моралі.',
  sacred_strike:  'Удар по сусідньому юніту + -10% броні цілі на 1 хід.',
  consecration:   '+15 HP та знімає дебафи з союзника.',
  shot:           'Атакує будь-якого ворога на полі.',
  aim:            'Фіксує +25–40% точності та шанс крита на 2 ходи (крит зростає з рівнем).',
  poison_shot:    'Постріл + накладає отруту: 4 урону на початку кожного ходу цілі (3 ходи). Не стакується.',
  double_shot:    'Дві стріли в одній дії. Кожна перевіряється окремо. Друга -15% точності.',
  chain_lightning: 'Б\'є кожного живого ворога — повний урон кожному.',
  fireball:       'Потрійний урон по одній цілі. Точність та ухилення застосовуються.',
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
    const lvlActions = WARRIOR_LEVELS[unit.level ?? 1]?.actions ?? ['strike', 'shield']
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
    ? (unit.class === 'warrior' ? `/sacred/warriors/level${unit.level}.jpg`
     : unit.class === 'archer'  ? `/sacred/archers/level${unit.level}.jpg`
     : unit.class === 'mage'
       ? (unit.level === 1 || !unit.magePath
           ? `/sacred/mages/level1.jpg`
           : `/sacred/mages/${unit.magePath}/level${unit.level}.jpg`)
       : null)
    : null
  const levelName = unit.class === 'warrior' ? WARRIOR_LEVELS[unit.level ?? 1]?.name
                  : unit.class === 'archer'  ? ARCHER_LEVELS[unit.level ?? 1]?.name
                  : unit.class === 'mage' && unit.level && unit.level > 1 && unit.magePath
                    ? MAGE_PATHS[unit.magePath][unit.level]?.name
                    : unit.class === 'mage' ? MAGE_BASE.name
                    : undefined
  const maxLevel = unit.class === 'warrior' ? 4 : unit.class === 'archer' ? 3 : unit.class === 'mage' ? 5 : 0
  const nextLevelName = unit.class === 'warrior' ? WARRIOR_LEVELS[(unit.level ?? 1) + 1]?.name
                      : unit.class === 'archer'  ? ARCHER_LEVELS[(unit.level ?? 1) + 1]?.name
                      : unit.class === 'mage' && unit.magePath ? MAGE_PATHS[unit.magePath][(unit.level ?? 1) + 1]?.name
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {unit.buffs.map(b => (
                  <div key={b.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', borderRadius: 8,
                    background: 'rgba(240,232,216,0.05)', border: '1px solid rgba(240,232,216,0.09)',
                  }}>
                    <span style={{ fontSize: 14 }}>{BUFF_ICON[b.type] ?? '✦'}</span>
                    <span style={{ fontSize: 12, color: '#f0e8d8', flex: 1 }}>
                      {b.type === 'aimed'
                        ? `Прицілення +${Math.round(b.value * 100)}% точн.`
                        : b.type === 'morale_up'
                          ? `Бойовий клич: +${b.value} моралі → +${(b.value / 10).toFixed(1)}% точн./ухил.`
                          : b.type === 'armor_break'
                            ? `-${Math.round(b.value * 100)}% броні цілі`
                            : b.type === 'poison'
                              ? `Отрута: -${b.value} HP/хід`
                              : (BUFF_LABEL[b.type] ?? b.type)}
                    </span>
                    <span style={{ fontSize: 11, color: 'rgba(240,232,216,0.45)' }}>{b.turnsLeft} хід.</span>
                  </div>
                ))}
              </div>
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

function Landing({ onStartTower, onContinueTower, savedTowerFloor, onFreeBattle, onWorldMap }: {
  onStartTower: () => void
  onContinueTower: () => void
  savedTowerFloor: number | null
  onFreeBattle: () => void
  onWorldMap: () => void
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
        <button onClick={onWorldMap} style={{
          padding: '15px 0', fontSize: 15, fontWeight: 700,
          background: 'linear-gradient(135deg, #7a5a30, #4a3018)',
          color: '#f0e8d8', border: '1px solid rgba(212,168,90,0.3)', borderRadius: 12, cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(212,168,90,0.25)',
        }}>
          ✦ Кампанія
        </button>
        <button onClick={onFreeBattle} style={{
          padding: '15px 0', fontSize: 15, fontWeight: 700,
          background: 'linear-gradient(135deg, #5a6aa8, #3a4a80)',
          color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(90,106,168,0.4)',
        }}>
          Вільний бій
        </button>

        {savedTowerFloor ? (
          <>
            <button onClick={onContinueTower} style={{
              padding: '15px 0', fontSize: 15, fontWeight: 700,
              background: 'linear-gradient(135deg, #4a7a5a, #2e5c3e)',
              color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(74,122,90,0.4)',
            }}>
              Продовжити тауер ({savedTowerFloor}/{TOWER_FLOORS.length})
            </button>
            <button onClick={onStartTower} style={{
              padding: '11px 0', fontSize: 13, fontWeight: 600,
              background: 'transparent', color: 'rgba(240,232,216,0.45)',
              border: '1px solid rgba(240,232,216,0.12)', borderRadius: 10, cursor: 'pointer',
            }}>
              Новий тауер
            </button>
          </>
        ) : (
          <button onClick={onStartTower} style={{
            padding: '15px 0', fontSize: 15, fontWeight: 700,
            background: 'linear-gradient(135deg, #4a7a5a, #2e5c3e)',
            color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(74,122,90,0.4)',
          }}>
            Тауер
          </button>
        )}
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

// ── Catapult path choice modal ────────────────────────────────────────────────
function CatapultPathModal({ unit, onChoose }: { unit: GameUnit; onChoose: (path: CatapultPath) => void }) {
  const paths: CatapultPath[] = ['ballista', 'trebuchet']
  const pathIcon: Record<CatapultPath, string> = { ballista: '🏹', trebuchet: '⚙' }
  const pathColor: Record<CatapultPath, string> = { ballista: '#4a86a8', trebuchet: '#8060a8' }
  const pathDesc: Record<CatapultPath, string> = {
    ballista:  'Точність і швидкість. Прицільний постріл (95% точн.), Скорпіон б\'є двічі по різних цілях.',
    trebuchet: 'Важка артилерія. Залп по площі + 60% урону сусідам. Чумний Требюше отруює всіх уражених.',
  }
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 60 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 560, background: '#17150f',
        borderRadius: '18px 18px 0 0', zIndex: 61, padding: '20px 20px 32px',
        fontFamily: "'Inter', sans-serif",
      }}>
        <div style={{ width: 36, height: 3, background: 'rgba(240,232,216,0.15)', borderRadius: 2, margin: '0 auto 16px' }} />
        <div style={{ fontSize: 16, fontWeight: 800, color: '#d4a85a', textAlign: 'center', marginBottom: 4 }}>
          ⭐ {unit.name} — Еволюція!
        </div>
        <div style={{ fontSize: 12, color: 'rgba(240,232,216,0.45)', textAlign: 'center', marginBottom: 18 }}>
          Обери напрямок розвитку — це вплине на всі наступні рівні
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {paths.map(path => (
            <button key={path} onClick={() => onChoose(path)} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
              borderRadius: 12, border: `1.5px solid ${pathColor[path]}44`,
              background: `${pathColor[path]}08`, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>{pathIcon[path]}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: pathColor[path], marginBottom: 2 }}>
                  {pathIcon[path]} {CATAPULT_PATHS[path][2].name}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.45)', lineHeight: 1.5 }}>{pathDesc[path]}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

// ── Recruitment screen ─────────────────────────────────────────────────────────
const CLASS_LABEL_UA: Record<UnitClass, string> = {
  warrior: 'Воїн', archer: 'Лучник', mage: 'Маг', catapult: 'Катапульта',
}
const CLASS_DESC_UA: Record<UnitClass, string> = {
  warrior: 'Передній ряд. Ближній бій, щит, провокація.',
  archer:  'Дальній ряд. Постріл, прицілення, пасивне отруєння.',
  mage:    'Підтримка. Магічні атаки, шлях обирається після рівня 1.',
  catapult: '',
}

function RecruitmentScreen({ options, onPick, onSkip }: {
  options: GameUnit[]; onPick: (cls: UnitClass) => void; onSkip: () => void
}) {
  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', minHeight: '100vh', background: '#0f0e09',
      fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '32px 24px',
    }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>🎖</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#b07850', marginBottom: 6 }}>Нове поповнення!</div>
      <div style={{ fontSize: 13, color: 'rgba(240,232,216,0.45)', marginBottom: 28, textAlign: 'center' }}>
        Після перемоги до тебе приєднується новий боєць. Обери одного:
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 320 }}>
        {options.map((u, i) => {
          const AvatarSVG = CLASS_SVG[u.class]
          return (
            <button key={i} onClick={() => onPick(u.class)} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
              borderRadius: 12, border: '1.5px solid rgba(176,120,80,0.3)',
              background: 'rgba(176,120,80,0.06)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(176,120,80,0.12)', border: '1.5px solid rgba(176,120,80,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AvatarSVG color="#b07850" size={26} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#b07850', marginBottom: 2 }}>{CLASS_LABEL_UA[u.class]}</div>
                <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.45)', lineHeight: 1.5 }}>{CLASS_DESC_UA[u.class]}</div>
              </div>
            </button>
          )
        })}
      </div>
      <button onClick={onSkip} style={{
        marginTop: 20, padding: '10px 24px', fontSize: 13, color: 'rgba(240,232,216,0.45)',
        background: 'transparent', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, cursor: 'pointer',
        fontFamily: 'inherit',
      }}>Пропустити</button>
    </div>
  )
}

// ── Arrange screen (between floors) ────────────────────────────────────────────
function ArrangeScreen({ units, onDone }: { units: GameUnit[]; onDone: (units: GameUnit[]) => void }) {
  const [arranged, setArranged] = useState<GameUnit[]>(units)
  const [selected, setSelected] = useState<string | null>(null)
  const hasCatapult = arranged.some(u => u.class === 'catapult')

  function handleSlotClick(row: Row, slot: number) {
    if (hasCatapult && row === 2 && slot === 2) return
    if (hasCatapult && row === 1 && slot === 2) { setSelected(null); return }
    const occupant = arranged.find(u => u.row === row && u.slot === slot)
    if (selected) {
      const selUnit = arranged.find(u => u.id === selected)!
      if (selUnit.row !== row) { setSelected(null); return } // same row only
      if (occupant) {
        setArranged(prev => prev.map(u => {
          if (u.id === selUnit.id) return { ...u, slot: occupant.slot }
          if (u.id === occupant.id) return { ...u, slot: selUnit.slot }
          return u
        }))
      } else {
        setArranged(prev => prev.map(u => u.id === selUnit.id ? { ...u, slot } : u))
      }
      setSelected(null)
      return
    }
    if (occupant && occupant.class !== 'catapult') setSelected(occupant.id)
  }

  const rowLabel: Record<number, string> = { 0: 'Передній ряд (воїни)', 1: 'Дальній ряд (лучники)', 2: 'Підтримка (маги)' }

  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', minHeight: '100vh', background: '#0f0e09',
      fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(240,232,216,0.1)', background: '#17150f' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#b07850', marginBottom: 2 }}>✦ Розстановка армії</div>
        <div style={{ fontSize: 12, color: 'rgba(240,232,216,0.45)' }}>Натисни юніта, потім інший слот у тому ж ряду щоб поміняти</div>
      </div>
      <div style={{ flex: 1, padding: '16px 20px', overflowY: 'auto' }}>
        {([0, 1, 2] as Row[]).map(row => (
          <div key={row} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(240,232,216,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
              {rowLabel[row]}
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
              {Array.from({ length: 4 }, (_, i) => {
                const isCatBase = hasCatapult && row === 2 && i === 2
                const isCatSlot = hasCatapult && row === 1 && i === 2
                const unit = arranged.find(u => u.row === row && u.slot === i)
                const isSel = unit?.id === selected
                const selUnit = selected ? arranged.find(u => u.id === selected) : null
                const isTarget = selUnit && selUnit.row === row && !isCatBase && !isCatSlot && !unit && !isSel

                if (isCatBase) return (
                  <div key={i} style={{ width: 76, height: 86, borderRadius: 8, flexShrink: 0, border: '1.5px dashed rgba(128,96,168,0.25)', background: 'rgba(128,96,168,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <span style={{ fontSize: 14, opacity: 0.4, color: '#8060a8' }}>⚙</span>
                    <span style={{ fontSize: 7, color: '#8060a8', opacity: 0.5 }}>База</span>
                  </div>
                )

                return (
                  <div key={i} onClick={() => handleSlotClick(row, i)} style={{
                    width: 76, height: 86, borderRadius: 8, flexShrink: 0,
                    cursor: isCatSlot ? 'default' : 'pointer',
                    background: isSel ? 'rgba(111,166,122,0.15)' : isTarget ? 'rgba(176,120,80,0.08)' : unit ? '#fff' : 'rgba(0,0,0,0.02)',
                    border: `2px solid ${isSel ? '#6fa67a' : isTarget ? '#b0785066' : unit ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.08)'}`,
                    borderStyle: isTarget ? 'dashed' : 'solid',
                    boxShadow: isSel ? '0 0 0 2px #6fa67a44' : 'none',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 3, position: 'relative', overflow: 'hidden', transition: 'all 0.12s',
                  }}>
                    {unit ? (() => {
                      const portrait = unit.class === 'warrior' ? `/sacred/warriors/level${unit.level ?? 1}.jpg`
                        : unit.class === 'archer' ? `/sacred/archers/level${unit.level ?? 1}.jpg`
                        : unit.class === 'mage' ? (unit.level === 1 || !unit.magePath ? `/sacred/mages/level1.jpg` : `/sacred/mages/${unit.magePath}/level${unit.level}.jpg`)
                        : unit.class === 'catapult' ? (unit.level === 1 || !unit.catapultPath ? `/sacred/catapults/level1.jpg` : `/sacred/catapults/${unit.catapultPath}/level${unit.level}.jpg`)
                        : null
                      const unitName = unit.class === 'warrior' ? WARRIOR_LEVELS[unit.level ?? 1]?.name
                        : unit.class === 'archer' ? ARCHER_LEVELS[unit.level ?? 1]?.name
                        : unit.class === 'mage' && unit.level && unit.level > 1 && unit.magePath ? MAGE_PATHS[unit.magePath][unit.level]?.name
                        : unit.class === 'mage' ? MAGE_BASE.name : unit.name
                      return portrait ? (
                        <>
                          <img src={portrait} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.7) 100%)' }} />
                          <div style={{ position: 'relative', zIndex: 1, alignSelf: 'stretch', marginTop: 'auto', padding: '0 4px 4px' }}>
                            <div style={{ fontSize: 8, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{unitName}</div>
                            {isSel && <div style={{ fontSize: 7, color: '#7aaa82', fontWeight: 700 }}>ОБРАНИЙ</div>}
                          </div>
                        </>
                      ) : (
                        <>
                          <CLASS_SVG_Component cls={unit.class} color={isSel ? '#6fa67a' : SIDE_COLOR.player} size={22} />
                          <span style={{ fontSize: 8, color: 'rgba(240,232,216,0.45)', textAlign: 'center', lineHeight: 1.2 }}>{unitName}</span>
                          {isSel && <span style={{ fontSize: 7, color: '#6fa67a', fontWeight: 700 }}>ОБРАНИЙ</span>}
                        </>
                      )
                    })() : (
                      <span style={{ fontSize: isTarget ? 18 : 14, color: isTarget ? '#b0785066' : 'rgba(0,0,0,0.1)' }}>
                        {isTarget ? '+' : '·'}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {selected && (
          <div style={{ textAlign: 'center', fontSize: 12, color: '#b07850', padding: '4px 0' }}>
            Натисни інший слот у тому ж ряду щоб поміняти · або юніта щоб поміняти місцями
          </div>
        )}
      </div>
      <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(240,232,216,0.1)', background: '#17150f' }}>
        <button onClick={() => onDone(arranged)} style={{
          width: '100%', padding: '14px', borderRadius: 10, border: 'none',
          background: '#b07850', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'inherit',
        }}>
          Продовжити →
        </button>
      </div>
    </div>
  )
}

// Helper for ArrangeScreen SVG
function CLASS_SVG_Component({ cls, color, size }: { cls: string; color: string; size?: number }) {
  const Comp = CLASS_SVG[cls]
  return Comp ? <Comp color={color} size={size} /> : null
}

// ── Tower helpers ──────────────────────────────────────────────────────────────
const LS_TOWER_FLOOR  = 'sacred_tower_floor'
const LS_TOWER_UNITS  = 'sacred_tower_units'
const LS_TOWER_COUNTS = 'sacred_tower_counts'

function prepareNextFloorUnits(towerCounts: ArmyCounts, battleUnits: GameUnit[]): GameUnit[] {
  const freshArmy = buildCustomArmy(towerCounts, 'player')
  return battleUnits
    .filter(u => u.side === 'player')
    .map(u => {
      if (u.hp > 0) return { ...u, hp: u.maxHp, buffs: [], hasActed: false }
      const fresh = freshArmy.find(f => f.class === u.class && f.slot === u.slot && f.row === u.row)
        ?? freshArmy.find(f => f.class === u.class)
      return fresh ? { ...fresh, row: u.row, slot: u.slot, xp: u.xp, level: u.level, magePath: u.magePath, catapultPath: u.catapultPath } : { ...u, hp: u.maxHp, buffs: [], hasActed: false }
    })
}

// ── Battle component ───────────────────────────────────────────────────────────
const ROW_SLOTS: Record<number, number> = { 0: 4, 1: 4, 2: 4 }

function Battle({ counts, playerUnits, prebuiltAiUnits, onRestart, towerFloor, onTowerWin, onTowerLose, onBattleEnd }: {
  counts: ArmyCounts; playerUnits?: GameUnit[]; prebuiltAiUnits?: GameUnit[]; onRestart: () => void
  towerFloor?: TowerFloor; onTowerWin?: (units: GameUnit[]) => void; onTowerLose?: () => void
  onBattleEnd?: (units: GameUnit[], won: boolean) => void
}) {
  const [state, dispatch] = useReducer(
    battleReducer,
    undefined as unknown as ArmyCounts,
    () => createInitialState(counts, playerUnits, towerFloor?.aiCounts, prebuiltAiUnits),
  )
  const [floats, setFloats]       = useState<BattleEvent[]>([])
  const [infoUnit, setInfoUnit]   = useState<GameUnit | null>(null)
  const [bannerText, setBannerText] = useState<string | null>(null)
  const battlefieldRef = useRef<HTMLDivElement>(null)
  const prevPhase = useRef(state.phase)
  const prevRound = useRef(state.round)

  const actorId = state.queue[state.queueIdx]
  const actor   = state.units.find(u => u.id === actorId && u.hp > 0) ?? null
  const mainActions = actor ? getMainActions(actor.class, actor.level, actor.magePath, actor.catapultPath) : []

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

  // Turn change banner
  useEffect(() => {
    if (state.phase === 'game-over') { prevPhase.current = state.phase; prevRound.current = state.round; return }
    const phaseChanged = prevPhase.current !== state.phase
    const roundChanged = prevRound.current !== state.round
    prevPhase.current = state.phase
    prevRound.current = state.round
    if (phaseChanged || roundChanged) {
      setBannerText(state.phase === 'player-turn' ? '🛡 Твоя черга' : '⚔ Хід ворога')
      const t = setTimeout(() => setBannerText(null), 1600)
      return () => clearTimeout(t)
    }
  }, [state.phase, state.round])

  // AI turn trigger
  useEffect(() => {
    if (state.phase !== 'ai-thinking') return
    const t = setTimeout(() => dispatch({ type: 'AI_TAKE_TURN' }), 2400)
    return () => clearTimeout(t)
  }, [state.phase, state.queueIdx])

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

  const pendingMage = state.pendingMageLevelUp && state.phase !== 'game-over'
    ? state.units.find(u => u.id === state.pendingMageLevelUp && u.side === 'player') ?? null
    : null
  const pendingCatapult = state.pendingCatapultLevelUp && state.phase !== 'game-over'
    ? state.units.find(u => u.id === state.pendingCatapultLevelUp && u.side === 'player') ?? null
    : null

  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column',
      minHeight: '100vh', background: '#0f0e09', color: '#f0e8d8',
      fontFamily: "'Inter', sans-serif",
    }}>

      {/* Turn change banner */}
      {bannerText && (
        <div style={{
          position: 'fixed', top: '42%', left: '50%', zIndex: 40,
          pointerEvents: 'none', padding: '12px 28px', borderRadius: 10,
          background: bannerBg, color: '#fff', fontSize: 17, fontWeight: 700,
          letterSpacing: '-0.01em', boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          animation: 'sacred-banner-in 0.3s cubic-bezier(0.4,0,0.2,1) forwards',
        }}>
          {bannerText}
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(240,232,216,0.1)', background: '#17150f' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#d4a85a' }}>✦ Серафити</div>
            {towerFloor && <div style={{ fontSize: 11, color: '#b07850', fontWeight: 600, opacity: 0.8 }}>🗼 {towerFloor.floor}/{TOWER_FLOORS.length}</div>}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(240,232,216,0.4)' }}>
            {towerFloor ? `${towerFloor.name} · ` : ''}Раунд {state.round}
          </div>
        </div>
      </div>

      {/* Battlefield */}
      <div
        ref={battlefieldRef}
        style={{
          flex: 1, padding: '8px 12px 300px', display: 'flex', flexDirection: 'column', gap: 2,
          position: 'relative',
          backgroundImage: [
            'repeating-linear-gradient(90deg, transparent, transparent 23px, rgba(212,168,90,0.025) 23px, rgba(212,168,90,0.025) 24px)',
            'repeating-linear-gradient(0deg,  transparent, transparent 23px, rgba(212,168,90,0.025) 23px, rgba(212,168,90,0.025) 24px)',
          ].join(','),
        }}
      >
        <ProjectileLayer battlefieldRef={battlefieldRef} events={state.events} />

        {/* AI side: rows 2→1→0 */}
        <div style={{
          borderRadius: 8, padding: '6px 4px 4px',
          background: 'rgba(192,112,112,0.04)',
          border: '1px solid rgba(192,112,112,0.1)',
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(192,112,112,0.8)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4, paddingLeft: 2 }}>
            Ворог
          </div>
          {([2, 1, 0] as Row[]).map(row => {
            const hasUnits = state.units.some(u => u.side === 'ai' && u.row === row)
            if (!hasUnits) return null
            return (
              <div key={row}>
                <div style={{ fontSize: 9, color: 'rgba(192,112,112,0.5)', marginBottom: 1, paddingLeft: 2 }}>{ROW_LABEL[row]}</div>
                <UnitRow
                  units={state.units} side="ai" row={row}
                  activeId={actor?.side === 'ai' ? actorId : null}
                  targetIds={targetIds} maxSlots={ROW_SLOTS[row]}
                  floatsMap={floatsMap} onSelectUnit={handleUnitClick} onInfoUnit={handleUnitInfo}
                />
              </div>
            )
          })}
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid rgba(240,232,216,0.1)', margin: '2px 0', position: 'relative' }}>
          <div style={{ position: 'absolute', left: '50%', top: -9, transform: 'translateX(-50%)', fontSize: 16, background: '#0f0e09', padding: '0 8px', color: 'rgba(240,232,216,0.3)' }}>
            ⚔
          </div>
        </div>

        {/* Player side: rows 0→1→2 */}
        <div style={{
          borderRadius: 8, padding: '4px 4px 6px',
          background: 'rgba(111,166,122,0.04)',
          border: '1px solid rgba(111,166,122,0.1)',
        }}>
          {([0, 1, 2] as Row[]).map(row => {
            const hasUnits = state.units.some(u => u.side === 'player' && u.row === row)
            if (!hasUnits) return null
            return (
              <div key={row}>
                <div style={{ fontSize: 9, color: 'rgba(111,166,122,0.6)', marginBottom: 1, paddingLeft: 2 }}>{ROW_LABEL[row]}</div>
                <UnitRow
                  units={state.units} side="player" row={row}
                  activeId={actor?.side === 'player' ? actorId : null}
                  targetIds={targetIds} maxSlots={ROW_SLOTS[row]}
                  floatsMap={floatsMap} onSelectUnit={handleUnitClick} onInfoUnit={handleUnitInfo}
                />
              </div>
            )
          })}
          <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(111,166,122,0.8)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 4, paddingLeft: 2 }}>
            Твоя армія
          </div>
        </div>
      </div>

      {/* Fixed bottom panel */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 560, zIndex: 20,
        background: '#17150f', borderTop: '1px solid rgba(240,232,216,0.1)',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.4)',
      }}>
        {/* Action area */}
        <div style={{
          minHeight: 118, display: 'flex', flexDirection: 'column', justifyContent: 'center',
        }}>
        {state.phase === 'game-over' ? (
          towerFloor ? (
            <div style={{ padding: '16px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: state.winner === 'player' ? '#7aaa82' : '#c07070', marginBottom: 4 }}>
                {state.winner === 'player' ? '🏆 Поверх пройдено!' : '💀 Поразка'}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(240,232,216,0.45)', marginBottom: 12 }}>
                {state.winner === 'player' ? towerFloor.name : 'Тауер завершено. Починай спочатку.'}
              </div>
              {state.winner === 'player' ? (
                <button onClick={() => onTowerWin?.(state.units)}
                  style={{ padding: '10px 28px', background: '#7aaa82', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  {towerFloor.floor < TOWER_FLOORS.length ? 'Далі →' : '🏆 Завершити тауер'}
                </button>
              ) : (
                <button onClick={onTowerLose}
                  style={{ padding: '10px 28px', background: '#c07070', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  До меню
                </button>
              )}
            </div>
          ) : (
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
          )

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
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {mainActions.map(a => {
                  let disabled = false
                  if (a === 'provoke' && actor) {
                    const enemySide = actor.side === 'player' ? 'ai' : 'player'
                    disabled = !state.units.some(u => u.side === enemySide && u.hp > 0 && u.row === 0)
                  }
                  if (a === 'aim' && actor) {
                    disabled = actor.buffs.some(b => b.type === 'aimed')
                  }
                  if ((a === 'hurricane' || a === 'armageddon' || a === 'earthquake' || a === 'fortress_aura' || a === 'blizzard') && actor) {
                    disabled = actor.buffs.some(b => b.type === 'cooldown' && b.actionKey === a)
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

        {/* Turn queue */}
        <div style={{ padding: '6px 12px 4px', borderTop: '1px solid rgba(240,232,216,0.07)' }}>
          <TurnQueue queue={state.queue} units={state.units} currentIdx={state.queueIdx} />
        </div>

        {/* Compact battle log */}
        <BattleLog entries={state.log} />
      </div>

      {infoUnit && <UnitInfoSheet unit={infoUnit} onClose={() => setInfoUnit(null)} />}
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
  )
}

// ── Tower map ──────────────────────────────────────────────────────────────────
function aiCompositionText(counts: ArmyCounts): string {
  const parts: string[] = []
  if (counts.warriors)  parts.push(`${counts.warriors} воїн${counts.warriors > 1 ? 'и' : ''}`)
  if (counts.archers)   parts.push(`${counts.archers} лучник${counts.archers > 1 ? 'и' : ''}`)
  if (counts.mages)     parts.push(`${counts.mages} маг${counts.mages > 1 ? 'и' : ''}`)
  if (counts.catapults) parts.push(`${counts.catapults} катапульта`)
  return parts.join(', ') || 'немає'
}

const ENEMY_CHIPS: { key: keyof ArmyCounts; icon: string; label: string; color: string }[] = [
  { key: 'warriors',  icon: '⚔',  label: 'воїн',      color: '#c07070' },
  { key: 'archers',   icon: '🏹', label: 'лучник',     color: '#c4a040' },
  { key: 'mages',     icon: '✨', label: 'маг',        color: '#7ea8c4' },
  { key: 'catapults', icon: '⚙',  label: 'катапульта', color: '#8060a8' },
]

function TowerMap({ floorIdx, playerUnits, onEnterBattle, onBackToMenu }: {
  floorIdx: number
  playerUnits: GameUnit[]
  onEnterBattle: () => void
  onBackToMenu: () => void
}) {
  const currentFloor = TOWER_FLOORS[floorIdx]

  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', minHeight: '100vh', background: '#0f0e09',
      color: '#f0e8d8', fontFamily: "'Inter', sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 20px 0', borderBottom: '1px solid rgba(240,232,216,0.1)', background: '#17150f', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button onClick={onBackToMenu} style={{
            padding: '6px 12px', fontSize: 12, color: 'rgba(240,232,216,0.5)',
            background: 'rgba(240,232,216,0.06)', border: '1px solid rgba(240,232,216,0.1)',
            borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
          }}>← Меню</button>
          <div style={{ flex: 1, fontSize: 16, fontWeight: 800, color: '#d4a85a', textAlign: 'center' }}>🗼 Тауер Серафітів</div>
          <div style={{ width: 56 }} />
        </div>
        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 3, paddingBottom: 14 }}>
          {TOWER_FLOORS.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 7, borderRadius: 4,
              background: i < floorIdx
                ? 'linear-gradient(90deg, #5a9a6a, #7aaa82)'
                : i === floorIdx
                  ? 'linear-gradient(90deg, #b07850, #d4a85a)'
                  : 'rgba(240,232,216,0.08)',
              transition: 'background 0.3s',
              boxShadow: i === floorIdx ? '0 0 6px rgba(176,120,80,0.5)' : 'none',
            }} />
          ))}
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 24px' }}>

        {/* Current floor hero card */}
        <div style={{
          borderRadius: 14, marginBottom: 16, overflow: 'hidden',
          border: '1px solid rgba(176,120,80,0.35)',
          background: 'linear-gradient(135deg, rgba(176,120,80,0.12) 0%, rgba(176,120,80,0.05) 100%)',
        }}>
          <div style={{ padding: '16px 18px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#d4a85a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
              ⚡ Поточний поверх · {currentFloor.floor} з {TOWER_FLOORS.length}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#f0e8d8', marginBottom: 10, lineHeight: 1.15 }}>
              {currentFloor.name}
            </div>
            {/* Enemy chips */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ENEMY_CHIPS.filter(c => currentFloor.aiCounts[c.key] > 0).map(c => (
                <div key={c.key} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 20,
                  background: `${c.color}18`, border: `1px solid ${c.color}44`,
                }}>
                  <span style={{ fontSize: 11 }}>{c.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: c.color }}>
                    {currentFloor.aiCounts[c.key]} {c.label}{(currentFloor.aiCounts[c.key] ?? 0) > 1 ? 'и' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Floor list */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(240,232,216,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Поверхи тауера
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {TOWER_FLOORS.map((floor, i) => {
              const isDone    = i < floorIdx
              const isCurrent = i === floorIdx
              const isLocked  = i > floorIdx
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10,
                  background: isCurrent ? 'rgba(176,120,80,0.1)' : isDone ? 'rgba(122,170,130,0.07)' : 'rgba(240,232,216,0.03)',
                  border: `1px solid ${isCurrent ? 'rgba(176,120,80,0.4)' : isDone ? 'rgba(122,170,130,0.2)' : 'rgba(240,232,216,0.07)'}`,
                  opacity: isLocked ? 0.55 : 1,
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: isDone ? '#5a9a6a' : isCurrent ? '#b07850' : 'rgba(240,232,216,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700,
                    color: isDone || isCurrent ? '#fff' : 'rgba(240,232,216,0.3)',
                    boxShadow: isCurrent ? '0 0 8px rgba(176,120,80,0.4)' : 'none',
                  }}>
                    {isDone ? '✓' : floor.floor}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? '#d4a85a' : isDone ? '#7aaa82' : '#f0e8d8' }}>
                      {floor.name}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(240,232,216,0.38)', marginTop: 1 }}>
                      {aiCompositionText(floor.aiCounts)}
                    </div>
                  </div>
                  {isLocked && <span style={{ fontSize: 12, color: 'rgba(240,232,216,0.2)' }}>🔒</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Player army */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(240,232,216,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Твоя армія
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {playerUnits.map(u => {
              const portrait = getPortraitSrc(u)
              const levelName = u.class === 'warrior' ? WARRIOR_LEVELS[u.level ?? 1]?.name
                              : u.class === 'archer'  ? ARCHER_LEVELS[u.level ?? 1]?.name
                              : u.class === 'mage' && u.level && u.level > 1 && u.magePath
                                ? MAGE_PATHS[u.magePath][u.level]?.name
                                : u.class === 'mage' ? MAGE_BASE.name
                                : undefined
              const maxLevel = u.class === 'warrior' ? 4 : u.class === 'archer' ? 3 : u.class === 'mage' ? 5 : 0
              const xpPct = maxLevel > 0 && (u.level ?? 1) < maxLevel
                ? Math.min(100, ((u.xp ?? 0) / (u.xpToNext ?? 1)) * 100) : 0
              const AvatarSVG = CLASS_SVG[u.class]
              return (
                <div key={u.id} style={{
                  width: 62, borderRadius: 10, overflow: 'hidden', position: 'relative',
                  border: '1.5px solid rgba(122,170,130,0.3)',
                }}>
                  {/* Portrait */}
                  <div style={{ height: 68, position: 'relative', background: '#17150f' }}>
                    {portrait
                      ? <img src={portrait} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <AvatarSVG color="#7aaa82" size={26} />
                        </div>
                    }
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.75) 100%)' }} />
                    <div style={{ position: 'absolute', bottom: 3, left: 0, right: 0, padding: '0 4px', textAlign: 'center' }}>
                      <div style={{ fontSize: 7, fontWeight: 700, color: '#f0e8d8', textShadow: '0 1px 3px rgba(0,0,0,0.9)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {levelName ?? u.name}
                      </div>
                    </div>
                  </div>
                  {/* XP bar */}
                  {xpPct > 0 && (
                    <div style={{ height: 3, background: 'rgba(176,120,80,0.2)' }}>
                      <div style={{ width: `${xpPct}%`, height: '100%', background: '#b07850' }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Enter battle */}
      <div style={{ padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', background: '#17150f', borderTop: '1px solid rgba(240,232,216,0.1)', flexShrink: 0 }}>
        <button onClick={onEnterBattle} style={{
          width: '100%', padding: '15px 0', fontSize: 16, fontWeight: 700,
          background: 'linear-gradient(135deg, #b07850, #8c5a38)',
          color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(176,120,80,0.4)', fontFamily: 'inherit',
        }}>
          ⚔ Вступити в бій
        </button>
      </div>
    </div>
  )
}

// ── Root component ─────────────────────────────────────────────────────────────
type RootScreen = 'landing' | 'army-builder' | 'placement' | 'battle' | 'tower-map' | 'tower-battle' | 'recruitment' | 'arrange' | 'free-battle' | 'world-map' | 'world-battle'

export default function SacredGame() {
  const [screen, setScreen] = useState<RootScreen>('landing')
  const [isTowerMode, setIsTowerMode] = useState(false)
  const [counts, setCounts] = useState<ArmyCounts | null>(null)
  const [playerUnits, setPlayerUnits] = useState<GameUnit[] | null>(null)
  const [towerFloorIdx, setTowerFloorIdx] = useState(0)
  const [towerCounts, setTowerCounts] = useState<ArmyCounts | null>(null)
  const [towerUnits, setTowerUnits] = useState<GameUnit[] | null>(null)
  const [savedTowerFloor, setSavedTowerFloor] = useState<number | null>(null)
  const [pendingRecruitmentOptions, setPendingRecruitmentOptions] = useState<GameUnit[] | null>(null)
  const [freeBattleAiUnits, setFreeBattleAiUnits] = useState<GameUnit[] | null>(null)
  const [worldMapState, setWorldMapState] = useState<WorldMapState>(createInitialMapState)
  const [worldPlayerUnits, setWorldPlayerUnits] = useState<GameUnit[] | null>(null)
  const [worldFightNodeId, setWorldFightNodeId] = useState<string | null>(null)
  const [worldBattleResult, setWorldBattleResult] = useState<WorldBattleResult | null>(null)
  const worldPreBattleUnits = useRef<GameUnit[] | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_TOWER_FLOOR)
      setSavedTowerFloor(saved ? parseInt(saved) : null)
    } catch {}
  }, [])

  function clearTowerSave() {
    try {
      localStorage.removeItem(LS_TOWER_FLOOR)
      localStorage.removeItem(LS_TOWER_UNITS)
      localStorage.removeItem(LS_TOWER_COUNTS)
    } catch {}
    setSavedTowerFloor(null)
  }

  function saveTowerProgress(floorNum: number, units: GameUnit[], tc: ArmyCounts) {
    try {
      localStorage.setItem(LS_TOWER_FLOOR, String(floorNum))
      localStorage.setItem(LS_TOWER_UNITS, JSON.stringify(units))
      localStorage.setItem(LS_TOWER_COUNTS, JSON.stringify(tc))
    } catch {}
    setSavedTowerFloor(floorNum)
  }

  function handleNewGame() {
    setIsTowerMode(false)
    setScreen('army-builder')
  }

  function handleStartTower() {
    clearTowerSave()
    setIsTowerMode(true)
    setTowerFloorIdx(0)
    setTowerUnits(null)
    setTowerCounts(null)
    setScreen('army-builder')
  }

  function handleContinueTower() {
    try {
      const floorNum = parseInt(localStorage.getItem(LS_TOWER_FLOOR) ?? '1')
      const units = JSON.parse(localStorage.getItem(LS_TOWER_UNITS) ?? '[]') as GameUnit[]
      const tc = JSON.parse(localStorage.getItem(LS_TOWER_COUNTS) ?? '{}') as ArmyCounts
      setIsTowerMode(true)
      setTowerFloorIdx(floorNum - 1)
      setTowerUnits(units)
      setTowerCounts(tc)
      setScreen('tower-map')
    } catch {
      handleStartTower()
    }
  }

  function handleFreeBattle() {
    setIsTowerMode(false)
    setScreen('free-battle')
  }

  function handleFreeBattleStart(pUnits: GameUnit[], aUnits: GameUnit[]) {
    setPlayerUnits(pUnits)
    setFreeBattleAiUnits(aUnits)
    setCounts({ warriors: 0, archers: 0, mages: 0, catapults: 0 })
    setScreen('battle')
  }

  function handleWorldMap() {
    if (!worldPlayerUnits) {
      setWorldPlayerUnits(buildCustomArmy({ warriors: 3, archers: 2, mages: 1, catapults: 0 }, 'player'))
    }
    setScreen('world-map')
  }

  function handleWorldMove(nodeId: string) {
    const cost = getPathCost(worldMapState.heroNodeId, nodeId, worldMapState.statuses)
    if (cost === 0 || cost > worldMapState.heroAP) return
    setWorldMapState(prev => ({ ...prev, heroNodeId: nodeId, heroAP: prev.heroAP - cost }))
  }

  function handleWorldFight(nodeId: string) {
    worldPreBattleUnits.current = worldPlayerUnits
    setWorldFightNodeId(nodeId)
    setScreen('world-battle')
  }

  function handleWorldBattleEnd(units: GameUnit[], won: boolean) {
    const survived = units.filter(u => u.hp > 0).map(u => ({ ...u, buffs: [] }))
    setWorldPlayerUnits(survived)

    const fightNodeDef = worldFightNodeId ? WORLD_NODES.find(n => n.id === worldFightNodeId) : null
    const goldGained = won ? (fightNodeDef?.goldReward ?? 0) : 0

    const levelUps: string[] = []
    if (won && worldPreBattleUnits.current) {
      for (const u of survived) {
        const prev = worldPreBattleUnits.current.find(p => p.id === u.id)
        if (prev && (u.level ?? 1) > (prev.level ?? 1)) levelUps.push(u.name)
      }
    }

    if (won && worldFightNodeId) {
      setWorldMapState(prev => ({
        ...prev,
        statuses: { ...prev.statuses, [worldFightNodeId]: 'cleared' },
        gold: prev.gold + goldGained,
        heroAP: 0,
      }))
    } else {
      setWorldMapState(prev => ({ ...prev, heroAP: 0 }))
    }

    if (won && (goldGained > 0 || levelUps.length > 0)) {
      setWorldBattleResult({ gold: goldGained, levelUps })
    }

    worldPreBattleUnits.current = null
    setWorldFightNodeId(null)
    setScreen('world-map')
  }

  function handleWorldCollect(nodeId: string) {
    const nodeDef = WORLD_NODES.find(n => n.id === nodeId)!
    const goldGain = nodeDef.goldReward ?? 0
    const xpGain   = nodeDef.xpReward ?? 0
    setWorldMapState(prev => ({
      ...prev,
      gold: prev.gold + goldGain,
      statuses: { ...prev.statuses, [nodeId]: 'collected' },
    }))
    if (xpGain > 0) {
      setWorldPlayerUnits(prev => prev
        ? prev.map(u => ({ ...u, xp: (u.xp ?? 0) + xpGain }))
        : prev
      )
    }
  }

  function handleWorldRest() {
    setWorldPlayerUnits(prev => prev ? prev.map(u => ({ ...u, hp: u.maxHp })) : prev)
    setWorldMapState(prev => ({ ...prev, restedThisTurn: true }))
  }

  function handleWorldEndTurn() {
    setWorldMapState(prev => ({ ...prev, heroAP: prev.maxAP, turn: prev.turn + 1, restedThisTurn: false }))
  }

  function handleArmyBuilt(c: ArmyCounts) {
    setCounts(c)
    if (isTowerMode) setTowerCounts(c)
    setScreen('placement')
  }

  function handlePlacementDone(units: GameUnit[]) {
    setPlayerUnits(units)
    if (isTowerMode) {
      setTowerUnits(units)
      saveTowerProgress(1, units, towerCounts!)
      setScreen('tower-map')
    } else {
      setScreen('battle')
    }
  }

  function handleTowerWin(battleUnits: GameUnit[]) {
    const nextIdx = towerFloorIdx + 1
    if (nextIdx >= TOWER_FLOORS.length) {
      clearTowerSave()
      setScreen('landing')
      return
    }
    const nextUnits = prepareNextFloorUnits(towerCounts!, battleUnits)
    setTowerFloorIdx(nextIdx)
    setTowerUnits(nextUnits)
    // Recruitment offered after floors 3 and 5 (indices 2 and 4)
    if (towerFloorIdx === 2 || towerFloorIdx === 4) {
      const opts = generateRecruitOptions(nextUnits)
      if (opts.length > 0) {
        setPendingRecruitmentOptions(opts)
        setScreen('recruitment')
        return
      }
    }
    saveTowerProgress(nextIdx + 1, nextUnits, towerCounts!)
    setScreen('arrange')
  }

  function handleRecruitmentComplete(cls: UnitClass | null) {
    let newUnits = towerUnits!
    if (cls !== null) {
      newUnits = addUnitToArmy(newUnits, cls)
      setTowerUnits(newUnits)
    }
    setPendingRecruitmentOptions(null)
    saveTowerProgress(towerFloorIdx + 1, newUnits, towerCounts!)
    setScreen('arrange')
  }

  function handleArrangeComplete(arranged: GameUnit[]) {
    setTowerUnits(arranged)
    saveTowerProgress(towerFloorIdx + 1, arranged, towerCounts!)
    setScreen('tower-map')
  }

  function handleTowerLose() {
    clearTowerSave()
    setScreen('landing')
  }

  if (screen === 'landing') return (
    <Landing
      onStartTower={handleStartTower}
      onContinueTower={handleContinueTower}
      savedTowerFloor={savedTowerFloor}
      onFreeBattle={handleFreeBattle}
      onWorldMap={handleWorldMap}
    />
  )
  if (screen === 'world-map') return (
    <WorldMap
      mapState={worldMapState}
      playerUnits={worldPlayerUnits ?? []}
      battleResult={worldBattleResult}
      onClearBattleResult={() => setWorldBattleResult(null)}
      onMove={handleWorldMove}
      onFight={handleWorldFight}
      onCollect={handleWorldCollect}
      onRest={handleWorldRest}
      onEndTurn={handleWorldEndTurn}
      onBack={() => setScreen('landing')}
    />
  )
  if (screen === 'world-battle') {
    const fightNode = worldFightNodeId ? WORLD_NODES.find(n => n.id === worldFightNodeId) : null
    if (fightNode?.enemyCounts && worldPlayerUnits) return (
      <Battle
        counts={{ warriors: 0, archers: 0, mages: 0, catapults: 0 }}
        playerUnits={worldPlayerUnits}
        prebuiltAiUnits={buildCustomArmy(fightNode.enemyCounts, 'ai')}
        onRestart={() => handleWorldBattleEnd(worldPlayerUnits, false)}
        onBattleEnd={handleWorldBattleEnd}
      />
    )
    return null
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
  if (screen === 'tower-map') return (
    <TowerMap
      floorIdx={towerFloorIdx}
      playerUnits={towerUnits!}
      onEnterBattle={() => setScreen('tower-battle')}
      onBackToMenu={() => setScreen('landing')}
    />
  )
  if (screen === 'tower-battle') return (
    <Battle
      counts={towerCounts!}
      playerUnits={towerUnits!}
      onRestart={() => {}}
      towerFloor={TOWER_FLOORS[towerFloorIdx]}
      onTowerWin={handleTowerWin}
      onTowerLose={handleTowerLose}
    />
  )
  if (screen === 'recruitment') return (
    <RecruitmentScreen
      options={pendingRecruitmentOptions!}
      onPick={(cls) => handleRecruitmentComplete(cls)}
      onSkip={() => handleRecruitmentComplete(null)}
    />
  )
  if (screen === 'arrange') return (
    <ArrangeScreen
      units={towerUnits!}
      onDone={handleArrangeComplete}
    />
  )
  return <Battle counts={counts!} playerUnits={playerUnits ?? undefined} prebuiltAiUnits={freeBattleAiUnits ?? undefined} onRestart={() => setScreen('landing')} />
}
