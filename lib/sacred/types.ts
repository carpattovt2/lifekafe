export type UnitClass = 'warrior' | 'archer' | 'mage'
export type Side = 'player' | 'ai'
export type Row = 0 | 1 | 2

export type BuffType =
  | 'defense_up'      // warrior shield: -15% damage taken
  | 'damage_up'       // warrior battle cry bonus: +20% damage dealt
  | 'aimed'           // archer aim: 20% chance per shot for +20% acc / +35% dmg
  | 'damage_taken_up' // mage debuff Розрив: +30% damage taken
  | 'exhausted'       // mage debuff Виснаження: goes last in next round
  | 'weakness'        // mage debuff Слабкість: -25% damage dealt

export interface Buff {
  id: string
  type: BuffType
  value: number
  turnsLeft: number
}

export interface GameUnit {
  id: string
  side: Side
  row: Row
  slot: number
  class: UnitClass
  name: string

  hp: number
  maxHp: number
  minDmg: number
  maxDmg: number
  accuracy: number
  defense: number
  initiative: number
  morale: number
  critChance: number
  critMult: number
  counter: number
  evasion: number

  buffs: Buff[]
  hasActed: boolean
}

export type ActionKey =
  | 'strike'           // warrior: melee attack
  | 'shield'           // warrior: defense buff
  | 'shot'             // archer: ranged attack
  | 'aim'              // archer: aimed buff
  | 'spell'            // mage: magic attack
  | 'heal'             // mage: heal ally
  | 'debuff_rupture'   // mage bonus: +30% dmg taken
  | 'debuff_exhaust'   // mage bonus: acts last next round
  | 'debuff_weakness'  // mage bonus: -25% dmg dealt

export interface ActionDef {
  key: ActionKey
  label: string
  desc: string
  needsTarget: boolean
  targetSide: Side | 'ally' | null
}

export interface LogEntry {
  id: number
  text: string
  type: 'attack' | 'miss' | 'evade' | 'crit' | 'heal' | 'buff' | 'debuff' | 'death' | 'info'
}

export type Phase = 'player-turn' | 'ai-thinking' | 'game-over'

export interface BattleEvent {
  id: number
  unitId: string
  text: string
  type: 'damage' | 'crit' | 'miss' | 'evade' | 'heal' | 'buff' | 'debuff'
}

export interface BattleState {
  units: GameUnit[]
  queue: string[]
  queueIdx: number
  phase: Phase
  winner: Side | null
  log: LogEntry[]
  round: number

  selectedAction: ActionKey | null
  needsTarget: boolean
  pendingDebuff: boolean  // mage bonus triggered — waiting for player to pick debuff + target
  events: BattleEvent[]  // cleared each turn, consumed by UI for floating numbers
}

export type BattleAction =
  | { type: 'SELECT_ACTION'; action: ActionKey }
  | { type: 'CONFIRM_TARGET'; targetId: string }
  | { type: 'CANCEL_ACTION' }
  | { type: 'AI_TAKE_TURN' }
  | { type: 'ADVANCE_QUEUE' }

export interface ArmyCounts {
  warriors: number  // 0–4, row 0
  archers: number   // 0–3, row 1
  mages: number     // 0–2, row 2
}
