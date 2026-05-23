'use client'

import { useReducer, useEffect, useRef, useState } from 'react'
import {
  createInitialState, battleReducer, getMainActions, getValidTargets, getBonusTargets, ACTIONS,
} from '@/lib/sacred/game'
import type { GameUnit, ActionKey, Side, Row, LogEntry, ArmyCounts, BattleEvent } from '@/lib/sacred/types'
import ArmyBuilder from './ArmyBuilder'
import PlacementScreen from './PlacementScreen'

const SIDE_COLOR: Record<Side, string> = { player: '#7aaa82', ai: '#c07070' }
const ROW_LABEL: Record<number, string> = { 0: 'Передній', 1: 'Дальній', 2: 'Підтримка' }
const BUFF_ICON: Record<string, string> = {
  defense_up: '🛡', damage_up: '📯', aimed: '🎯',
  damage_taken_up: '🩸', exhausted: '💤', weakness: '🌑',
}
const BUFF_LABEL: Record<string, string> = {
  defense_up: '+50% захист цього ходу',
  damage_up: '+20% урон атак',
  aimed: 'Прицілення — бонус на наступні постріли',
  damage_taken_up: 'Розрив — +30% отримуваного урону',
  exhausted: 'Виснаження — ходить останнім',
  weakness: 'Слабкість — -25% урон атак',
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

type AvatarComponent = React.ComponentType<{ color: string; size?: number }>
const CLASS_SVG: Record<string, AvatarComponent> = {
  warrior: WarriorSVG, archer: ArcherSVG, mage: MageSVG,
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
          width: 76, minHeight: 86, padding: '6px 6px 4px',
          background: alive ? '#ffffff' : 'rgba(0,0,0,0.04)',
          border: `2px solid ${borderColor}`,
          borderRadius: 8,
          cursor: alive ? 'pointer' : 'default',
          opacity: alive ? 1 : 0.35,
          transform: isActive ? 'scale(1.06)' : isTargetable ? 'scale(1.03)' : 'scale(1)',
          boxShadow: isTargetable && !isActive ? `0 2px 8px ${color}44` : '0 1px 3px rgba(0,0,0,0.08)',
          transition: 'border-color 0.15s, transform 0.1s',
          position: 'relative',
        }}
      >
        {floats.map(f => (
          <span key={f.id} className={`float-${f.type}`}>{f.text}</span>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          <AvatarSVG color={alive ? color : '#aaa'} size={24} />
          {isActive && <span style={{ fontSize: 8, color: '#b07850', fontWeight: 700 }}>ХОДА</span>}
          {isTargetable && !isActive && <span style={{ fontSize: 9, color, fontWeight: 700 }}>➜</span>}
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
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', minHeight: 96 }}>
      {Array.from({ length: maxSlots }, (_, i) => {
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
function ActionBtn({ actionKey, selected, onSelect }: {
  actionKey: ActionKey; selected: boolean; onSelect: () => void
}) {
  const def = ACTIONS[actionKey]
  return (
    <button
      onClick={onSelect}
      style={{
        flex: '1 1 0', padding: '10px 12px', borderRadius: 8, textAlign: 'left',
        background: selected ? 'rgba(176,120,80,0.12)' : '#fff',
        border: `1px solid ${selected ? '#b07850' : 'rgba(0,0,0,0.1)'}`,
        color: 'var(--text)', cursor: 'pointer', transition: 'all 0.12s',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{def.label}</div>
      <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.4 }}>{def.desc}</div>
    </button>
  )
}

// ── Unit info sheet ────────────────────────────────────────────────────────────
function UnitInfoSheet({ unit, onClose }: { unit: GameUnit; onClose: () => void }) {
  const color = SIDE_COLOR[unit.side]
  const alive = unit.hp > 0
  const AvatarSVG = CLASS_SVG[unit.class]
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
        width: '100%', maxWidth: 560,
        background: '#faf8f5', borderRadius: '16px 16px 0 0',
        border: `1px solid ${color}55`, borderBottom: 'none',
        zIndex: 51, padding: '14px 20px 36px',
        fontFamily: "'Inter', sans-serif",
      }}>
        <div style={{ width: 36, height: 3, background: 'rgba(0,0,0,0.1)', borderRadius: 2, margin: '0 auto 14px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10, flexShrink: 0,
            background: `${color}18`, border: `1.5px solid ${color}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AvatarSVG color={color} size={26} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color }}>{unit.name}</div>
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
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
            <span>HP</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{unit.hp} / {unit.maxHp}</span>
          </div>
          <HpBar hp={unit.hp} maxHp={unit.maxHp} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 12 }}>
          {stats.map(([label, value]) => (
            <div key={label} style={{ padding: '7px 10px', borderRadius: 8, background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 1 }}>{value}</div>
            </div>
          ))}
        </div>
        {unit.buffs.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Активні ефекти</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {unit.buffs.map(b => (
                <div key={b.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderRadius: 8,
                  background: '#fff', border: '1px solid rgba(0,0,0,0.08)',
                }}>
                  <span style={{ fontSize: 14 }}>{BUFF_ICON[b.type] ?? '✦'}</span>
                  <span style={{ fontSize: 12, color: 'var(--text)', flex: 1 }}>{BUFF_LABEL[b.type] ?? b.type}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{b.turnsLeft} хід.</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ── Landing screen ─────────────────────────────────────────────────────────────
function Landing({ onNewGame }: { onNewGame: () => void }) {
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
      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 300, marginBottom: 44 }}>
        Тактична покрокова битва. Обирай армію і веди її до перемоги.
      </div>
      <button
        onClick={onNewGame}
        style={{
          padding: '16px 44px', fontSize: 16, fontWeight: 700,
          background: '#b07850', color: '#fff',
          border: 'none', borderRadius: 12, cursor: 'pointer',
          boxShadow: '0 2px 12px rgba(176,120,80,0.3)',
        }}
      >
        ⚔ Нова гра
      </button>
      <div style={{ marginTop: 52, display: 'flex', gap: 36, fontSize: 11, color: 'var(--muted)' }}>
        {([['warrior', 'Воїни'], ['archer', 'Лучники'], ['mage', 'Маги']] as const).map(([cls, label]) => {
          const AvatarSVG = CLASS_SVG[cls]
          return (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'center' }}>
                <AvatarSVG color="#b07850" size={28} />
              </div>
              {label}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Battle component ───────────────────────────────────────────────────────────
const ROW_SLOTS: Record<number, number> = { 0: 4, 1: 3, 2: 2 }

function Battle({ counts, playerUnits, onRestart }: { counts: ArmyCounts; playerUnits?: GameUnit[]; onRestart: () => void }) {
  const [state, dispatch] = useReducer(
    battleReducer,
    undefined as unknown as ArmyCounts,
    () => createInitialState(counts, playerUnits),
  )
  const [floats, setFloats]       = useState<BattleEvent[]>([])
  const [infoUnit, setInfoUnit]   = useState<GameUnit | null>(null)
  const [bannerText, setBannerText] = useState<string | null>(null)
  const battlefieldRef = useRef<HTMLDivElement>(null)
  const prevPhase = useRef(state.phase)

  const actorId = state.queue[state.queueIdx]
  const actor   = state.units.find(u => u.id === actorId && u.hp > 0) ?? null
  const mainActions = actor ? getMainActions(actor.class) : []

  const targetIds = state.pendingPlayerBonus && actor
    ? getBonusTargets(state.pendingPlayerBonus, actor, state.units)
    : actor && state.selectedAction
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
    if (state.pendingAIBonus) {
      const t = setTimeout(() => dispatch({ type: 'AI_RUN_BONUS' }), 4800)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => dispatch({ type: 'AI_TAKE_TURN' }), 4800)
    return () => clearTimeout(t)
  }, [state.phase, state.queueIdx, state.pendingAIBonus])

  function handleSelectAction(a: ActionKey) {
    if (state.selectedAction === a) { dispatch({ type: 'CANCEL_ACTION' }); return }
    dispatch({ type: 'SELECT_ACTION', action: a })
  }

  function handleUnitClick(id: string) {
    if (state.pendingPlayerBonus) { dispatch({ type: 'CONFIRM_BONUS_TARGET', targetId: id }); return }
    if (!state.needsTarget) return
    dispatch({ type: 'CONFIRM_TARGET', targetId: id })
  }

  function handleUnitInfo(id: string) {
    setInfoUnit(state.units.find(x => x.id === id) ?? null)
  }

  const isPlayerTurn = state.phase === 'player-turn'
  const bannerBg = state.phase === 'player-turn'
    ? 'rgba(111,166,122,0.95)' : 'rgba(192,112,112,0.95)'

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
          <div style={{ fontSize: 15, fontWeight: 700, color: '#b07850' }}>✦ Серафити</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Раунд {state.round}</div>
        </div>
        <TurnQueue queue={state.queue} units={state.units} currentIdx={state.queueIdx} />
      </div>

      {/* Battlefield */}
      <div
        ref={battlefieldRef}
        style={{
          flex: 1, padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 2,
          position: 'relative',
          backgroundImage: [
            'repeating-linear-gradient(90deg, transparent, transparent 23px, rgba(176,120,80,0.04) 23px, rgba(176,120,80,0.04) 24px)',
            'repeating-linear-gradient(0deg,  transparent, transparent 23px, rgba(176,120,80,0.04) 23px, rgba(176,120,80,0.04) 24px)',
          ].join(','),
        }}
      >
        <ProjectileLayer battlefieldRef={battlefieldRef} events={state.events} />

        {/* AI side: rows 2→1→0 */}
        <div style={{ fontSize: 10, fontWeight: 600, color: '#c07070', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>
          Ворог
        </div>
        {([2, 1, 0] as Row[]).map(row => (
          <div key={row}>
            <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 2 }}>{ROW_LABEL[row]}</div>
            <UnitRow
              units={state.units} side="ai" row={row}
              activeId={actor?.side === 'ai' ? actorId : null}
              targetIds={targetIds} maxSlots={ROW_SLOTS[row]}
              floatsMap={floatsMap} onSelectUnit={handleUnitClick} onInfoUnit={handleUnitInfo}
            />
          </div>
        ))}

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0', position: 'relative' }}>
          <div style={{ position: 'absolute', left: '50%', top: -9, transform: 'translateX(-50%)', fontSize: 16, background: '#faf8f5', padding: '0 8px', color: 'var(--muted)' }}>
            ⚔
          </div>
        </div>

        {/* Player side: rows 0→1→2 */}
        {([0, 1, 2] as Row[]).map(row => (
          <div key={row}>
            <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 2 }}>{ROW_LABEL[row]}</div>
            <UnitRow
              units={state.units} side="player" row={row}
              activeId={actor?.side === 'player' ? actorId : null}
              targetIds={targetIds} maxSlots={ROW_SLOTS[row]}
              floatsMap={floatsMap} onSelectUnit={handleUnitClick} onInfoUnit={handleUnitInfo}
            />
          </div>
        ))}
        <div style={{ fontSize: 10, fontWeight: 600, color: '#7aaa82', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 2 }}>
          Твоя армія
        </div>
      </div>

      {/* Action panel — fixed height so battlefield never jumps */}
      <div style={{
        minHeight: 128, display: 'flex', flexDirection: 'column', justifyContent: 'center',
        borderTop: '1px solid var(--border)', background: '#fff',
      }}>
        {state.phase === 'game-over' ? (
          <div style={{ padding: '16px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: state.winner === 'player' ? '#7aaa82' : '#c07070', marginBottom: 12 }}>
              {state.winner === 'player' ? '🏆 Перемога!' : '💀 Поразка'}
            </div>
            <button onClick={onRestart}
              style={{ padding: '10px 28px', background: '#7aaa82', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Новий бій
            </button>
          </div>

        ) : state.pendingPlayerBonus && actor ? (
          <div style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8,
              color: state.pendingPlayerBonus === 'warrior-cry' ? '#a891c4' : '#c4a040' }}>
              {state.pendingPlayerBonus === 'warrior-cry'
                ? `📯 ${actor.name} — оберіть союзника для бойового кличу`
                : `🏹 ${actor.name} — оберіть ціль для додаткового пострілу`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Натисніть на підсвіченого юніта на полі бою</div>
            <button onClick={() => dispatch({ type: 'CANCEL_ACTION' })}
              style={{ marginTop: 8, padding: '6px 14px', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>
              Пропустити бонус
            </button>
          </div>

        ) : state.pendingDebuff && actor ? (
          <div style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#a891c4', marginBottom: 8 }}>
              ✨ {actor.name} — оберіть дебаф:
            </div>
            {!state.needsTarget ? (
              <div style={{ display: 'flex', gap: 8 }}>
                {(['debuff_rupture', 'debuff_exhaust', 'debuff_weakness'] as ActionKey[]).map(a => (
                  <ActionBtn key={a} actionKey={a} selected={state.selectedAction === a}
                    onSelect={() => handleSelectAction(a)} />
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13, color: '#b07850' }}>Обери ворога →</div>
                <button onClick={() => dispatch({ type: 'CANCEL_ACTION' })}
                  style={{ padding: '8px 16px', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>
                  Скасувати
                </button>
              </div>
            )}
          </div>

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
                {mainActions.map(a => (
                  <ActionBtn key={a} actionKey={a} selected={state.selectedAction === a}
                    onSelect={() => handleSelectAction(a)} />
                ))}
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

      <BattleLog entries={state.log} />

      {infoUnit && <UnitInfoSheet unit={infoUnit} onClose={() => setInfoUnit(null)} />}
    </div>
  )
}

// ── Root component ─────────────────────────────────────────────────────────────
export default function SacredGame() {
  const [screen, setScreen] = useState<'landing' | 'army-builder' | 'placement' | 'battle'>('landing')
  const [counts, setCounts] = useState<ArmyCounts | null>(null)
  const [playerUnits, setPlayerUnits] = useState<GameUnit[] | null>(null)

  if (screen === 'landing') return <Landing onNewGame={() => setScreen('army-builder')} />
  if (screen === 'army-builder') return (
    <ArmyBuilder onStart={c => { setCounts(c); setScreen('placement') }} />
  )
  if (screen === 'placement') return (
    <PlacementScreen
      counts={counts!}
      onStart={units => { setPlayerUnits(units); setScreen('battle') }}
      onBack={() => setScreen('army-builder')}
    />
  )
  return <Battle counts={counts!} playerUnits={playerUnits ?? undefined} onRestart={() => setScreen('landing')} />
}
