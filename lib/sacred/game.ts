import type {
  GameUnit, Side, Row, UnitClass, Buff, BuffType,
  ActionKey, ActionDef, LogEntry, BattleState, BattleAction, Phase,
  ArmyCounts, BattleEvent,
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

export function buildDefaultAIArmy(): GameUnit[] {
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

// ── Front-line shield bonus ────────────────────────────────────────────────────
// If the defender's side has living units in row 0, rows 1 and 2 get +20% defense.
function frontLineBonus(def: GameUnit, units: GameUnit[]): number {
  if (def.row === 0) return 0
  const frontAlive = units.some(u => u.side === def.side && u.hp > 0 && u.row === 0)
  return frontAlive ? 0.20 : 0
}

// ── Combat ─────────────────────────────────────────────────────────────────────
let _logId = 0
let _evId  = 0
function log(text: string, type: LogEntry['type']): LogEntry { return { id: ++_logId, text, type } }
function ev(unitId: string, text: string, type: BattleEvent['type'], sourceId?: string): BattleEvent { return { id: ++_evId, unitId, text, type, sourceId } }

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

  // Aimed buff: 20% chance to activate +20% acc / +35% dmg
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
    events.push(ev(atk.id, 'Промах!', 'miss'))
    return { hit: false, evaded: false, crit: false, damage: 0, logs, events }
  }

  // Evasion check
  if (Math.random() < def.evasion) {
    logs.push(log(`${def.name} ухиляється!`, 'evade'))
    events.push(ev(def.id, 'Ухил!', 'evade', atk.id))
    return { hit: true, evaded: true, crit: false, damage: 0, logs, events }
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

  // Defense: base + shield buff + front-line bonus
  const defTotal = def.defense + getBuffValue(def, 'defense_up') + frontLineBonus(def, units)
  dmg *= (1 - Math.max(0, defTotal))

  // Розрив debuff
  dmg *= (1 + getBuffValue(def, 'damage_taken_up'))

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
    // Find the front-most enemy row that has living units
    for (const r of [0, 1, 2] as Row[]) {
      const row = living(enemySide).filter(u => u.row === r)
      if (!row.length) continue
      // Restrict to slots adjacent to the attacker's slot (slot N-1, N, N+1)
      const reachable = row.filter(u => Math.abs(u.slot - actor.slot) <= 1)
      // If none in range (e.g. all opponents are far slots), allow nearest edge unit
      if (reachable.length) return reachable.map(u => u.id)
      const nearest = row.sort((a, b) => Math.abs(a.slot - actor.slot) - Math.abs(b.slot - actor.slot))[0]
      return [nearest.id]
    }
    return []
  }

  if (['shot', 'spell', 'debuff_rupture', 'debuff_exhaust', 'debuff_weakness'].includes(action)) {
    return living(enemySide).map(u => u.id)
  }

  if (action === 'heal') return living(actor.side).map(u => u.id)

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

  switch (action) {
    case 'strike':
    case 'shot':
    case 'spell': {
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
      newLogs.push(log(`🛡 ${actor.name} піднімає щит (+50% захисту)`, 'buff'))
      newEvents.push(ev(actor.id, '🛡 +50%', 'buff'))
      break
    }

    case 'aim': {
      const a = getUnit(actor.id)
      update({ ...a, buffs: [...a.buffs, makeBuff('aimed', 0.20, 3)] })
      newLogs.push(log(`🎯 ${actor.name} прицілюється (20% шанс бонусу на 3 постріли)`, 'buff'))
      newEvents.push(ev(actor.id, '🎯 Прицілення', 'buff'))
      break
    }

    case 'heal': {
      if (!target) break
      const before = target.hp
      const healed = Math.min(target.maxHp, target.hp + 10)
      update({ ...target, hp: healed })
      const amt = healed - before
      newLogs.push(log(`💚 ${actor.name} зцілює ${target.name} (+${amt} HP)`, 'heal'))
      newEvents.push(ev(target.id, `+${amt}`, 'heal', actor.id))
      break
    }

    case 'debuff_rupture': {
      if (!target) break
      update({ ...target, buffs: [...target.buffs, makeBuff('damage_taken_up', 0.30, 2)] })
      newLogs.push(log(`🩸 Розрив! ${target.name} отримуватиме +30% урону (2 ходи)`, 'debuff'))
      newEvents.push(ev(target.id, '🩸 Розрив', 'debuff', actor.id))
      break
    }

    case 'debuff_exhaust': {
      if (!target) break
      update({ ...target, buffs: [...target.buffs, makeBuff('exhausted', 1, 2)] })
      newLogs.push(log(`💤 Виснаження! ${target.name} ходитиме останнім`, 'debuff'))
      newEvents.push(ev(target.id, '💤 Виснаження', 'debuff', actor.id))
      break
    }

    case 'debuff_weakness': {
      if (!target) break
      update({ ...target, buffs: [...target.buffs, makeBuff('weakness', 0.25, 2)] })
      newLogs.push(log(`🌑 Слабкість! ${target.name} завдаватиме -25% урону`, 'debuff'))
      newEvents.push(ev(target.id, '🌑 Слабкість', 'debuff', actor.id))
      break
    }
  }

  return { units, newLogs, newEvents }
}

// ── Auto-bonus after player action ────────────────────────────────────────────
// Warrior / archer: pause for player to pick a target.
// Mage: pause for player to pick debuff type + target.
// Events merged with state.events so main-action floats persist.
function handleAutoBonus(state: BattleState, actorId: string): BattleState {
  const actor = state.units.find(u => u.id === actorId)
  if (!actor || actor.hp === 0) return state

  if (actor.class === 'warrior' && Math.random() < 0.33) {
    const allies = state.units.filter(u => u.side === actor.side && u.hp > 0 && u.id !== actor.id)
    if (allies.length > 0) {
      const msg = log(`📯 ${actor.name} — бойовий клич! Обери союзника для підбадьорення`, 'buff')
      return { ...state, log: [...state.log, msg], pendingPlayerBonus: 'warrior-cry' }
    }
  }

  if (actor.class === 'archer' && Math.random() < 0.25) {
    const enemies = state.units.filter(u => u.side !== actor.side && u.hp > 0)
    if (enemies.length > 0) {
      const msg = log(`🏹 ${actor.name} — додатковий постріл! Обери ціль`, 'info')
      return { ...state, log: [...state.log, msg], pendingPlayerBonus: 'archer-shot' }
    }
  }

  if (actor.class === 'mage' && Math.random() < 0.20) {
    const msg = log(`✨ ${actor.name} відчуває приплив темної сили — оберіть дебаф!`, 'buff')
    return { ...state, log: [...state.log, msg], events: [...state.events], pendingDebuff: true }
  }

  return state
}

// ── AI decision ────────────────────────────────────────────────────────────────
function aiDecide(actor: GameUnit, state: BattleState): { action: ActionKey; targetId: string | null } {
  const playerUnits = state.units.filter(u => u.hp > 0 && u.side === 'player')
  const aiAllies    = state.units.filter(u => u.hp > 0 && u.side === 'ai' && u.id !== actor.id)

  const weakestPlayer = [...playerUnits].sort((a, b) => a.hp - b.hp)[0]
  const mostHurtAlly  = [...aiAllies].sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0]

  if (actor.class === 'warrior') {
    if (actor.hp < actor.maxHp * 0.35 && Math.random() < 0.5) return { action: 'shield', targetId: null }
    const front = playerUnits.filter(u => u.row === 0)
    const target = (front.length ? front : playerUnits).sort((a, b) => a.hp - b.hp)[0]
    return { action: 'strike', targetId: target?.id ?? null }
  }

  if (actor.class === 'archer') {
    const hasAimed = actor.buffs.some(b => b.type === 'aimed')
    if (!hasAimed && playerUnits.length > 0 && Math.random() < 0.30) return { action: 'aim', targetId: null }
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

// ── Action definitions ─────────────────────────────────────────────────────────
export const ACTIONS: Record<ActionKey, ActionDef> = {
  strike:          { key: 'strike',          label: 'Удар',       desc: 'Атака ворога в ближньому бою',              needsTarget: true,  targetSide: 'ai'   },
  shield:          { key: 'shield',          label: 'Щит',        desc: '+50% захисту цей хід',                      needsTarget: false, targetSide: null   },
  shot:            { key: 'shot',            label: 'Постріл',    desc: 'Атака будь-якого ворога',                   needsTarget: true,  targetSide: 'ai'   },
  aim:             { key: 'aim',             label: 'Прицілення', desc: '20% шанс +20% точн./+35% урону на 3 ходи',  needsTarget: false, targetSide: null   },
  spell:           { key: 'spell',           label: 'Закляття',   desc: 'Магічна атака будь-якого ворога',           needsTarget: true,  targetSide: 'ai'   },
  heal:            { key: 'heal',            label: 'Зцілення',   desc: '+10 HP союзнику',                           needsTarget: true,  targetSide: 'ally' },
  debuff_rupture:  { key: 'debuff_rupture',  label: 'Розрив',     desc: '+30% урону по цілі (2 ходи)',               needsTarget: true,  targetSide: 'ai'   },
  debuff_exhaust:  { key: 'debuff_exhaust',  label: 'Виснаження', desc: 'Ціль ходить останньою (2 ходи)',            needsTarget: true,  targetSide: 'ai'   },
  debuff_weakness: { key: 'debuff_weakness', label: 'Слабкість',  desc: '-25% урону цілі (2 ходи)',                  needsTarget: true,  targetSide: 'ai'   },
}

export function getBonusTargets(
  bonus: 'warrior-cry' | 'archer-shot',
  actor: GameUnit,
  units: GameUnit[],
): string[] {
  if (bonus === 'warrior-cry') return units.filter(u => u.side === actor.side && u.hp > 0 && u.id !== actor.id).map(u => u.id)
  return units.filter(u => u.side !== actor.side && u.hp > 0).map(u => u.id)
}

export function getMainActions(cls: UnitClass): ActionKey[] {
  if (cls === 'warrior') return ['strike', 'shield']
  if (cls === 'archer')  return ['shot',   'aim']
  return ['spell', 'heal']
}

// ── Initial state ──────────────────────────────────────────────────────────────
const TURN_RESET = {
  selectedAction: null as ActionKey | null,
  needsTarget: false,
  pendingDebuff: false,
  pendingPlayerBonus: null as 'warrior-cry' | 'archer-shot' | null,
}

export function createInitialState(counts?: ArmyCounts, prebuiltPlayerUnits?: GameUnit[]): BattleState {
  const playerUnits = prebuiltPlayerUnits
    ?? (counts ? buildCustomArmy(counts, 'player') : buildCustomArmy({ warriors: 3, archers: 2, mages: 1 }, 'player'))
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
    pendingAIBonus: null,
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
        const next = { ...state, units, log: [...state.log, ...newLogs], ...TURN_RESET, events: newEvents }
        if (state.pendingDebuff) return advanceQueue({ ...next, pendingDebuff: false })
        return advanceQueue(handleAutoBonus(next, actor.id))
      }
      return { ...state, selectedAction: a, needsTarget: true, events: [] }
    }

    case 'CONFIRM_TARGET': {
      const actor = state.units.find(u => u.id === state.queue[state.queueIdx])
      if (!actor || !state.selectedAction) return state

      const { units, newLogs, newEvents } = executeAction(state, actor, state.selectedAction, action.targetId)
      const next = { ...state, units, log: [...state.log, ...newLogs], ...TURN_RESET, events: newEvents }
      if (state.pendingDebuff) return advanceQueue({ ...next, pendingDebuff: false })
      return advanceQueue(handleAutoBonus(next, actor.id))
    }

    case 'CONFIRM_BONUS_TARGET': {
      const actorId = state.queue[state.queueIdx]
      const actor = state.units.find(u => u.id === actorId)
      if (!actor || !state.pendingPlayerBonus) return state

      let units = [...state.units]
      const newLogs: LogEntry[] = []
      const newEvents: BattleEvent[] = []
      const target = units.find(u => u.id === action.targetId)
      if (!target) return state

      if (state.pendingPlayerBonus === 'warrior-cry') {
        units = units.map(u => u.id === target.id
          ? { ...u, buffs: [...u.buffs, makeBuff('damage_up', 0.20, 2)] }
          : u)
        newLogs.push(log(`📯 Бойовий клич! ${actor.name} підбадьорює ${target.name} (+20% урону)`, 'buff'))
        newEvents.push(ev(target.id, '📯 +20%', 'buff'))
      } else if (state.pendingPlayerBonus === 'archer-shot') {
        newLogs.push(log(`🏹 Додатковий постріл по ${target.name}!`, 'info'))
        const res = resolveAttack(actor, target, units)
        newLogs.push(...res.logs)
        newEvents.push(...res.events)
        if (res.damage > 0) {
          const updated = { ...target, hp: Math.max(0, target.hp - res.damage) }
          units = units.map(u => u.id === target.id ? updated : u)
          if (updated.hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
        }
      }

      const next = {
        ...state, units,
        log: [...state.log, ...newLogs],
        events: [...state.events, ...newEvents],
        pendingPlayerBonus: null,
      }
      return advanceQueue(next)
    }

    case 'CANCEL_ACTION':
      return { ...state, selectedAction: null, needsTarget: false, pendingPlayerBonus: null }

    case 'AI_TAKE_TURN': {
      const actorId = state.queue[state.queueIdx]
      const actor = state.units.find(u => u.id === actorId)
      if (!actor || actor.hp === 0 || actor.side !== 'ai') return advanceQueue(state)

      const { action: act, targetId } = aiDecide(actor, state)
      if (!act || (ACTIONS[act].needsTarget && !targetId)) return advanceQueue(state)

      const { units, newLogs, newEvents } = executeAction(state, actor, act, targetId)
      const next = { ...state, units, log: [...state.log, ...newLogs], ...TURN_RESET, events: newEvents }

      // Roll for bonus — if triggered, defer to AI_RUN_BONUS so the UI shows main action first
      const bonusChance = actor.class === 'warrior' ? 0.33 : actor.class === 'archer' ? 0.25 : actor.class === 'mage' ? 0.20 : 0
      if (bonusChance > 0 && Math.random() < bonusChance) {
        return { ...next, pendingAIBonus: actorId }
      }
      return advanceQueue(next)
    }

    case 'AI_RUN_BONUS': {
      const actorId = state.pendingAIBonus
      if (!actorId) return advanceQueue(state)

      const actor = state.units.find(u => u.id === actorId)
      if (!actor || actor.hp === 0) return advanceQueue({ ...state, pendingAIBonus: null })

      let units = [...state.units]
      const newLogs: LogEntry[] = []
      const newEvents: BattleEvent[] = []

      if (actor.class === 'warrior') {
        const allies = units.filter(u => u.side === actor.side && u.hp > 0 && u.id !== actor.id)
        if (allies.length > 0) {
          const target = allies[Math.floor(Math.random() * allies.length)]
          units = units.map(u => u.id === target.id
            ? { ...u, buffs: [...u.buffs, makeBuff('damage_up', 0.20, 2)] }
            : u)
          newLogs.push(log(`📯 Бойовий клич! ${actor.name} підбадьорює ${target.name} (+20% урону)`, 'buff'))
          newEvents.push(ev(target.id, '📯 +20%', 'buff'))
        }
      } else if (actor.class === 'archer') {
        const freshActor = units.find(u => u.id === actorId)!
        const enemies = units.filter(u => u.side !== actor.side && u.hp > 0)
        if (enemies.length > 0) {
          const target = enemies[Math.floor(Math.random() * enemies.length)]
          newLogs.push(log(`🏹 Додатковий постріл!`, 'info'))
          const res = resolveAttack(freshActor, target, units)
          newLogs.push(...res.logs)
          newEvents.push(...res.events)
          if (res.damage > 0) {
            const updated = { ...target, hp: Math.max(0, target.hp - res.damage) }
            units = units.map(u => u.id === target.id ? updated : u)
            if (updated.hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
          }
        }
      } else if (actor.class === 'mage') {
        const freshActor = units.find(u => u.id === actorId)!
        const enemies = units.filter(u => u.side !== actor.side && u.hp > 0)
        const target = [...enemies].sort((a, b) => a.hp - b.hp)[0]
        if (target) {
          const result = executeAction({ ...state, units }, freshActor, 'debuff_rupture', target.id)
          units = result.units
          newLogs.push(...result.newLogs)
          newEvents.push(...result.newEvents)
        }
      }

      return advanceQueue({ ...state, units, log: [...state.log, ...newLogs], pendingAIBonus: null, events: newEvents })
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
