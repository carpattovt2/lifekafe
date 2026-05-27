export type UnitClass = 'warrior' | 'archer' | 'mage' | 'catapult'
export type Side = 'player' | 'ai'
export type Row = 0 | 1 | 2

export type BuffType =
  | 'defense_up'    // warrior shield: +50% damage reduction this turn
  | 'aimed'         // archer aim: fixed acc bonus + crit for 2 turns
  | 'morale_up'     // knight battle cry: +N morale → +1% acc/eva per 10 morale
  | 'armor_break'   // paladin sacred strike: -10% target armor for 1 turn
  | 'poison'        // hunter poison_shot: 4 dmg/turn for 3 turns, no stack
  | 'burning'       // fire mage: X dmg/turn for N turns (like poison, no stack)
  | 'frozen'        // water/earth: skip next turn (turnsLeft = 1)
  | 'accuracy_down' // frost bolt / gust: -X% accuracy for N turns
  | 'regen'         // ice shield lv3+ / stone skin lv3+: +X HP at turn start
  | 'wind_shield'   // air lv4: +X% evasion
  | 'fortress_buff' // earth lv5: +X% defense (party)
  | 'thorns'        // stone skin lv3: attacker takes X dmg on hit
  | 'taunt'         // warrior lv2 provoke: front-row enemies must target this unit
  | 'initiative_up' // archer aim: +X initiative for queue ordering

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

  // Level system (warrior, archer, mage)
  level?: number
  xp?: number
  xpToNext?: number

  // Mage-only
  magePath?: MagePath

  // Elemental resistances (0–1, default 0)
  fireRes?: number
  waterRes?: number
  earthRes?: number
  airRes?: number
}

export type MagePath = 'fire' | 'water' | 'earth' | 'air'

export type ActionKey =
  | 'strike'          // warrior: melee attack (adjacent slots, same row)
  | 'shield'          // warrior: +50% defense this turn
  | 'battle_cry'      // knight (lv3): +15 morale to all allies for 2 turns
  | 'sacred_strike'   // paladin (lv4): strike + -10% armor on target 1 turn
  | 'consecration'    // paladin (lv4): remove debuffs + heal ally 15 HP
  | 'shot'            // archer: ranged attack any enemy
  | 'aim'             // archer: +25–40% acc + crit for 2 turns (crit% scales with level)
  | 'poison_shot'     // hunter (lv2): shot + poison 4dmg/turn for 3 turns, no stack
  | 'double_shot'     // ranger (lv3): two shots, second -15% acc
  | 'magic_bolt'      // mage lv1: single target, force damage (no element)
  | 'fireball'        // fire lv2-5: fixed damage + 25% burn passive
  | 'fire_orb'        // fire lv3-5: area attack, 50% splash, no burn
  | 'armageddon'      // fire lv5: hits ALL enemies, fire damage
  | 'ignite'          // legacy (unused)
  | 'inferno'         // legacy (unused)
  | 'chain_lightning' // legacy (unused)
  | 'frost_bolt'      // water lv2-4: damage + accuracy_down debuff
  | 'ice_shield'      // water lv2-4: ally +def buff (+ regen at lv3+, freeze at lv4)
  | 'blizzard'        // water lv5: frost_bolt hits ALL enemies
  | 'tidal_heal'      // water lv5: heal all allies
  | 'rock_throw'      // earth lv2-4: unblockable damage (ignores evasion + acc_down at lv3+)
  | 'stone_skin'      // earth lv2-4: ally def buff (+ thorns at lv3+, regen at lv4+)
  | 'earthquake'      // earth lv5: rock_throw hits ALL enemies (half dmg)
  | 'fortress_aura'   // earth lv5: massive defense buff to all allies
  | 'lightning_bolt'  // air lv2-4: high-crit damage (chains to extra targets at lv3+)
  | 'gust'            // air lv2-4: accuracy_down debuff (stronger at higher levels)
  | 'thunder_storm'   // air lv5: lightning_bolt hits ALL enemies
  | 'hurricane'       // air lv5: massive single-target + frozen (skip turn)
  | 'provoke'         // warrior lv2: front-row enemies must target this unit + +20% defense
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

  pendingMageLevelUp?: string  // unitId of mage awaiting path choice
}

export type BattleAction =
  | { type: 'SELECT_ACTION'; action: ActionKey }
  | { type: 'CONFIRM_TARGET'; targetId: string }
  | { type: 'CANCEL_ACTION' }
  | { type: 'AI_TAKE_TURN' }
  | { type: 'ADVANCE_QUEUE' }
  | { type: 'CHOOSE_MAGE_PATH'; unitId: string; path: MagePath }

export interface ArmyCounts {
  warriors: number   // 0–4, row 0
  archers: number    // 0–2, row 1 (max 2 when catapult present)
  mages: number      // 0–2, row 2
  catapults: number  // 0–1, row 1 slot 2 + row 2 slot 2 base; counts as 2 units
}

export interface TowerFloor {
  floor: number
  name: string
  aiCounts: ArmyCounts
}

export const TOWER_FLOORS: TowerFloor[] = [
  { floor: 1, name: 'Прикордонна застава', aiCounts: { warriors: 2, archers: 0, mages: 0, catapults: 0 } },
  { floor: 2, name: 'Лісовий загін',        aiCounts: { warriors: 2, archers: 1, mages: 0, catapults: 0 } },
  { floor: 3, name: 'Гірський перевал',      aiCounts: { warriors: 3, archers: 1, mages: 1, catapults: 0 } },
  { floor: 4, name: 'Річкова переправа',     aiCounts: { warriors: 3, archers: 2, mages: 1, catapults: 0 } },
  { floor: 5, name: 'Осадний табір',         aiCounts: { warriors: 4, archers: 2, mages: 1, catapults: 0 } },
  { floor: 6, name: 'Замкові мури',          aiCounts: { warriors: 4, archers: 2, mages: 2, catapults: 0 } },
  { floor: 7, name: 'Цитадель Серафітів',   aiCounts: { warriors: 4, archers: 1, mages: 2, catapults: 1 } },
]

// ── Mage level data ────────────────────────────────────────────────────────────
export interface MageLevelData {
  name: string
  hp: number; minDmg: number; maxDmg: number
  accuracy: number; defense: number; evasion: number
  initiative: number; critChance: number; critMult: number; morale: number
  actions: ActionKey[]
  xpToNext: number
}

export const MAGE_BASE: MageLevelData = {
  name: 'Учень',
  hp: 55, minDmg: 7, maxDmg: 10, accuracy: 0.60, defense: 0, evasion: 0.10,
  initiative: 30, critChance: 0, critMult: 2.0, morale: 50,
  actions: ['magic_bolt'],
  xpToNext: 100,
}

export const MAGE_PATHS: Record<MagePath, Record<number, MageLevelData>> = {
  fire: {
    2: { name: 'Підпалювач',      hp:  75, minDmg: 20, maxDmg: 20, accuracy: 0.75, defense: 0,    evasion: 0.15, initiative: 35, critChance: 0, critMult: 2.0, morale: 55, actions: ['fireball'],                  xpToNext: 200 },
    3: { name: 'Піромант',        hp:  95, minDmg: 25, maxDmg: 25, accuracy: 0.75, defense: 0.05, evasion: 0.12, initiative: 35, critChance: 0, critMult: 2.0, morale: 60, actions: ['fireball', 'fire_orb'],      xpToNext: 350 },
    4: { name: 'Майстер Вогню',   hp: 115, minDmg: 30, maxDmg: 30, accuracy: 0.75, defense: 0.10, evasion: 0.10, initiative: 35, critChance: 0, critMult: 2.0, morale: 65, actions: ['fireball', 'fire_orb'],      xpToNext: 500 },
    5: { name: 'Архонт Полум\'я', hp: 140, minDmg: 35, maxDmg: 35, accuracy: 0.75, defense: 0.10, evasion: 0.10, initiative: 35, critChance: 0, critMult: 2.0, morale: 75, actions: ['fireball', 'fire_orb', 'armageddon'], xpToNext: Infinity },
  },
  water: {
    2: { name: 'Льодовий Маг',    hp:  80, minDmg: 10, maxDmg: 16, accuracy: 0.70, defense: 0.05, evasion: 0.12, initiative: 36, critChance: 0.05, critMult: 2.0, morale: 55, actions: ['frost_bolt', 'ice_shield'],  xpToNext: 200 },
    3: { name: 'Кріомант',        hp: 100, minDmg: 13, maxDmg: 20, accuracy: 0.74, defense: 0.10, evasion: 0.12, initiative: 38, critChance: 0.08, critMult: 2.0, morale: 60, actions: ['frost_bolt', 'ice_shield'],  xpToNext: 350 },
    4: { name: 'Майстер Води',    hp: 120, minDmg: 15, maxDmg: 23, accuracy: 0.78, defense: 0.15, evasion: 0.12, initiative: 40, critChance: 0.12, critMult: 2.0, morale: 65, actions: ['frost_bolt', 'ice_shield'],  xpToNext: 500 },
    5: { name: 'Морський Архонт', hp: 145, minDmg: 18, maxDmg: 27, accuracy: 0.82, defense: 0.20, evasion: 0.12, initiative: 42, critChance: 0.15, critMult: 2.0, morale: 75, actions: ['blizzard', 'tidal_heal'],    xpToNext: Infinity },
  },
  earth: {
    2: { name: 'Маг Каменю',      hp:  90, minDmg: 11, maxDmg: 17, accuracy: 0.72, defense: 0.08, evasion: 0.08, initiative: 32, critChance: 0,    critMult: 2.0, morale: 60, actions: ['rock_throw', 'stone_skin'],  xpToNext: 200 },
    3: { name: 'Геомант',         hp: 110, minDmg: 14, maxDmg: 21, accuracy: 0.76, defense: 0.15, evasion: 0.08, initiative: 34, critChance: 0.05, critMult: 2.0, morale: 65, actions: ['rock_throw', 'stone_skin'],  xpToNext: 350 },
    4: { name: 'Майстер Землі',   hp: 135, minDmg: 17, maxDmg: 25, accuracy: 0.80, defense: 0.22, evasion: 0.08, initiative: 36, critChance: 0.08, critMult: 2.0, morale: 70, actions: ['rock_throw', 'stone_skin'],  xpToNext: 500 },
    5: { name: 'Архонт Землі',    hp: 165, minDmg: 20, maxDmg: 30, accuracy: 0.84, defense: 0.30, evasion: 0.08, initiative: 38, critChance: 0.10, critMult: 2.0, morale: 80, actions: ['earthquake', 'fortress_aura'], xpToNext: Infinity },
  },
  air: {
    2: { name: 'Вітровий Маг',    hp:  70, minDmg: 13, maxDmg: 19, accuracy: 0.72, defense: 0,    evasion: 0.18, initiative: 42, critChance: 0.15, critMult: 2.5, morale: 55, actions: ['lightning_bolt', 'gust'],    xpToNext: 200 },
    3: { name: 'Буревій',         hp:  88, minDmg: 16, maxDmg: 24, accuracy: 0.76, defense: 0,    evasion: 0.20, initiative: 46, critChance: 0.25, critMult: 2.5, morale: 60, actions: ['lightning_bolt', 'gust'],    xpToNext: 350 },
    4: { name: 'Майстер Повітря', hp: 108, minDmg: 20, maxDmg: 29, accuracy: 0.80, defense: 0.05, evasion: 0.22, initiative: 50, critChance: 0.35, critMult: 3.0, morale: 65, actions: ['lightning_bolt', 'gust'],    xpToNext: 500 },
    5: { name: 'Архонт Повітря',  hp: 130, minDmg: 24, maxDmg: 35, accuracy: 0.84, defense: 0.08, evasion: 0.24, initiative: 55, critChance: 0.45, critMult: 3.0, morale: 75, actions: ['thunder_storm', 'hurricane'], xpToNext: Infinity },
  },
}

// ── Archer level data ──────────────────────────────────────────────────────────
export interface ArcherLevelData {
  name: string
  hp: number; minDmg: number; maxDmg: number
  accuracy: number; defense: number; evasion: number
  initiative: number; critChance: number; critMult: number; morale: number
  actions: ActionKey[]
  aimCritChance: number
  aimCritMult: number
  xpToNext: number
}

export const ARCHER_LEVELS: Record<number, ArcherLevelData> = {
  1: {
    name: 'Розвідник',
    hp: 65, minDmg: 12, maxDmg: 18, accuracy: 0.80, defense: 0, evasion: 0.20,
    initiative: 60, critChance: 0, critMult: 2.0, morale: 50,
    actions: ['shot', 'aim'],
    aimCritChance: 0.35, aimCritMult: 2.0,
    xpToNext: 140,
  },
  2: {
    name: 'Мисливець',
    hp: 90, minDmg: 16, maxDmg: 24, accuracy: 0.80, defense: 0, evasion: 0.15,
    initiative: 60, critChance: 0, critMult: 2.0, morale: 55,
    actions: ['shot', 'aim'],
    aimCritChance: 0.35, aimCritMult: 2.0,
    xpToNext: 300,
  },
  3: {
    name: 'Рейнджер',
    hp: 120, minDmg: 22, maxDmg: 32, accuracy: 0.85, defense: 0, evasion: 0.15,
    initiative: 60, critChance: 0, critMult: 2.0, morale: 65,
    actions: ['shot', 'aim', 'double_shot'],
    aimCritChance: 0.45, aimCritMult: 2.5,
    xpToNext: Infinity,
  },
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
    name: 'Зброєносець',
    hp: 80, minDmg: 10, maxDmg: 15, accuracy: 0.80, defense: 0.10, evasion: 0.15,
    initiative: 50, critChance: 0, critMult: 2.0, morale: 50,
    actions: ['strike', 'shield'],
    frontLineBonus: 0.20, xpToNext: 100,
  },
  2: {
    name: 'Солдат',
    hp: 110, minDmg: 14, maxDmg: 20, accuracy: 0.80, defense: 0.10, evasion: 0.12,
    initiative: 50, critChance: 0, critMult: 2.0, morale: 55,
    actions: ['strike', 'shield', 'provoke'],
    frontLineBonus: 0.20, xpToNext: 200,
  },
  3: {
    name: 'Лицар',
    hp: 145, minDmg: 18, maxDmg: 26, accuracy: 0.80, defense: 0.20, evasion: 0.10,
    initiative: 50, critChance: 0, critMult: 2.0, morale: 65,
    actions: ['strike', 'shield', 'battle_cry', 'provoke'],
    frontLineBonus: 0.25, xpToNext: 350,
  },
  4: {
    name: 'Паладін',
    hp: 190, minDmg: 24, maxDmg: 34, accuracy: 0.80, defense: 0.35, evasion: 0.08,
    initiative: 50, critChance: 0, critMult: 2.0, morale: 80,
    actions: ['sacred_strike', 'shield', 'consecration', 'battle_cry'],
    frontLineBonus: 0.30, xpToNext: Infinity,
  },
}
