'use client'

import { useReducer, useEffect, useRef, useState, useCallback } from 'react'
import {
  createInitialState, battleReducer, getMainActions, getValidTargets, getBonusTargets, ACTIONS,
} from '@/lib/sacred/game'
import type { GameUnit, ActionKey, Side, Row, LogEntry, ArmyCounts, BattleEvent } from '@/lib/sacred/types'
import ArmyBuilder from './ArmyBuilder'
import PlacementScreen from './PlacementScreen'

const SIDE_COLOR: Record<Side, string> = { player: '#7aaa82', ai: '#c07070' }
const CLASS_ICON: Record<string, string> = { warrior: '⚔', archer: '🏹', mage: '✨' }
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

const FLOAT_COLOR: Record<BattleEvent['type'], string> = {
  damage: '#c0392b',
  crit:   '#b07850',
  miss:   '#9b9289',
  evade:  '#4a86a8',
  heal:   '#5a9a6a',
  buff:   '#8060a8',
  debuff: '#c07070',
}

// ── Unit card ──────────────────────────────────────────────────────────────────
function UnitCard({ unit, isActive, isTargetable, onSelect, onInfo, floats }: {
  unit: GameUnit; isActive: boolean; isTargetable: boolean
  onSelect?: () => void; onInfo?: () => void
  floats: BattleEvent[]
}) {
  const alive = unit.hp > 0
  const color = SIDE_COLOR[unit.side]
  const borderColor = isActive ? '#b07850' : isTargetable ? color : 'rgba(0,0,0,0.12)'

  function handleClick() {
    if (!alive) return
    if (isTargetable) onSelect?.()
    else onInfo?.()
  }

  return (
    <div
      onClick={handleClick}
      style={{
        width: 76, minHeight: 86, padding: '6px 6px 4px',
        background: alive ? '#ffffff' : 'rgba(0,0,0,0.04)',
        border: `2px solid ${borderColor}`,
        borderRadius: 8,
        cursor: alive ? 'pointer' : 'default',
        opacity: alive ? 1 : 0.3,
        transform: isActive ? 'scale(1.06)' : isTargetable ? 'scale(1.03)' : 'scale(1)',
        boxShadow: isActive ? `0 2px 12px ${color}66` : isTargetable ? `0 2px 8px ${color}44` : '0 1px 3px rgba(0,0,0,0.08)',
        transition: 'border-color 0.15s, transform 0.1s',
        flexShrink: 0, position: 'relative',
      }}
    >
      {/* Floating combat numbers */}
      {floats.map(f => (
        <span key={f.id} className="float-text" style={{ color: FLOAT_COLOR[f.type] }}>
          {f.text}
        </span>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: 13 }}>{CLASS_ICON[unit.class]}</span>
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
          <div key={i} style={{ width: 76, height: 86, border: '1px dashed rgba(0,0,0,0.12)', borderRadius: 8, flexShrink: 0 }} />
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
          return (
            <div key={`${id}-${i}`} style={{
              width: 32, height: 32, borderRadius: 6, flexShrink: 0,
              background: isCurrent ? '#b07850' : 'rgba(0,0,0,0.06)',
              border: `1px solid ${isCurrent ? '#b07850' : SIDE_COLOR[u.side] + '88'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, opacity: isCurrent ? 1 : 0.55,
              transform: isCurrent ? 'scale(1.18)' : 'scale(1)',
              transition: 'transform 0.2s',
            }}>
              {CLASS_ICON[u.class]}
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
  const stats: [string, string][] = [
    ['⚔ Урон', `${unit.minDmg}–${unit.maxDmg}`],
    ['🎯 Точність', `${Math.round(unit.accuracy * 100)}%`],
    ['🛡 Захист', `${Math.round(unit.defense * 100)}%`],
    ['⚡ Ініціатива', `${unit.initiative}`],
    ['👁 Ухилення', `${Math.round(unit.evasion * 100)}%`],
    ['💥 Крит', `${Math.round(unit.critChance * 100)}% ×${unit.critMult}`],
    ...(unit.counter > 0 ? [['↩ Контратака', `${Math.round(unit.counter * 100)}%`] as [string, string]] : []),
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

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10, flexShrink: 0,
            background: `${color}18`, border: `1.5px solid ${color}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
          }}>
            {CLASS_ICON[unit.class]}
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

        {/* HP */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
            <span>HP</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{unit.hp} / {unit.maxHp}</span>
          </div>
          <HpBar hp={unit.hp} maxHp={unit.maxHp} />
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 12 }}>
          {stats.map(([label, value]) => (
            <div key={label} style={{
              padding: '7px 10px', borderRadius: 8,
              background: '#fff', border: '1px solid rgba(0,0,0,0.08)',
            }}>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 1 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Active buffs */}
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
      <div style={{ fontSize: 52, marginBottom: 18, filter: 'drop-shadow(0 0 24px #ffd70055)' }}>✦</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: '#b07850', letterSpacing: '-0.02em', marginBottom: 10 }}>
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
      <div style={{ marginTop: 52, display: 'flex', gap: 32, fontSize: 11, color: 'var(--muted)' }}>
        {[['⚔', 'Воїни'], ['🏹', 'Лучники'], ['✨', 'Маги']].map(([icon, label]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>{label}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Battle component ───────────────────────────────────────────────────────────
// Row slot counts: warriors 0→4, archers 1→3, mages 2→2
const ROW_SLOTS: Record<number, number> = { 0: 4, 1: 3, 2: 2 }

function Battle({ counts, playerUnits, onRestart }: { counts: ArmyCounts; playerUnits?: GameUnit[]; onRestart: () => void }) {
  const [state, dispatch] = useReducer(
    battleReducer,
    undefined as unknown as ArmyCounts,
    () => createInitialState(counts, playerUnits),
  )
  const [floats, setFloats] = useState<BattleEvent[]>([])
  const [infoUnit, setInfoUnit] = useState<GameUnit | null>(null)

  const actorId = state.queue[state.queueIdx]
  const actor   = state.units.find(u => u.id === actorId && u.hp > 0) ?? null
  const mainActions = actor ? getMainActions(actor.class) : []

  const targetIds = state.pendingPlayerBonus && actor
    ? getBonusTargets(state.pendingPlayerBonus, actor, state.units)
    : actor && state.selectedAction
      ? getValidTargets(actor, state.selectedAction, state.units)
      : []

  // Accumulate floats — each batch stays until its own 3500ms timer fires
  useEffect(() => {
    if (!state.events.length) return
    const batch = state.events
    setFloats(prev => [...prev, ...batch])
    const ids = new Set(batch.map(e => e.id))
    const t = setTimeout(() => {
      setFloats(prev => prev.filter(f => !ids.has(f.id)))
    }, 6000)
    return () => clearTimeout(t)
  }, [state.events])

  const floatsMap = floats.reduce((m, e) => {
    m.set(e.unitId, [...(m.get(e.unitId) ?? []), e])
    return m
  }, new Map<string, BattleEvent[]>())

  // AI turn trigger — main action first, then bonus (if any) after another delay
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
    if (state.pendingPlayerBonus) {
      dispatch({ type: 'CONFIRM_BONUS_TARGET', targetId: id })
      return
    }
    if (!state.needsTarget) return
    dispatch({ type: 'CONFIRM_TARGET', targetId: id })
  }

  function handleUnitInfo(id: string) {
    const u = state.units.find(x => x.id === id) ?? null
    setInfoUnit(u)
  }

  const isPlayerTurn = state.phase === 'player-turn'

  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column',
      minHeight: '100vh', background: '#faf8f5', color: 'var(--text)',
      fontFamily: "'Inter', sans-serif",
    }}>

      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#b07850' }}>✦ Серафити</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Раунд {state.round}</div>
        </div>
        <TurnQueue queue={state.queue} units={state.units} currentIdx={state.queueIdx} />
      </div>

      {/* Battlefield */}
      <div style={{ flex: 1, padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>

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

      {/* Action panel — fixed height so battlefield never jumps between turns */}
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
          /* Warrior / archer bonus target selection */
          <div style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8,
              color: state.pendingPlayerBonus === 'warrior-cry' ? '#a891c4' : '#c4a040' }}>
              {state.pendingPlayerBonus === 'warrior-cry'
                ? `📯 ${actor.name} — оберіть союзника для бойового кличу`
                : `🏹 ${actor.name} — оберіть ціль для додаткового пострілу`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              Натисніть на підсвіченого юніта на полі бою
            </div>
            <button onClick={() => dispatch({ type: 'CANCEL_ACTION' })}
              style={{ marginTop: 8, padding: '6px 14px', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>
              Пропустити бонус
            </button>
          </div>

        ) : state.pendingDebuff && actor ? (
          /* Mage debuff selection */
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
          /* Normal player action panel */
          <div style={{ padding: '10px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>{CLASS_ICON[actor.class]}</span>
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

      {/* Unit info sheet */}
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
