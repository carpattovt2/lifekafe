export type UnitClass = 'warrior' | 'archer' | 'mage' | 'catapult'
export type Side = 'player' | 'ai'
export type Row = 0 | 1 | 2

export type BuffType =
  | 'defense_up'   // warrior shield: +50% damage reduction this turn
  | 'aimed'        // archer aim: fixed acc bonus + 35% crit for 2 turns
  | 'morale_up'    // knight battle cry: +N morale → +1% acc/eva per 10 morale
  | 'armor_break'  // paladin sacred strike: -10% target armor for 1 turn

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

  // Warrior-only level system
  level?: number
  xp?: number
  xpToNext?: number
}

export type ActionKey =
  | 'strike'          // warrior: melee attack (adjacent slots, same row)
  | 'shield'          // warrior: +50% defense this turn
  | 'battle_cry'      // knight (lv3): +15 morale to all allies for 2 turns
  | 'sacred_strike'   // paladin (lv4): strike + -10% armor on target 1 turn
  | 'consecration'    // paladin (lv4): remove debuffs + heal ally 15 HP
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

// ── Warrior level data ─────────────────────────────────────────────────────────
export interface WarriorLevelData {
  name: string
  hp: number; minDmg: number; maxDmg: number
  accuracy: number; defense: number; evasion: number
  initiative: number; critChance: number; critMult: number; morale: number
  actions: ActionKey[]
  frontLineBonus: number
  xpToNext: number
}

export const WARRIOR_LEVELS: Record<number, WarriorLevelData> = {
  1: {
    name: 'Squire',
    hp: 80, minDmg: 10, maxDmg: 15, accuracy: 0.80, defense: 0,    evasion: 0.15,
    initiative: 50, critChance: 0,    critMult: 2.0, morale: 50,
    actions: ['strike', 'shield'],
    frontLineBonus: 0.20, xpToNext: 100,
  },
  2: {
    name: 'Soldier',
    hp: 110, minDmg: 14, maxDmg: 20, accuracy: 0.85, defense: 0.10, evasion: 0.12,
    initiative: 52, critChance: 0.05, critMult: 1.5, morale: 55,
    actions: ['strike', 'shield'],
    frontLineBonus: 0.20, xpToNext: 200,
  },
  3: {
    name: 'Knight',
    hp: 145, minDmg: 18, maxDmg: 26, accuracy: 0.88, defense: 0.20, evasion: 0.10,
    initiative: 55, critChance: 0.12, critMult: 1.75, morale: 65,
    actions: ['strike', 'shield', 'battle_cry'],
    frontLineBonus: 0.25, xpToNext: 350,
  },
  4: {
    name: 'Paladin',
    hp: 190, minDmg: 24, maxDmg: 34, accuracy: 0.92, defense: 0.35, evasion: 0.08,
    initiative: 60, critChance: 0.18, critMult: 2.0, morale: 80,
    actions: ['sacred_strike', 'shield', 'consecration'],
    frontLineBonus: 0.30, xpToNext: Infinity,
  },
}
