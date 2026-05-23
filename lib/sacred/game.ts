import type {
  GameUnit, Side, Row, UnitClass, Buff, BuffType,
  ActionKey, ActionDef, LogEntry, BattleState, BattleAction, Phase,
  ArmyCounts,
} from './types'

// ── Unit templates ─────────────────────────────────────────────────────────────
type Template = Omit<GameUnit, 'id' | 'side' | 'row' | 'slot' | 'name' | 'buffs' | 'hasActed'>

const TEMPLATES: Record<UnitClass, Template> = {
  warrior: {
    class: 'warrior', hp: 75, maxHp: 75,
    minDmg: 14, maxDmg: 18, accuracy: 0.75, defense: 0.10,
    initiative: 50, morale: 50,
    critChance: 0.10, critMult: 1.5, counter: 0.10, evasion: 0.05,
  },
  archer: {
    class: 'archer', hp: 55, maxHp: 55,
    minDmg: 18, maxDmg: 24, accuracy: 0.60, defense: 0.05,
    initiative: 65, morale: 50,
    critChance: 0.05, critMult: 3.0, counter: 0, evasion: 0.15,
  },
  mage: {
    class: 'mage', hp: 50, maxHp: 50,
    minDmg: 10, maxDmg: 14, accuracy: 0.50, defense: 0,
    initiative: 40, morale: 50,
    critChance: 0.75, critMult: 2.0, counter: 0, evasion: 0.35,
  },
}

const CLASS_LABEL: Record<UnitClass, string> = { warrior: 'Воїн', archer: 'Лучник', mage: 'Маг' }
const ROMAN = ['I', 'II', 'III', 'IV']

let _uid = 0
function uid() { return `u${++_uid}` }

function makeUnit(cls: UnitClass, side: Side, row: Row, slot: number): GameUnit {
  const prefix = side === 'ai' ? 'Вор.' : ''
  const name = `${prefix}${CLASS_LABEL[cls]} ${ROMAN[slot] ?? slot + 1}`
  return { ...TEMPLATES[cls], id: uid(), side, row, slot, hasActed: false, buffs: [], name }
}

// ── Army builders ──────────────────────────────────────────────────────────────
export function buildCustomArmy(counts: ArmyCounts, side: Side): GameUnit[] {
  const units: GameUnit[] = []
  for (let i = 0; i < counts.warriors; i++) units.push(makeUnit('warrior', side, 0, i))
  for (let i = 0; i < counts.archers;  i++) units.push(makeUnit('archer',  side, 1, i))
  for (let i = 0; i < counts.mages;    i++) units.push(makeUnit('mage',    side, 2, i))
  return units
}

function buildDefaultAIArmy(): GameUnit[] {
  return buildCustomArmy({ warriors: 3, archers: 2, mages: 1 }, 'ai')
}

// ── Initiative queue ───────────────────────────────────────────────────────────
function buildQueue(units: GameUnit[]): string[] {
  const alive = units.filter(u => u.hp > 0)
  const exhausted = alive.filter(u => u.buffs.some(b => b.type === 'exhausted'))
  const normal    = alive.filter(u => !u.buffs.some(b => b.type === 'exhausted'))

  const sort = (arr: GameUnit[]) =>
    [...arr].sort((a, b) => b.initiative - a.initiative + (Math.random() - 0.5) * 0.1)

  return [...sort(normal), ...sort(exhausted)].map(u => u.id)
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

// ── Combat ─────────────────────────────────────────────────────────────────────
let _logId = 0
function log(text: string, type: LogEntry['type']): LogEntry {
  return { id: ++_logId, text, type }
}

interface AttackResult { hit: boolean; evaded: boolean; damage: number; logs: LogEntry[] }

function resolveAttack(atk: GameUnit, def: GameUnit, opts: { dmgMult?: number; accBonus?: number } = {}): AttackResult {
  let { dmgMult = 1, accBonus = 0 } = opts
  const logs: LogEntry[] = []

  // Aimed buff: 20% chance to activate +20% acc / +35% dmg bonus
  const aimedBuff = atk.buffs.find(b => b.type === 'aimed')
  if (aimedBuff && Math.random() < 0.20) {
    accBonus += 0.20
    dmgMult  *= 1.35
    logs.push(log(`🎯 Прицільний постріл активовано!`, 'buff'))
  }

  // Hit check
  const acc = Math.min(0.97, atk.accuracy + accBonus)
  if (Math.random() > acc) {
    logs.push(log(`${atk.name} промахується!`, 'miss'))
    return { hit: false, evaded: false, damage: 0, logs }
  }

  // Evasion check
  if (Math.random() < def.evasion) {
    logs.push(log(`${def.name} ухиляється!`, 'evade'))
    return { hit: true, evaded: true, damage: 0, logs }
  }

  // Base damage
  let dmg = (atk.minDmg + Math.random() * (atk.maxDmg - atk.minDmg)) * dmgMult

  // damage_up buff (battle cry)
  dmg *= (1 + getBuffValue(atk, 'damage_up'))

  // weakness debuff on attacker
  dmg *= (1 - getBuffValue(atk, 'weakness'))

  // Crit
  const isCrit = Math.random() < atk.critChance
  if (isCrit) dmg *= atk.critMult

  // Defense
  dmg *= (1 - Math.max(0, def.defense + getBuffValue(def, 'defense_up')))

  // Розрив debuff
  dmg *= (1 + getBuffValue(def, 'damage_taken_up'))

  dmg = Math.max(1, Math.round(dmg))

  if (isCrit) {
    logs.push(log(`💥 КРИТ! ${atk.name} → ${def.name}: ${dmg} урону`, 'crit'))
  } else {
    logs.push(log(`${atk.name} атакує ${def.name}: ${dmg} урону`, 'attack'))
  }

  return { hit: true, evaded: false, damage: dmg, logs }
}

// ── Valid targets ──────────────────────────────────────────────────────────────
export function getValidTargets(actor: GameUnit, action: ActionKey, units: GameUnit[]): string[] {
  const living = (s: Side) => units.filter(u => u.hp > 0 && u.side === s)
  const enemySide: Side = actor.side === 'player' ? 'ai' : 'player'

  if (action === 'strike') {
    // Must target front row first; fall back to nearest occupied row
    for (const r of [0, 1, 2] as Row[]) {
      const row = living(enemySide).filter(u => u.row === r)
      if (row.length) return row.map(u => u.id)
    }
    return []
  }

  if (action === 'shot' || action === 'spell' || action === 'debuff_rupture' || action === 'debuff_exhaust' || action === 'debuff_weakness') {
    return living(enemySide).map(u => u.id)
  }

  if (action === 'heal') {
    return living(actor.side).map(u => u.id)
  }

  return [] // shield, aim → self (no target needed)
}

// ── Execute one action ─────────────────────────────────────────────────────────
export function executeAction(
  state: BattleState,
  actor: GameUnit,
  action: ActionKey,
  targetId: string | null,
): { units: GameUnit[]; newLogs: LogEntry[] } {
  let units = state.units.map(u => ({ ...u }))
  const newLogs: LogEntry[] = []

  const getUnit = (id: string) => units.find(u => u.id === id)!
  const update  = (u: GameUnit) => { units = units.map(x => x.id === u.id ? u : x) }
  const target  = targetId ? getUnit(targetId) : null

  switch (action) {
    case 'strike':
    case 'shot':
    case 'spell': {
      if (!target) break
      const res = resolveAttack(actor, target)
      newLogs.push(...res.logs)
      if (res.damage > 0) {
        const updated = { ...target, hp: Math.max(0, target.hp - res.damage) }
        update(updated)
        if (updated.hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
        // Counter-attack (warriors only)
        if (res.hit && !res.evaded && actor.class === 'warrior' && Math.random() < target.counter && target.hp > 0) {
          const ctr = resolveAttack(updated, actor)
          newLogs.push(log(`↩ Контратака!`, 'info'), ...ctr.logs)
          if (ctr.damage > 0) {
            const actorUpdated = { ...getUnit(actor.id), hp: Math.max(0, actor.hp - ctr.damage) }
            update(actorUpdated)
            if (actorUpdated.hp === 0) newLogs.push(log(`☠ ${actor.name} гине!`, 'death'))
          }
        }
      }
      break
    }

    case 'shield': {
      const a = getUnit(actor.id)
      update({ ...a, buffs: [...a.buffs, makeBuff('defense_up', 0.15, 1)] })
      newLogs.push(log(`🛡 ${actor.name} піднімає щит (+15% захисту)`, 'buff'))
      break
    }

    case 'aim': {
      const a = getUnit(actor.id)
      update({ ...a, buffs: [...a.buffs, makeBuff('aimed', 0.20, 3)] })
      newLogs.push(log(`🎯 ${actor.name} прицілюється (20% шанс бонусу на 3 постріли)`, 'buff'))
      break
    }

    case 'heal': {
      if (!target) break
      const healed = Math.min(target.maxHp, target.hp + 10)
      update({ ...target, hp: healed })
      newLogs.push(log(`💚 ${actor.name} зцілює ${target.name} (+${healed - target.hp} HP)`, 'heal'))
      break
    }

    case 'debuff_rupture': {
      if (!target) break
      update({ ...target, buffs: [...target.buffs, makeBuff('damage_taken_up', 0.30, 2)] })
      newLogs.push(log(`🩸 Розрив! ${target.name} отримуватиме +30% урону (2 ходи)`, 'debuff'))
      break
    }

    case 'debuff_exhaust': {
      if (!target) break
      update({ ...target, buffs: [...target.buffs, makeBuff('exhausted', 1, 2)] })
      newLogs.push(log(`💤 Виснаження! ${target.name} ходитиме останнім наступного раунду`, 'debuff'))
      break
    }

    case 'debuff_weakness': {
      if (!target) break
      update({ ...target, buffs: [...target.buffs, makeBuff('weakness', 0.25, 2)] })
      newLogs.push(log(`🌑 Слабкість! ${target.name} завдаватиме -25% урону (2 ходи)`, 'debuff'))
      break
    }
  }

  return { units, newLogs }
}

// ── Auto-bonus after main action ───────────────────────────────────────────────
// Returns updated state; if mage bonus triggers for AI, resolves automatically.
// For player mage bonus, returns pendingDebuff=true (UI handles selection).
function handleAutoBonus(state: BattleState, actorId: string, isAI: boolean): BattleState {
  let units = [...state.units]
  const newLogs: LogEntry[] = []

  const actor = units.find(u => u.id === actorId)
  if (!actor || actor.hp === 0) return state

  if (actor.class === 'warrior') {
    if (Math.random() < 0.33) {
      const allies = units.filter(u => u.side === actor.side && u.hp > 0 && u.id !== actor.id)
      if (allies.length > 0) {
        const target = allies[Math.floor(Math.random() * allies.length)]
        newLogs.push(log(`📯 Бойовий клич! ${actor.name} підбадьорює ${target.name} (+20% урону на 2 ходи)`, 'buff'))
        units = units.map(u => u.id === target.id
          ? { ...u, buffs: [...u.buffs, makeBuff('damage_up', 0.20, 2)] }
          : u)
      }
    }
  }

  if (actor.class === 'archer') {
    if (Math.random() < 0.25) {
      const freshActor = units.find(u => u.id === actorId)!
      const enemies = units.filter(u => u.side !== actor.side && u.hp > 0)
      if (enemies.length > 0) {
        const target = enemies[Math.floor(Math.random() * enemies.length)]
        const res = resolveAttack(freshActor, target)
        newLogs.push(log(`🏹 Додатковий постріл!`, 'info'), ...res.logs)
        if (res.damage > 0) {
          const updated = { ...target, hp: Math.max(0, target.hp - res.damage) }
          units = units.map(u => u.id === target.id ? updated : u)
          if (updated.hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
        }
      }
    }
  }

  if (actor.class === 'mage') {
    if (Math.random() < 0.20) {
      if (isAI) {
        // AI auto-picks Розрив on weakest player
        const freshActor = units.find(u => u.id === actorId)!
        const enemies = units.filter(u => u.side !== actor.side && u.hp > 0)
        const target = [...enemies].sort((a, b) => a.hp - b.hp)[0]
        if (target) {
          const { units: u2, newLogs: l2 } = executeAction({ ...state, units }, freshActor, 'debuff_rupture', target.id)
          return { ...state, units: u2, log: [...state.log, ...newLogs, ...l2] }
        }
      } else {
        // Player chooses — signal UI
        newLogs.push(log(`✨ ${actor.name} відчуває приплив темної сили — оберіть дебаф!`, 'buff'))
        return { ...state, units, log: [...state.log, ...newLogs], pendingDebuff: true }
      }
    }
  }

  return { ...state, units, log: [...state.log, ...newLogs] }
}

// ── AI decision ────────────────────────────────────────────────────────────────
function aiDecide(actor: GameUnit, state: BattleState): { action: ActionKey; targetId: string | null } {
  const playerUnits = state.units.filter(u => u.hp > 0 && u.side === 'player')
  const aiAllies    = state.units.filter(u => u.hp > 0 && u.side === 'ai' && u.id !== actor.id)

  const weakestPlayer = [...playerUnits].sort((a, b) => a.hp - b.hp)[0]
  const mostHurtAlly  = [...aiAllies].sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0]

  if (actor.class === 'warrior') {
    if (actor.hp < actor.maxHp * 0.35 && Math.random() < 0.5) {
      return { action: 'shield', targetId: null }
    }
    // Strike front row first
    const front = playerUnits.filter(u => u.row === 0)
    const target = (front.length ? front : playerUnits).sort((a, b) => a.hp - b.hp)[0]
    return { action: 'strike', targetId: target?.id ?? null }
  }

  if (actor.class === 'archer') {
    const hasAimed = actor.buffs.some(b => b.type === 'aimed')
    if (!hasAimed && playerUnits.length > 0 && Math.random() < 0.30) {
      return { action: 'aim', targetId: null }
    }
    return { action: 'shot', targetId: weakestPlayer?.id ?? null }
  }

  if (actor.class === 'mage') {
    if (mostHurtAlly && mostHurtAlly.hp < mostHurtAlly.maxHp * 0.5 && Math.random() < 0.40) {
      return { action: 'heal', targetId: mostHurtAlly.id }
    }
    return { action: 'spell', targetId: weakestPlayer?.id ?? null }
  }

  return { action: 'strike', targetId: weakestPlayer?.id ?? null }
}

// ── Action definitions (for UI) ────────────────────────────────────────────────
export const ACTIONS: Record<ActionKey, ActionDef> = {
  strike:          { key: 'strike',          label: 'Удар',       desc: 'Атака ворога в ближньому бою',             needsTarget: true,  targetSide: 'ai'   },
  shield:          { key: 'shield',          label: 'Щит',        desc: '+15% захисту цей хід',                     needsTarget: false, targetSide: null   },
  shot:            { key: 'shot',            label: 'Постріл',    desc: 'Атака будь-якого ворога',                  needsTarget: true,  targetSide: 'ai'   },
  aim:             { key: 'aim',             label: 'Прицілення', desc: '20% шанс +20% точн./+35% урону на 3 ходи', needsTarget: false, targetSide: null   },
  spell:           { key: 'spell',           label: 'Закляття',   desc: 'Магічна атака будь-якого ворога',          needsTarget: true,  targetSide: 'ai'   },
  heal:            { key: 'heal',            label: 'Зцілення',   desc: '+10 HP союзнику',                          needsTarget: true,  targetSide: 'ally' },
  debuff_rupture:  { key: 'debuff_rupture',  label: 'Розрив',     desc: '+30% урону по цілі (2 ходи)',              needsTarget: true,  targetSide: 'ai'   },
  debuff_exhaust:  { key: 'debuff_exhaust',  label: 'Виснаження', desc: 'Ціль ходить останньою (2 ходи)',           needsTarget: true,  targetSide: 'ai'   },
  debuff_weakness: { key: 'debuff_weakness', label: 'Слабкість',  desc: '-25% урону цілі (2 ходи)',                 needsTarget: true,  targetSide: 'ai'   },
}

export function getMainActions(cls: UnitClass): ActionKey[] {
  if (cls === 'warrior') return ['strike', 'shield']
  if (cls === 'archer')  return ['shot',   'aim']
  return ['spell', 'heal']
}

// ── Initial state ──────────────────────────────────────────────────────────────
const TURN_RESET = { selectedAction: null, needsTarget: false, pendingDebuff: false }

export function createInitialState(counts?: ArmyCounts): BattleState {
  const playerUnits = counts ? buildCustomArmy(counts, 'player') : buildCustomArmy({ warriors: 3, archers: 2, mages: 1 }, 'player')
  const units = [...playerUnits, ...buildDefaultAIArmy()]
  const queue = buildQueue(units)
  const first = units.find(u => u.id === queue[0])!
  return {
    units, queue, queueIdx: 0,
    phase: first.side === 'player' ? 'player-turn' : 'ai-thinking',
    winner: null,
    log: [{ id: ++_logId, text: '⚔ Бій починається!', type: 'info' }],
    round: 1,
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
        // Execute immediately (shield, aim)
        const { units, newLogs } = executeAction(state, actor, a, null)
        const next = { ...state, units, log: [...state.log, ...newLogs], ...TURN_RESET }
        // Debuff selections don't trigger another bonus
        if (state.pendingDebuff) return advanceQueue({ ...next, pendingDebuff: false })
        return advanceQueue(handleAutoBonus(next, actor.id, false))
      }

      return { ...state, selectedAction: a, needsTarget: true }
    }

    case 'CONFIRM_TARGET': {
      const actor = state.units.find(u => u.id === state.queue[state.queueIdx])
      if (!actor || !state.selectedAction) return state

      const { units, newLogs } = executeAction(state, actor, state.selectedAction, action.targetId)
      const next = { ...state, units, log: [...state.log, ...newLogs], ...TURN_RESET }

      // If this confirm was for a debuff choice (mage bonus), advance queue
      if (state.pendingDebuff) return advanceQueue({ ...next, pendingDebuff: false })

      // Otherwise run auto-bonus
      return advanceQueue(handleAutoBonus(next, actor.id, false))
    }

    case 'CANCEL_ACTION':
      return { ...state, selectedAction: null, needsTarget: false }

    case 'AI_TAKE_TURN': {
      const actorId = state.queue[state.queueIdx]
      const actor = state.units.find(u => u.id === actorId)
      if (!actor || actor.hp === 0 || actor.side !== 'ai') return advanceQueue(state)

      const { action: act, targetId } = aiDecide(actor, state)
      if (!act || (ACTIONS[act].needsTarget && !targetId)) return advanceQueue(state)

      const { units, newLogs } = executeAction(state, actor, act, targetId)
      const next = { ...state, units, log: [...state.log, ...newLogs], ...TURN_RESET }
      return advanceQueue(handleAutoBonus(next, actorId, true))
    }

    case 'ADVANCE_QUEUE':
      return advanceQueue(state)

    default:
      return state
  }
}

function advanceQueue(state: BattleState): BattleState {
  // Win check
  const playerAlive = state.units.filter(u => u.side === 'player' && u.hp > 0).length
  const aiAlive     = state.units.filter(u => u.side === 'ai'     && u.hp > 0).length
  if (playerAlive === 0) return { ...state, phase: 'game-over', winner: 'ai' }
  if (aiAlive     === 0) return { ...state, phase: 'game-over', winner: 'player' }

  // Tick buffs on unit that just acted
  let units = state.units
  const justActed = units.find(u => u.id === state.queue[state.queueIdx])
  if (justActed) units = units.map(u => u.id === justActed.id ? tickBuffs(u) : u)

  // Find next alive unit in queue
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
