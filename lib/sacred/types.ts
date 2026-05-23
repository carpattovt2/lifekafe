export type UnitClass = 'warrior' | 'archer' | 'mage'
export type Side = 'player' | 'ai'
export type Row = 0 | 1 | 2

export type BuffType =
  | 'defense_up'    // reduces damage taken
  | 'evasion_up'    // increases evasion
  | 'accuracy_up'   // increases accuracy
  | 'morale_up'     // increases morale
  | 'damage_taken_up'   // debuff: +% damage received
  | 'damage_taken_down' // buff: -% damage received (mage shield)

export interface Buff {
  id: string
  type: BuffType
  value: number    // fractional (0.15 = 15%)
  turnsLeft: number
}

export interface GameUnit {
  id: string
  side: Side
  row: Row
  slot: number     // position within row (0-indexed)

  class: UnitClass
  name: string

  hp: number
  maxHp: number
  minDmg: number
  maxDmg: number
  accuracy: number     // base (0–1)
  defense: number      // base (0–1)
  initiative: number
  morale: number       // 1–100
  critChance: number   // 0–1
  critMult: number
  counter: number      // counter-attack chance (0–1)
  evasion: number      // 0–1

  buffs: Buff[]
  hasActed: boolean
}

export type ActionKey =
  | 'strike'       // warrior primary
  | 'shield'       // warrior secondary (self)
  | 'battle_cry'   // warrior bonus (ally)
  | 'shot'         // archer primary
  | 'cover_shot'   // archer primary alt
  | 'aim'          // archer secondary (self)
  | 'spell'        // mage primary
  | 'ally_shield'  // mage secondary (ally)
  | 'debuff'       // mage secondary (enemy)
  | 'heal'         // mage bonus (ally)

export interface ActionDef {
  key: ActionKey
  label: string
  desc: string
  targetSide: Side | 'self' | 'ally' | null
}

export interface LogEntry {
  id: number
  text: string
  type: 'attack' | 'miss' | 'evade' | 'crit' | 'heal' | 'buff' | 'debuff' | 'death' | 'info'
}

export type Phase = 'player-turn' | 'ai-thinking' | 'game-over'
export type ActionCategory = 'primary' | 'secondary' | 'bonus'

export interface BattleState {
  units: GameUnit[]
  queue: string[]      // unit IDs sorted by initiative for this round
  queueIdx: number
  phase: Phase
  winner: Side | null
  log: LogEntry[]
  round: number

  selectedAction: ActionKey | null
  needsTarget: boolean

  // Multi-action tracking for current actor's turn
  usedPrimary: boolean
  usedSecondary: boolean
  usedBonus: boolean
}

export type BattleAction =
  | { type: 'SELECT_ACTION'; action: ActionKey }
  | { type: 'CONFIRM_TARGET'; targetId: string | null }
  | { type: 'CANCEL_ACTION' }
  | { type: 'AI_TAKE_TURN' }
  | { type: 'END_TURN' }
  | { type: 'ADVANCE_QUEUE' }

export interface UnitDef {
  defId: string
  class: UnitClass
  name: string
  hp: number; maxHp: number
  minDmg: number; maxDmg: number
  accuracy: number; defense: number
  initiative: number; morale: number
  critChance: number; critMult: number
  counter: number; evasion: number
  desc: string
}

export interface ArmySlot {
  def: UnitDef
  row: Row
}
