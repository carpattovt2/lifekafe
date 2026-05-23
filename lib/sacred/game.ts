import type {
  GameUnit, Side, Row, UnitClass, Buff, BuffType,
  ActionKey, ActionDef, LogEntry, BattleState, BattleAction, Phase, ActionCategory,
} from './types'

// ── Morale modifier ────────────────────────────────────────────────────────────
// 100 → +10%, 50 → 0%, 1 → -10%
function moraleBonus(morale: number): number {
  return (morale - 50) / 500
}

// ── Unit templates ─────────────────────────────────────────────────────────────
type Template = Omit<GameUnit, 'id'|'side'|'row'|'slot'|'name'|'buffs'|'hasActed'>

// ── Variant A stats ────────────────────────────────────────────────────────────
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

const CLASS_NAMES: Record<UnitClass, string[]> = {
  warrior: ['Брат Лю', 'Брат Анте', 'Брат Мар'],
  archer:  ['Стрілець Дан', 'Стрілець Леон'],
  mage:    ['Маг Серафіт'],
}

let _uid = 0
function uid() { return `u${++_uid}` }

function makeUnit(cls: UnitClass, side: Side, row: Row, slot: number, nameIdx = 0): GameUnit {
  const t = TEMPLATES[cls]
  return {
    ...t, id: uid(), side, row, slot, hasActed: false, buffs: [],
    name: CLASS_NAMES[cls][nameIdx] ?? `${cls} ${slot + 1}`,
  }
}

// ── Initial army layout ────────────────────────────────────────────────────────
function buildArmy(side: Side): GameUnit[] {
  return [
    makeUnit('warrior', side, 0, 0, 0),
    makeUnit('warrior', side, 0, 1, 1),
    makeUnit('warrior', side, 0, 2, 2),
    makeUnit('archer',  side, 1, 0, 0),
    makeUnit('archer',  side, 1, 1, 1),
    makeUnit('mage',    side, 2, 0, 0),
  ]
}

// ── Initiative queue ───────────────────────────────────────────────────────────
function buildQueue(units: GameUnit[]): string[] {
  const alive = units.filter(u => u.hp > 0)
  return [...alive]
    .sort((a, b) => {
      const ai = a.initiative + moraleBonus(a.morale) * 100 + Math.random() * 0.001
      const bi = b.initiative + moraleBonus(b.morale) * 100 + Math.random() * 0.001
      return bi - ai
    })
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
  const buffs = unit.buffs
    .map(b => ({ ...b, turnsLeft: b.turnsLeft - 1 }))
    .filter(b => b.turnsLeft > 0)
  return { ...unit, buffs }
}

// ── Combat calculation ─────────────────────────────────────────────────────────
interface AttackResult {
  hit: boolean
  evaded: boolean
  crit: boolean
  damage: number
  logs: LogEntry[]
}

let _logId = 0
function log(text: string, type: LogEntry['type']): LogEntry {
  return { id: ++_logId, text, type }
}

function resolveAttack(
  atk: GameUnit,
  def: GameUnit,
  opts: { dmgMult?: number; accBonus?: number } = {}
): AttackResult {
  const logs: LogEntry[] = []
  const { dmgMult = 1, accBonus = 0 } = opts

  // Hit check
  const acc = atk.accuracy + moraleBonus(atk.morale) + getBuffValue(atk, 'accuracy_up') + accBonus
  if (Math.random() > acc) {
    logs.push(log(`${atk.name} промахується!`, 'miss'))
    return { hit: false, evaded: false, crit: false, damage: 0, logs }
  }

  // Evasion check
  const eva = def.evasion + getBuffValue(def, 'evasion_up')
  if (Math.random() < eva) {
    logs.push(log(`${def.name} ухиляється!`, 'evade'))
    return { hit: true, evaded: true, crit: false, damage: 0, logs }
  }

  // Base damage
  let dmg = (atk.minDmg + Math.random() * (atk.maxDmg - atk.minDmg)) * dmgMult

  // Crit check
  const critRate = atk.critChance + moraleBonus(atk.morale)
  const isCrit = Math.random() < critRate
  if (isCrit) dmg *= atk.critMult

  // Defense reduction
  const def_ = def.defense + getBuffValue(def, 'defense_up') - getBuffValue(def, 'damage_taken_down')
  dmg *= (1 - Math.max(0, def_))

  // Debuff increases damage taken
  dmg *= (1 + getBuffValue(def, 'damage_taken_up'))

  dmg = Math.max(1, Math.round(dmg))

  if (isCrit) {
    logs.push(log(`💥 КРИТ! ${atk.name} → ${def.name}: ${dmg} урону`, 'crit'))
  } else {
    logs.push(log(`${atk.name} атакує ${def.name}: ${dmg} урону`, 'attack'))
  }

  return { hit: true, evaded: false, crit: isCrit, damage: dmg, logs }
}

// ── Valid targets ──────────────────────────────────────────────────────────────
export function getValidTargets(actor: GameUnit, action: ActionKey, units: GameUnit[]): string[] {
  const living = (s: Side) => units.filter(u => u.hp > 0 && u.side === s)

  if (action === 'strike') {
    const enemySide = actor.side === 'player' ? 'ai' : 'player'
    const row0 = living(enemySide).filter(u => u.row === 0)
    if (row0.length) return row0.map(u => u.id)
    // If row 0 empty, can attack nearest non-empty row
    for (const r of [1, 2] as Row[]) {
      const inRow = living(enemySide).filter(u => u.row === r)
      if (inRow.length) return inRow.map(u => u.id)
    }
    return []
  }

  if (action === 'shot' || action === 'cover_shot' || action === 'spell' || action === 'debuff') {
    const enemySide = actor.side === 'player' ? 'ai' : 'player'
    return living(enemySide).map(u => u.id)
  }

  if (action === 'battle_cry' || action === 'ally_shield' || action === 'heal') {
    return living(actor.side).filter(u => u.id !== actor.id).map(u => u.id)
  }

  return [] // shield, aim → self
}

// ── Execute action on state ────────────────────────────────────────────────────
export function executeAction(
  state: BattleState,
  actor: GameUnit,
  action: ActionKey,
  targetId: string | null
): { units: GameUnit[]; newLogs: LogEntry[] } {
  let units = state.units.map(u => ({ ...u }))
  const newLogs: LogEntry[] = []

  const getUnit = (id: string) => units.find(u => u.id === id)!
  const updateUnit = (u: GameUnit) => { units = units.map(x => x.id === u.id ? u : x) }

  const target = targetId ? getUnit(targetId) : null

  switch (action) {
    case 'strike':
    case 'shot':
    case 'spell': {
      if (!target) break
      const res = resolveAttack(actor, target)
      newLogs.push(...res.logs)
      if (res.damage > 0) {
        const updated = { ...target, hp: Math.max(0, target.hp - res.damage) }
        updateUnit(updated)
        if (updated.hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
        // Counter-attack
        if (res.hit && !res.evaded && actor.class === 'warrior' && Math.random() < target.counter && target.hp > 0) {
          const ctr = resolveAttack(updated, actor)
          newLogs.push(log(`↩ Контратака!`, 'info'), ...ctr.logs)
          if (ctr.damage > 0) {
            const actorUpdated = { ...getUnit(actor.id), hp: Math.max(0, actor.hp - ctr.damage) }
            updateUnit(actorUpdated)
            if (actorUpdated.hp === 0) newLogs.push(log(`☠ ${actor.name} гине!`, 'death'))
          }
        }
      }
      break
    }

    case 'cover_shot': {
      if (!target) break
      const res = resolveAttack(actor, target, { dmgMult: 0.5 })
      newLogs.push(...res.logs)
      if (res.damage > 0) {
        updateUnit({ ...target, hp: Math.max(0, target.hp - res.damage) })
      }
      // Apply evasion buff to self
      const actorWithBuff = { ...getUnit(actor.id), buffs: [...getUnit(actor.id).buffs, makeBuff('evasion_up', 0.60, 1)] }
      updateUnit(actorWithBuff)
      newLogs.push(log(`🛡 ${actor.name} в укритті (+60% ухилення)`, 'buff'))
      break
    }

    case 'shield': {
      const a = getUnit(actor.id)
      updateUnit({ ...a, buffs: [...a.buffs, makeBuff('defense_up', 0.15, 1)] })
      newLogs.push(log(`🛡 ${actor.name} піднімає щит (+15% захисту)`, 'buff'))
      break
    }

    case 'aim': {
      const a = getUnit(actor.id)
      updateUnit({ ...a, buffs: [...a.buffs, makeBuff('accuracy_up', 0.20, 2)] })
      newLogs.push(log(`🎯 ${actor.name} прицілюється (+20% точності)`, 'buff'))
      break
    }

    case 'battle_cry': {
      if (!target) break
      updateUnit({ ...target, buffs: [...target.buffs, makeBuff('morale_up', 20, 2)], morale: Math.min(100, target.morale + 20) })
      newLogs.push(log(`📯 Бойовий клич! ${target.name} +20 моралі`, 'buff'))
      break
    }

    case 'ally_shield': {
      if (!target) break
      updateUnit({ ...target, buffs: [...target.buffs, makeBuff('damage_taken_down', 0.10, 2)] })
      newLogs.push(log(`✨ ${actor.name} захищає ${target.name} (-10% урону)`, 'buff'))
      break
    }

    case 'debuff': {
      if (!target) break
      updateUnit({ ...target, buffs: [...target.buffs, makeBuff('damage_taken_up', 0.10, 2)] })
      newLogs.push(log(`🌑 ${actor.name} накладає дебафф на ${target.name} (+10% урону)`, 'debuff'))
      break
    }

    case 'heal': {
      if (!target) break
      updateUnit({ ...target, hp: Math.min(target.maxHp, target.hp + 10) })
      newLogs.push(log(`💚 ${actor.name} зцілює ${target.name} (+10 HP)`, 'heal'))
      break
    }
  }

  return { units, newLogs }
}

// ── AI decision ────────────────────────────────────────────────────────────────
export function aiDecide(actor: GameUnit, state: BattleState): { action: ActionKey; targetId: string | null } {
  const playerUnits = state.units.filter(u => u.hp > 0 && u.side === 'player')
  const aiAllies = state.units.filter(u => u.hp > 0 && u.side === 'ai' && u.id !== actor.id)

  const weakestPlayer = [...playerUnits].sort((a, b) => a.hp - b.hp)[0]
  const weakestAlly = [...aiAllies].sort((a, b) => a.hp - b.hp)[0]

  if (actor.class === 'warrior') {
    const row0Targets = playerUnits.filter(u => u.row === 0)
    const attackTarget = row0Targets.length ? [...row0Targets].sort((a, b) => a.hp - b.hp)[0] : weakestPlayer
    // 30% chance to shield after attacking (but since AI acts in one step, just randomly shield instead)
    if (Math.random() < 0.25) {
      return { action: 'shield', targetId: null }
    }
    return { action: 'strike', targetId: attackTarget?.id ?? null }
  }

  if (actor.class === 'archer') {
    if (!weakestPlayer) return { action: 'aim', targetId: null }
    return { action: 'shot', targetId: weakestPlayer.id }
  }

  if (actor.class === 'mage') {
    // 40% debuff, 30% heal ally, 30% spell
    const roll = Math.random()
    if (roll < 0.40 && weakestPlayer) return { action: 'debuff', targetId: weakestPlayer.id }
    if (roll < 0.70 && weakestAlly && weakestAlly.hp < weakestAlly.maxHp * 0.6) {
      return { action: 'heal', targetId: weakestAlly.id }
    }
    return { action: 'spell', targetId: weakestPlayer?.id ?? null }
  }

  return { action: 'strike', targetId: weakestPlayer?.id ?? null }
}

// ── Action definitions ─────────────────────────────────────────────────────────
export const ACTION_CATEGORY: Record<ActionKey, ActionCategory> = {
  strike: 'primary', shot: 'primary', cover_shot: 'primary', spell: 'primary',
  shield: 'secondary', aim: 'secondary', ally_shield: 'secondary', debuff: 'secondary',
  battle_cry: 'bonus', heal: 'bonus',
}

export const ACTIONS: Record<ActionKey, ActionDef> = {
  strike:     { key: 'strike',     label: 'Удар',           desc: 'Атака ворога в ближньому бою',            targetSide: 'ai',   },
  shield:     { key: 'shield',     label: 'Щит',            desc: '+15% захисту цей хід',                    targetSide: null,   },
  battle_cry: { key: 'battle_cry', label: 'Бойовий клич',   desc: '+20 моралі союзнику на 2 ходи',           targetSide: 'ally', },
  shot:       { key: 'shot',       label: 'Постріл',        desc: 'Атака будь-якого ворога',                 targetSide: 'ai',   },
  cover_shot: { key: 'cover_shot', label: 'З укриття',      desc: '-50% урону, +60% ухилення цей хід',      targetSide: 'ai',   },
  aim:        { key: 'aim',        label: 'Прицілитись',    desc: '+20% точності наступний хід',             targetSide: null,   },
  spell:      { key: 'spell',      label: 'Заклинання',     desc: 'Магічна атака будь-якого ворога',         targetSide: 'ai',   },
  ally_shield:{ key: 'ally_shield',label: 'Захист',         desc: '-10% урону союзнику на 2 ходи',          targetSide: 'ally', },
  debuff:     { key: 'debuff',     label: 'Дебафф',         desc: '+10% урону по ворогу на 2 ходи',         targetSide: 'ai',   },
  heal:       { key: 'heal',       label: 'Зцілення',       desc: '+10 HP союзнику',                         targetSide: 'ally', },
}

export function getActorActions(cls: UnitClass): { primary: ActionKey[]; secondary: ActionKey[]; bonus: ActionKey[] } {
  if (cls === 'warrior') return { primary: ['strike'], secondary: ['shield'], bonus: ['battle_cry'] }
  if (cls === 'archer')  return { primary: ['shot', 'cover_shot'], secondary: ['aim'], bonus: [] }
  return { primary: ['spell'], secondary: ['ally_shield', 'debuff'], bonus: ['heal'] }
}

// ── Initial state ──────────────────────────────────────────────────────────────
const TURN_RESET = { usedPrimary: false, usedSecondary: false, usedBonus: false, selectedAction: null, needsTarget: false }

export function createInitialState(): BattleState {
  const units = [...buildArmy('player'), ...buildArmy('ai')]
  const queue = buildQueue(units)
  const firstId = queue[0]
  const first = units.find(u => u.id === firstId)!
  return {
    units, queue, queueIdx: 0,
    phase: first.side === 'player' ? 'player-turn' : 'ai-thinking',
    winner: null,
    log: [{ id: ++_logId, text: '⚔ Бій починається!', type: 'info' }],
    round: 1,
    ...TURN_RESET,
  }
}

// Check if current actor still has actions available
function hasRemainingActions(state: BattleState, actorClass: UnitClass): boolean {
  const { primary, secondary, bonus } = getActorActions(actorClass)
  if (primary.length > 0 && !state.usedPrimary) return true
  if (secondary.length > 0 && !state.usedSecondary) return true
  if (bonus.length > 0 && !state.usedBonus) return true
  return false
}

// Mark the used category after executing an action
function markUsed(state: BattleState, action: ActionKey): BattleState {
  const cat = ACTION_CATEGORY[action]
  return {
    ...state,
    usedPrimary:   cat === 'primary'   ? true : state.usedPrimary,
    usedSecondary: cat === 'secondary' ? true : state.usedSecondary,
    usedBonus:     cat === 'bonus'     ? true : state.usedBonus,
  }
}

// ── Reducer ────────────────────────────────────────────────────────────────────
export function battleReducer(state: BattleState, action: BattleAction): BattleState {
  if (state.phase === 'game-over') return state

  switch (action.type) {

    case 'SELECT_ACTION': {
      const a = action.action
      const actor = state.units.find(u => u.id === state.queue[state.queueIdx])!
      const targets = getValidTargets(actor, a, state.units)
      const needsTarget = ACTIONS[a].targetSide !== null && targets.length > 0

      // Self-targeting: execute immediately
      if (!needsTarget) {
        const { units, newLogs } = executeAction(state, actor, a, null)
        const next = markUsed({ ...state, units, log: [...state.log, ...newLogs], selectedAction: null, needsTarget: false }, a)
        return hasRemainingActions(next, actor.class) ? next : advanceQueue(next)
      }

      return { ...state, selectedAction: a, needsTarget: true }
    }

    case 'CANCEL_ACTION':
      return { ...state, selectedAction: null, needsTarget: false }

    case 'CONFIRM_TARGET': {
      const actor = state.units.find(u => u.id === state.queue[state.queueIdx])!
      if (!state.selectedAction) return state
      const a = state.selectedAction
      const { units, newLogs } = executeAction(state, actor, a, action.targetId)
      const next = markUsed({ ...state, units, log: [...state.log, ...newLogs], selectedAction: null, needsTarget: false }, a)
      return hasRemainingActions(next, actor.class) ? next : advanceQueue(next)
    }

    case 'END_TURN':
      return advanceQueue({ ...state, selectedAction: null, needsTarget: false })

    case 'AI_TAKE_TURN': {
      const actorId = state.queue[state.queueIdx]
      const actor = state.units.find(u => u.id === actorId)
      if (!actor || actor.hp === 0 || actor.side !== 'ai') return advanceQueue(state)

      // AI uses all available actions in sequence
      let cur: BattleState = { ...state }
      const actorRef = actor

      const tryAction = (actionKey: ActionKey, s: BattleState): BattleState => {
        const freshActor = s.units.find(u => u.id === actorRef.id)
        if (!freshActor || freshActor.hp === 0) return s
        const { action: act, targetId } = aiDecide(freshActor, s)
        // Use the requested action type if possible
        const usedAction = actionKey === act ? act : actionKey
        const targets = getValidTargets(freshActor, usedAction, s.units)
        const tid = ACTIONS[usedAction].targetSide !== null ? (targets[0] ?? null) : null
        if (ACTIONS[usedAction].targetSide !== null && !tid) return s
        const { units, newLogs } = executeAction(s, freshActor, usedAction, tid)
        return markUsed({ ...s, units, log: [...s.log, ...newLogs] }, usedAction)
      }

      const { primary, secondary, bonus } = getActorActions(actorRef.class)
      // Pick best primary
      const { action: bestPrimary } = aiDecide(actor, cur)
      if (primary.length && !cur.usedPrimary) {
        const act = primary.includes(bestPrimary) ? bestPrimary : primary[0]
        cur = tryAction(act, cur)
      }
      if (secondary.length && !cur.usedSecondary) {
        const { action: bestSec } = aiDecide(cur.units.find(u=>u.id===actorRef.id)??actor, cur)
        const act = secondary.includes(bestSec) ? bestSec : secondary[0]
        cur = tryAction(act, cur)
      }
      if (bonus.length && !cur.usedBonus) {
        cur = tryAction(bonus[0], cur)
      }

      return advanceQueue(cur)
    }

    case 'ADVANCE_QUEUE':
      return advanceQueue(state)

    default:
      return state
  }
}

function advanceQueue(state: BattleState): BattleState {
  // Check win condition
  const playerAlive = state.units.filter(u => u.side === 'player' && u.hp > 0).length
  const aiAlive = state.units.filter(u => u.side === 'ai' && u.hp > 0).length
  if (playerAlive === 0) return { ...state, phase: 'game-over', winner: 'ai' }
  if (aiAlive === 0) return { ...state, phase: 'game-over', winner: 'player' }

  // Find next unit in queue that's alive
  let idx = state.queueIdx + 1
  let round = state.round
  let queue = state.queue

  // Tick buffs on the unit that just acted
  let units = state.units
  const justActed = state.units.find(u => u.id === state.queue[state.queueIdx])
  if (justActed) units = units.map(u => u.id === justActed.id ? tickBuffs(u) : u)

  // Skip dead units in queue
  while (idx < queue.length && (units.find(u => u.id === queue[idx])?.hp ?? 0) === 0) idx++

  if (idx >= queue.length) {
    // New round: rebuild queue
    round++
    queue = buildQueue(units)
    idx = 0
    const newRoundLog: LogEntry = { id: ++_logId, text: `── Раунд ${round} ──`, type: 'info' }
    state = { ...state, log: [...state.log, newRoundLog] }
  }

  const nextId = queue[idx]
  const next = units.find(u => u.id === nextId)
  const phase: Phase = next?.side === 'player' ? 'player-turn' : 'ai-thinking'

  return { ...state, units, queue, queueIdx: idx, round, phase, ...TURN_RESET }
}
