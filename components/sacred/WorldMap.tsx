'use client'

import { useState, useEffect } from 'react'
import { WORLD_NODES, getReachableNodes, getPathCost, getVisibleNodeIds, FORTRESS_NAMES, FORTRESS_UPGRADE_COST } from '@/lib/sacred/worldMap'
import type { WorldMapState, NodeType, NodeStatus } from '@/lib/sacred/worldMap'
import type { GameUnit, UnitClass, MagePath } from '@/lib/sacred/types'

const NODE_COLOR: Record<NodeType, string> = {
  town:     '#d4a85a',
  resource: '#6fa67a',
  dungeon:  '#c07070',
  camp:     '#b07850',
  artifact: '#a080c8',
}

const NODE_ICON: Record<NodeType, string> = {
  town:     '🏰',
  resource: '💰',
  dungeon:  '💀',
  camp:     '⚔',
  artifact: '✦',
}

const DIFFICULTY_COLOR: Record<string, string> = {
  'Легко':         '#6fa67a',
  'Середньо':      '#d4a85a',
  'Важко':         '#c07070',
  'Дуже важко':    '#a060a0',
  'Фінальний бій': '#c07070',
}

const MAGE_PATH_LABEL: Record<MagePath, string> = {
  fire:  'Шлях Вогню',
  water: 'Шлях Води',
  earth: 'Шлях Землі',
  air:   'Шлях Повітря',
}

const HIRE_INFO: { cls: UnitClass; label: string; cost: number; desc: string }[] = [
  { cls: 'warrior',  label: 'Воїн',       cost: 2, desc: 'Передній ряд, щит, провокація' },
  { cls: 'archer',   label: 'Лучник',     cost: 3, desc: 'Дальній ряд, постріл, прицілення' },
  { cls: 'mage',     label: 'Маг',        cost: 5, desc: 'Дальній ряд, обирає шлях після lv1' },
  { cls: 'catapult', label: 'Катапульта', cost: 8, desc: 'Важка артилерія, площинний урон' },
]

function getPortraitSrc(unit: GameUnit): string | null {
  const lvl = unit.level ?? 1
  if (unit.class === 'warrior') {
    if (unit.warriorPath === 'champion' && lvl >= 3) return `/sacred/warriors/champion/level${lvl}.jpg`
    return `/sacred/warriors/level${Math.min(lvl, 4)}.jpg`
  }
  if (unit.class === 'archer')  return `/sacred/archers/level${lvl}.jpg`
  if (unit.class === 'mage')
    return lvl === 1 || !unit.magePath ? '/sacred/mages/level1.jpg' : `/sacred/mages/${unit.magePath}/level${lvl}.jpg`
  if (unit.class === 'catapult')
    return lvl === 1 || !unit.catapultPath ? '/sacred/catapults/level1.jpg' : `/sacred/catapults/${unit.catapultPath}/level${lvl}.jpg`
  return null
}

function unitSubtitle(unit: GameUnit): string | null {
  if (unit.class === 'mage' && unit.magePath && (unit.level ?? 1) > 1) {
    return MAGE_PATH_LABEL[unit.magePath]
  }
  return null
}

const ROW_LABEL_GRID: Record<number, string> = { 0: 'Передній ряд', 1: 'Дальній ряд' }

interface WorldMapProps {
  mapState: WorldMapState
  playerUnits: GameUnit[]
  battleResult?: { gold: number; levelUps: string[] } | null
  onClearBattleResult?: () => void
  reinforcement?: string | null
  onClearReinforcement?: () => void
  onMove:              (nodeId: string) => void
  onFight:             (nodeId: string) => void
  onCollect:           (nodeId: string) => void
  onRest:              () => void
  onEndTurn:           () => void
  onBack:              () => void
  onHireUnit?:         (cls: UnitClass) => void
  onExpandSlots?:      () => void
  onReorderUnits?:     (id1: string, id2: string) => void
  onMoveUnitSlot?:     (id: string, row: number, slot: number) => void
  onUpgradeFortress?:  () => void
}

export default function WorldMap({
  mapState, playerUnits, battleResult, onClearBattleResult,
  reinforcement, onClearReinforcement,
  onMove, onFight, onCollect, onRest, onEndTurn, onBack,
  onHireUnit, onExpandSlots, onReorderUnits, onMoveUnitSlot, onUpgradeFortress,
}: WorldMapProps) {
  const [previewNodeId,   setPreviewNodeId]   = useState<string | null>(null)
  const [armyPanelOpen,   setArmyPanelOpen]   = useState(false)
  const [fortressOpen,    setFortressOpen]     = useState(false)
  const [fortressTab,     setFortressTab]      = useState<'army' | 'hire' | 'upgrade'>('army')
  const [selectedUnitId,  setSelectedUnitId]   = useState<string | null>(null)

  const { statuses, heroNodeId, heroAP, maxAP, turn, gold, restedThisTurn, maxArmySlots, fortressLevel } = mapState
  const heroNode  = WORLD_NODES.find(n => n.id === heroNodeId)!
  const reachable = getReachableNodes(heroNodeId, heroAP, statuses)
  const visible   = getVisibleNodeIds(heroNodeId, maxAP)
  const atTown    = heroNodeId === 'town'

  const panelNode   = (previewNodeId ? WORLD_NODES.find(n => n.id === previewNodeId) : null) ?? heroNode
  const panelIsHero = panelNode.id === heroNodeId
  const panelStatus = statuses[panelNode.id] as NodeStatus

  const nonTownNodes = WORLD_NODES.filter(n => n.id !== 'town')
  const clearedCount = nonTownNodes.filter(n => statuses[n.id] === 'cleared' || statuses[n.id] === 'collected').length
  const totalCount   = nonTownNodes.length

  useEffect(() => {
    if (!battleResult) return
    const t = setTimeout(() => onClearBattleResult?.(), 3500)
    return () => clearTimeout(t)
  }, [battleResult])

  useEffect(() => {
    if (!reinforcement) return
    const t = setTimeout(() => onClearReinforcement?.(), 4000)
    return () => clearTimeout(t)
  }, [reinforcement])

  function handleNodeClick(nodeId: string) {
    if (nodeId === heroNodeId) { setPreviewNodeId(null); return }
    const status = statuses[nodeId]
    if (reachable.has(nodeId)) {
      if (status === 'enemy') {
        setPreviewNodeId(nodeId)
      } else {
        onMove(nodeId)
        setPreviewNodeId(null)
      }
    } else {
      setPreviewNodeId(nodeId)
    }
  }

  function handleAttack() {
    if (!previewNodeId) {
      if (statuses[heroNodeId] === 'enemy') onFight(heroNodeId)
      return
    }
    onMove(previewNodeId)
    onFight(previewNodeId)
    setPreviewNodeId(null)
  }

  function handleCollect() {
    onCollect(panelNode.id)
    setPreviewNodeId(null)
  }

  function handleSlotClick(row: number, slot: number) {
    const occupant = playerUnits.find(u => u.row === row && u.slot === slot)
    if (selectedUnitId) {
      const selUnit = playerUnits.find(u => u.id === selectedUnitId)
      if (!selUnit || selUnit.row !== row) { setSelectedUnitId(null); return }
      if (occupant && occupant.id !== selectedUnitId) {
        onReorderUnits?.(selectedUnitId, occupant.id)
      } else if (!occupant) {
        onMoveUnitSlot?.(selectedUnitId, row, slot)
      }
      setSelectedUnitId(null)
      return
    }
    if (occupant) setSelectedUnitId(occupant.id)
  }

  const drawnLines = new Set<string>()
  const connectionLines = WORLD_NODES.flatMap(node =>
    node.connections.map(connId => {
      const key = [node.id, connId].sort().join('|')
      if (drawnLines.has(key)) return null
      drawnLines.add(key)
      const conn = WORLD_NODES.find(n => n.id === connId)!
      const bothVisible    = visible.has(node.id) && visible.has(connId)
      const bothAccessible =
        (statuses[node.id] !== 'enemy' || node.id === heroNodeId) &&
        (statuses[connId]  !== 'enemy' || connId  === heroNodeId)
      return { key, x1: node.x, y1: node.y, x2: conn.x, y2: conn.y, active: bothAccessible, visible: bothVisible }
    }).filter(Boolean),
  )

  // ── Army grid (shared between standalone panel and fortress) ────────────────
  function ArmyGrid({ reorder }: { reorder: boolean }) {
    const selUnit = selectedUnitId ? playerUnits.find(u => u.id === selectedUnitId) : null
    return (
      <div>
        {([0, 1] as const).map(row => {
          const rowUnits = playerUnits.filter(u => u.row === row)
          if (!reorder && rowUnits.length === 0) return null
          return (
            <div key={row} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(240,232,216,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>
                {ROW_LABEL_GRID[row]}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {Array.from({ length: 4 }, (_, slot) => {
                  const unit    = playerUnits.find(u => u.row === row && u.slot === slot)
                  const isSel   = unit?.id === selectedUnitId
                  const isTarget = reorder && selUnit && selUnit.row === row && !unit && !isSel
                  const portrait = unit ? getPortraitSrc(unit) : null
                  const subtitle = unit ? unitSubtitle(unit) : null
                  const hpPct    = unit ? Math.max(0, unit.hp / unit.maxHp) : 0
                  const hpColor  = hpPct > 0.6 ? '#6fa67a' : hpPct > 0.3 ? '#d4a85a' : '#c07070'

                  return (
                    <div key={slot}
                      onClick={reorder ? () => handleSlotClick(row, slot) : undefined}
                      style={{
                        width: 72, height: 84, borderRadius: 8, flexShrink: 0,
                        cursor: reorder ? 'pointer' : 'default',
                        background: isSel ? 'rgba(212,168,90,0.1)' : unit ? '#1a1810' : 'rgba(0,0,0,0.18)',
                        border: `2px solid ${isSel ? '#d4a85a' : isTarget ? 'rgba(212,168,90,0.45)' : unit ? 'rgba(240,232,216,0.12)' : 'rgba(240,232,216,0.06)'}`,
                        borderStyle: isTarget ? 'dashed' : 'solid',
                        boxShadow: isSel ? '0 0 0 2px rgba(212,168,90,0.2)' : 'none',
                        position: 'relative', overflow: 'hidden', transition: 'all 0.12s',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {unit && portrait ? (
                        <>
                          <img src={portrait} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 35%, rgba(0,0,0,0.78) 100%)' }} />
                          <div style={{ position: 'relative', zIndex: 1, alignSelf: 'stretch', marginTop: 'auto', padding: '0 4px 4px' }}>
                            <div style={{ fontSize: 8, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.9)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {unit.name}
                            </div>
                            {subtitle && <div style={{ fontSize: 7, color: '#d4a85a', opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</div>}
                            {isSel && <div style={{ fontSize: 7, color: '#d4a85a', fontWeight: 700 }}>ОБРАНИЙ</div>}
                            <div style={{ marginTop: 2, height: 2, background: 'rgba(255,255,255,0.15)', borderRadius: 1 }}>
                              <div style={{ width: `${hpPct * 100}%`, height: '100%', background: hpColor, borderRadius: 1 }} />
                            </div>
                          </div>
                        </>
                      ) : unit ? (
                        <div style={{ fontSize: 9, color: '#f0e8d8', textAlign: 'center', padding: '0 4px' }}>{unit.name}</div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        {playerUnits.length === 0 && (
          <div style={{ fontSize: 13, color: 'rgba(240,232,216,0.35)', textAlign: 'center', padding: '16px 0' }}>Армія порожня</div>
        )}
      </div>
    )
  }

  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', minHeight: '100dvh',
      background: '#0f0e09', color: '#f0e8d8',
      fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column',
    }}>

      {/* Reinforcement notification */}
      {reinforcement && (
        <div onClick={() => onClearReinforcement?.()} style={{
          position: 'fixed', top: 76, left: '50%', transform: 'translateX(-50%)',
          zIndex: 50, background: '#1e1008', border: '1px solid rgba(192,112,112,0.5)',
          borderRadius: 12, padding: '12px 20px', boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
          minWidth: 200, textAlign: 'center', cursor: 'pointer',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#c07070' }}>⚠ Ворожі підкріплення!</div>
          <div style={{ fontSize: 12, color: 'rgba(240,232,216,0.6)', marginTop: 3 }}>
            {reinforcement} знову під контролем ворога
          </div>
        </div>
      )}

      {/* Battle result notification */}
      {battleResult && (battleResult.gold > 0 || battleResult.levelUps.length > 0) && (
        <div onClick={() => onClearBattleResult?.()} style={{
          position: 'fixed', top: reinforcement ? 136 : 76, left: '50%', transform: 'translateX(-50%)',
          zIndex: 50, background: '#1e1b12', border: '1px solid rgba(212,168,90,0.45)',
          borderRadius: 12, padding: '12px 20px', boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
          minWidth: 190, textAlign: 'center', cursor: 'pointer',
        }}>
          {battleResult.gold > 0 && (
            <div style={{ fontSize: 15, fontWeight: 700, color: '#d4a85a' }}>+{battleResult.gold} 💰 золото</div>
          )}
          {battleResult.levelUps.map(name => (
            <div key={name} style={{ fontSize: 12, color: '#a080c8', marginTop: 3 }}>⭐ {name} — новий рівень!</div>
          ))}
        </div>
      )}

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', background: '#17150f',
        borderBottom: '1px solid rgba(240,232,216,0.08)', flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', color: 'rgba(240,232,216,0.45)',
          fontSize: 13, cursor: 'pointer', padding: '4px 0', lineHeight: 1,
        }}>← Меню</button>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#d4a85a' }}>✦ Кампанія</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'rgba(240,232,216,0.5)' }}>💰 {gold}</span>
          <span style={{ fontSize: 12, color: '#b07850' }}>Хід {turn}</span>
          <button onClick={() => { setArmyPanelOpen(true); setSelectedUnitId(null) }} style={{
            padding: '5px 10px', background: 'rgba(111,166,122,0.12)',
            border: '1px solid rgba(111,166,122,0.3)', borderRadius: 7,
            color: '#7aaa82', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}>⚔ Армія</button>
        </div>
      </div>

      {/* AP + Progress */}
      <div style={{
        padding: '7px 16px 6px', background: '#17150f',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        borderBottom: '1px solid rgba(240,232,216,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'rgba(240,232,216,0.35)', marginRight: 2 }}>Кроки:</span>
          {Array.from({ length: maxAP }, (_, i) => (
            <div key={i} style={{
              width: 9, height: 9, borderRadius: '50%',
              background: i < heroAP ? '#d4a85a' : 'rgba(240,232,216,0.1)',
              transition: 'background 0.2s',
            }} />
          ))}
          {heroAP === 0 && (
            <span style={{ fontSize: 11, color: '#c07070', marginLeft: 4 }}>— завершіть хід</span>
          )}
        </div>
        <span style={{ fontSize: 11, color: 'rgba(240,232,216,0.35)' }}>
          {clearedCount}/{totalCount} вузлів
        </span>
      </div>

      {/* SVG Map */}
      <div style={{ flexShrink: 0, padding: '6px 0' }}>
        <svg viewBox="0 0 200 130" style={{ width: '100%', display: 'block' }}
          onClick={() => setPreviewNodeId(null)}>
          <defs>
            <radialGradient id="mapbg" cx="50%" cy="50%" r="70%">
              <stop offset="0%" stopColor="#131108" />
              <stop offset="100%" stopColor="#0a0908" />
            </radialGradient>
          </defs>
          <rect x={0} y={0} width={200} height={130} fill="url(#mapbg)" />
          {connectionLines.map(l => l && (
            <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
              stroke={!l.visible ? 'rgba(240,232,216,0.03)' : l.active ? 'rgba(212,168,90,0.2)' : 'rgba(240,232,216,0.08)'}
              strokeWidth={1.5} />
          ))}
          {WORLD_NODES.map(node => {
            const status   = statuses[node.id] as NodeStatus
            const isHero   = node.id === heroNodeId
            const canReach = reachable.has(node.id) && !isHero
            const isPrev   = node.id === previewNodeId
            const color    = NODE_COLOR[node.type]
            const dimmed   = status === 'cleared' || status === 'collected'
            const fogged   = !visible.has(node.id)
            if (fogged) return (
              <g key={node.id} opacity={0.2}>
                <circle cx={node.x} cy={node.y} r={10} fill="rgba(240,232,216,0.04)"
                  stroke="rgba(240,232,216,0.18)" strokeWidth={1} strokeDasharray="2 2" />
                <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="central"
                  fontSize={8} fill="rgba(240,232,216,0.35)" style={{ userSelect: 'none', pointerEvents: 'none' }}>?</text>
              </g>
            )
            return (
              <g key={node.id} opacity={dimmed ? 0.45 : 1}
                style={{ cursor: canReach || isHero || isPrev ? 'pointer' : 'default' }}
                onClick={e => { e.stopPropagation(); handleNodeClick(node.id) }}>
                <circle cx={node.x} cy={node.y} r={15} fill="transparent" />
                {canReach && <circle cx={node.x} cy={node.y} r={13.5} fill="none"
                  stroke={color} strokeWidth={1.5} strokeDasharray="3 2" opacity={0.55} />}
                {isPrev && <circle cx={node.x} cy={node.y} r={13}
                  fill="none" stroke="#f0e8d8" strokeWidth={1.5} opacity={0.6} />}
                <circle cx={node.x} cy={node.y} r={10} fill={`${color}1a`}
                  stroke={isHero ? '#d4a85a' : color} strokeWidth={isHero ? 2.5 : 1.5} />
                <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="central"
                  fontSize={9} style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {dimmed ? '✓' : NODE_ICON[node.type]}
                </text>
                <text x={node.x} y={node.y + 15} textAnchor="middle" fontSize={5.5}
                  fill="rgba(240,232,216,0.5)" style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {node.label}
                </text>
              </g>
            )
          })}
          <circle cx={heroNode.x} cy={heroNode.y} r={14} fill="none"
            stroke="#d4a85a" strokeWidth={2} opacity={0.9} style={{ pointerEvents: 'none' }} />
        </svg>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, padding: '0 16px 8px', fontSize: 10, color: 'rgba(240,232,216,0.3)', flexWrap: 'wrap', flexShrink: 0 }}>
        {([['town','🏰 Місто'], ['resource','💰 Ресурс'], ['dungeon','💀 Данж'], ['camp','⚔ Табір'], ['artifact','✦ Артефакт']] as [NodeType, string][]).map(([t, label]) => (
          <span key={t} style={{ color: NODE_COLOR[t], opacity: 0.7 }}>{label}</span>
        ))}
      </div>

      {/* Mini army bar */}
      {playerUnits.length > 0 && (
        <div style={{
          padding: '8px 16px 10px', background: '#17150f',
          borderTop: '1px solid rgba(240,232,216,0.07)',
          display: 'flex', gap: 7, overflowX: 'auto', flexShrink: 0,
          scrollbarWidth: 'none',
        } as React.CSSProperties}>
          {playerUnits.map(unit => {
            const portrait = getPortraitSrc(unit)
            const hpPct = Math.max(0, unit.hp / unit.maxHp)
            const hpColor = hpPct > 0.6 ? '#6fa67a' : hpPct > 0.3 ? '#d4a85a' : '#c07070'
            return (
              <div key={unit.id} style={{ flexShrink: 0, width: 36 }}>
                <div style={{ width: 36, height: 42, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(240,232,216,0.12)', background: '#17150f' }}>
                  {portrait ? <img src={portrait} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} /> : <div style={{ width: '100%', height: '100%', background: '#1a1810' }} />}
                </div>
                <div style={{ height: 3, background: 'rgba(240,232,216,0.1)', borderRadius: 2, marginTop: 2 }}>
                  <div style={{ width: `${hpPct * 100}%`, height: '100%', background: hpColor, borderRadius: 2, transition: 'width 0.3s' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Node info panel */}
      <div style={{ background: '#17150f', borderTop: '1px solid rgba(240,232,216,0.08)', padding: '14px 16px 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: `${NODE_COLOR[panelNode.type]}14`, border: `1.5px solid ${NODE_COLOR[panelNode.type]}44`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
          }}>
            {panelStatus === 'cleared' || panelStatus === 'collected' ? '✓' : NODE_ICON[panelNode.type]}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#f0e8d8' }}>{panelNode.label}</span>
              {panelNode.difficulty && panelStatus === 'enemy' && (
                <span style={{
                  fontSize: 10, padding: '1px 7px', borderRadius: 4, fontWeight: 600,
                  background: `${DIFFICULTY_COLOR[panelNode.difficulty] ?? '#b07850'}18`,
                  color: DIFFICULTY_COLOR[panelNode.difficulty] ?? '#b07850',
                  border: `1px solid ${DIFFICULTY_COLOR[panelNode.difficulty] ?? '#b07850'}33`,
                }}>{panelNode.difficulty}</span>
              )}
              {panelIsHero && <span style={{ fontSize: 10, color: '#d4a85a', opacity: 0.7 }}>▲ ти тут</span>}
              {previewNodeId && !panelIsHero && reachable.has(previewNodeId) && (
                <span style={{ fontSize: 10, color: 'rgba(240,232,216,0.35)' }}>
                  (-{getPathCost(heroNodeId, previewNodeId, statuses)} кроки)
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.42)', marginTop: 4, lineHeight: 1.45 }}>
              {panelNode.desc}
            </div>
            {panelNode.enemyCounts && panelStatus === 'enemy' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                {([['⚔', panelNode.enemyCounts.warriors], ['🏹', panelNode.enemyCounts.archers], ['🔮', panelNode.enemyCounts.mages], ['🗿', panelNode.enemyCounts.catapults]] as [string, number][])
                  .filter(([, n]) => n > 0)
                  .map(([icon, n]) => (
                    <span key={icon} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: 'rgba(192,112,112,0.1)', color: 'rgba(192,112,112,0.75)', border: '1px solid rgba(192,112,112,0.18)' }}>{icon} ×{n}</span>
                  ))}
                {panelNode.goldReward && (
                  <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: 'rgba(212,168,90,0.1)', color: '#d4a85a', border: '1px solid rgba(212,168,90,0.2)' }}>+{panelNode.goldReward}💰</span>
                )}
              </div>
            )}
            {panelNode.type === 'resource' && panelStatus !== 'collected' && (
              <div style={{ fontSize: 11, color: '#6fa67a', marginTop: 5 }}>💰 +{panelNode.goldReward} золота</div>
            )}
            {panelNode.type === 'artifact' && panelStatus !== 'collected' && (
              <div style={{ fontSize: 11, color: '#a080c8', marginTop: 5 }}>✦ +{panelNode.xpReward} XP усім юнітам</div>
            )}
            {(panelStatus === 'cleared' || panelStatus === 'collected') && (
              <div style={{ fontSize: 11, color: 'rgba(111,166,122,0.8)', marginTop: 5, fontWeight: 600 }}>✓ Зачищено</div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          {((previewNodeId && reachable.has(previewNodeId) && panelStatus === 'enemy') ||
            (panelIsHero && (panelNode.type === 'dungeon' || panelNode.type === 'camp') && panelStatus === 'enemy')) && (
            <button onClick={handleAttack} style={{
              flex: 1, padding: '11px', borderRadius: 8,
              background: 'rgba(192,112,112,0.15)', border: '1px solid rgba(192,112,112,0.4)',
              color: '#e08080', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              ⚔ Атакувати{panelNode.goldReward ? ` (+${panelNode.goldReward}💰)` : ''}
            </button>
          )}
          {panelIsHero && panelNode.type === 'resource' && panelStatus === 'neutral' && (
            <button onClick={handleCollect} style={{ flex: 1, padding: '11px', borderRadius: 8, background: 'rgba(111,166,122,0.12)', border: '1px solid rgba(111,166,122,0.3)', color: '#7aaa82', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              💰 Зібрати +{panelNode.goldReward} золота
            </button>
          )}
          {panelIsHero && panelNode.type === 'artifact' && panelStatus === 'neutral' && (
            <button onClick={handleCollect} style={{ flex: 1, padding: '11px', borderRadius: 8, background: 'rgba(160,128,200,0.12)', border: '1px solid rgba(160,128,200,0.3)', color: '#a080c8', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              ✦ Взяти (+{panelNode.xpReward} XP)
            </button>
          )}
          {panelIsHero && panelNode.type === 'town' && (
            <>
              <button onClick={restedThisTurn ? undefined : onRest} disabled={restedThisTurn} style={{
                flex: 1, padding: '11px', borderRadius: 8,
                background: restedThisTurn ? 'rgba(240,232,216,0.03)' : 'rgba(212,168,90,0.1)',
                border: `1px solid ${restedThisTurn ? 'rgba(240,232,216,0.1)' : 'rgba(212,168,90,0.3)'}`,
                color: restedThisTurn ? 'rgba(240,232,216,0.28)' : '#d4a85a',
                fontSize: 13, fontWeight: 600, cursor: restedThisTurn ? 'not-allowed' : 'pointer',
              }}>
                {restedThisTurn ? '🏠 Вже відпочили' : '🏥 Відпочити'}
              </button>
              <button onClick={() => { setFortressOpen(true); setFortressTab('army'); setSelectedUnitId(null) }} style={{
                flex: 1, padding: '11px', borderRadius: 8,
                background: 'rgba(212,168,90,0.14)', border: '1px solid rgba(212,168,90,0.35)',
                color: '#d4a85a', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
                🏰 Фортеця
              </button>
            </>
          )}
          <button onClick={onEndTurn} style={{
            padding: '11px 18px', borderRadius: 8, flexShrink: 0,
            background: 'rgba(176,120,80,0.1)', border: '1px solid rgba(176,120,80,0.3)',
            color: '#b07850', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            Хід →
          </button>
        </div>
      </div>

      {/* ── Standalone army panel ── */}
      {armyPanelOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60 }}
            onClick={() => { setArmyPanelOpen(false); setSelectedUnitId(null) }} />
          <div style={{
            position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
            width: '100%', maxWidth: 560, background: '#17150f',
            borderRadius: '18px 18px 0 0', zIndex: 61, padding: '16px 16px 36px',
            fontFamily: "'Inter', sans-serif", maxHeight: '75vh', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ width: 36, height: 3, background: 'rgba(240,232,216,0.15)', borderRadius: 2, margin: '0 auto 14px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#d4a85a' }}>⚔ Армія ({playerUnits.length}/{maxArmySlots})</div>
              <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.35)' }}>Оберіть юніта, потім слот у тому ж ряду</div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <ArmyGrid reorder={true} />
            </div>
          </div>
        </>
      )}

      {/* ── Fortress panel ── */}
      {fortressOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 60 }}
            onClick={() => { setFortressOpen(false); setSelectedUnitId(null) }} />
          <div style={{
            position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
            width: '100%', maxWidth: 560, background: '#17150f',
            borderRadius: '18px 18px 0 0', zIndex: 61, padding: '16px 16px 36px',
            fontFamily: "'Inter', sans-serif", maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ width: 36, height: 3, background: 'rgba(240,232,216,0.15)', borderRadius: 2, margin: '0 auto 12px' }} />
            {/* Fortress header with image */}
            <div style={{ position: 'relative', marginBottom: 12, borderRadius: 10, overflow: 'hidden', height: 110 }}>
              <img
                src={`/sacred/fortress/fortress-${fortressLevel ?? 1}.jpg`}
                alt="Фортеця"
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }}
              />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 55%)' }} />
              <div style={{ position: 'absolute', bottom: 8, left: 12, right: 12, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.55)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Рівень {fortressLevel}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#d4a85a' }}>{FORTRESS_NAMES[fortressLevel ?? 1]}</div>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.45)' }}>
                  Макс. рівень юнітів: <span style={{ color: '#d4a85a', fontWeight: 700 }}>{fortressLevel}</span>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {(['army', 'hire', 'upgrade'] as const).map(tab => (
                <button key={tab} onClick={() => { setFortressTab(tab); setSelectedUnitId(null) }} style={{
                  flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: fortressTab === tab ? 'rgba(212,168,90,0.15)' : 'rgba(240,232,216,0.04)',
                  border: `1px solid ${fortressTab === tab ? 'rgba(212,168,90,0.4)' : 'rgba(240,232,216,0.08)'}`,
                  color: fortressTab === tab ? '#d4a85a' : 'rgba(240,232,216,0.45)',
                }}>
                  {tab === 'army' ? `⚔ Армія (${playerUnits.length}/${maxArmySlots})` : tab === 'hire' ? '🗡 Найм' : '🏰 Розвиток'}
                </button>
              ))}
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {fortressTab === 'army' && (
                <>
                  <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.35)', marginBottom: 10 }}>
                    Оберіть юніта, потім інший слот у тому ж ряду щоб поміняти
                  </div>
                  <ArmyGrid reorder={true} />
                </>
              )}

              {fortressTab === 'hire' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.35)', marginBottom: 2 }}>
                    Слоти армії: {playerUnits.length}/{maxArmySlots} · 💰 {gold}
                  </div>
                  {HIRE_INFO.map(({ cls, label, cost, desc }) => {
                    const canAfford  = gold >= cost
                    const hasSpace   = playerUnits.length < maxArmySlots
                    const canHire    = canAfford && hasSpace
                    return (
                      <div key={cls} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 12px', borderRadius: 10,
                        background: 'rgba(240,232,216,0.04)', border: '1px solid rgba(240,232,216,0.08)',
                        opacity: canHire ? 1 : 0.5,
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#f0e8d8', marginBottom: 2 }}>{label}</div>
                          <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.4)' }}>{desc}</div>
                        </div>
                        <button onClick={canHire ? () => onHireUnit?.(cls) : undefined} disabled={!canHire} style={{
                          padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: canHire ? 'pointer' : 'not-allowed',
                          background: canHire ? 'rgba(212,168,90,0.15)' : 'rgba(240,232,216,0.05)',
                          border: `1px solid ${canHire ? 'rgba(212,168,90,0.4)' : 'rgba(240,232,216,0.1)'}`,
                          color: canHire ? '#d4a85a' : 'rgba(240,232,216,0.3)',
                          flexShrink: 0,
                        }}>
                          {cost}💰
                        </button>
                      </div>
                    )
                  })}

                  {/* Expand slots */}
                  <div style={{ marginTop: 4, padding: '10px 12px', borderRadius: 10, background: 'rgba(111,166,122,0.05)', border: '1px solid rgba(111,166,122,0.15)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#7aaa82', marginBottom: 2 }}>+ Розширити армію</div>
                        <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.4)' }}>+1 слот для нового юніта</div>
                      </div>
                      <button
                        onClick={gold >= 5 ? onExpandSlots : undefined}
                        disabled={gold < 5}
                        style={{
                          padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                          cursor: gold >= 5 ? 'pointer' : 'not-allowed',
                          background: gold >= 5 ? 'rgba(111,166,122,0.15)' : 'rgba(240,232,216,0.05)',
                          border: `1px solid ${gold >= 5 ? 'rgba(111,166,122,0.4)' : 'rgba(240,232,216,0.1)'}`,
                          color: gold >= 5 ? '#7aaa82' : 'rgba(240,232,216,0.3)',
                          flexShrink: 0,
                        }}
                      >
                        5💰
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {fortressTab === 'upgrade' && (() => {
                const nextLevel = (fortressLevel ?? 1) + 1
                const cost = FORTRESS_UPGRADE_COST[nextLevel]
                const canAfford = gold >= (cost ?? 0)
                const isMaxed = (fortressLevel ?? 1) >= 5
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {isMaxed ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#d4a85a', fontWeight: 600 }}>
                        🏆 Фортеця досягла максимального рівня!
                      </div>
                    ) : (
                      <>
                        <div style={{ padding: '12px', borderRadius: 10, background: 'rgba(212,168,90,0.06)', border: '1px solid rgba(212,168,90,0.15)' }}>
                          <div style={{ fontSize: 12, color: 'rgba(240,232,216,0.5)', marginBottom: 6 }}>Наступний рівень</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#d4a85a', marginBottom: 4 }}>
                            {FORTRESS_NAMES[nextLevel]} (Рівень {nextLevel})
                          </div>
                          <div style={{ fontSize: 12, color: 'rgba(240,232,216,0.55)' }}>
                            Дозволить юнітам досягати рівня {nextLevel}
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {[2, 3, 4, 5].map(lvl => {
                            const upgCost = FORTRESS_UPGRADE_COST[lvl]
                            const done = (fortressLevel ?? 1) >= lvl
                            const isCurrent = lvl === nextLevel
                            return (
                              <div key={lvl} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: done ? 0.4 : 1 }}>
                                <div style={{
                                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 10, fontWeight: 700,
                                  background: done ? 'rgba(111,166,122,0.2)' : isCurrent ? 'rgba(212,168,90,0.2)' : 'rgba(240,232,216,0.06)',
                                  border: `1px solid ${done ? 'rgba(111,166,122,0.4)' : isCurrent ? 'rgba(212,168,90,0.4)' : 'rgba(240,232,216,0.1)'}`,
                                  color: done ? '#6fa67a' : isCurrent ? '#d4a85a' : 'rgba(240,232,216,0.3)',
                                }}>
                                  {done ? '✓' : lvl}
                                </div>
                                <div style={{ flex: 1 }}>
                                  <span style={{ fontSize: 12, color: done ? 'rgba(240,232,216,0.4)' : isCurrent ? '#f0e8d8' : 'rgba(240,232,216,0.5)', fontWeight: isCurrent ? 600 : 400 }}>
                                    {FORTRESS_NAMES[lvl]}
                                  </span>
                                </div>
                                <span style={{ fontSize: 11, color: 'rgba(212,168,90,0.7)', flexShrink: 0 }}>{upgCost}💰</span>
                              </div>
                            )
                          })}
                        </div>

                        <button
                          onClick={canAfford ? onUpgradeFortress : undefined}
                          disabled={!canAfford}
                          style={{
                            padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                            cursor: canAfford ? 'pointer' : 'not-allowed', marginTop: 4,
                            background: canAfford ? 'rgba(212,168,90,0.18)' : 'rgba(240,232,216,0.04)',
                            border: `1px solid ${canAfford ? 'rgba(212,168,90,0.5)' : 'rgba(240,232,216,0.1)'}`,
                            color: canAfford ? '#d4a85a' : 'rgba(240,232,216,0.25)',
                          }}
                        >
                          {canAfford
                            ? `🏰 Покращити до ${FORTRESS_NAMES[nextLevel]} — ${cost}💰`
                            : `Не вистачає золота (потрібно ${cost}💰, є ${gold}💰)`}
                        </button>
                      </>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
