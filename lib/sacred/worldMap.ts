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
  enemyLevel?: number
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
  maxArmySlots: number
  fortressLevel: 1 | 2 | 3 | 4 | 5
}

export const FORTRESS_NAMES: Record<number, string> = {
  1: 'Аванпост',
  2: 'Табір',
  3: 'Фортеця',
  4: 'Цитадель',
  5: 'Бастіон',
}

// Cost to unlock next army slot (key = current maxArmySlots, value = gold cost)
export const SLOT_COSTS: Record<number, number> = { 4: 5, 5: 8, 6: 12, 7: 15 }

export function isSlotUnlocked(row: number, slot: number, maxArmySlots: number): boolean {
  if (slot <= 1) return true
  if (slot === 2) return row === 0 ? maxArmySlots >= 5 : maxArmySlots >= 6
  if (slot === 3) return row === 0 ? maxArmySlots >= 7 : maxArmySlots >= 8
  return false
}

export const FORTRESS_UPGRADE_COST: Record<number, number> = {
  2: 5,
  3: 8,
  4: 12,
  5: 15,
}

// viewBox: 0 0 200 130
export const WORLD_NODES: MapNodeDef[] = [
  // ── Home ──────────────────────────────────────────────────────────────────────
  {
    id: 'town', label: 'Місто', type: 'town',
    x: 15, y: 65, connections: ['outpost', 'farmlands'],
    desc: 'Твоя фортеця. Тут можна відпочити й відновити сили перед походом.',
  },
  // ── Zone 1 (lv1) ──────────────────────────────────────────────────────────────
  {
    id: 'outpost', label: 'Прикордонний пост', type: 'camp',
    x: 40, y: 44, connections: ['town', 'forest', 'watchtower'],
    desc: 'Ворожий дозорний пост. Перша перешкода на шляху до лісу.',
    difficulty: 'Легко',
    enemyCounts: { warriors: 2, archers: 0, mages: 0, catapults: 0 },
    enemyLevel: 1,
    goldReward: 2,
  },
  {
    id: 'farmlands', label: 'Занедбані поля', type: 'resource',
    x: 40, y: 88, connections: ['town', 'watchtower', 'ruins'],
    desc: "Покинуті поля. Серед бур'яну ще можна знайти золоті монети.",
    goldReward: 3,
  },
  // ── Zone 2 (lv1–2) ────────────────────────────────────────────────────────────
  {
    id: 'forest', label: 'Зачарований ліс', type: 'resource',
    x: 68, y: 20, connections: ['outpost', 'shrine', 'watchtower'],
    desc: 'Старий ліс, повний магічних трав і золотих грибів.',
    goldReward: 3,
    xpReward: 20,
  },
  {
    id: 'watchtower', label: 'Вежа Вартових', type: 'camp',
    x: 68, y: 62, connections: ['outpost', 'farmlands', 'forest', 'ruins', 'mine'],
    desc: 'Укріплена вежа на перехресті доріг. Ворожі вартові не пропустять.',
    difficulty: 'Легко',
    enemyCounts: { warriors: 2, archers: 1, mages: 0, catapults: 0 },
    enemyLevel: 1,
    goldReward: 3,
  },
  {
    id: 'ruins', label: 'Стародавні руїни', type: 'dungeon',
    x: 68, y: 106, connections: ['farmlands', 'watchtower', 'cemetery'],
    desc: 'Колись велике місто. Тепер притулок для нечисті та скелетів.',
    difficulty: 'Легко',
    enemyCounts: { warriors: 2, archers: 1, mages: 0, catapults: 0 },
    enemyLevel: 1,
    goldReward: 3,
  },
  // ── Zone 3 (lv2–3) ────────────────────────────────────────────────────────────
  {
    id: 'shrine', label: 'Прадавній вівтар', type: 'artifact',
    x: 96, y: 7, connections: ['forest', 'mine', 'temple'],
    desc: 'Сили цього місця пробуджують мудрість у всіх, хто торкнеться каменю.',
    xpReward: 60,
  },
  {
    id: 'mine', label: 'Золота шахта', type: 'resource',
    x: 96, y: 42, connections: ['shrine', 'watchtower', 'swamp'],
    desc: 'Занедбана гномами шахта. Золото ще там — потрібно лише взяти.',
    goldReward: 5,
  },
  {
    id: 'swamp', label: 'Мертве болото', type: 'camp',
    x: 96, y: 78, connections: ['mine', 'cemetery', 'crossroads'],
    desc: 'Темні істоти у гнилих топях. Проходу не дадуть без бою.',
    difficulty: 'Середньо',
    enemyCounts: { warriors: 2, archers: 1, mages: 1, catapults: 0 },
    enemyLevel: 2,
    goldReward: 4,
  },
  {
    id: 'cemetery', label: 'Проклятий цвинтар', type: 'dungeon',
    x: 96, y: 114, connections: ['ruins', 'swamp', 'necropolis'],
    desc: 'Нежить ходить між могильними плитами. Темна магія тут сильна.',
    difficulty: 'Середньо',
    enemyCounts: { warriors: 3, archers: 1, mages: 0, catapults: 0 },
    enemyLevel: 2,
    goldReward: 4,
  },
  // ── Zone 4 (lv3–4) ────────────────────────────────────────────────────────────
  {
    id: 'temple', label: 'Занедбаний храм', type: 'dungeon',
    x: 126, y: 16, connections: ['shrine', 'crossroads', 'dark_keep'],
    desc: 'Темний культ оселився в руїнах давнього храму. Жерці викликають демонів.',
    difficulty: 'Важко',
    enemyCounts: { warriors: 2, archers: 2, mages: 1, catapults: 0 },
    enemyLevel: 3,
    goldReward: 6,
  },
  {
    id: 'crossroads', label: 'Перехрестя Доріг', type: 'camp',
    x: 126, y: 58, connections: ['swamp', 'temple', 'necropolis', 'shadow_gate'],
    desc: 'Ворожий загін тримає ключове перехрестя. Без бою не пройти.',
    difficulty: 'Важко',
    enemyCounts: { warriors: 3, archers: 2, mages: 1, catapults: 0 },
    enemyLevel: 3,
    goldReward: 5,
  },
  {
    id: 'necropolis', label: 'Некрополь', type: 'dungeon',
    x: 124, y: 105, connections: ['cemetery', 'crossroads', 'shadow_gate'],
    desc: 'Місто мертвих. Некромант збирає непереможну армію.',
    difficulty: 'Дуже важко',
    enemyCounts: { warriors: 3, archers: 2, mages: 2, catapults: 0 },
    enemyLevel: 4,
    goldReward: 8,
  },
  // ── Zone 5 (lv4–5) ────────────────────────────────────────────────────────────
  {
    id: 'dark_keep', label: 'Темна Твердиня', type: 'dungeon',
    x: 156, y: 32, connections: ['temple', 'boss'],
    desc: 'Передовий форпост Повелителя. Елітні воїни тьми охороняють браму.',
    difficulty: 'Дуже важко',
    enemyCounts: { warriors: 4, archers: 2, mages: 2, catapults: 0 },
    enemyLevel: 4,
    goldReward: 10,
  },
  {
    id: 'shadow_gate', label: 'Брама Тіней', type: 'dungeon',
    x: 156, y: 82, connections: ['crossroads', 'necropolis', 'boss'],
    desc: 'Портал у темряву. Охорона — найсильніші бійці армії тьми.',
    difficulty: 'Дуже важко',
    enemyCounts: { warriors: 4, archers: 3, mages: 2, catapults: 1 },
    enemyLevel: 5,
    goldReward: 12,
  },
  {
    id: 'boss', label: 'Цитадель Тьми', type: 'dungeon',
    x: 184, y: 58, connections: ['dark_keep', 'shadow_gate'],
    desc: 'Серце темряви. Переможи Повелителя — і перемога за тобою.',
    difficulty: 'Фінальний бій',
    enemyCounts: { warriors: 4, archers: 3, mages: 3, catapults: 1 },
    enemyLevel: 5,
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
  return { statuses, heroNodeId: 'town', heroAP: 3, maxAP: 3, turn: 1, gold: 0, restedThisTurn: false, maxArmySlots: 4, fortressLevel: 1 }
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
