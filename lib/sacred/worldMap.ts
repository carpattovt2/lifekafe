import type { ArmyCounts } from './types'

export type NodeType = 'town' | 'resource' | 'dungeon' | 'camp' | 'artifact'
export type NodeStatus = 'player' | 'cleared' | 'collected' | 'enemy' | 'neutral'

export interface MapNodeDef {
  id: string
  label: string
  type: NodeType
  x: number
  y: number
  connections: string[]
  desc?: string
  enemyCounts?: ArmyCounts
  goldReward?: number
  xpReward?: number
  difficulty?: string
}

export interface WorldMapState {
  statuses: Record<string, NodeStatus>
  heroNodeId: string
  heroAP: number
  maxAP: number
  turn: number
  gold: number
  restedThisTurn: boolean
}

// viewBox: 0 0 200 130
export const WORLD_NODES: MapNodeDef[] = [
  {
    id: 'town', label: 'Місто', type: 'town',
    x: 18, y: 65, connections: ['forest', 'ruins'],
    desc: 'Твоя фортеця. Тут можна відпочити й відновити сили перед походом.',
  },
  {
    id: 'forest', label: 'Зачарований ліс', type: 'resource',
    x: 50, y: 30, connections: ['town', 'shrine', 'camp1'],
    desc: 'Старий ліс, повний магічних трав і золотих грибів.',
    goldReward: 3,
  },
  {
    id: 'shrine', label: 'Прадавній вівтар', type: 'artifact',
    x: 88, y: 10, connections: ['forest', 'mine'],
    desc: 'Сили цього місця пробуджують мудрість у всіх, хто торкнеться каменю.',
    xpReward: 60,
  },
  {
    id: 'mine', label: 'Золота шахта', type: 'resource',
    x: 126, y: 25, connections: ['shrine', 'necropolis'],
    desc: 'Занедбана гномами шахта. Золото ще там — потрібно лише взяти.',
    goldReward: 5,
  },
  {
    id: 'ruins', label: 'Стародавні руїни', type: 'dungeon',
    x: 44, y: 98, connections: ['town', 'camp1', 'swamp'],
    desc: 'Колись велике місто. Тепер притулок для нечисті та скелетів.',
    difficulty: 'Легко',
    enemyCounts: { warriors: 2, archers: 1, mages: 0, catapults: 0 },
    goldReward: 3,
  },
  {
    id: 'camp1', label: 'Табір найманців', type: 'camp',
    x: 84, y: 65, connections: ['forest', 'ruins', 'temple'],
    desc: "Озброєні найманці контролюють перехрестя. Хочуть плату кров'ю.",
    difficulty: 'Середньо',
    enemyCounts: { warriors: 2, archers: 1, mages: 1, catapults: 0 },
    goldReward: 4,
  },
  {
    id: 'swamp', label: 'Мертве болото', type: 'camp',
    x: 96, y: 100, connections: ['ruins', 'temple'],
    desc: 'Темні істоти у гнилих топях. Проходу не дадуть без бою.',
    difficulty: 'Важко',
    enemyCounts: { warriors: 3, archers: 1, mages: 1, catapults: 0 },
    goldReward: 5,
  },
  {
    id: 'temple', label: 'Занедбаний храм', type: 'dungeon',
    x: 126, y: 65, connections: ['camp1', 'swamp', 'necropolis', 'boss'],
    desc: 'Темний культ оселився в руїнах давнього храму. Дуже небезпечно.',
    difficulty: 'Важко',
    enemyCounts: { warriors: 2, archers: 2, mages: 2, catapults: 0 },
    goldReward: 6,
  },
  {
    id: 'necropolis', label: 'Некрополь', type: 'dungeon',
    x: 158, y: 32, connections: ['mine', 'temple', 'boss'],
    desc: 'Місто мертвих. Некромант збирає сили для фінального удару.',
    difficulty: 'Дуже важко',
    enemyCounts: { warriors: 3, archers: 2, mages: 2, catapults: 1 },
    goldReward: 10,
  },
  {
    id: 'boss', label: 'Цитадель Тьми', type: 'dungeon',
    x: 182, y: 65, connections: ['temple', 'necropolis'],
    desc: 'Серце темряви. Переможи Повелителя — і перемога за тобою.',
    difficulty: 'Фінальний бій',
    enemyCounts: { warriors: 4, archers: 3, mages: 2, catapults: 1 },
    goldReward: 20,
  },
]

const NODE_MAP = new Map(WORLD_NODES.map(n => [n.id, n]))

export function createInitialMapState(): WorldMapState {
  const statuses: Record<string, NodeStatus> = {}
  for (const n of WORLD_NODES) {
    if (n.id === 'town') statuses[n.id] = 'player'
    else if (n.type === 'resource' || n.type === 'artifact') statuses[n.id] = 'neutral'
    else statuses[n.id] = 'enemy'
  }
  return { statuses, heroNodeId: 'town', heroAP: 3, maxAP: 3, turn: 1, gold: 0, restedThisTurn: false }
}

function isBlocker(nodeId: string, statuses: Record<string, NodeStatus>): boolean {
  return statuses[nodeId] === 'enemy'
}

export function getReachableNodes(
  heroNodeId: string,
  ap: number,
  statuses: Record<string, NodeStatus>,
): Map<string, number> {
  const costs = new Map<string, number>([[heroNodeId, 0]])
  const queue: Array<{ id: string; cost: number }> = [{ id: heroNodeId, cost: 0 }]

  while (queue.length > 0) {
    const { id, cost } = queue.shift()!
    if (cost >= ap) continue
    // Can't pass THROUGH enemy nodes — only enter them
    if (id !== heroNodeId && isBlocker(id, statuses)) continue
    for (const connId of NODE_MAP.get(id)!.connections) {
      const newCost = cost + 1
      if (!costs.has(connId) || costs.get(connId)! > newCost) {
        costs.set(connId, newCost)
        queue.push({ id: connId, cost: newCost })
      }
    }
  }

  costs.delete(heroNodeId)
  return costs
}

export function getVisibleNodeIds(heroNodeId: string, maxAP: number): Set<string> {
  const visible = new Set<string>([heroNodeId])
  const queue: Array<{ id: string; dist: number }> = [{ id: heroNodeId, dist: 0 }]
  while (queue.length > 0) {
    const { id, dist } = queue.shift()!
    if (dist >= maxAP) continue
    for (const connId of NODE_MAP.get(id)!.connections) {
      if (!visible.has(connId)) {
        visible.add(connId)
        queue.push({ id: connId, dist: dist + 1 })
      }
    }
  }
  return visible
}

export function getPathCost(
  fromId: string,
  toId: string,
  statuses: Record<string, NodeStatus>,
): number {
  if (fromId === toId) return 0
  const costs = new Map<string, number>([[fromId, 0]])
  const queue: Array<{ id: string; cost: number }> = [{ id: fromId, cost: 0 }]

  while (queue.length > 0) {
    const { id, cost } = queue.shift()!
    if (id === toId) return cost
    if (id !== fromId && isBlocker(id, statuses)) continue
    for (const connId of NODE_MAP.get(id)!.connections) {
      const newCost = cost + 1
      if (!costs.has(connId) || costs.get(connId)! > newCost) {
        costs.set(connId, newCost)
        queue.push({ id: connId, cost: newCost })
      }
    }
  }

  return Infinity
}
