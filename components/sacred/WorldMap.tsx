'use client'

import { useState } from 'react'
import { WORLD_NODES, getReachableNodes, getPathCost } from '@/lib/sacred/worldMap'
import type { WorldMapState, NodeType, NodeStatus } from '@/lib/sacred/worldMap'

// ── Visual constants ────────────────────────────────────────────────────────────

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

// ── Props ───────────────────────────────────────────────────────────────────────

interface WorldMapProps {
  mapState: WorldMapState
  onMove:      (nodeId: string) => void
  onFight:     (nodeId: string) => void
  onCollect:   (nodeId: string) => void
  onRest:      () => void
  onEndTurn:   () => void
  onBack:      () => void
}

// ── Component ───────────────────────────────────────────────────────────────────

export default function WorldMap({
  mapState, onMove, onFight, onCollect, onRest, onEndTurn, onBack,
}: WorldMapProps) {
  const [previewNodeId, setPreviewNodeId] = useState<string | null>(null)

  const { statuses, heroNodeId, heroAP, maxAP, turn, gold } = mapState
  const heroNode   = WORLD_NODES.find(n => n.id === heroNodeId)!
  const reachable  = getReachableNodes(heroNodeId, heroAP, statuses)

  // Panel shows preview node if set, else current hero node
  const panelNode  = (previewNodeId ? WORLD_NODES.find(n => n.id === previewNodeId) : null) ?? heroNode
  const panelIsHero = panelNode.id === heroNodeId

  // ── Interactions ──────────────────────────────────────────────────────────────

  function handleNodeClick(nodeId: string) {
    if (nodeId === heroNodeId) { setPreviewNodeId(null); return }

    const status = statuses[nodeId]
    if (reachable.has(nodeId)) {
      if (status === 'enemy') {
        // Show enemy preview before committing to move
        setPreviewNodeId(nodeId)
      } else {
        onMove(nodeId)
        setPreviewNodeId(null)
      }
    } else {
      // Unreachable — just show info
      setPreviewNodeId(nodeId)
    }
  }

  function handleAttack() {
    if (!previewNodeId) {
      // Hero is already at an enemy node
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

  // ── Rendering helpers ─────────────────────────────────────────────────────────

  const panelStatus = statuses[panelNode.id] as NodeStatus
  const enemyCounts = panelNode.enemyCounts

  const statusBadge = (status: NodeStatus) => {
    if (status === 'cleared' || status === 'collected') return null
    if (panelNode.difficulty && status === 'enemy') return panelNode.difficulty
    return null
  }

  // Draw connections — each pair only once
  const drawnLines = new Set<string>()
  const connectionLines = WORLD_NODES.flatMap(node =>
    node.connections.map(connId => {
      const key = [node.id, connId].sort().join('|')
      if (drawnLines.has(key)) return null
      drawnLines.add(key)
      const conn = WORLD_NODES.find(n => n.id === connId)!
      const bothAccessible =
        (statuses[node.id] !== 'enemy' || node.id === heroNodeId) &&
        (statuses[connId]  !== 'enemy' || connId  === heroNodeId)
      return { key, x1: node.x, y1: node.y, x2: conn.x, y2: conn.y, active: bothAccessible }
    }).filter(Boolean),
  )

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', minHeight: '100dvh',
      background: '#0f0e09', color: '#f0e8d8',
      fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column',
    }}>

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
        <div style={{ fontSize: 14, fontWeight: 700, color: '#d4a85a' }}>✦ Карта світу</div>
        <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'rgba(240,232,216,0.5)' }}>
          <span>💰 {gold}</span>
          <span style={{ color: '#b07850' }}>Хід {turn}</span>
        </div>
      </div>

      {/* AP indicator */}
      <div style={{
        padding: '7px 16px 6px', background: '#17150f',
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, color: 'rgba(240,232,216,0.35)', marginRight: 2 }}>Кроки:</span>
        {Array.from({ length: maxAP }, (_, i) => (
          <div key={i} style={{
            width: 9, height: 9, borderRadius: '50%',
            background: i < heroAP ? '#d4a85a' : 'rgba(240,232,216,0.1)',
            transition: 'background 0.2s',
          }} />
        ))}
        {heroAP === 0 && (
          <span style={{ fontSize: 11, color: '#c07070', marginLeft: 6 }}>
            Кроків немає — завершіть хід
          </span>
        )}
      </div>

      {/* SVG Map */}
      <div style={{ flexShrink: 0, padding: '6px 0' }}>
        <svg
          viewBox="0 0 200 130"
          style={{ width: '100%', display: 'block' }}
          onClick={() => setPreviewNodeId(null)}
        >
          {/* Background */}
          <defs>
            <radialGradient id="mapbg" cx="50%" cy="50%" r="70%">
              <stop offset="0%" stopColor="#131108" />
              <stop offset="100%" stopColor="#0a0908" />
            </radialGradient>
          </defs>
          <rect x={0} y={0} width={200} height={130} fill="url(#mapbg)" />

          {/* Connection lines */}
          {connectionLines.map(l => l && (
            <line
              key={l.key}
              x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
              stroke={l.active ? 'rgba(212,168,90,0.2)' : 'rgba(240,232,216,0.08)'}
              strokeWidth={1.5}
            />
          ))}

          {/* Nodes */}
          {WORLD_NODES.map(node => {
            const status   = statuses[node.id] as NodeStatus
            const isHero   = node.id === heroNodeId
            const canReach = reachable.has(node.id) && !isHero
            const isPrev   = node.id === previewNodeId
            const color    = NODE_COLOR[node.type]
            const dimmed   = status === 'cleared' || status === 'collected'

            return (
              <g
                key={node.id}
                opacity={dimmed ? 0.45 : 1}
                style={{ cursor: canReach || isHero || isPrev ? 'pointer' : 'default' }}
                onClick={e => { e.stopPropagation(); handleNodeClick(node.id) }}
              >
                {/* Large hit area */}
                <circle cx={node.x} cy={node.y} r={15} fill="transparent" />

                {/* Reachable pulse ring */}
                {canReach && (
                  <circle
                    cx={node.x} cy={node.y} r={13.5}
                    fill="none"
                    stroke={color} strokeWidth={1.5}
                    strokeDasharray="3 2"
                    opacity={0.55}
                  />
                )}

                {/* Preview / selected highlight */}
                {isPrev && (
                  <circle cx={node.x} cy={node.y} r={13}
                    fill="none" stroke="#f0e8d8" strokeWidth={1.5} opacity={0.6}
                  />
                )}

                {/* Main circle */}
                <circle
                  cx={node.x} cy={node.y} r={10}
                  fill={`${color}1a`}
                  stroke={isHero ? '#d4a85a' : color}
                  strokeWidth={isHero ? 2.5 : 1.5}
                />

                {/* Icon or checkmark */}
                <text
                  x={node.x} y={node.y}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={9} style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {dimmed ? '✓' : NODE_ICON[node.type]}
                </text>

                {/* Label */}
                <text
                  x={node.x} y={node.y + 15}
                  textAnchor="middle"
                  fontSize={5.5}
                  fill="rgba(240,232,216,0.5)"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {node.label}
                </text>
              </g>
            )
          })}

          {/* Hero ring */}
          <circle
            cx={heroNode.x} cy={heroNode.y} r={14}
            fill="none" stroke="#d4a85a" strokeWidth={2}
            opacity={0.9} style={{ pointerEvents: 'none' }}
          />
        </svg>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', gap: 12, padding: '0 16px 8px',
        fontSize: 10, color: 'rgba(240,232,216,0.3)', flexWrap: 'wrap', flexShrink: 0,
      }}>
        {([['town','🏰 Місто'], ['resource','💰 Ресурс'], ['dungeon','💀 Данж'], ['camp','⚔ Табір'], ['artifact','✦ Артефакт']] as [NodeType, string][]).map(([t, label]) => (
          <span key={t} style={{ color: NODE_COLOR[t], opacity: 0.7 }}>{label}</span>
        ))}
      </div>

      {/* Node info panel */}
      <div style={{
        background: '#17150f', borderTop: '1px solid rgba(240,232,216,0.08)',
        padding: '14px 16px 20px', flexShrink: 0,
      }}>
        {/* Node header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: `${NODE_COLOR[panelNode.type]}14`,
            border: `1.5px solid ${NODE_COLOR[panelNode.type]}44`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 17,
          }}>
            {panelStatus === 'cleared' || panelStatus === 'collected'
              ? '✓' : NODE_ICON[panelNode.type]}
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
              {panelIsHero && (
                <span style={{ fontSize: 10, color: '#d4a85a', opacity: 0.7 }}>▲ ти тут</span>
              )}
              {previewNodeId && !panelIsHero && reachable.has(previewNodeId) && (
                <span style={{ fontSize: 10, color: 'rgba(240,232,216,0.35)' }}>
                  (-{getPathCost(heroNodeId, previewNodeId, statuses)} кроки)
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.42)', marginTop: 4, lineHeight: 1.45 }}>
              {panelNode.desc}
            </div>

            {/* Enemy composition */}
            {enemyCounts && panelStatus === 'enemy' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                {([['⚔', enemyCounts.warriors], ['🏹', enemyCounts.archers], ['🔮', enemyCounts.mages], ['🗿', enemyCounts.catapults]] as [string, number][])
                  .filter(([, n]) => n > 0)
                  .map(([icon, n]) => (
                    <span key={icon} style={{
                      fontSize: 11, padding: '2px 7px', borderRadius: 5,
                      background: 'rgba(192,112,112,0.1)', color: 'rgba(192,112,112,0.75)',
                      border: '1px solid rgba(192,112,112,0.18)',
                    }}>{icon} ×{n}</span>
                  ))}
              </div>
            )}

            {/* Resource / artifact info */}
            {panelNode.type === 'resource' && panelStatus !== 'collected' && (
              <div style={{ fontSize: 11, color: '#6fa67a', marginTop: 5 }}>
                💰 +{panelNode.goldReward} золота
              </div>
            )}
            {panelNode.type === 'artifact' && panelStatus !== 'collected' && (
              <div style={{ fontSize: 11, color: '#a080c8', marginTop: 5 }}>
                ✦ +{panelNode.xpReward} XP усім юнітам
              </div>
            )}
            {(panelStatus === 'cleared' || panelStatus === 'collected') && (
              <div style={{ fontSize: 11, color: 'rgba(111,166,122,0.6)', marginTop: 5 }}>✓ Виконано</div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>

          {/* Attack — enemy node in preview (move + fight) or hero already there */}
          {((previewNodeId && reachable.has(previewNodeId) && panelStatus === 'enemy') ||
            (panelIsHero && (panelNode.type === 'dungeon' || panelNode.type === 'camp') && panelStatus === 'enemy')) && (
            <button onClick={handleAttack} style={{
              flex: 1, padding: '11px', borderRadius: 8,
              background: 'rgba(192,112,112,0.15)', border: '1px solid rgba(192,112,112,0.4)',
              color: '#e08080', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              ⚔ Атакувати
            </button>
          )}

          {/* Resource collect */}
          {panelIsHero && panelNode.type === 'resource' && panelStatus === 'neutral' && (
            <button onClick={handleCollect} style={{
              flex: 1, padding: '11px', borderRadius: 8,
              background: 'rgba(111,166,122,0.12)', border: '1px solid rgba(111,166,122,0.3)',
              color: '#7aaa82', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              💰 Зібрати +{panelNode.goldReward} золота
            </button>
          )}

          {/* Artifact collect */}
          {panelIsHero && panelNode.type === 'artifact' && panelStatus === 'neutral' && (
            <button onClick={handleCollect} style={{
              flex: 1, padding: '11px', borderRadius: 8,
              background: 'rgba(160,128,200,0.12)', border: '1px solid rgba(160,128,200,0.3)',
              color: '#a080c8', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              ✦ Взяти (+{panelNode.xpReward} XP)
            </button>
          )}

          {/* Rest at town */}
          {panelIsHero && panelNode.type === 'town' && (
            <button onClick={onRest} style={{
              flex: 1, padding: '11px', borderRadius: 8,
              background: 'rgba(212,168,90,0.1)', border: '1px solid rgba(212,168,90,0.25)',
              color: '#d4a85a', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              🏠 Відпочити (відновити HP)
            </button>
          )}

          {/* End turn */}
          <button onClick={onEndTurn} style={{
            padding: '11px 18px', borderRadius: 8, flexShrink: 0,
            background: 'rgba(176,120,80,0.1)', border: '1px solid rgba(176,120,80,0.3)',
            color: '#b07850', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            Хід →
          </button>
        </div>
      </div>
    </div>
  )
}
