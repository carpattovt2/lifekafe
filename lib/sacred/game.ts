import type {
  GameUnit, Side, Row, UnitClass, Buff, BuffType,
  ActionKey, ActionDef, LogEntry, BattleState, BattleAction, Phase,
  ArmyCounts, BattleEvent,
} from './types'

// ── Unit templates ─────────────────────────────────────────────────────────────
type Template = Omit<GameUnit, 'id' | 'side' | 'row' | 'slot' | 'name' | 'buffs' | 'hasActed'>

const TEMPLATES: Record<UnitClass, Template> = {
  warrior: {
    class: 'warrior', hp: 80, maxHp: 80,
    minDmg: 10, maxDmg: 15, accuracy: 0.80, defense: 0,
    initiative: 50, morale: 50,
    critChance: 0, critMult: 2.0, counter: 0, evasion: 0.15,
  },
  archer: {
    class: 'archer', hp: 65, maxHp: 65,
    minDmg: 12, maxDmg: 18, accuracy: 0.85, defense: 0,
    initiative: 60, morale: 50,
    critChance: 0, critMult: 2.0, counter: 0, evasion: 0.15,
  },
  mage: {
    class: 'mage', hp: 55, maxHp: 55,
    minDmg: 7, maxDmg: 10, accuracy: 0.60, defense: 0,
    initiative: 30, morale: 50,
    critChance: 0, critMult: 2.0, counter: 0, evasion: 0.10,
  },
  catapult: {
    class: 'catapult', hp: 95, maxHp: 95,
    minDmg: 15, maxDmg: 18, accuracy: 0.60, defense: 0,
    initiative: 10, morale: 50,
    critChance: 0, critMult: 2.0, counter: 0, evasion: 0,
  },
}

const CLASS_LABEL: Record<UnitClass, string> = {
  warrior: 'Воїн', archer: 'Лучник', mage: 'Маг', catapult: 'Катапульта',
}
const ROMAN = ['I', 'II', 'III', 'IV']

let _uid = 0
function uid() { return `u${++_uid}` }

function makeUnit(cls: UnitClass, side: Side, row: Row, slot: number): GameUnit {
  const prefix = side === 'ai' ? 'Вор.' : ''
  const label = cls === 'catapult' ? 'Катапульта' : `${CLASS_LABEL[cls]} ${ROMAN[slot] ?? slot + 1}`
  const name = `${prefix}${label}`
  return { ...TEMPLATES[cls], id: uid(), side, row, slot, hasActed: false, buffs: [], name }
}

// ── Army builders ──────────────────────────────────────────────────────────────
export function buildCustomArmy(counts: ArmyCounts, side: Side): GameUnit[] {
  const units: GameUnit[] = []
  for (let i = 0; i < counts.warriors;  i++) units.push(makeUnit('warrior',  side, 0, i))
  for (let i = 0; i < counts.archers;   i++) units.push(makeUnit('archer',   side, 1, i))
  if ((counts.catapults ?? 0) > 0)           units.push(makeUnit('catapult', side, 1, 2))
  for (let i = 0; i < counts.mages;     i++) units.push(makeUnit('mage',     side, 2, i))
  return units
}

export function buildDefaultAIArmy(): GameUnit[] {
  return buildCustomArmy({ warriors: 2, archers: 1, mages: 1, catapults: 1 }, 'ai')
}

// ── Initiative queue ───────────────────────────────────────────────────────────
function buildQueue(units: GameUnit[]): string[] {
  const alive = units.filter(u => u.hp > 0)
  return [...alive]
    .sort((a, b) => b.initiative - a.initiative + (Math.random() - 0.5) * 0.1)
    .map(u => u.id)
}

// ── Buff helpers ───────────────────────────────────────────────────────────────
let _bid = 0
function makeBuff(type: BuffType, value: number, turnsLeft: number): Buff {
  return { id: `b${++_bid}`, type, value, turnsLeft }
}

function getBuffValue(unit: GameUnit, type: BuffType): number {
  return unit.buffs.filter(b => b.type === type).reduce((s, b) => s + b.value, 0)
}

function tickBuffs(unit: GameUnit): GameUnit {
  return { ...unit, buffs: unit.buffs.map(b => ({ ...b, turnsLeft: b.turnsLeft - 1 })).filter(b => b.turnsLeft > 0) }
}

// ── Front-line protection: back-row units gain 20% damage reduction while front row alive ──
function frontLineBonus(def: GameUnit, units: GameUnit[]): number {
  if (def.row === 0) return 0
  const frontAlive = units.some(u => u.side === def.side && u.hp > 0 && u.row === 0)
  return frontAlive ? 0.20 : 0
}

// ── Adjacent units (row ±1, slot ±1) ─────────────────────────────────────────
function getAdjacentEnemies(target: GameUnit, units: GameUnit[], enemySide: Side): GameUnit[] {
  return units.filter(u => {
    if (u.side !== enemySide || u.hp === 0 || u.id === target.id) return false
    return Math.abs(u.row - target.row) <= 1 && Math.abs(u.slot - target.slot) <= 1
  })
}

// ── Combat ─────────────────────────────────────────────────────────────────────
let _logId = 0
let _evId  = 0
function log(text: string, type: LogEntry['type']): LogEntry { return { id: ++_logId, text, type } }
function ev(unitId: string, text: string, type: BattleEvent['type'], sourceId?: string): BattleEvent {
  return { id: ++_evId, unitId, text, type, sourceId }
}

interface AttackResult {
  hit: boolean; evaded: boolean; crit: boolean; damage: number
  logs: LogEntry[]; events: BattleEvent[]
}

function resolveAttack(
  atk: GameUnit, def: GameUnit, units: GameUnit[],
  opts: { dmgMult?: number; accBonus?: number } = {},
): AttackResult {
  let { dmgMult = 1, accBonus = 0 } = opts
  const logs: LogEntry[] = []
  const events: BattleEvent[] = []

  let effectiveCritChance = atk.critChance
  let effectiveCritMult   = atk.critMult

  const aimedBuff = atk.buffs.find(b => b.type === 'aimed')
  if (aimedBuff) {
    accBonus += aimedBuff.value       // fixed bonus stored at cast time
    effectiveCritChance = 0.35
    effectiveCritMult   = 2.0
  }

  const acc = Math.min(0.97, atk.accuracy + accBonus)
  if (Math.random() > acc) {
    logs.push(log(`${atk.name} промахується!`, 'miss'))
    events.push(ev(atk.id, 'Промах!', 'miss'))
    return { hit: false, evaded: false, crit: false, damage: 0, logs, events }
  }

  if (Math.random() < def.evasion) {
    logs.push(log(`${def.name} ухиляється!`, 'evade'))
    events.push(ev(def.id, 'Ухил!', 'evade', atk.id))
    return { hit: true, evaded: true, crit: false, damage: 0, logs, events }
  }

  let dmg = (atk.minDmg + Math.random() * (atk.maxDmg - atk.minDmg)) * dmgMult

  const isCrit = Math.random() < effectiveCritChance
  if (isCrit) dmg *= effectiveCritMult

  const defTotal = def.defense + getBuffValue(def, 'defense_up') + frontLineBonus(def, units)
  dmg *= (1 - Math.max(0, defTotal))
  dmg = Math.max(1, Math.round(dmg))

  if (isCrit) {
    logs.push(log(`💥 КРИТ! ${atk.name} → ${def.name}: ${dmg} урону`, 'crit'))
    events.push(ev(def.id, `💥 ${dmg}`, 'crit', atk.id))
  } else {
    logs.push(log(`${atk.name} атакує ${def.name}: ${dmg} урону`, 'attack'))
    events.push(ev(def.id, `${dmg}`, 'damage', atk.id))
  }

  return { hit: true, evaded: false, crit: isCrit, damage: dmg, logs, events }
}

// ── Valid targets ──────────────────────────────────────────────────────────────
export function getValidTargets(actor: GameUnit, action: ActionKey, units: GameUnit[]): string[] {
  const living = (s: Side) => units.filter(u => u.hp > 0 && u.side === s)
  const enemySide: Side = actor.side === 'player' ? 'ai' : 'player'

  if (action === 'strike') {
    for (const r of [0, 1, 2] as Row[]) {
      const row = living(enemySide).filter(u => u.row === r)
      if (!row.length) continue
      const reachable = row.filter(u => Math.abs(u.slot - actor.slot) <= 1)
      if (reachable.length) return reachable.map(u => u.id)
      const nearest = row.sort((a, b) => Math.abs(a.slot - actor.slot) - Math.abs(b.slot - actor.slot))[0]
      return [nearest.id]
    }
    return []
  }

  if (['shot', 'fireball', 'barrage', 'grapeshot'].includes(action)) {
    return living(enemySide).map(u => u.id)
  }

  return []
}

// ── Execute one action ─────────────────────────────────────────────────────────
export function executeAction(
  state: BattleState, actor: GameUnit, action: ActionKey, targetId: string | null,
): { units: GameUnit[]; newLogs: LogEntry[]; newEvents: BattleEvent[] } {
  let units = state.units.map(u => ({ ...u }))
  const newLogs: LogEntry[] = []
  const newEvents: BattleEvent[] = []

  const getUnit = (id: string) => units.find(u => u.id === id)!
  const update  = (u: GameUnit) => { units = units.map(x => x.id === u.id ? u : x) }
  const target  = targetId ? getUnit(targetId) : null
  const enemySide: Side = actor.side === 'player' ? 'ai' : 'player'

  switch (action) {

    case 'strike':
    case 'shot': {
      if (!target) break
      const res = resolveAttack(actor, target, units)
      newLogs.push(...res.logs)
      newEvents.push(...res.events)
      if (res.damage > 0) {
        const updated = { ...target, hp: Math.max(0, target.hp - res.damage) }
        update(updated)
        if (updated.hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
      }
      break
    }

    case 'shield': {
      const a = getUnit(actor.id)
      update({ ...a, buffs: [...a.buffs, makeBuff('defense_up', 0.50, 1)] })
      newLogs.push(log(`🛡 ${actor.name} піднімає щит (+50% броні)`, 'buff'))
      newEvents.push(ev(actor.id, '🛡 +50%', 'buff'))
      break
    }

    case 'aim': {
      const a = getUnit(actor.id)
      const accBonus = 0.25 + Math.random() * 0.15  // 25–40%, fixed at cast
      const pct = Math.round(accBonus * 100)
      update({ ...a, buffs: [...a.buffs, makeBuff('aimed', accBonus, 2)] })
      newLogs.push(log(`🎯 ${actor.name} прицілюється (+${pct}% точн., 35% крит ×2 на 2 ходи)`, 'buff'))
      newEvents.push(ev(actor.id, `🎯 +${pct}%`, 'buff'))
      break
    }

    case 'chain_lightning': {
      const enemies = units.filter(u => u.side === enemySide && u.hp > 0)
      if (!enemies.length) break
      newLogs.push(log(`⚡ ${actor.name} — Ланцюгова молнія!`, 'attack'))
      for (const enemySnap of enemies) {
        const enemy = getUnit(enemySnap.id)
        if (enemy.hp === 0) continue
        const res = resolveAttack(actor, enemy, units)
        newLogs.push(...res.logs)
        newEvents.push(...res.events)
        if (res.damage > 0) {
          const updated = { ...enemy, hp: Math.max(0, enemy.hp - res.damage) }
          update(updated)
          if (updated.hp === 0) newLogs.push(log(`☠ ${enemy.name} гине!`, 'death'))
        }
      }
      break
    }

    case 'fireball': {
      if (!target) break
      newLogs.push(log(`🔥 ${actor.name} — Фаєрбол!`, 'attack'))
      const res = resolveAttack(actor, target, units, { dmgMult: 3 })
      newLogs.push(...res.logs)
      newEvents.push(...res.events)
      if (res.damage > 0) {
        const updated = { ...target, hp: Math.max(0, target.hp - res.damage) }
        update(updated)
        if (updated.hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
      }
      break
    }

    case 'barrage': {
      if (!target) break
      const res = resolveAttack(actor, target, units)
      newLogs.push(...res.logs)
      newEvents.push(...res.events)
      if (res.damage > 0) {
        const updated = { ...target, hp: Math.max(0, target.hp - res.damage) }
        update(updated)
        if (updated.hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
      }
      if (res.hit && !res.evaded) {
        const adjacent = getAdjacentEnemies(target, units, enemySide)
        for (const adjSnap of adjacent) {
          const adj = getUnit(adjSnap.id)
          if (adj.hp === 0) continue
          const splashMult = 0.25 + Math.random() * 0.25  // 25–50%
          const splashRes = resolveAttack(actor, adj, units, {
            dmgMult: splashMult,
            accBonus: Math.max(0, 1 - actor.accuracy),  // splash always hits
          })
          newLogs.push(...splashRes.logs)
          newEvents.push(...splashRes.events)
          if (splashRes.damage > 0) {
            const adjUp = { ...adj, hp: Math.max(0, adj.hp - splashRes.damage) }
            update(adjUp)
            if (adjUp.hp === 0) newLogs.push(log(`☠ ${adj.name} гине!`, 'death'))
          }
        }
      }
      break
    }

    case 'grapeshot': {
      if (!target) break
      const rowTargets = units.filter(u => u.side === enemySide && u.hp > 0 && u.row === target.row)
      newLogs.push(log(`💥 ${actor.name} — Картеч по ряду!`, 'attack'))
      for (const tSnap of rowTargets) {
        const t = getUnit(tSnap.id)
        if (t.hp === 0) continue
        const res = resolveAttack(actor, t, units, { dmgMult: 0.60 })
        newLogs.push(...res.logs)
        newEvents.push(...res.events)
        if (res.damage > 0) {
          const updated = { ...t, hp: Math.max(0, t.hp - res.damage) }
          update(updated)
          if (updated.hp === 0) newLogs.push(log(`☠ ${t.name} гине!`, 'death'))
        }
      }
      break
    }
  }

  return { units, newLogs, newEvents }
}

// ── AI decision ────────────────────────────────────────────────────────────────
function aiDecide(actor: GameUnit, state: BattleState): { action: ActionKey; targetId: string | null } {
  const playerUnits = state.units.filter(u => u.hp > 0 && u.side === 'player')
  const weakest = [...playerUnits].sort((a, b) => a.hp - b.hp)[0]
  const strongest = [...playerUnits].sort((a, b) => b.hp - a.hp)[0]

  if (actor.class === 'warrior') {
    if (actor.hp < actor.maxHp * 0.35 && Math.random() < 0.50) return { action: 'shield', targetId: null }
    const front = playerUnits.filter(u => u.row === 0)
    const target = (front.length ? front : playerUnits).sort((a, b) => a.hp - b.hp)[0]
    return { action: 'strike', targetId: target?.id ?? null }
  }

  if (actor.class === 'archer') {
    const hasAimed = actor.buffs.some(b => b.type === 'aimed')
    if (!hasAimed && playerUnits.length > 0 && Math.random() < 0.30) return { action: 'aim', targetId: null }
    return { action: 'shot', targetId: weakest?.id ?? null }
  }

  if (actor.class === 'mage') {
    // Fireball on high-HP targets to maximize triple damage value
    if (strongest && strongest.hp > strongest.maxHp * 0.60 && Math.random() < 0.45) {
      return { action: 'fireball', targetId: strongest.id }
    }
    return { action: 'chain_lightning', targetId: null }
  }

  if (actor.class === 'catapult') {
    if (!playerUnits.length) return { action: 'barrage', targetId: null }

    // Count units per row — prefer grapeshot when row has 2+ enemies
    const rowCounts = ([0, 1, 2] as Row[]).map(r => ({
      row: r,
      units: playerUnits.filter(u => u.row === r),
    }))
    const densestRow = rowCounts.filter(r => r.units.length > 0).sort((a, b) => b.units.length - a.units.length)[0]

    if (densestRow && densestRow.units.length >= 2 && Math.random() < 0.55) {
      const target = densestRow.units[Math.floor(Math.random() * densestRow.units.length)]
      return { action: 'grapeshot', targetId: target.id }
    }

    // Barrage: pick target with most adjacent enemies
    const scored = playerUnits.map(e => ({
      id: e.id,
      score: playerUnits.filter(o => o.id !== e.id
        && Math.abs(o.row - e.row) <= 1 && Math.abs(o.slot - e.slot) <= 1).length,
    }))
    const best = scored.reduce((a, b) => a.score >= b.score ? a : b)
    return { action: 'barrage', targetId: best.id }
  }

  return { action: 'strike', targetId: weakest?.id ?? null }
}

// ── Action definitions ─────────────────────────────────────────────────────────
export const ACTIONS: Record<ActionKey, ActionDef> = {
  strike:          { key: 'strike',          label: 'Удар',              desc: 'Ближній бій — сусідні слоти',              needsTarget: true,  targetSide: 'ai'   },
  shield:          { key: 'shield',          label: 'Щит',               desc: '+50% броні цей хід',                       needsTarget: false, targetSide: null   },
  shot:            { key: 'shot',            label: 'Постріл',           desc: 'Атака будь-якого ворога',                  needsTarget: true,  targetSide: 'ai'   },
  aim:             { key: 'aim',             label: 'Прицілення',        desc: '+25–40% точн. та 35% крит ×2 (2 ходи)',    needsTarget: false, targetSide: null   },
  chain_lightning: { key: 'chain_lightning', label: 'Ланцюгова молнія',  desc: 'Б\'є всіх ворогів одночасно',              needsTarget: false, targetSide: null   },
  fireball:        { key: 'fireball',        label: 'Фаєрбол',           desc: '×3 урону по одній цілі',                   needsTarget: true,  targetSide: 'ai'   },
  barrage:         { key: 'barrage',         label: 'Удар по площі',     desc: 'Ціль + сусіди отримують 25–50% урону',     needsTarget: true,  targetSide: 'ai'   },
  grapeshot:       { key: 'grapeshot',       label: 'Картеч',            desc: 'Весь ряд цілі з -40% урону',               needsTarget: true,  targetSide: 'ai'   },
}

export function getMainActions(cls: UnitClass): ActionKey[] {
  if (cls === 'warrior')  return ['strike', 'shield']
  if (cls === 'archer')   return ['shot',   'aim']
  if (cls === 'catapult') return ['barrage', 'grapeshot']
  return ['chain_lightning', 'fireball']
}

// ── Initial state ──────────────────────────────────────────────────────────────
const TURN_RESET = {
  selectedAction: null as ActionKey | null,
  needsTarget: false,
}

export function createInitialState(counts?: ArmyCounts, prebuiltPlayerUnits?: GameUnit[]): BattleState {
  const playerUnits = prebuiltPlayerUnits
    ?? (counts ? buildCustomArmy(counts, 'player') : buildCustomArmy({ warriors: 3, archers: 2, mages: 1, catapults: 0 }, 'player'))
  const units = [...playerUnits, ...buildDefaultAIArmy()]
  const queue = buildQueue(units)
  const first = units.find(u => u.id === queue[0])!
  return {
    units, queue, queueIdx: 0,
    phase: first.side === 'player' ? 'player-turn' : 'ai-thinking',
    winner: null,
    log: [{ id: ++_logId, text: '⚔ Бій починається!', type: 'info' }],
    round: 1,
    events: [],
    ...TURN_RESET,
  }
}

// ── Reducer ────────────────────────────────────────────────────────────────────
export function battleReducer(state: BattleState, action: BattleAction): BattleState {
  if (state.phase === 'game-over') return state

  switch (action.type) {

    case 'SELECT_ACTION': {
      const a = action.action
      const actor = state.units.find(u => u.id === state.queue[state.queueIdx])
      if (!actor || actor.hp === 0) return state

      const def = ACTIONS[a]
      if (!def.needsTarget) {
        const { units, newLogs, newEvents } = executeAction(state, actor, a, null)
        return advanceQueue({ ...state, units, log: [...state.log, ...newLogs], ...TURN_RESET, events: newEvents })
      }
      return { ...state, selectedAction: a, needsTarget: true, events: [] }
    }

    case 'CONFIRM_TARGET': {
      const actor = state.units.find(u => u.id === state.queue[state.queueIdx])
      if (!actor || !state.selectedAction) return state

      const { units, newLogs, newEvents } = executeAction(state, actor, state.selectedAction, action.targetId)
      return advanceQueue({ ...state, units, log: [...state.log, ...newLogs], ...TURN_RESET, events: newEvents })
    }

    case 'CANCEL_ACTION':
      return { ...state, selectedAction: null, needsTarget: false }

    case 'AI_TAKE_TURN': {
      const actorId = state.queue[state.queueIdx]
      const actor = state.units.find(u => u.id === actorId)
      if (!actor || actor.hp === 0 || actor.side !== 'ai') return advanceQueue(state)

      const { action: act, targetId } = aiDecide(actor, state)
      if (!act || (ACTIONS[act].needsTarget && !targetId)) return advanceQueue(state)

      const { units, newLogs, newEvents } = executeAction(state, actor, act, targetId)
      return advanceQueue({ ...state, units, log: [...state.log, ...newLogs], ...TURN_RESET, events: newEvents })
    }

    case 'ADVANCE_QUEUE':
      return advanceQueue(state)

    default:
      return state
  }
}

function advanceQueue(state: BattleState): BattleState {
  const playerAlive = state.units.filter(u => u.side === 'player' && u.hp > 0).length
  const aiAlive     = state.units.filter(u => u.side === 'ai'     && u.hp > 0).length
  if (playerAlive === 0) return { ...state, phase: 'game-over', winner: 'ai' }
  if (aiAlive     === 0) return { ...state, phase: 'game-over', winner: 'player' }

  let units = state.units
  const justActed = units.find(u => u.id === state.queue[state.queueIdx])
  if (justActed) units = units.map(u => u.id === justActed.id ? tickBuffs(u) : u)

  let idx = state.queueIdx + 1
  while (idx < state.queue.length && (units.find(u => u.id === state.queue[idx])?.hp ?? 0) === 0) idx++

  let queue = state.queue
  let round = state.round

  if (idx >= queue.length) {
    round++
    queue = buildQueue(units)
    idx = 0
    state = { ...state, log: [...state.log, { id: ++_logId, text: `── Раунд ${round} ──`, type: 'info' }] }
  }

  const next = units.find(u => u.id === queue[idx])
  const phase: Phase = next?.side === 'player' ? 'player-turn' : 'ai-thinking'

  return { ...state, units, queue, queueIdx: idx, round, phase, ...TURN_RESET }
}
