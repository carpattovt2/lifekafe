'use client'

import { useReducer, useEffect, useRef, useState } from 'react'
import {
  createInitialState, battleReducer, getMainActions, getValidTargets, ACTIONS,
} from '@/lib/sacred/game'
import type { GameUnit, ActionKey, Side, Row, LogEntry, ArmyCounts, BattleEvent } from '@/lib/sacred/types'
import ArmyBuilder from './ArmyBuilder'

const SIDE_COLOR: Record<Side, string> = { player: '#7aaa82', ai: '#c07070' }
const CLASS_ICON: Record<string, string> = { warrior: '⚔', archer: '🏹', mage: '✨' }
const ROW_LABEL: Record<number, string> = { 0: 'Передній', 1: 'Дальній', 2: 'Підтримка' }
const BUFF_ICON: Record<string, string> = {
  defense_up: '🛡', damage_up: '📯', aimed: '🎯',
  damage_taken_up: '🩸', exhausted: '💤', weakness: '🌑',
}

// ── HP bar ─────────────────────────────────────────────────────────────────────
function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = Math.max(0, hp / maxHp)
  const color = pct > 0.5 ? '#7aaa82' : pct > 0.25 ? '#c4a040' : '#c07070'
  return (
    <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginTop: 4 }}>
      <div style={{ width: `${pct * 100}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s' }} />
    </div>
  )
}

const FLOAT_COLOR: Record<BattleEvent['type'], string> = {
  damage: '#ef4444',
  crit:   '#ffd700',
  miss:   '#888888',
  evade:  '#7ea8c4',
  heal:   '#7aaa82',
  buff:   '#a891c4',
  debuff: '#c07070',
}

// ── Unit card ──────────────────────────────────────────────────────────────────
function UnitCard({ unit, isActive, isTargetable, onSelect, floats }: {
  unit: GameUnit; isActive: boolean; isTargetable: boolean; onSelect?: () => void
  floats: BattleEvent[]
}) {
  const alive = unit.hp > 0
  const color = SIDE_COLOR[unit.side]
  const borderColor = isActive ? '#ffd700' : isTargetable ? color : 'rgba(255,255,255,0.1)'

  return (
    <div
      onClick={isTargetable && alive ? onSelect : undefined}
      style={{
        width: 76, minHeight: 86, padding: '6px 6px 4px',
        background: alive ? 'rgba(20,18,16,0.85)' : 'rgba(20,18,16,0.3)',
        border: `2px solid ${borderColor}`,
        borderRadius: 8,
        cursor: isTargetable && alive ? 'pointer' : 'default',
        opacity: alive ? 1 : 0.3,
        transform: isActive ? 'scale(1.06)' : isTargetable ? 'scale(1.03)' : 'scale(1)',
        boxShadow: isActive ? `0 0 14px ${color}88` : isTargetable ? `0 0 8px ${color}55` : 'none',
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
        {isActive && <span style={{ fontSize: 8, color: '#ffd700', fontWeight: 700 }}>ХОДА</span>}
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
            <span key={b.id} style={{ fontSize: 8, padding: '1px 2px', borderRadius: 3, background: 'rgba(255,255,255,0.1)', color: 'var(--muted)' }}>
              {BUFF_ICON[b.type] ?? '✦'}{b.turnsLeft}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Unit row ───────────────────────────────────────────────────────────────────
function UnitRow({ units, side, row, activeId, targetIds, maxSlots, floatsMap, onSelectUnit }: {
  units: GameUnit[]; side: Side; row: Row; activeId: string | null
  targetIds: string[]; maxSlots: number; floatsMap: Map<string, BattleEvent[]>
  onSelectUnit: (id: string) => void
}) {
  const rowUnits = units.filter(u => u.side === side && u.row === row)
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', minHeight: 96 }}>
      {Array.from({ length: maxSlots }, (_, i) => {
        const unit = rowUnits.find(u => u.slot === i)
        if (!unit) return (
          <div key={i} style={{ width: 76, height: 86, border: '1px dashed rgba(255,255,255,0.07)', borderRadius: 8, flexShrink: 0 }} />
        )
        return (
          <UnitCard key={unit.id} unit={unit}
            isActive={unit.id === activeId}
            isTargetable={targetIds.includes(unit.id)}
            floats={floatsMap.get(unit.id) ?? []}
            onSelect={() => onSelectUnit(unit.id)}
          />
        )
      })}
    </div>
  )
}

// ── Turn queue ─────────────────────────────────────────────────────────────────
function TurnQueue({ queue, units, currentIdx }: { queue: string[]; units: GameUnit[]; currentIdx: number }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current?.children[currentIdx] as HTMLElement
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [currentIdx])

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
      <div ref={scrollRef} style={{ display: 'flex', gap: 5, padding: '0 4px', width: 'max-content' }}>
        {queue.map((id, i) => {
          const u = units.find(x => x.id === id)
          if (!u || u.hp === 0) return null
          const isCurrent = i === currentIdx
          return (
            <div key={`${id}-${i}`} style={{
              width: 32, height: 32, borderRadius: 6, flexShrink: 0,
              background: isCurrent ? '#ffd700' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${isCurrent ? '#ffd700' : SIDE_COLOR[u.side] + '44'}`,
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
    attack: 'var(--text)', miss: 'var(--muted)', evade: '#7ea8c4', crit: '#ffd700',
    heal: '#7aaa82', buff: '#a891c4', debuff: '#c07070', death: '#ef4444', info: 'rgba(255,255,255,0.3)',
  }

  return (
    <div style={{ height: 130, overflowY: 'auto', padding: '8px 14px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid var(--border)' }}>
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
        background: selected ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.05)',
        border: `1px solid ${selected ? '#ffd700' : 'rgba(255,255,255,0.12)'}`,
        color: 'var(--text)', cursor: 'pointer', transition: 'all 0.12s',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{def.label}</div>
      <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.4 }}>{def.desc}</div>
    </button>
  )
}

// ── Landing screen ─────────────────────────────────────────────────────────────
function Landing({ onNewGame }: { onNewGame: () => void }) {
  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', minHeight: '100vh', background: '#0e0d0b',
      color: 'var(--text)', fontFamily: "'Inter', sans-serif",
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 52, marginBottom: 18, filter: 'drop-shadow(0 0 24px #ffd70055)' }}>✦</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: '#ffd700', letterSpacing: '-0.02em', marginBottom: 10 }}>
        Серафити
      </div>
      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 300, marginBottom: 44 }}>
        Тактична покрокова битва. Обирай армію і веди її до перемоги.
      </div>
      <button
        onClick={onNewGame}
        style={{
          padding: '16px 44px', fontSize: 16, fontWeight: 700,
          background: '#ffd700', color: '#0e0d0b',
          border: 'none', borderRadius: 12, cursor: 'pointer',
          boxShadow: '0 0 28px #ffd70044',
        }}
      >
        ⚔ Нова гра
      </button>
      <div style={{ marginTop: 52, display: 'flex', gap: 32, fontSize: 11, color: 'rgba(255,255,255,0.18)' }}>
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

function Battle({ counts, onRestart }: { counts: ArmyCounts; onRestart: () => void }) {
  const [state, dispatch] = useReducer(battleReducer, counts, createInitialState)
  const [floats, setFloats] = useState<BattleEvent[]>([])

  const actorId = state.queue[state.queueIdx]
  const actor   = state.units.find(u => u.id === actorId && u.hp > 0) ?? null
  const mainActions = actor ? getMainActions(actor.class) : []

  const targetIds = actor && state.selectedAction
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
    }, 3500)
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
      const t = setTimeout(() => dispatch({ type: 'AI_RUN_BONUS' }), 1600)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => dispatch({ type: 'AI_TAKE_TURN' }), 1600)
    return () => clearTimeout(t)
  }, [state.phase, state.queueIdx, state.pendingAIBonus])

  function handleSelectAction(a: ActionKey) {
    if (state.selectedAction === a) { dispatch({ type: 'CANCEL_ACTION' }); return }
    dispatch({ type: 'SELECT_ACTION', action: a })
  }

  function handleUnitClick(id: string) {
    if (!state.needsTarget) return
    dispatch({ type: 'CONFIRM_TARGET', targetId: id })
  }

  const isPlayerTurn = state.phase === 'player-turn'

  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column',
      minHeight: '100vh', background: '#0e0d0b', color: 'var(--text)',
      fontFamily: "'Inter', sans-serif",
    }}>

      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#ffd700' }}>✦ Серафити</div>
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
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginBottom: 2 }}>{ROW_LABEL[row]}</div>
            <UnitRow
              units={state.units} side="ai" row={row}
              activeId={actor?.side === 'ai' ? actorId : null}
              targetIds={targetIds} maxSlots={ROW_SLOTS[row]}
              floatsMap={floatsMap} onSelectUnit={handleUnitClick}
            />
          </div>
        ))}

        {/* Divider */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '4px 0', position: 'relative' }}>
          <div style={{ position: 'absolute', left: '50%', top: -9, transform: 'translateX(-50%)', fontSize: 16, background: '#0e0d0b', padding: '0 8px', color: 'rgba(255,255,255,0.3)' }}>
            ⚔
          </div>
        </div>

        {/* Player side: rows 0→1→2 */}
        {([0, 1, 2] as Row[]).map(row => (
          <div key={row}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginBottom: 2 }}>{ROW_LABEL[row]}</div>
            <UnitRow
              units={state.units} side="player" row={row}
              activeId={actor?.side === 'player' ? actorId : null}
              targetIds={targetIds} maxSlots={ROW_SLOTS[row]}
              floatsMap={floatsMap} onSelectUnit={handleUnitClick}
            />
          </div>
        ))}
        <div style={{ fontSize: 10, fontWeight: 600, color: '#7aaa82', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 2 }}>
          Твоя армія
        </div>
      </div>

      {/* Action panel */}
      {state.phase === 'game-over' ? (
        <div style={{ padding: 20, textAlign: 'center', background: 'rgba(0,0,0,0.6)', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: state.winner === 'player' ? '#7aaa82' : '#c07070', marginBottom: 14 }}>
            {state.winner === 'player' ? '🏆 Перемога!' : '💀 Поразка'}
          </div>
          <button onClick={onRestart}
            style={{ padding: '12px 28px', background: '#7aaa82', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Новий бій
          </button>
        </div>

      ) : state.pendingDebuff && actor ? (
        /* Mage debuff selection */
        <div style={{ padding: '14px 16px', background: 'rgba(0,0,0,0.75)', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#a891c4', marginBottom: 10 }}>
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
              <div style={{ fontSize: 13, color: '#ffd700' }}>Обери ворога →</div>
              <button onClick={() => dispatch({ type: 'CANCEL_ACTION' })}
                style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>
                Скасувати
              </button>
            </div>
          )}
        </div>

      ) : isPlayerTurn && actor ? (
        /* Normal player action panel */
        <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.7)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 18 }}>{CLASS_ICON[actor.class]}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{actor.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>HP {actor.hp}/{actor.maxHp}</div>
            </div>
            {state.needsTarget && (
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#ffd700', fontWeight: 500 }}>
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
              style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>
              Скасувати
            </button>
          )}
        </div>

      ) : (
        <div style={{ padding: '14px 16px', background: 'rgba(0,0,0,0.7)', borderTop: '1px solid rgba(255,255,255,0.08)', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          {state.phase === 'ai-thinking' ? `${actor?.name ?? 'Ворог'} думає...` : ''}
        </div>
      )}

      <BattleLog entries={state.log} />
    </div>
  )
}

// ── Root component ─────────────────────────────────────────────────────────────
export default function SacredGame() {
  const [screen, setScreen] = useState<'landing' | 'army-builder' | 'battle'>('landing')
  const [counts, setCounts] = useState<ArmyCounts | null>(null)

  if (screen === 'landing') return <Landing onNewGame={() => setScreen('army-builder')} />
  if (screen === 'army-builder') return (
    <ArmyBuilder onStart={c => { setCounts(c); setScreen('battle') }} />
  )
  return <Battle counts={counts!} onRestart={() => setScreen('landing')} />
}
