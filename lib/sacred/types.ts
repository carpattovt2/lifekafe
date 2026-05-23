export type UnitClass = 'warrior' | 'archer' | 'mage' | 'catapult'
export type Side = 'player' | 'ai'
export type Row = 0 | 1 | 2

export type BuffType =
  | 'defense_up'  // warrior shield: +50% damage reduction this turn
  | 'aimed'       // archer aim: fixed acc bonus + 35% crit for 2 turns

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
  | 'strike'          // warrior: melee attack (adjacent slots, same row)
  | 'shield'          // warrior: +50% defense this turn
  | 'shot'            // archer: ranged attack any enemy
  | 'aim'             // archer: +25–40% acc + 35% crit ×2 for 2 turns
  | 'chain_lightning' // mage: hits all enemies, full damage each
  | 'fireball'        // mage: ×3 damage to single target
  | 'barrage'         // catapult: area strike, adjacents get 25–50% damage
  | 'grapeshot'       // catapult: all enemies in same row, -40% damage

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
  sourceId?: string
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
  events: BattleEvent[]
}

export type BattleAction =
  | { type: 'SELECT_ACTION'; action: ActionKey }
  | { type: 'CONFIRM_TARGET'; targetId: string }
  | { type: 'CANCEL_ACTION' }
  | { type: 'AI_TAKE_TURN' }
  | { type: 'ADVANCE_QUEUE' }

export interface ArmyCounts {
  warriors: number   // 0–4, row 0
  archers: number    // 0–2, row 1 (max 2 when catapult present)
  mages: number      // 0–2, row 2
  catapults: number  // 0–1, row 1 slot 2 + row 2 slot 2 base; counts as 2 units
}
