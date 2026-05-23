'use client'

import { useReducer, useEffect, useRef } from 'react'
import {
  createInitialState, battleReducer, getActorActions, getValidTargets, ACTIONS,
} from '@/lib/sacred/game'
import type { GameUnit, ActionKey, Side, Row, LogEntry, ActionCategory } from '@/lib/sacred/types'

// ── Colour palette ────────────────────────────────────────────────────────────
const SIDE_COLOR: Record<Side, string> = { player: '#7aaa82', ai: '#c07070' }
const CLASS_ICON: Record<string, string> = { warrior: '⚔', archer: '🏹', mage: '✨' }
const ROW_LABEL: Record<number, string> = { 0: 'Передній', 1: 'Дальній', 2: 'Підтримка' }

// ── HP bar ────────────────────────────────────────────────────────────────────
function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = Math.max(0, hp / maxHp)
  const color = pct > 0.5 ? '#7aaa82' : pct > 0.25 ? '#c4a040' : '#c07070'
  return (
    <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginTop: 4 }}>
      <div style={{ width: `${pct * 100}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s' }} />
    </div>
  )
}

// ── Single unit card ──────────────────────────────────────────────────────────
function UnitCard({
  unit, isActive, isTargetable, isSelf, onSelect,
}: {
  unit: GameUnit
  isActive: boolean
  isTargetable: boolean
  isSelf: boolean
  onSelect?: () => void
}) {
  const alive = unit.hp > 0
  const color = SIDE_COLOR[unit.side]
  const borderColor = isActive
    ? '#ffd700'
    : isTargetable
      ? color
      : 'rgba(255,255,255,0.12)'

  return (
    <div
      onClick={isTargetable && alive ? onSelect : undefined}
      style={{
        width: 80, minHeight: 90, padding: '6px 6px 4px',
        background: alive ? 'rgba(20,18,16,0.85)' : 'rgba(20,18,16,0.35)',
        border: `2px solid ${borderColor}`,
        borderRadius: 8,
        cursor: isTargetable && alive ? 'pointer' : 'default',
        opacity: alive ? 1 : 0.35,
        position: 'relative',
        transition: 'border-color 0.2s, transform 0.1s',
        transform: isActive ? 'scale(1.06)' : isTargetable ? 'scale(1.03)' : 'scale(1)',
        boxShadow: isActive ? `0 0 14px ${color}88` : isTargetable ? `0 0 8px ${color}55` : 'none',
        flexShrink: 0,
      }}
    >
      {/* Class icon + side indicator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: 14 }}>{CLASS_ICON[unit.class]}</span>
        {isActive && <span style={{ fontSize: 9, color: '#ffd700', fontWeight: 700 }}>ХОДА</span>}
        {isTargetable && !isActive && <span style={{ fontSize: 9, color, fontWeight: 700 }}>➜</span>}
      </div>
      {/* Name */}
      <div style={{ fontSize: 9, fontWeight: 600, color: alive ? 'var(--text)' : 'var(--muted)', lineHeight: 1.3, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {unit.name.split(' ').slice(-1)[0]}
      </div>
      {/* HP */}
      <div style={{ fontSize: 10, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
        {unit.hp}/{unit.maxHp}
      </div>
      <HpBar hp={unit.hp} maxHp={unit.maxHp} />
      {/* Active buffs */}
      {unit.buffs.length > 0 && (
        <div style={{ display: 'flex', gap: 2, marginTop: 3, flexWrap: 'wrap' }}>
          {unit.buffs.map(b => (
            <span key={b.id} style={{ fontSize: 8, padding: '1px 3px', borderRadius: 3, background: 'rgba(255,255,255,0.1)', color: 'var(--muted)' }}>
              {b.type === 'defense_up' ? '🛡' : b.type === 'evasion_up' ? '💨' : b.type === 'accuracy_up' ? '🎯' : b.type === 'morale_up' ? '📯' : b.type === 'damage_taken_up' ? '☠' : '✨'}
              {b.turnsLeft}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Row of units ──────────────────────────────────────────────────────────────
function UnitRow({
  units, side, row, activeId, targetIds, onSelectUnit,
}: {
  units: GameUnit[]
  side: Side
  row: Row
  activeId: string | null
  targetIds: string[]
  onSelectUnit: (id: string) => void
}) {
  const rowUnits = units.filter(u => u.side === side && u.row === row)
  const maxSlots = row === 0 ? 3 : row === 1 ? 2 : 1

  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', minHeight: 100 }}>
      {Array.from({ length: maxSlots }, (_, i) => {
        const unit = rowUnits.find(u => u.slot === i)
        if (!unit) {
          return <div key={i} style={{ width: 80, height: 90, border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 8, flexShrink: 0 }} />
        }
        return (
          <UnitCard
            key={unit.id}
            unit={unit}
            isActive={unit.id === activeId}
            isTargetable={targetIds.includes(unit.id)}
            isSelf={unit.id === activeId}
            onSelect={() => onSelectUnit(unit.id)}
          />
        )
      })}
    </div>
  )
}

// ── Turn queue ────────────────────────────────────────────────────────────────
function TurnQueue({ queue, units, currentIdx }: { queue: string[]; units: GameUnit[]; currentIdx: number }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current?.children[currentIdx] as HTMLElement
    if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [currentIdx])

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
      <div ref={scrollRef} style={{ display: 'flex', gap: 6, padding: '0 8px', width: 'max-content' }}>
        {queue.map((id, i) => {
          const u = units.find(x => x.id === id)
          if (!u || u.hp === 0) return null
          const isCurrent = i === currentIdx
          return (
            <div key={id} style={{
              width: 36, height: 36, borderRadius: 6, flexShrink: 0,
              background: isCurrent ? '#ffd700' : 'rgba(255,255,255,0.08)',
              border: `1px solid ${isCurrent ? '#ffd700' : SIDE_COLOR[u.side] + '44'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, opacity: isCurrent ? 1 : 0.6,
              transform: isCurrent ? 'scale(1.15)' : 'scale(1)',
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

// ── Battle log ────────────────────────────────────────────────────────────────
function BattleLog({ entries }: { entries: LogEntry[] }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [entries.length])

  const typeColor: Record<LogEntry['type'], string> = {
    attack: 'var(--text)', miss: 'var(--muted)', evade: '#7ea8c4', crit: '#ffd700',
    heal: '#7aaa82', buff: '#a891c4', debuff: '#c07070', death: '#ef4444', info: 'var(--muted)',
  }

  return (
    <div style={{ height: 140, overflowY: 'auto', padding: '8px 12px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid var(--border)' }}>
      {entries.slice(-40).map(e => (
        <div key={e.id} style={{ fontSize: 12, color: typeColor[e.type], lineHeight: 1.6, marginBottom: 1 }}>
          {e.text}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}

// ── Action button ─────────────────────────────────────────────────────────────
function ActionBtn({ actionKey, selected, used, onSelect }: {
  actionKey: ActionKey; selected: boolean; used: boolean; onSelect: () => void
}) {
  const def = ACTIONS[actionKey]
  return (
    <button
      onClick={used ? undefined : onSelect}
      style={{
        padding: '10px 14px', borderRadius: 8, cursor: used ? 'not-allowed' : 'pointer', textAlign: 'left',
        background: used ? 'rgba(255,255,255,0.03)' : selected ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${used ? 'rgba(255,255,255,0.06)' : selected ? '#ffd700' : 'rgba(255,255,255,0.14)'}`,
        color: used ? 'rgba(255,255,255,0.25)' : 'var(--text)',
        transition: 'all 0.15s', flex: '1 1 140px', minWidth: 0,
        position: 'relative', overflow: 'hidden',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{def.label} {used ? '✓' : ''}</div>
      <div style={{ fontSize: 11, color: used ? 'rgba(255,255,255,0.2)' : 'var(--muted)', lineHeight: 1.4 }}>{def.desc}</div>
    </button>
  )
}

// ── Main game ─────────────────────────────────────────────────────────────────
export default function SacredGame() {
  const [state, dispatch] = useReducer(battleReducer, undefined, createInitialState)

  const actorId = state.queue[state.queueIdx]
  const actor = state.units.find(u => u.id === actorId && u.hp > 0) ?? null
  const actorActions = actor ? getActorActions(actor.class) : { primary: [], secondary: [], bonus: [] }
  const targetIds = actor && state.selectedAction
    ? getValidTargets(actor, state.selectedAction, state.units)
    : []

  // Trigger AI turn automatically
  useEffect(() => {
    if (state.phase !== 'ai-thinking') return
    const t = setTimeout(() => dispatch({ type: 'AI_TAKE_TURN' }), 900)
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
          <div style={{ fontSize: 15, fontWeight: 700, color: '#ffd700', letterSpacing: '-0.01em' }}>
            ✦ Серафити
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Раунд {state.round}</div>
        </div>
        <TurnQueue queue={state.queue} units={state.units} currentIdx={state.queueIdx} />
      </div>

      {/* Battlefield */}
      <div style={{ flex: 1, padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>

        {/* AI side (rows displayed 2→1→0 top to bottom) */}
        <div style={{ fontSize: 10, fontWeight: 600, color: '#c07070', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
          Ворог
        </div>
        {([2, 1, 0] as Row[]).map(row => (
          <div key={row}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginBottom: 2 }}>{ROW_LABEL[row]}</div>
            <UnitRow
              units={state.units} side="ai" row={row}
              activeId={actor?.side === 'ai' ? actorId : null}
              targetIds={targetIds}
              onSelectUnit={handleUnitClick}
            />
          </div>
        ))}

        {/* Separator */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '6px 0', position: 'relative' }}>
          <div style={{ position: 'absolute', left: '50%', top: -8, transform: 'translateX(-50%)', fontSize: 16, background: '#0e0d0b', padding: '0 8px', color: 'var(--muted)' }}>
            ⚔
          </div>
        </div>

        {/* Player side (rows 0→1→2 top to bottom) */}
        {([0, 1, 2] as Row[]).map(row => (
          <div key={row}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginBottom: 2 }}>{ROW_LABEL[row]}</div>
            <UnitRow
              units={state.units} side="player" row={row}
              activeId={actor?.side === 'player' ? actorId : null}
              targetIds={targetIds}
              onSelectUnit={handleUnitClick}
            />
          </div>
        ))}
        <div style={{ fontSize: 10, fontWeight: 600, color: '#7aaa82', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
          Твоя армія
        </div>
      </div>

      {/* Action panel (fixed at bottom above log) */}
      {state.phase === 'game-over' ? (
        <div style={{ padding: 20, textAlign: 'center', background: 'rgba(0,0,0,0.6)', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: state.winner === 'player' ? '#7aaa82' : '#c07070', marginBottom: 12 }}>
            {state.winner === 'player' ? '🏆 Перемога!' : '💀 Поразка'}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '12px 28px', background: '#7aaa82', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Новий бій
          </button>
        </div>
      ) : isPlayerTurn && actor ? (
        <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.7)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {/* Actor info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 18 }}>{CLASS_ICON[actor.class]}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{actor.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>HP: {actor.hp}/{actor.maxHp} · Мораль: {actor.morale}</div>
            </div>
            {state.needsTarget && (
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#ffd700', fontWeight: 500 }}>
                Обери ціль →
              </div>
            )}
          </div>

          {!state.needsTarget ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Primary */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', width: '100%', fontWeight: 600 }}>🗡 Основна дія</div>
                {actorActions.primary.map(a => (
                  <ActionBtn key={a} actionKey={a} selected={state.selectedAction === a}
                    used={state.usedPrimary} onSelect={() => handleSelectAction(a)} />
                ))}
              </div>
              {/* Secondary */}
              {actorActions.secondary.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', width: '100%', fontWeight: 600 }}>🛡 Додаткова дія</div>
                  {actorActions.secondary.map(a => (
                    <ActionBtn key={a} actionKey={a} selected={state.selectedAction === a}
                      used={state.usedSecondary} onSelect={() => handleSelectAction(a)} />
                  ))}
                </div>
              )}
              {/* Bonus */}
              {actorActions.bonus.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', width: '100%', fontWeight: 600 }}>⭐ Бонусна дія</div>
                  {actorActions.bonus.map(a => (
                    <ActionBtn key={a} actionKey={a} selected={state.selectedAction === a}
                      used={state.usedBonus} onSelect={() => handleSelectAction(a)} />
                  ))}
                </div>
              )}
              {/* End turn */}
              <button
                onClick={() => dispatch({ type: 'END_TURN' })}
                style={{ padding: '9px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer', fontSize: 12, marginTop: 2 }}
              >
                Завершити хід →
              </button>
            </div>
          ) : (
            <button
              onClick={() => dispatch({ type: 'CANCEL_ACTION' })}
              style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}
            >
              Скасувати
            </button>
          )}
        </div>
      ) : (
        <div style={{ padding: '14px 16px', background: 'rgba(0,0,0,0.7)', borderTop: '1px solid rgba(255,255,255,0.08)', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          {state.phase === 'ai-thinking' ? `${actor?.name ?? 'Ворог'} думає...` : ''}
        </div>
      )}

      {/* Battle log */}
      <BattleLog entries={state.log} />
    </div>
  )
}
