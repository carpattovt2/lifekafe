import type { UnitClass, MagePath, WarriorPath, CatapultPath, Side } from './types'
import { buildFreeUnit } from './game'
import type { GameUnit } from './types'

export interface UnitSpec {
  class: UnitClass
  level: number
  magePath?: MagePath
  warriorPath?: WarriorPath
  catapultPath?: CatapultPath
}

export interface Territory {
  id: string
  name: string
  adjacentTo: string[]
  army: UnitSpec[]
  goldReward: number
  isBoss?: boolean
  isStart?: boolean
  polygon: [number, number][]
}

export interface TerritoryMapState {
  ownership:      Record<string, 'player' | 'enemy'>
  gold:           number
  turn:           number
  ap:             number   // action points left this day (max 2)
  armyNodeId:     string   // territory where the army currently stands
  maxArmySlots:   number
  fortressLevel:  1 | 2 | 3 | 4 | 5
  restedThisTurn: boolean
}

export const FORTRESS_NAMES: Record<number, string> = {
  1: 'Аванпост', 2: 'Табір', 3: 'Фортеця', 4: 'Цитадель', 5: 'Бастіон',
}
export const FORTRESS_UPGRADE_COST: Record<number, number> = { 2: 5, 3: 8, 4: 12, 5: 15 }
export const SLOT_COSTS: Record<number, number> = { 4: 5, 5: 8, 6: 12, 7: 15 }

const REVIVE_TABLE: Record<string, number[]> = {
  warrior:  [1, 2, 3, 4, 5],
  archer:   [2, 4, 6],
  mage:     [3, 5, 8, 11, 14],
  catapult: [4, 8, 15],
}
export function getReviveCost(unit: GameUnit): number {
  const lvl = Math.max(1, unit.level ?? 1)
  const table = REVIVE_TABLE[unit.class] ?? [5]
  return table[lvl - 1] ?? table[table.length - 1]
}

export const MAP_WIDTH  = 2048
export const MAP_HEIGHT = 1536

export const HIRE_COSTS: Record<UnitClass, number> = { warrior: 2, archer: 3, mage: 5, catapult: 8 }

export const TERRITORIES: Territory[] = [
  {
    id: 'dans',
    name: 'Данс',
    isStart: true,
    adjacentTo: ['tsyklop', 'ussuriysk'],
    army: [],
    goldReward: 0,
    polygon: [[1238,152],[1241,321],[1334,360],[1413,347],[1499,288],[1559,245],[1635,225],[1698,228],[1784,215],[1840,215],[1899,178],[1946,129],[1906,102],[1856,102],[1803,102],[1734,116],[1671,102],[1605,63],[1496,16],[1403,56],[1301,96]],
  },
  {
    id: 'tsyklop',
    name: 'Циклоп',
    adjacentTo: ['dans', 'ussuriysk', 'mahadan'],
    army: [
      { class: 'warrior', level: 1 },
      { class: 'warrior', level: 1 },
    ],
    goldReward: 5,
    polygon: [[1347,354],[1350,440],[1403,489],[1496,499],[1588,473],[1661,456],[1701,433],[1721,397],[1803,393],[1846,347],[1833,301],[1757,301],[1711,264],[1668,241],[1592,238],[1519,278],[1463,330],[1426,350]],
  },
  {
    id: 'ussuriysk',
    name: 'Уссурийськ',
    adjacentTo: ['dans', 'tsyklop', 'mahadan', 'ssania'],
    army: [
      { class: 'warrior', level: 1 },
      { class: 'warrior', level: 1 },
      { class: 'mage', level: 1 },
    ],
    goldReward: 10,
    polygon: [[596,400],[537,476],[537,552],[590,621],[663,684],[709,714],[752,741],[844,704],[940,671],[1033,631],[1079,559],[1155,483],[1228,483],[1340,436],[1347,373],[1271,334],[1238,264],[1228,135],[1125,202],[1102,261],[1073,185],[1066,129],[1010,162],[983,238],[901,324],[798,400],[689,400]],
  },
  {
    id: 'ssania',
    name: 'Ссання',
    adjacentTo: ['ussuriysk', 'mohykan'],
    army: [
      { class: 'warrior', level: 2, warriorPath: 'paladin' },
      { class: 'warrior', level: 1 },
      { class: 'archer', level: 1 },
    ],
    goldReward: 10,
    polygon: [[203,707],[302,744],[401,734],[481,688],[583,701],[663,688],[557,618],[524,506],[553,423],[590,387],[613,231],[550,202],[520,278],[477,241],[434,314],[382,443],[286,453],[239,526],[210,612]],
  },
  {
    id: 'mohykan',
    name: 'Могикан',
    adjacentTo: ['ssania', 'bebra'],
    army: [
      { class: 'warrior', level: 2, warriorPath: 'paladin' },
      { class: 'warrior', level: 2, warriorPath: 'champion' },
      { class: 'archer', level: 2 },
      { class: 'mage',   level: 2, magePath: 'fire' },
    ],
    goldReward: 15,
    polygon: [[190,717],[266,734],[358,744],[441,731],[504,711],[600,704],[679,704],[656,780],[596,869],[550,929],[477,929],[395,995],[348,1065],[286,1061],[256,1002],[259,972],[259,916],[220,903],[173,856]],
  },
  {
    id: 'bebra',
    name: 'Бебра',
    adjacentTo: ['mohykan', 'mana'],
    army: [
      { class: 'warrior', level: 2, warriorPath: 'paladin' },
      { class: 'warrior', level: 2, warriorPath: 'champion' },
      { class: 'archer', level: 2 },
      { class: 'mage',   level: 2, magePath: 'earth' },
    ],
    goldReward: 20,
    polygon: [[372,1048],[438,972],[507,949],[616,949],[603,1031],[603,1114],[630,1220],[630,1256],[553,1342],[458,1399],[362,1385],[329,1359],[352,1276],[382,1253],[388,1200],[302,1203],[302,1151],[355,1121]],
  },
  {
    id: 'mana',
    name: 'Мана',
    adjacentTo: ['bebra', 'bebe'],
    army: [
      { class: 'warrior', level: 3, warriorPath: 'paladin' },
      { class: 'warrior', level: 3, warriorPath: 'champion' },
      { class: 'archer', level: 3 },
      { class: 'mage',   level: 3, magePath: 'water' },
    ],
    goldReward: 25,
    polygon: [[587,906],[673,787],[709,747],[792,750],[894,694],[1003,658],[1023,661],[990,807],[960,929],[944,1074],[844,1144],[874,1246],[838,1316],[712,1346],[666,1299],[649,1230],[610,1134],[610,995]],
  },
  {
    id: 'mahadan',
    name: 'Магадан',
    adjacentTo: ['ussuriysk', 'tsyklop', 'bebe'],
    army: [
      { class: 'warrior', level: 3, warriorPath: 'paladin' },
      { class: 'warrior', level: 3, warriorPath: 'champion' },
      { class: 'archer', level: 3 },
      { class: 'mage',   level: 3, magePath: 'fire' },
    ],
    goldReward: 25,
    polygon: [[1334,453],[1416,509],[1532,502],[1433,602],[1420,678],[1612,671],[1750,671],[1790,717],[1744,823],[1707,988],[1678,1028],[1324,866],[1215,810],[1152,754],[1043,671],[1073,608],[1125,559],[1192,486]],
  },
  {
    id: 'bebe',
    name: 'Бебе',
    isBoss: true,
    adjacentTo: ['mana', 'mahadan'],
    army: [
      { class: 'warrior',  level: 4, warriorPath: 'paladin' },
      { class: 'warrior',  level: 3, warriorPath: 'champion' },
      { class: 'archer',   level: 3 },
      { class: 'mage',     level: 4, magePath: 'fire' },
      { class: 'catapult', level: 2, catapultPath: 'ballista' },
    ],
    goldReward: 50,
    polygon: [[1033,684],[1000,869],[970,936],[967,1078],[1109,1098],[1235,1157],[1357,1164],[1453,1151],[1440,1197],[1440,1263],[1539,1207],[1655,1177],[1760,1167],[1810,1094],[1734,1055],[1678,1094],[1658,1045],[1387,922],[1360,846],[1235,850],[1135,764]],
  },
]

export function createInitialTerritoryState(): TerritoryMapState {
  const ownership: Record<string, 'player' | 'enemy'> = {}
  for (const t of TERRITORIES) ownership[t.id] = t.isStart ? 'player' : 'enemy'
  return {
    ownership, gold: 10, turn: 1,
    ap: 2, armyNodeId: 'dans',
    maxArmySlots: 4, fortressLevel: 1, restedThisTurn: false,
  }
}

export function getTerritoryById(id: string): Territory | undefined {
  return TERRITORIES.find(t => t.id === id)
}

export function getAttackableTerritories(
  ownership: Record<string, 'player' | 'enemy'>,
  armyNodeId: string,
): Set<string> {
  const army = getTerritoryById(armyNodeId)
  if (!army) return new Set()
  const playerSet = new Set(Object.entries(ownership).filter(([, o]) => o === 'player').map(([id]) => id))
  return new Set(army.adjacentTo.filter(id => !playerSet.has(id)))
}

export function getMovableTerritories(
  ownership: Record<string, 'player' | 'enemy'>,
  armyNodeId: string,
): Set<string> {
  const army = getTerritoryById(armyNodeId)
  if (!army) return new Set()
  const playerSet = new Set(Object.entries(ownership).filter(([, o]) => o === 'player').map(([id]) => id))
  return new Set(army.adjacentTo.filter(id => playerSet.has(id)))
}

export function isSlotUnlocked(row: number, slot: number, maxArmySlots: number): boolean {
  if (slot <= 1) return true
  if (slot === 2) return row === 0 ? maxArmySlots >= 5 : maxArmySlots >= 6
  return row === 0 ? maxArmySlots >= 7 : maxArmySlots >= 8
}

export function buildArmyFromSpecs(specs: UnitSpec[], side: Side): GameUnit[] {
  const units: GameUnit[] = []
  const hasCat = specs.some(s => s.class === 'catapult')
  const warriors  = specs.filter(s => s.class === 'warrior')
  const catapults = specs.filter(s => s.class === 'catapult')
  const ranged    = specs.filter(s => s.class === 'archer' || s.class === 'mage')

  for (let i = 0; i < warriors.length; i++) {
    const s = warriors[i]
    units.push(buildFreeUnit(s.class, s.level, side, 0, i, undefined, undefined, s.warriorPath))
  }
  if (hasCat && catapults.length > 0) {
    const s = catapults[0]
    units.push(buildFreeUnit(s.class, s.level, side, 0, 3, undefined, s.catapultPath))
  }
  let slot = 0
  for (const s of ranged) {
    if (hasCat && slot === 3) slot++
    units.push(buildFreeUnit(s.class, s.level, side, 1, slot++, s.magePath, undefined, undefined))
  }
  return units
}
