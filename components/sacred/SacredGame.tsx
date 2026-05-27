'use client'

import { useReducer, useEffect, useRef, useState } from 'react'
import {
  createInitialState, battleReducer, getMainActions, getValidTargets, ACTIONS, buildCustomArmy,
} from '@/lib/sacred/game'
import type { GameUnit, ActionKey, Side, Row, LogEntry, ArmyCounts, BattleEvent, BattleAction, TowerFloor, MagePath } from '@/lib/sacred/types'
import { WARRIOR_LEVELS, ARCHER_LEVELS, MAGE_BASE, MAGE_PATHS, TOWER_FLOORS } from '@/lib/sacred/types'
import ArmyBuilder from './ArmyBuilder'
import PlacementScreen from './PlacementScreen'

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
  regen: '💚',
  wind_shield: '💨',
  fortress_buff: '🏰',
  thorns: '🌿',
  taunt: '🗣',
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

// ── Seraph Logo ────────────────────────────────────────────────────────────────
function SeraphLogo() {
  const c = '#b07850'
  const spokes = [0, 45, 90, 135, 180, 225, 270, 315]
  return (
    <svg width={108} height={108} viewBox="0 0 108 108" fill="none">
      <circle cx="54" cy="54" r="50" stroke={c} strokeWidth="1" opacity="0.25"/>
      <circle cx="54" cy="54" r="42" stroke={c} strokeWidth="0.5" opacity="0.12"/>
      {spokes.map((deg, i) => {
        const rad = (deg * Math.PI) / 180
        const isPrimary = i % 2 === 0
        const r1 = isPrimary ? 38 : 40, r2 = isPrimary ? 50 : 46
        return (
          <line key={deg}
            x1={54 + r1 * Math.sin(rad)} y1={54 - r1 * Math.cos(rad)}
            x2={54 + r2 * Math.sin(rad)} y2={54 - r2 * Math.cos(rad)}
            stroke={c} strokeWidth={isPrimary ? 2 : 1}
            opacity={isPrimary ? 0.65 : 0.35} strokeLinecap="round"/>
        )
      })}
      <path d="M54 27L69 33V49Q69 64 54 69Q39 64 39 49V33Z"
        fill={c} opacity="0.1" stroke={c} strokeWidth="1.5"/>
      <line x1="54" y1="34" x2="54" y2="59" stroke={c} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="48" y1="44" x2="60" y2="44" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M51 34L54 29L57 34Z" fill={c}/>
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
  const borderColor = isActive ? '#b07850' : isTargetable ? color : 'rgba(0,0,0,0.12)'
  const AvatarSVG = CLASS_SVG[unit.class]
  const unitLevelName = unit.class === 'warrior' ? WARRIOR_LEVELS[unit.level ?? 1]?.name
                      : unit.class === 'archer'  ? ARCHER_LEVELS[unit.level ?? 1]?.name
                      : unit.class === 'mage' && unit.level && unit.level > 1 && unit.magePath
                        ? MAGE_PATHS[unit.magePath][unit.level]?.name
                        : unit.class === 'mage' ? MAGE_BASE.name
                        : undefined
  const portraitSrc = unit.level
    ? (unit.class === 'warrior' ? `/sacred/warriors/level${unit.level}.jpg`
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
      style={{ flexShrink: 0, width: 76 }}
    >
      <div
        onClick={handleClick}
        className={pulseClass}
        style={{
          width: 76, height: 90,
          background: portraitSrc ? 'transparent' : (alive ? '#ffffff' : 'rgba(0,0,0,0.04)'),
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
            <div style={{ fontSize: 9, color: 'var(--muted)', lineHeight: 1.2, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {unit.name}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
              {unit.hp}/{unit.maxHp}
            </div>
            <HpBar hp={unit.hp} maxHp={unit.maxHp} />
            {unit.buffs.length > 0 && (
              <div style={{ display: 'flex', gap: 2, marginTop: 3, flexWrap: 'wrap' }}>
                {unit.buffs.map(b => (
                  <span key={b.id} style={{ fontSize: 8, padding: '1px 2px', borderRadius: 3, background: 'rgba(0,0,0,0.07)', color: 'var(--muted)' }}>
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
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', minHeight: 96 }}>
      {Array.from({ length: maxSlots }, (_, i) => {
        if (catapult && i === 2) {
          const alive = catapult.hp > 0
          return (
            <div key={i} style={{
              width: 76, minHeight: 86, flexShrink: 0,
              border: `2px dashed ${alive ? sideColor + '44' : 'rgba(0,0,0,0.1)'}`,
              borderRadius: 8,
              background: alive ? `${sideColor}06` : 'rgba(0,0,0,0.02)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 4, opacity: alive ? 1 : 0.35,
            }}>
              <CatapultBaseSVG color={alive ? sideColor : '#aaa'} size={28} />
              <span style={{ fontSize: 7, color: 'var(--muted)', fontWeight: 600 }}>База</span>
            </div>
          )
        }
        const unit = rowUnits.find(u => u.slot === i)
        if (!unit) return (
          <div key={i} style={{ width: 76, height: 86, border: '1px dashed rgba(0,0,0,0.1)', borderRadius: 8, flexShrink: 0 }} />
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
    <div style={{ overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
      <div style={{ display: 'flex', gap: 5, padding: '0 4px', width: 'max-content' }}>
        {queue.map((id, i) => {
          const u = units.find(x => x.id === id)
          if (!u || u.hp === 0) return null
          const isCurrent = i === currentIdx
          const AvatarSVG = CLASS_SVG[u.class]
          return (
            <div key={`${id}-${i}`} style={{
              width: 34, height: 34, borderRadius: 7, flexShrink: 0,
              background: isCurrent ? '#b07850' : 'rgba(0,0,0,0.06)',
              border: `1.5px solid ${isCurrent ? '#b07850' : SIDE_COLOR[u.side] + '88'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: isCurrent ? 1 : 0.6,
              transform: isCurrent ? 'scale(1.2)' : 'scale(1)',
              transition: 'transform 0.2s',
            }}>
              <AvatarSVG color={isCurrent ? '#fff' : SIDE_COLOR[u.side]} size={18} />
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
    attack: 'var(--text)', miss: 'var(--muted)', evade: '#4a86a8', crit: '#b07850',
    heal: '#5a9a6a', buff: '#8060a8', debuff: '#c07070', death: '#c0392b', info: 'rgba(0,0,0,0.3)',
  }

  return (
    <div style={{ height: 130, overflowY: 'auto', padding: '8px 14px', background: '#f2efe9', borderTop: '1px solid var(--border)' }}>
      {entries.slice(-40).map(e => (
        <div key={e.id} style={{ fontSize: 12, color: typeColor[e.type], lineHeight: 1.6, marginBottom: 1 }}>
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
        flex: '1 1 0', padding: '10px 12px', borderRadius: 8, textAlign: 'left',
        background: selected ? 'rgba(176,120,80,0.12)' : '#fff',
        border: `1px solid ${selected ? '#b07850' : 'rgba(0,0,0,0.1)'}`,
        color: 'var(--text)', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1, transition: 'all 0.12s',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{def.label}</div>
      <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.4 }}>{def.desc}</div>
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
        background: '#faf8f5', borderRadius: '16px 16px 0 0',
        border: `1px solid ${color}55`, borderBottom: 'none',
        zIndex: 51, display: 'flex', flexDirection: 'column',
        fontFamily: "'Inter', sans-serif",
      }}>
        {/* Drag handle + header — fixed */}
        <div style={{ padding: '14px 20px 0', flexShrink: 0 }}>
          <div style={{ width: 36, height: 3, background: 'rgba(0,0,0,0.1)', borderRadius: 2, margin: '0 auto 14px' }} />
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
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                {unit.side === 'player' ? 'Твій юніт' : 'Ворожий юніт'} · {ROW_LABEL[unit.row]} ряд
              </div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: alive ? '#7aaa82' : '#c07070', marginRight: 6 }}>
              {alive ? '● Живий' : '● Загинув'}
            </div>
            <button onClick={onClose} style={{
              width: 28, height: 28, borderRadius: 7, flexShrink: 0,
              background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.1)',
              color: 'var(--muted)', cursor: 'pointer', fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', padding: '0 20px 36px', flex: 1 }}>

          {/* HP */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
              <span>HP</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{unit.hp} / {unit.maxHp}</span>
            </div>
            <HpBar hp={unit.hp} maxHp={unit.maxHp} />
          </div>

          {/* XP (warriors and archers) */}
          {maxLevel > 0 && (unit.level ?? 1) < maxLevel && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
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
              <div key={label} style={{ padding: '7px 10px', borderRadius: 8, background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 1 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          {actionsForSheet.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>
                Дії
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {actionsForSheet.map(({ key, extra }) => {
                  const def = ACTIONS[key]
                  return (
                    <div key={key} style={{
                      padding: '9px 12px', borderRadius: 9,
                      background: '#fff', border: '1px solid rgba(0,0,0,0.08)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: extra ? 3 : 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{def.label}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{def.desc}</span>
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
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>
                Активні ефекти
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {unit.buffs.map(b => (
                  <div key={b.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', borderRadius: 8,
                    background: '#fff', border: '1px solid rgba(0,0,0,0.08)',
                  }}>
                    <span style={{ fontSize: 14 }}>{BUFF_ICON[b.type] ?? '✦'}</span>
                    <span style={{ fontSize: 12, color: 'var(--text)', flex: 1 }}>
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
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{b.turnsLeft} хід.</span>
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
function Landing({ onNewGame, onStartTower, onContinueTower, savedTowerFloor }: {
  onNewGame: () => void
  onStartTower: () => void
  onContinueTower: () => void
  savedTowerFloor: number | null
}) {
  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', minHeight: '100vh', background: '#faf8f5',
      color: 'var(--text)', fontFamily: "'Inter', sans-serif",
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px', textAlign: 'center',
    }}>
      <div style={{ marginBottom: 20, filter: 'drop-shadow(0 0 18px rgba(176,120,80,0.35))' }}>
        <SeraphLogo />
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color: '#b07850', letterSpacing: '-0.02em', marginBottom: 8 }}>
        Серафити
      </div>
      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 300, marginBottom: 36 }}>
        Тактична покрокова битва. Обирай армію і веди її до перемоги.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 280 }}>
        <button onClick={onNewGame} style={{
          padding: '14px 0', fontSize: 15, fontWeight: 700,
          background: '#b07850', color: '#fff',
          border: 'none', borderRadius: 12, cursor: 'pointer',
          boxShadow: '0 2px 12px rgba(176,120,80,0.3)',
        }}>
          ⚔ Одиночний бій
        </button>

        {savedTowerFloor ? (
          <>
            <button onClick={onContinueTower} style={{
              padding: '14px 0', fontSize: 15, fontWeight: 700,
              background: '#4a7a5a', color: '#fff',
              border: 'none', borderRadius: 12, cursor: 'pointer',
              boxShadow: '0 2px 12px rgba(74,122,90,0.3)',
            }}>
              🗼 Продовжити тауер ({savedTowerFloor}/{TOWER_FLOORS.length})
            </button>
            <button onClick={onStartTower} style={{
              padding: '10px 0', fontSize: 13, fontWeight: 600,
              background: 'transparent', color: 'var(--muted)',
              border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, cursor: 'pointer',
            }}>
              Новий тауер
            </button>
          </>
        ) : (
          <button onClick={onStartTower} style={{
            padding: '14px 0', fontSize: 15, fontWeight: 700,
            background: '#4a7a5a', color: '#fff',
            border: 'none', borderRadius: 12, cursor: 'pointer',
            boxShadow: '0 2px 12px rgba(74,122,90,0.3)',
          }}>
            🗼 Тауер
          </button>
        )}
      </div>

      <div style={{ marginTop: 44, display: 'flex', gap: 24, fontSize: 11, color: 'var(--muted)' }}>
        {(['warrior', 'archer', 'mage', 'catapult'] as const).map(cls => {
          const labels: Record<string, string> = { warrior: 'Воїни', archer: 'Лучники', mage: 'Маги', catapult: 'Катапульта' }
          const AvatarSVG = CLASS_SVG[cls]
          return (
            <div key={cls} style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'center' }}>
                <AvatarSVG color="#b07850" size={28} />
              </div>
              {labels[cls]}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Mage path choice modal ────────────────────────────────────────────────────
function MagePathModal({ unit, onChoose }: { unit: GameUnit; onChoose: (path: MagePath) => void }) {
  const paths: MagePath[] = ['fire', 'water', 'earth', 'air']
  const pathDesc: Record<MagePath, string> = {
    fire:  'Сильний burst + підпал DoT. Фаєрбол посилюється, Інферно б\'є всіх.',
    water: 'Контроль + підтримка. Заморозка, крижаний щит, лікування команди.',
    earth: 'Незблокований урон + захист. Кам\'яна шкіра, тернії, Фортеця.',
    air:   'Висока крит. шанс + дебафи. Ланцюг блискавок, Ураган, пориви вітру.',
  }
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 60 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 560, background: '#faf8f5',
        borderRadius: '18px 18px 0 0', zIndex: 61, padding: '20px 20px 32px',
        fontFamily: "'Inter', sans-serif",
      }}>
        <div style={{ width: 36, height: 3, background: 'rgba(0,0,0,0.1)', borderRadius: 2, margin: '0 auto 16px' }} />
        <div style={{ fontSize: 16, fontWeight: 800, color: '#b07850', textAlign: 'center', marginBottom: 4 }}>
          ⭐ {unit.name} готовий до еволюції!
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginBottom: 18 }}>
          Обери шлях мага — це вплине на всі наступні рівні
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {paths.map(path => (
            <button key={path} onClick={() => onChoose(path)} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
              borderRadius: 12, border: `1.5px solid ${MAGE_PATH_COLOR[path]}44`,
              background: `${MAGE_PATH_COLOR[path]}08`, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>{MAGE_PATH_ICON[path]}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: MAGE_PATH_COLOR[path], marginBottom: 2 }}>
                  {MAGE_PATH_ICON[path]} {MAGE_PATH_NAME[path]} — {MAGE_PATHS[path][2].name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{pathDesc[path]}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  )
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
      return freshArmy.find(f => f.class === u.class && f.slot === u.slot && f.row === u.row) ?? u
    })
}

// ── Battle component ───────────────────────────────────────────────────────────
const ROW_SLOTS: Record<number, number> = { 0: 4, 1: 3, 2: 3 }

function Battle({ counts, playerUnits, onRestart, towerFloor, onTowerWin, onTowerLose }: {
  counts: ArmyCounts; playerUnits?: GameUnit[]; onRestart: () => void
  towerFloor?: TowerFloor; onTowerWin?: (units: GameUnit[]) => void; onTowerLose?: () => void
}) {
  const [state, dispatch] = useReducer(
    battleReducer,
    undefined as unknown as ArmyCounts,
    () => createInitialState(counts, playerUnits, towerFloor?.aiCounts),
  )
  const [floats, setFloats]       = useState<BattleEvent[]>([])
  const [infoUnit, setInfoUnit]   = useState<GameUnit | null>(null)
  const [bannerText, setBannerText] = useState<string | null>(null)
  const battlefieldRef = useRef<HTMLDivElement>(null)
  const prevPhase = useRef(state.phase)

  const actorId = state.queue[state.queueIdx]
  const actor   = state.units.find(u => u.id === actorId && u.hp > 0) ?? null
  const mainActions = actor ? getMainActions(actor.class, actor.level, actor.magePath) : []

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
    if (prevPhase.current !== state.phase && state.phase !== 'game-over') {
      setBannerText(state.phase === 'player-turn' ? '🛡 Твоя черга' : '⚔ Хід ворога')
      const t = setTimeout(() => setBannerText(null), 1600)
      prevPhase.current = state.phase
      return () => clearTimeout(t)
    }
    prevPhase.current = state.phase
  }, [state.phase])

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

  const pendingMage = state.pendingMageLevelUp
    ? state.units.find(u => u.id === state.pendingMageLevelUp && u.side === 'player') ?? null
    : null

  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column',
      minHeight: '100vh', background: '#faf8f5', color: 'var(--text)',
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
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#b07850' }}>✦ Серафити</div>
            {towerFloor && <div style={{ fontSize: 11, color: '#b07850', fontWeight: 600, opacity: 0.8 }}>🗼 {towerFloor.floor}/{TOWER_FLOORS.length}</div>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {towerFloor ? `${towerFloor.name} · ` : ''}Раунд {state.round}
          </div>
        </div>
        <TurnQueue queue={state.queue} units={state.units} currentIdx={state.queueIdx} />
      </div>

      {/* Battlefield */}
      <div
        ref={battlefieldRef}
        style={{
          flex: 1, padding: '10px 16px 270px', display: 'flex', flexDirection: 'column', gap: 2,
          position: 'relative',
          backgroundImage: [
            'repeating-linear-gradient(90deg, transparent, transparent 23px, rgba(176,120,80,0.04) 23px, rgba(176,120,80,0.04) 24px)',
            'repeating-linear-gradient(0deg,  transparent, transparent 23px, rgba(176,120,80,0.04) 23px, rgba(176,120,80,0.04) 24px)',
          ].join(','),
        }}
      >
        <ProjectileLayer battlefieldRef={battlefieldRef} events={state.events} />

        {/* AI side: rows 2→1→0 */}
        <div style={{
          borderRadius: 8, padding: '6px 4px 4px',
          background: 'rgba(192,112,112,0.05)',
          border: '1px solid rgba(192,112,112,0.08)',
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#c07070', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4, paddingLeft: 2 }}>
            Ворог
          </div>
          {([2, 1, 0] as Row[]).map(row => (
            <div key={row}>
              <div style={{ fontSize: 9, color: 'rgba(192,112,112,0.6)', marginBottom: 2, paddingLeft: 2 }}>{ROW_LABEL[row]}</div>
              <UnitRow
                units={state.units} side="ai" row={row}
                activeId={actor?.side === 'ai' ? actorId : null}
                targetIds={targetIds} maxSlots={ROW_SLOTS[row]}
                floatsMap={floatsMap} onSelectUnit={handleUnitClick} onInfoUnit={handleUnitInfo}
              />
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--border)', margin: '2px 0', position: 'relative' }}>
          <div style={{ position: 'absolute', left: '50%', top: -9, transform: 'translateX(-50%)', fontSize: 16, background: '#faf8f5', padding: '0 8px', color: 'var(--muted)' }}>
            ⚔
          </div>
        </div>

        {/* Player side: rows 0→1→2 */}
        <div style={{
          borderRadius: 8, padding: '4px 4px 6px',
          background: 'rgba(111,166,122,0.05)',
          border: '1px solid rgba(111,166,122,0.08)',
        }}>
          {([0, 1, 2] as Row[]).map(row => (
            <div key={row}>
              <div style={{ fontSize: 9, color: 'rgba(111,166,122,0.7)', marginBottom: 2, paddingLeft: 2 }}>{ROW_LABEL[row]}</div>
              <UnitRow
                units={state.units} side="player" row={row}
                activeId={actor?.side === 'player' ? actorId : null}
                targetIds={targetIds} maxSlots={ROW_SLOTS[row]}
                floatsMap={floatsMap} onSelectUnit={handleUnitClick} onInfoUnit={handleUnitInfo}
              />
            </div>
          ))}
          <div style={{ fontSize: 10, fontWeight: 600, color: '#7aaa82', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 4, paddingLeft: 2 }}>
            Твоя армія
          </div>
        </div>
      </div>

      {/* Fixed bottom panel */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 560, zIndex: 20,
        background: '#fff', borderTop: '1px solid var(--border)',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
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
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
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
              <button onClick={onRestart}
                style={{ padding: '10px 28px', background: '#7aaa82', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Новий бій
              </button>
            </div>
          )

        ) : isPlayerTurn && actor ? (
          <div style={{ padding: '10px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                background: `${SIDE_COLOR[actor.side]}18`, border: `1.5px solid ${SIDE_COLOR[actor.side]}55`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {CLASS_SVG[actor.class] && (() => {
                  const AvatarSVG = CLASS_SVG[actor.class]
                  return <AvatarSVG color={SIDE_COLOR[actor.side]} size={20} />
                })()}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{actor.name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>HP {actor.hp}/{actor.maxHp}</div>
              </div>
              {state.needsTarget && (
                <div style={{ marginLeft: 'auto', fontSize: 12, color: '#b07850', fontWeight: 500 }}>
                  Обери ціль →
                </div>
              )}
            </div>
            {!state.needsTarget ? (
              <div style={{ display: 'flex', gap: 8 }}>
                {mainActions.map(a => {
                  let disabled = false
                  if (a === 'provoke' && actor) {
                    const enemySide = actor.side === 'player' ? 'ai' : 'player'
                    disabled = !state.units.some(u => u.side === enemySide && u.hp > 0 && u.row === 0)
                  }
                  return (
                    <ActionBtn key={a} actionKey={a} selected={state.selectedAction === a}
                      onSelect={() => handleSelectAction(a)} disabled={disabled} />
                  )
                })}
              </div>
            ) : (
              <button onClick={() => dispatch({ type: 'CANCEL_ACTION' })}
                style={{ padding: '10px 20px', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>
                Скасувати
              </button>
            )}
          </div>

        ) : (
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            {state.phase === 'ai-thinking' ? `${actor?.name ?? 'Ворог'} думає...` : ''}
          </div>
        )}
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

function TowerMap({ floorIdx, playerUnits, onEnterBattle, onBackToMenu }: {
  floorIdx: number
  playerUnits: GameUnit[]
  onEnterBattle: () => void
  onBackToMenu: () => void
}) {
  const currentFloor = TOWER_FLOORS[floorIdx]

  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', minHeight: '100vh', background: '#faf8f5',
      color: 'var(--text)', fontFamily: "'Inter', sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 20px 0', borderBottom: '1px solid var(--border)', background: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button onClick={onBackToMenu} style={{
            padding: '6px 10px', fontSize: 12, color: 'var(--muted)',
            background: 'transparent', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>← Меню</button>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 800, color: '#b07850', textAlign: 'center' }}>🗼 Тауер Серафітів</div>
          <div style={{ width: 56 }} />
        </div>
        {/* Floor progress bar */}
        <div style={{ display: 'flex', gap: 3, paddingBottom: 14 }}>
          {TOWER_FLOORS.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 5, borderRadius: 3,
              background: i < floorIdx ? '#7aaa82' : i === floorIdx ? '#b07850' : 'rgba(0,0,0,0.1)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 24px' }}>

        {/* Current floor info */}
        <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(176,120,80,0.07)', border: '1px solid rgba(176,120,80,0.22)', marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#b07850', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
            Поверх {currentFloor.floor} з {TOWER_FLOORS.length}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{currentFloor.name}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            ⚔ Вороги: {aiCompositionText(currentFloor.aiCounts)}
          </div>
        </div>

        {/* Floor list */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            Поверхи тауера
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {TOWER_FLOORS.map((floor, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9,
                background: i === floorIdx ? 'rgba(176,120,80,0.08)' : '#fff',
                border: `1px solid ${i === floorIdx ? 'rgba(176,120,80,0.3)' : 'rgba(0,0,0,0.07)'}`,
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: i < floorIdx ? '#7aaa82' : i === floorIdx ? '#b07850' : 'rgba(0,0,0,0.07)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: i <= floorIdx ? '#fff' : 'var(--muted)',
                }}>
                  {i < floorIdx ? '✓' : floor.floor}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: i === floorIdx ? 700 : 500, color: i === floorIdx ? '#b07850' : 'var(--text)' }}>
                    {floor.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                    {aiCompositionText(floor.aiCounts)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Player units summary */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            Твоя армія
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {playerUnits.map(u => {
              const AvatarSVG = CLASS_SVG[u.class]
              const color = SIDE_COLOR.player
              const levelName = u.class === 'warrior' ? WARRIOR_LEVELS[u.level ?? 1]?.name
                              : u.class === 'archer'  ? ARCHER_LEVELS[u.level ?? 1]?.name
                              : u.class === 'mage' && u.level && u.level > 1 && u.magePath
                                ? MAGE_PATHS[u.magePath][u.level]?.name
                                : u.class === 'mage' ? MAGE_BASE.name
                                : undefined
              const maxLevel = u.class === 'warrior' ? 4 : u.class === 'archer' ? 3 : u.class === 'mage' ? 5 : 0
              const xpPct = maxLevel > 0 && (u.level ?? 1) < maxLevel
                ? Math.min(100, ((u.xp ?? 0) / (u.xpToNext ?? 1)) * 100) : 0
              return (
                <div key={u.id} style={{
                  width: 58, borderRadius: 8, padding: '7px 6px 6px',
                  background: '#fff', border: `1.5px solid ${color}44`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                }}>
                  <AvatarSVG color={color} size={22} />
                  <div style={{ fontSize: 8, fontWeight: 700, color: '#b07850', textAlign: 'center', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 52 }}>
                    {levelName ?? u.name}
                  </div>
                  {xpPct > 0 && (
                    <div style={{ width: '100%', height: 3, background: 'rgba(176,120,80,0.15)', borderRadius: 2 }}>
                      <div style={{ width: `${xpPct}%`, height: '100%', background: '#b07850', borderRadius: 2 }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Enter battle */}
      <div style={{ padding: '12px 20px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', background: '#fff', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button onClick={onEnterBattle} style={{
          width: '100%', padding: '15px 0', fontSize: 16, fontWeight: 700,
          background: '#b07850', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer',
          boxShadow: '0 2px 14px rgba(176,120,80,0.3)', fontFamily: 'inherit',
        }}>
          ⚔ Вступити в бій
        </button>
      </div>
    </div>
  )
}

// ── Root component ─────────────────────────────────────────────────────────────
type RootScreen = 'landing' | 'army-builder' | 'placement' | 'battle' | 'tower-map' | 'tower-battle'

export default function SacredGame() {
  const [screen, setScreen] = useState<RootScreen>('landing')
  const [isTowerMode, setIsTowerMode] = useState(false)
  const [counts, setCounts] = useState<ArmyCounts | null>(null)
  const [playerUnits, setPlayerUnits] = useState<GameUnit[] | null>(null)
  const [towerFloorIdx, setTowerFloorIdx] = useState(0)
  const [towerCounts, setTowerCounts] = useState<ArmyCounts | null>(null)
  const [towerUnits, setTowerUnits] = useState<GameUnit[] | null>(null)
  const [savedTowerFloor, setSavedTowerFloor] = useState<number | null>(null)

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
    saveTowerProgress(nextIdx + 1, nextUnits, towerCounts!)
    setTowerFloorIdx(nextIdx)
    setTowerUnits(nextUnits)
    setScreen('tower-map')
  }

  function handleTowerLose() {
    clearTowerSave()
    setScreen('landing')
  }

  if (screen === 'landing') return (
    <Landing
      onNewGame={handleNewGame}
      onStartTower={handleStartTower}
      onContinueTower={handleContinueTower}
      savedTowerFloor={savedTowerFloor}
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
  return <Battle counts={counts!} playerUnits={playerUnits ?? undefined} onRestart={() => setScreen('landing')} />
}
