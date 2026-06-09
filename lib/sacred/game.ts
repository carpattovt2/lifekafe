import type {
  GameUnit, Side, Row, UnitClass, Buff, BuffType,
  ActionKey, ActionDef, LogEntry, BattleState, BattleAction, Phase,
  ArmyCounts, BattleEvent, WarriorLevelData, ArcherLevelData, MagePath, MageLevelData,
  CatapultPath, CatapultLevelData, WarriorPath,
} from './types'
import { WARRIOR_LEVELS, WARRIOR_PATHS, ARCHER_LEVELS, MAGE_BASE, MAGE_PATHS, CATAPULT_BASE, CATAPULT_PATHS } from './types'

// ── Unit templates ─────────────────────────────────────────────────────────────
type Template = Omit<GameUnit, 'id' | 'side' | 'row' | 'slot' | 'name' | 'buffs' | 'hasActed' | 'level' | 'xp' | 'xpToNext'>

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
    class: 'catapult', hp: 120, maxHp: 120,
    minDmg: 22, maxDmg: 24, accuracy: 0.75, defense: 0,
    initiative: 20, morale: 50,
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
  const base: GameUnit = {
    ...TEMPLATES[cls], maxHp: TEMPLATES[cls].hp, id: uid(), side, row, slot, hasActed: false, buffs: [], name,
    fireRes: 0, waterRes: 0, earthRes: 0, airRes: 0,
  }
  if (cls === 'warrior')  return { ...base, level: 1, xp: 0, xpToNext: WARRIOR_LEVELS[1].xpToNext }
  if (cls === 'archer')   return { ...base, level: 1, xp: 0, xpToNext: ARCHER_LEVELS[1].xpToNext }
  if (cls === 'mage')     return { ...base, level: 1, xp: 0, xpToNext: MAGE_BASE.xpToNext }
  if (cls === 'catapult') return { ...base, level: 1, xp: 0, xpToNext: CATAPULT_BASE.xpToNext }
  return base
}

// ── Warrior level-up helpers ───────────────────────────────────────────────────
function applyWarriorPath(unit: GameUnit, path: WarriorPath, newLevel: number): GameUnit {
  const data: WarriorLevelData = newLevel <= 2 ? WARRIOR_LEVELS[newLevel] : WARRIOR_PATHS[path][newLevel]
  if (!data) return unit
  const hpPct = unit.hp / unit.maxHp
  return {
    ...unit,
    // lv1-2 are path-agnostic; only lock in the path at lv3+
    ...(newLevel >= 3 ? { warriorPath: path } : {}),
    level: newLevel, xp: 0,
    xpToNext: data.xpToNext === Infinity ? Infinity : data.xpToNext,
    maxHp: data.hp, hp: Math.max(1, Math.round(hpPct * data.hp)),
    minDmg: data.minDmg, maxDmg: data.maxDmg,
    accuracy: data.accuracy, defense: data.defense,
    evasion: data.evasion, initiative: data.initiative,
    critChance: data.critChance, critMult: data.critMult,
    morale: data.morale,
    counter: newLevel >= 3 && path === 'champion' ? 0.20 : 0,
  }
}

function grantWarriorXp(
  unit: GameUnit, amount: number,
  newLogs: LogEntry[], newEvents: BattleEvent[],
  cap?: number,
): { unit: GameUnit; pendingChoice: boolean } {
  if (unit.class !== 'warrior' || amount <= 0) return { unit, pendingChoice: false }
  const curLevel = unit.level ?? 1
  const maxLevel = unit.warriorPath === 'champion' ? 5 : 4
  if (curLevel >= maxLevel) return { unit, pendingChoice: false }
  if (cap !== undefined && curLevel >= cap) return { unit: { ...unit, xp: (unit.xp ?? 0) + amount }, pendingChoice: false }
  const newXp = (unit.xp ?? 0) + amount
  if (newXp >= (unit.xpToNext ?? Infinity)) {
    if (curLevel === 2 && !unit.warriorPath) {
      // Needs path choice before leveling
      return { unit: { ...unit, xp: newXp }, pendingChoice: true }
    }
    const path = unit.warriorPath ?? 'paladin'
    const nextLevel = curLevel + 1
    const leveled = applyWarriorPath({ ...unit, xp: newXp }, path, nextLevel)
    const levelName = WARRIOR_PATHS[path][nextLevel]?.name ?? ''
    newLogs.push(log(`⭐ ${unit.name} — рівень ${nextLevel} (${levelName})!`, 'buff'))
    newEvents.push(ev(unit.id, `⭐ Рівень ${nextLevel}!`, 'buff'))
    return { unit: leveled, pendingChoice: false }
  }
  return { unit: { ...unit, xp: newXp }, pendingChoice: false }
}

// ── Archer level-up helper ─────────────────────────────────────────────────────
function applyArcherLevel(unit: GameUnit, newLevel: number): GameUnit {
  const data: ArcherLevelData = ARCHER_LEVELS[newLevel]
  if (!data) return unit
  const hpPct = unit.hp / unit.maxHp
  return {
    ...unit,
    level: newLevel, xp: 0,
    xpToNext: data.xpToNext === Infinity ? Infinity : data.xpToNext,
    maxHp: data.hp, hp: Math.max(1, Math.round(hpPct * data.hp)),
    minDmg: data.minDmg, maxDmg: data.maxDmg,
    accuracy: data.accuracy, defense: data.defense,
    evasion: data.evasion, initiative: data.initiative,
    critChance: data.critChance, critMult: data.critMult,
    morale: data.morale,
  }
}

function grantArcherXp(
  unit: GameUnit, amount: number,
  newLogs: LogEntry[], newEvents: BattleEvent[],
  cap?: number,
): GameUnit {
  if (unit.class !== 'archer' || amount <= 0) return unit
  const curLevel = unit.level ?? 1
  if (curLevel >= 3) return unit  // maxed
  if (cap !== undefined && curLevel >= cap) return { ...unit, xp: (unit.xp ?? 0) + amount }
  const newXp = (unit.xp ?? 0) + amount
  if (newXp >= (unit.xpToNext ?? Infinity)) {
    const nextLevel = curLevel + 1
    const leveled = applyArcherLevel({ ...unit, xp: newXp }, nextLevel)
    newLogs.push(log(`⭐ ${unit.name} — рівень ${nextLevel} (${ARCHER_LEVELS[nextLevel].name})!`, 'buff'))
    newEvents.push(ev(unit.id, `⭐ Рівень ${nextLevel}!`, 'buff'))
    return leveled
  }
  return { ...unit, xp: newXp }
}

// ── Mage level-up helpers ──────────────────────────────────────────────────────
function applyMagePath(unit: GameUnit, path: MagePath, newLevel: number): GameUnit {
  const data: MageLevelData = MAGE_PATHS[path][newLevel]
  if (!data) return unit
  const hpPct = unit.hp / unit.maxHp
  return {
    ...unit,
    magePath: path, level: newLevel, xp: 0,
    xpToNext: data.xpToNext === Infinity ? Infinity : data.xpToNext,
    maxHp: data.hp, hp: Math.max(1, Math.round(hpPct * data.hp)),
    minDmg: data.minDmg, maxDmg: data.maxDmg,
    accuracy: data.accuracy, defense: data.defense,
    evasion: data.evasion, initiative: data.initiative,
    critChance: data.critChance, critMult: data.critMult,
    morale: data.morale,
  }
}

function applyMageLevel(unit: GameUnit, newLevel: number): GameUnit {
  const path = unit.magePath!
  return applyMagePath(unit, path, newLevel)
}

function grantMageXp(
  unit: GameUnit, amount: number,
  newLogs: LogEntry[], newEvents: BattleEvent[],
  cap?: number,
): { unit: GameUnit; pendingChoice: boolean } {
  if (unit.class !== 'mage' || amount <= 0) return { unit, pendingChoice: false }
  const curLevel = unit.level ?? 1
  const maxLevel = 5
  if (curLevel >= maxLevel) return { unit, pendingChoice: false }
  if (cap !== undefined && curLevel >= cap) return { unit: { ...unit, xp: (unit.xp ?? 0) + amount }, pendingChoice: false }
  const newXp = (unit.xp ?? 0) + amount
  if (newXp >= (unit.xpToNext ?? Infinity)) {
    if (curLevel === 1) {
      // Don't auto-level: signal that player needs to choose a path
      return { unit: { ...unit, xp: newXp }, pendingChoice: true }
    }
    const nextLevel = curLevel + 1
    const leveled = applyMageLevel({ ...unit, xp: newXp }, nextLevel)
    newLogs.push(log(`⭐ ${unit.name} — рівень ${nextLevel} (${MAGE_PATHS[unit.magePath!][nextLevel].name})!`, 'buff'))
    newEvents.push(ev(unit.id, `⭐ Рівень ${nextLevel}!`, 'buff'))
    return { unit: leveled, pendingChoice: false }
  }
  return { unit: { ...unit, xp: newXp }, pendingChoice: false }
}

// ── Catapult level-up helpers ──────────────────────────────────────────────────
function applyCatapultPath(unit: GameUnit, path: CatapultPath, newLevel: number): GameUnit {
  const data: CatapultLevelData = CATAPULT_PATHS[path][newLevel]
  if (!data) return unit
  const hpPct = unit.hp / unit.maxHp
  return {
    ...unit,
    catapultPath: path, level: newLevel, xp: 0,
    xpToNext: data.xpToNext === Infinity ? Infinity : data.xpToNext,
    maxHp: data.hp, hp: Math.max(1, Math.round(hpPct * data.hp)),
    minDmg: data.minDmg, maxDmg: data.maxDmg,
    accuracy: data.accuracy, defense: data.defense,
    evasion: data.evasion, initiative: data.initiative,
    critChance: data.critChance, critMult: data.critMult,
    morale: data.morale,
  }
}

function grantCatapultXp(
  unit: GameUnit, amount: number,
  newLogs: LogEntry[], newEvents: BattleEvent[],
  cap?: number,
): { unit: GameUnit; pendingChoice: boolean } {
  if (unit.class !== 'catapult' || amount <= 0) return { unit, pendingChoice: false }
  const curLevel = unit.level ?? 1
  if (curLevel >= 3) return { unit, pendingChoice: false }
  if (cap !== undefined && curLevel >= cap) return { unit: { ...unit, xp: (unit.xp ?? 0) + amount }, pendingChoice: false }
  const newXp = (unit.xp ?? 0) + amount
  if (newXp >= (unit.xpToNext ?? Infinity)) {
    if (curLevel === 1) {
      return { unit: { ...unit, xp: newXp }, pendingChoice: true }
    }
    const nextLevel = curLevel + 1
    const leveled = applyCatapultPath({ ...unit, xp: newXp }, unit.catapultPath!, nextLevel)
    newLogs.push(log(`⭐ ${unit.name} — рівень ${nextLevel} (${CATAPULT_PATHS[unit.catapultPath!][nextLevel].name})!`, 'buff'))
    newEvents.push(ev(unit.id, `⭐ Рівень ${nextLevel}!`, 'buff'))
    return { unit: leveled, pendingChoice: false }
  }
  return { unit: { ...unit, xp: newXp }, pendingChoice: false }
}

// ── Army builders ──────────────────────────────────────────────────────────────
export function buildCustomArmy(counts: ArmyCounts, side: Side): GameUnit[] {
  const units: GameUnit[] = []
  const hasCat = (counts.catapults ?? 0) > 0
  for (let i = 0; i < counts.warriors; i++) units.push(makeUnit('warrior', side, 0, i))
  if (hasCat) units.push(makeUnit('catapult', side, 0, 3))
  // row 1: archers then mages, skip slot 3 if catapult occupies it
  let s = 0
  for (let i = 0; i < counts.archers; i++) { if (hasCat && s === 3) s++; units.push(makeUnit('archer', side, 1, s++)) }
  for (let i = 0; i < counts.mages;   i++) { if (hasCat && s === 3) s++; units.push(makeUnit('mage',   side, 1, s++)) }
  return units
}

export function generateRecruitOptions(existingUnits: GameUnit[]): GameUnit[] {
  const hasCat = existingUnits.some(u => u.class === 'catapult')
  const wc = existingUnits.filter(u => u.class === 'warrior').length
  const ac = existingUnits.filter(u => u.class === 'archer').length
  const mc = existingUnits.filter(u => u.class === 'mage').length
  const maxW  = hasCat ? 3 : 4
  const maxR1 = hasCat ? 3 : 4
  const r1Count = existingUnits.filter(u => u.row === 1).length
  const avail: UnitClass[] = []
  if (wc < maxW) avail.push('warrior')
  if (ac < 4 && r1Count < maxR1) avail.push('archer')
  if (mc < 4 && r1Count < maxR1) avail.push('mage')
  if (!avail.length) return []
  const shuffled = [...avail].sort(() => Math.random() - 0.5)
  const pick = (cls: UnitClass) => makeUnit(cls, 'player', cls === 'warrior' ? 0 : 1, 99)
  return shuffled.length === 1
    ? [pick(shuffled[0]), pick(shuffled[0])]
    : [pick(shuffled[0]), pick(shuffled[1])]
}

export function addUnitToArmy(units: GameUnit[], cls: UnitClass): GameUnit[] {
  const hasCat = units.some(u => u.class === 'catapult')
  if (cls === 'catapult') {
    if (hasCat || units.some(u => u.row === 0 && u.slot === 3)) return units
    return [...units, makeUnit(cls, 'player', 0, 3)]
  }
  const row: Row = cls === 'warrior' ? 0 : 1
  const occupied = new Set(units.filter(u => u.row === row).map(u => u.slot))
  for (let slot = 0; slot <= 3; slot++) {
    if (hasCat && slot === 3) continue // slot 3 blocked in both rows when catapult present
    if (!occupied.has(slot)) return [...units, makeUnit(cls, 'player', row, slot)]
  }
  return units
}

export function addUnitAtSlot(units: GameUnit[], cls: UnitClass, row: number, slot: number): GameUnit[] {
  const targetRow: Row = cls === 'catapult' ? 0 : row as Row
  return [...units, makeUnit(cls, 'player', targetRow, slot)]
}

export function buildDefaultAIArmy(): GameUnit[] {
  return buildCustomArmy({ warriors: 2, archers: 1, mages: 1, catapults: 1 }, 'ai')
}

const MAGE_ELEMENTS: MagePath[] = ['fire', 'water', 'earth', 'air']
const CATAPULT_PATHS_LIST: CatapultPath[] = ['ballista', 'trebuchet']

export function buildLeveledArmy(counts: ArmyCounts, level: number, side: Side): GameUnit[] {
  const units: GameUnit[] = []
  const hasCat = (counts.catapults ?? 0) > 0
  for (let i = 0; i < counts.warriors; i++) {
    const wPath: WarriorPath = i % 2 === 0 ? 'paladin' : 'champion'
    const wLvl = Math.min(level, wPath === 'champion' ? 5 : 4)
    units.push(buildFreeUnit('warrior', wLvl, side, 0, i, undefined, undefined, level >= 3 ? wPath : undefined))
  }
  if (hasCat) {
    const cPath = CATAPULT_PATHS_LIST[0]
    units.push(buildFreeUnit('catapult', Math.min(level, 3), side, 0, 3, undefined, level >= 2 ? cPath : undefined))
  }
  let s = 0
  let mageIdx = 0
  for (let i = 0; i < counts.archers; i++) {
    if (hasCat && s === 3) s++
    units.push(buildFreeUnit('archer', Math.min(level, 3), side, 1, s++))
  }
  for (let i = 0; i < counts.mages; i++) {
    if (hasCat && s === 3) s++
    const mPath = MAGE_ELEMENTS[mageIdx++ % MAGE_ELEMENTS.length]
    units.push(buildFreeUnit('mage', Math.min(level, 5), side, 1, s++, level >= 2 ? mPath : undefined))
  }
  return units
}

export function buildFreeUnit(
  cls: UnitClass, level: number, side: Side, row: Row, slot: number,
  magePath?: MagePath, catapultPath?: CatapultPath, warriorPath?: WarriorPath,
): GameUnit {
  let unit = makeUnit(cls, side, row, slot)
  if (cls === 'warrior') {
    const wPath = warriorPath ?? 'paladin'
    if (level >= 2) unit = applyWarriorPath(unit, wPath, level)
  } else if (cls === 'archer') {
    for (let l = 2; l <= level; l++) unit = applyArcherLevel(unit, l)
  } else if (cls === 'mage' && level >= 2 && magePath) {
    unit = applyMagePath(unit, magePath, level)
  } else if (cls === 'catapult' && level >= 2 && catapultPath) {
    unit = applyCatapultPath(unit, catapultPath, level)
  }
  return unit
}

// ── Initiative queue ───────────────────────────────────────────────────────────
function buildQueue(units: GameUnit[]): string[] {
  return [...units.filter(u => u.hp > 0)]
    .sort((a, b) => {
      const effInit = (u: GameUnit) => {
        const base = u.initiative
          + u.buffs.filter(b => b.type === 'initiative_up').reduce((s, b) => s + b.value, 0)
          - u.buffs.filter(b => b.type === 'initiative_down').reduce((s, b) => s + b.value, 0)
        return u.hp < u.maxHp * 0.2 ? base * 0.5 : base
      }
      return effInit(b) - effInit(a) + (Math.random() - 0.5) * 0.1
    })
    .map(u => u.id)
}

// ── Buff helpers ───────────────────────────────────────────────────────────────
let _bid = 0
function makeBuff(type: BuffType, value: number, turnsLeft: number, actionKey?: ActionKey): Buff {
  return { id: `b${++_bid}`, type, value, turnsLeft, ...(actionKey ? { actionKey } : {}) }
}

function getBuffValue(unit: GameUnit, type: BuffType): number {
  return unit.buffs.filter(b => b.type === type).reduce((s, b) => s + b.value, 0)
}

function tickBuffs(unit: GameUnit): GameUnit {
  // poison ticks at START of the poisoned unit's turn (handled in advanceQueue), not here
  return {
    ...unit,
    buffs: unit.buffs
      .map(b => b.type === 'poison' ? b : { ...b, turnsLeft: b.turnsLeft - 1 })
      .filter(b => b.turnsLeft > 0),
  }
}

// ── Front-line protection ──────────────────────────────────────────────────────
function frontLineBonus(def: GameUnit, units: GameUnit[]): number {
  if (def.row === 0) return 0
  const frontWarriors = units.filter(u => u.side === def.side && u.hp > 0 && u.row === 0 && u.class === 'warrior')
  if (!frontWarriors.length) return 0
  const maxLvl = Math.max(...frontWarriors.map(u => u.level ?? 1))
  return maxLvl >= 4 ? 0.30 : maxLvl >= 3 ? 0.25 : 0.20
}

// ── Adjacent units (row ±1, slot ±1) ──────────────────────────────────────────
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

function getElemResist(def: GameUnit, path: MagePath | undefined): number {
  if (!path) return 0
  const r = { fire: def.fireRes, water: def.waterRes, earth: def.earthRes, air: def.airRes }
  return r[path] ?? 0
}

interface AttackResult {
  hit: boolean; evaded: boolean; crit: boolean; damage: number; thornsDmg?: number
  logs: LogEntry[]; events: BattleEvent[]
}

function resolveAttack(
  atk: GameUnit, def: GameUnit, units: GameUnit[],
  opts: { dmgMult?: number; accBonus?: number; ignoreEvasion?: boolean; elemPath?: MagePath; critChance?: number; critMult?: number; dmgMin?: number; dmgMax?: number } = {},
): AttackResult {
  let { dmgMult = 1, accBonus = 0, ignoreEvasion = false, elemPath } = opts
  const logs: LogEntry[] = []
  const events: BattleEvent[] = []

  let effectiveCritChance = opts.critChance ?? atk.critChance
  let effectiveCritMult   = opts.critMult   ?? atk.critMult

  // Aimed buff: accuracy bonus only (crit removed from aim)
  const aimedBuff = atk.buffs.find(b => b.type === 'aimed')
  if (aimedBuff) {
    accBonus += aimedBuff.value
  }

  // Morale buff: +1% acc/eva per 10 morale points
  const moraleAccBonus = getBuffValue(atk, 'morale_up') * 0.001
  const moraleEvaBonus = getBuffValue(def, 'morale_up') * 0.001
  // Accuracy down debuff on attacker / accuracy up buff
  const accDownPenalty = getBuffValue(atk, 'accuracy_down')
  const accUpBonus = getBuffValue(atk, 'accuracy_up')

  const acc = Math.min(0.97, atk.accuracy + accBonus + moraleAccBonus + accUpBonus - accDownPenalty)
  if (Math.random() > acc) {
    logs.push(log(`${atk.name} промахується!`, 'miss'))
    events.push(ev(atk.id, 'Промах!', 'miss'))
    events.push(ev(def.id, '', 'miss', atk.id))
    return { hit: false, evaded: false, crit: false, damage: 0, logs, events }
  }

  // Ranger passive: +10% evasion if sole survivor in row 1
  let rangerEvaBonus = 0
  if (def.class === 'archer' && (def.level ?? 1) >= 3 && def.row === 1) {
    const aloneInRow = units.filter(u => u.side === def.side && u.hp > 0 && u.row === 1).length === 1
    if (aloneInRow) rangerEvaBonus = 0.10
  }

  // Wind shield evasion buff
  const windShieldBonus = getBuffValue(def, 'wind_shield')

  const woundedEvaMult = def.hp < def.maxHp * 0.2 ? 0.5 : 1
  if (!ignoreEvasion && Math.random() < (def.evasion + moraleEvaBonus + rangerEvaBonus + windShieldBonus) * woundedEvaMult) {
    logs.push(log(`${def.name} ухиляється!`, 'evade'))
    events.push(ev(def.id, 'Ухил!', 'evade', atk.id))
    return { hit: true, evaded: true, crit: false, damage: 0, logs, events }
  }

  const rawMin = opts.dmgMin ?? atk.minDmg
  const rawMax = opts.dmgMax ?? atk.maxDmg
  let dmg = (rawMin + Math.random() * (rawMax - rawMin)) * dmgMult

  const isCrit = Math.random() < effectiveCritChance
  if (isCrit) dmg *= effectiveCritMult

  const fortressBonus = getBuffValue(def, 'fortress_buff')
  const defTotal = Math.max(0, def.defense + getBuffValue(def, 'defense_up') + getBuffValue(def, 'fortress_buff') + frontLineBonus(def, units))
  dmg *= (1 - defTotal)
  dmg *= (1 + getBuffValue(def, 'armor_break'))  // armor break amplifies damage
  // Elemental resistance
  if (elemPath) dmg *= (1 - getElemResist(def, elemPath))
  if (atk.hp < atk.maxHp * 0.2) dmg *= 0.5
  dmg = Math.max(1, Math.round(dmg))

  if (isCrit) {
    logs.push(log(`💥 КРИТ! ${atk.name} → ${def.name}: ${dmg} урону`, 'crit'))
    events.push(ev(def.id, `💥 ${dmg}`, 'crit', atk.id))
  } else {
    logs.push(log(`${atk.name} атакує ${def.name}: ${dmg} урону`, 'attack'))
    events.push(ev(def.id, `${dmg}`, 'damage', atk.id))
  }

  // Thorns: reflect damage to attacker
  const thornsDmg = def.buffs.filter(b => b.type === 'thorns').reduce((s, b) => s + b.value, 0)
  if (thornsDmg > 0 && dmg > 0) {
    logs.push(log(`🌿 Тернії! ${atk.name} отримує ${thornsDmg} урону у відповідь`, 'attack'))
    events.push(ev(atk.id, `🌿 ${thornsDmg}`, 'damage', def.id))
    // Note: thorn damage is returned in the result so caller can apply it
  }

  return { hit: true, evaded: false, crit: isCrit, damage: dmg, thornsDmg, logs, events }
}

// ── Valid targets ──────────────────────────────────────────────────────────────
export function getValidTargets(actor: GameUnit, action: ActionKey, units: GameUnit[]): string[] {
  const living = (s: Side) => units.filter(u => u.hp > 0 && u.side === s)
  const enemySide: Side = actor.side === 'player' ? 'ai' : 'player'

  if (action === 'strike' || action === 'sacred_strike' || action === 'shkvall') {
    for (const r of [0, 1] as Row[]) {
      const row = living(enemySide).filter(u => u.row === r)
      if (!row.length) continue
      const reachable = row.filter(u => Math.abs(u.slot - actor.slot) <= 1)
      const targets = reachable.length
        ? reachable
        : [row.slice().sort((a, b) => Math.abs(a.slot - actor.slot) - Math.abs(b.slot - actor.slot))[0]]
      return targets.map(u => u.id)
    }
    return []
  }

  if (['shot', 'poison_shot', 'double_shot', 'magic_bolt', 'fireball', 'fire_orb', 'ignite', 'frost_bolt', 'rock_throw', 'lightning_bolt', 'gust', 'hurricane', 'barrage', 'grapeshot', 'ballista_shot', 'twin_bolt', 'trebuchet_volley', 'plague_volley', 'freeze'].includes(action)) {
    const all = living(enemySide)
    const taunted = all.filter(u => u.buffs.some(b => b.type === 'taunt'))
    return taunted.length ? taunted.map(u => u.id) : all.map(u => u.id)
  }

  if (['consecration', 'ice_shield', 'stone_skin', 'fortress_aura'].includes(action)) {
    return living(actor.side).map(u => u.id)
  }

  return []
}

// ── Execute one action ─────────────────────────────────────────────────────────
export function executeAction(
  state: BattleState, actor: GameUnit, action: ActionKey, targetId: string | null,
  secondTargetId?: string | null,
): { units: GameUnit[]; newLogs: LogEntry[]; newEvents: BattleEvent[]; pendingWarriorLevelUp?: string; pendingMageLevelUp?: string; pendingCatapultLevelUp?: string } {
  let units = state.units.map(u => ({ ...u }))
  const newLogs: LogEntry[] = []
  const newEvents: BattleEvent[] = []
  let pendingMageLevelUp: string | undefined
  let pendingWarriorLevelUp: string | undefined

  const prevUnitMap = new Map(state.units.map(u => [u.id, u]))
  const getUnit = (id: string) => units.find(u => u.id === id)!
  const update  = (u: GameUnit) => { units = units.map(x => x.id === u.id ? u : x) }
  const target  = targetId ? getUnit(targetId) : null
  const enemySide: Side = actor.side === 'player' ? 'ai' : 'player'

  let hitLanded = false

  switch (action) {

    case 'strike': {
      if (!target) break
      const res = resolveAttack(actor, target, units)
      newLogs.push(...res.logs)
      newEvents.push(...res.events)
      if (res.damage > 0) {
        update({ ...target, hp: Math.max(0, target.hp - res.damage) })
        if (getUnit(target.id).hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
      }
      if (res.thornsDmg && res.thornsDmg > 0) {
        const atker = getUnit(actor.id)
        update({ ...atker, hp: Math.max(0, atker.hp - res.thornsDmg) })
        if (getUnit(actor.id).hp === 0) newLogs.push(log(`☠ ${actor.name} гине від терній!`, 'death'))
      }
      if (res.hit && !res.evaded) hitLanded = true
      break
    }

    case 'sacred_strike': {
      if (!target) break
      const res = resolveAttack(actor, target, units)
      newLogs.push(...res.logs)
      newEvents.push(...res.events)
      if (res.damage > 0) {
        update({ ...target, hp: Math.max(0, target.hp - res.damage) })
        if (getUnit(target.id).hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
      }
      if (res.hit && !res.evaded) {
        const tgt = getUnit(target.id)
        if (tgt.hp > 0) {
          update({ ...tgt, buffs: [...tgt.buffs, makeBuff('armor_break', 0.10, 1)] })
          newLogs.push(log(`⚔ Священний удар! ${target.name} -10% броні на 1 хід`, 'debuff'))
          newEvents.push(ev(target.id, '⚔ -10% броня', 'debuff', actor.id))
        }
        hitLanded = true
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

    case 'battle_cry': {
      const allies = units.filter(u => u.side === actor.side && u.hp > 0)
      for (const ally of allies) {
        const a = getUnit(ally.id)
        update({ ...a, buffs: [...a.buffs, makeBuff('morale_up', 15, 2)] })
      }
      newLogs.push(log(`📯 ${actor.name} — Бойовий клич! Усі союзники +15 моралі (2 ходи)`, 'buff'))
      newEvents.push(ev(actor.id, '📯 Бойовий клич', 'buff'))
      break
    }

    case 'consecration': {
      if (!target) break
      const tgt = getUnit(target.id)
      const healed = Math.min(tgt.maxHp, tgt.hp + 25)
      const amt = healed - tgt.hp
      update({ ...tgt, hp: healed })
      newLogs.push(log(`✨ ${actor.name} — Освячення! ${target.name} +${amt} HP`, 'heal'))
      newEvents.push(ev(target.id, `✨ +${amt}`, 'heal', actor.id))
      break
    }

    case 'shkvall': {
      if (!target) break
      if (actor.buffs.some(b => b.type === 'cooldown' && b.actionKey === 'shkvall')) break
      // First hit
      const res1 = resolveAttack(actor, target, units)
      newLogs.push(...res1.logs)
      newEvents.push(...res1.events)
      if (res1.damage > 0) {
        update({ ...target, hp: Math.max(0, target.hp - res1.damage) })
        if (getUnit(target.id).hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
      }
      if (res1.hit && !res1.evaded) hitLanded = true
      // Second hit (only if target still alive)
      const tgt2 = getUnit(target.id)
      if (tgt2.hp > 0) {
        const res2 = resolveAttack(actor, tgt2, units)
        newLogs.push(...res2.logs)
        newEvents.push(...res2.events)
        if (res2.damage > 0) {
          update({ ...tgt2, hp: Math.max(0, tgt2.hp - res2.damage) })
          if (getUnit(target.id).hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
        }
        if (res2.hit && !res2.evaded) hitLanded = true
      }
      newLogs.push(log(`⚡⚡ ${actor.name} — Шквал! Подвійний удар (перезарядка 3 ходи)`, 'attack'))
      newEvents.push(ev(actor.id, '⚡⚡ Шквал!', 'buff'))
      const actorAfter = getUnit(actor.id)
      update({ ...actorAfter, buffs: [...actorAfter.buffs, makeBuff('cooldown', 0, 3, 'shkvall')] })
      break
    }

    case 'provoke': {
      const a = getUnit(actor.id)
      update({ ...a, buffs: [...a.buffs, makeBuff('taunt', 1, 2), makeBuff('defense_up', 0.20, 2)] })
      newLogs.push(log(`🗣 ${actor.name} — Провокація! Вороги переднього ряду б'ють тільки його, +20% броні на 1 хід`, 'buff'))
      newEvents.push(ev(actor.id, '🗣 Провокація!', 'buff'))
      break
    }

    case 'aim': {
      const a = getUnit(actor.id)
      const accBonus = Math.round(a.accuracy * 0.5 * 100) / 100
      const initBonus = Math.round(a.initiative * 0.5)
      update({ ...a, buffs: [...a.buffs, makeBuff('aimed', accBonus, 4), makeBuff('initiative_up', initBonus, 4)] })
      newLogs.push(log(`🎯 ${actor.name} прицілюється (+${Math.round(accBonus * 100)}% точн., +${initBonus} ініціативи на 3 ходи)`, 'buff'))
      newEvents.push(ev(actor.id, `🎯 Прицілення`, 'buff'))
      break
    }

    case 'shot': {
      if (!target) break
      const archerLvl = actor.level ?? 1
      const shotCrit = (actor.class === 'archer' && archerLvl >= 3) ? { critChance: 0.33, critMult: 2.0 } : {}
      const res = resolveAttack(actor, target, units, shotCrit)
      newLogs.push(...res.logs)
      newEvents.push(...res.events)
      if (res.damage > 0) {
        update({ ...target, hp: Math.max(0, target.hp - res.damage) })
        if (getUnit(target.id).hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
      }
      if (res.hit && !res.evaded) {
        hitLanded = true
        // Passive poison (lv2+): 25% chance
        if (actor.class === 'archer' && archerLvl >= 2) {
          const tgt = getUnit(target.id)
          if (tgt.hp > 0 && !tgt.buffs.some(b => b.type === 'poison') && Math.random() < 0.25) {
            const poisonDmg = 10 + Math.round(Math.random() * 5)
            update({ ...tgt, buffs: [...tgt.buffs, makeBuff('poison', poisonDmg, 3)] })
            newLogs.push(log(`🧪 ${target.name} отруєний! ${poisonDmg} урону/хід на 3 ходи`, 'debuff'))
            newEvents.push(ev(target.id, '🧪 Отрута!', 'debuff', actor.id))
          }
        }
      }
      break
    }

    case 'poison_shot': {
      if (!target) break
      const alreadyPoisoned = target.buffs.some(b => b.type === 'poison')
      newLogs.push(log(`🧪 ${actor.name} — Отруєна стріла!`, 'attack'))
      const res = resolveAttack(actor, target, units)
      newLogs.push(...res.logs)
      newEvents.push(...res.events)
      if (res.damage > 0) {
        update({ ...getUnit(target.id), hp: Math.max(0, getUnit(target.id).hp - res.damage) })
        if (getUnit(target.id).hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
      }
      if (res.hit && !res.evaded) {
        hitLanded = true
        if (!alreadyPoisoned) {
          const tgt = getUnit(target.id)
          if (tgt.hp > 0) {
            update({ ...tgt, buffs: [...tgt.buffs, makeBuff('poison', 4, 3)] })
            newLogs.push(log(`🧪 ${target.name} отруєний! 4 урону/хід на 3 ходи`, 'debuff'))
            newEvents.push(ev(target.id, '🧪 Отрута!', 'debuff', actor.id))
          }
        } else {
          newLogs.push(log(`${target.name} вже отруєний — ефект не стакується`, 'info'))
        }
      }
      break
    }

    case 'double_shot': {
      if (actor.buffs.some(b => b.type === 'cooldown' && b.actionKey === 'double_shot')) break
      if (!target) break
      newLogs.push(log(`🏹🏹 ${actor.name} — Подвійний постріл!`, 'attack'))
      // First arrow — 75% damage, no passives
      const res1 = resolveAttack(actor, target, units, { dmgMult: 0.75 })
      newLogs.push(...res1.logs)
      newEvents.push(...res1.events)
      if (res1.damage > 0) {
        update({ ...getUnit(target.id), hp: Math.max(0, getUnit(target.id).hp - res1.damage) })
        if (getUnit(target.id).hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
      }
      if (res1.hit && !res1.evaded) hitLanded = true
      // Second arrow — 75% damage, -15% accuracy, no passives
      const tgt2 = getUnit(target.id)
      if (tgt2.hp > 0) {
        const res2 = resolveAttack(actor, tgt2, units, { dmgMult: 0.75, accBonus: -0.15 })
        newLogs.push(...res2.logs)
        newEvents.push(...res2.events)
        if (res2.damage > 0) {
          update({ ...tgt2, hp: Math.max(0, tgt2.hp - res2.damage) })
          if (getUnit(target.id).hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
        }
        if (res2.hit && !res2.evaded) hitLanded = true
      }
      const actorAfterShot = getUnit(actor.id)
      update({ ...actorAfterShot, buffs: [...actorAfterShot.buffs, makeBuff('cooldown', 0, 2, 'double_shot')] })
      break
    }

    case 'magic_bolt': {
      if (!target) break
      newLogs.push(log(`✨ ${actor.name} — Магічний болт!`, 'attack'))
      const res = resolveAttack(actor, target, units)
      newLogs.push(...res.logs); newEvents.push(...res.events)
      if (res.damage > 0) {
        update({ ...target, hp: Math.max(0, target.hp - res.damage) })
        if (getUnit(target.id).hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
      }
      if (res.hit && !res.evaded) hitLanded = true
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
          update({ ...enemy, hp: Math.max(0, enemy.hp - res.damage) })
          if (getUnit(enemy.id).hp === 0) newLogs.push(log(`☠ ${enemy.name} гине!`, 'death'))
        }
        if (res.hit && !res.evaded) hitLanded = true
      }
      break
    }

    case 'fireball': {
      if (!target) break
      const fireLvl = actor.level ?? 2
      const fireDmg = actor.minDmg // fixed per level in stats
      newLogs.push(log(`🔥 ${actor.name} — Фаєрбол!`, 'attack'))
      const res = resolveAttack(actor, target, units, { accBonus: 0.75 - actor.accuracy, elemPath: 'fire' })
      newLogs.push(...res.logs); newEvents.push(...res.events)
      if (res.damage > 0) {
        update({ ...target, hp: Math.max(0, target.hp - res.damage) })
        if (getUnit(target.id).hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
      }
      if (res.hit && !res.evaded) {
        hitLanded = true
        // Passive burn: 25% chance, 3 turns, 15% of fireball dmg per tick
        const tgt = getUnit(target.id)
        if (tgt.hp > 0 && !tgt.buffs.some(b => b.type === 'burning') && Math.random() < 0.25) {
          const burnDmg = Math.max(1, Math.round(fireDmg * 0.15))
          update({ ...tgt, buffs: [...tgt.buffs, makeBuff('burning', burnDmg, 4)] })
          newLogs.push(log(`🔥 ${target.name} палає! ${burnDmg} урону/хід на 3 ходи`, 'debuff'))
          newEvents.push(ev(target.id, `🔥 Підпал`, 'debuff', actor.id))
        }
      }
      break
    }

    case 'fire_orb': {
      if (!target) break
      const orbDmg = actor.minDmg
      newLogs.push(log(`🔥 ${actor.name} — Вогняний шар!`, 'attack'))
      const res = resolveAttack(actor, target, units, { accBonus: 0.80 - actor.accuracy, elemPath: 'fire' })
      newLogs.push(...res.logs); newEvents.push(...res.events)
      if (res.damage > 0) {
        update({ ...target, hp: Math.max(0, target.hp - res.damage) })
        if (getUnit(target.id).hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
      }
      if (res.hit && !res.evaded) {
        hitLanded = true
        for (const adjSnap of getAdjacentEnemies(target, units, enemySide)) {
          const adj = getUnit(adjSnap.id)
          if (adj.hp === 0) continue
          const splashRes = resolveAttack(actor, adj, units, { dmgMult: 0.5, accBonus: 0.80 - actor.accuracy, elemPath: 'fire' })
          newLogs.push(...splashRes.logs); newEvents.push(...splashRes.events)
          if (splashRes.damage > 0) {
            update({ ...adj, hp: Math.max(0, adj.hp - splashRes.damage) })
            if (getUnit(adj.id).hp === 0) newLogs.push(log(`☠ ${adj.name} гине!`, 'death'))
          }
        }
      }
      break
    }

    case 'armageddon': {
      if (actor.buffs.some(b => b.type === 'cooldown' && b.actionKey === 'armageddon')) break
      const allEnemies = units.filter(u => u.side === enemySide && u.hp > 0)
      if (!allEnemies.length) break
      newLogs.push(log(`💥 ${actor.name} — Армагедон!`, 'attack'))
      for (const snap of allEnemies) {
        const e = getUnit(snap.id)
        if (e.hp === 0) continue
        const res = resolveAttack(actor, e, units, { accBonus: 0.90 - actor.accuracy, dmgMin: 40, dmgMax: 45, elemPath: 'fire' })
        newLogs.push(...res.logs); newEvents.push(...res.events)
        if (res.damage > 0) {
          update({ ...e, hp: Math.max(0, e.hp - res.damage) })
          if (getUnit(e.id).hp === 0) newLogs.push(log(`☠ ${e.name} гине!`, 'death'))
        }
        if (res.hit && !res.evaded) hitLanded = true
      }
      const actorNow = getUnit(actor.id)
      update({ ...actorNow, buffs: [...actorNow.buffs, makeBuff('cooldown', 0, 4, 'armageddon')] })
      break
    }

    case 'barrage': {
      if (!target) break
      const res = resolveAttack(actor, target, units)
      newLogs.push(...res.logs)
      newEvents.push(...res.events)
      if (res.damage > 0) {
        update({ ...target, hp: Math.max(0, target.hp - res.damage) })
        if (getUnit(target.id).hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
      }
      if (res.hit && !res.evaded) {
        for (const adjSnap of getAdjacentEnemies(target, units, enemySide)) {
          const adj = getUnit(adjSnap.id)
          if (adj.hp === 0) continue
          const splashRes = resolveAttack(actor, adj, units, {
            dmgMult: 0.25 + Math.random() * 0.25,
            accBonus: Math.max(0, 1 - actor.accuracy),
          })
          newLogs.push(...splashRes.logs)
          newEvents.push(...splashRes.events)
          if (splashRes.damage > 0) {
            update({ ...adj, hp: Math.max(0, adj.hp - splashRes.damage) })
            if (getUnit(adj.id).hp === 0) newLogs.push(log(`☠ ${adj.name} гине!`, 'death'))
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
          update({ ...t, hp: Math.max(0, t.hp - res.damage) })
          if (getUnit(t.id).hp === 0) newLogs.push(log(`☠ ${t.name} гине!`, 'death'))
        }
      }
      break
    }

    case 'ballista_shot': {
      if (!target) break
      newLogs.push(log(`🏹 ${actor.name} — Прицільний постріл!`, 'attack'))
      const res = resolveAttack(actor, target, units)
      newLogs.push(...res.logs); newEvents.push(...res.events)
      if (res.damage > 0) {
        update({ ...target, hp: Math.max(0, target.hp - res.damage) })
        if (getUnit(target.id).hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
      }
      if (res.hit && !res.evaded) hitLanded = true
      break
    }

    case 'twin_bolt': {
      if (!target) break
      // secondTargetId comes from the caller (reducer pendingFirstTarget flow)
      const twinTargetId = secondTargetId ?? target.id
      newLogs.push(log(`⚡ ${actor.name} — Подвійний болт!`, 'attack'))
      for (const tid of [target.id, twinTargetId]) {
        const tgt = getUnit(tid)
        if (tgt.hp === 0) continue
        const res = resolveAttack(actor, tgt, units)
        newLogs.push(...res.logs); newEvents.push(...res.events)
        if (res.damage > 0) {
          update({ ...tgt, hp: Math.max(0, tgt.hp - res.damage) })
          if (getUnit(tgt.id).hp === 0) newLogs.push(log(`☠ ${tgt.name} гине!`, 'death'))
        }
        if (res.hit && !res.evaded) hitLanded = true
      }
      break
    }

    case 'trebuchet_volley': {
      if (!target) break
      const splashAcc = 0.75
      newLogs.push(log(`💥 ${actor.name} — Залп Требюше!`, 'attack'))
      const res = resolveAttack(actor, target, units)
      newLogs.push(...res.logs); newEvents.push(...res.events)
      if (res.damage > 0) {
        update({ ...target, hp: Math.max(0, target.hp - res.damage) })
        if (getUnit(target.id).hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
      }
      if (res.hit && !res.evaded) {
        hitLanded = true
        for (const adjSnap of getAdjacentEnemies(target, units, enemySide)) {
          const adj = getUnit(adjSnap.id)
          if (adj.hp === 0) continue
          const adjRes = resolveAttack(actor, adj, units, { dmgMult: 0.60, accBonus: splashAcc - actor.accuracy })
          newLogs.push(...adjRes.logs); newEvents.push(...adjRes.events)
          if (adjRes.damage > 0) {
            update({ ...adj, hp: Math.max(0, adj.hp - adjRes.damage) })
            if (getUnit(adj.id).hp === 0) newLogs.push(log(`☠ ${adj.name} гине!`, 'death'))
          }
        }
      }
      break
    }

    case 'plague_volley': {
      if (!target) break
      const splashAcc2 = 0.80
      const poisonChance = 0.60
      const poisonDmg = 15
      newLogs.push(log(`☠ ${actor.name} — Чумний залп!`, 'attack'))
      const res = resolveAttack(actor, target, units)
      newLogs.push(...res.logs); newEvents.push(...res.events)
      if (res.damage > 0) {
        update({ ...target, hp: Math.max(0, target.hp - res.damage) })
        if (getUnit(target.id).hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
      }
      if (res.hit && !res.evaded) {
        hitLanded = true
        const tgt = getUnit(target.id)
        if (tgt.hp > 0 && !tgt.buffs.some(b => b.type === 'poison') && Math.random() < poisonChance) {
          update({ ...tgt, buffs: [...tgt.buffs, makeBuff('poison', poisonDmg, 3)] })
          newLogs.push(log(`🧪 ${target.name} отруєний! ${poisonDmg} урону/хід на 3 ходи`, 'debuff'))
          newEvents.push(ev(target.id, '🧪 Отрута!', 'debuff', actor.id))
        }
        for (const adjSnap of getAdjacentEnemies(target, units, enemySide)) {
          const adj = getUnit(adjSnap.id)
          if (adj.hp === 0) continue
          const adjRes = resolveAttack(actor, adj, units, { dmgMult: 0.60, accBonus: splashAcc2 - actor.accuracy })
          newLogs.push(...adjRes.logs); newEvents.push(...adjRes.events)
          if (adjRes.damage > 0) {
            update({ ...adj, hp: Math.max(0, adj.hp - adjRes.damage) })
            if (getUnit(adj.id).hp === 0) newLogs.push(log(`☠ ${adj.name} гине!`, 'death'))
          }
          if (adjRes.hit && !adjRes.evaded) {
            const adjNow = getUnit(adj.id)
            if (adjNow.hp > 0 && !adjNow.buffs.some(b => b.type === 'poison') && Math.random() < poisonChance) {
              update({ ...adjNow, buffs: [...adjNow.buffs, makeBuff('poison', poisonDmg, 3)] })
              newLogs.push(log(`🧪 ${adj.name} отруєний!`, 'debuff'))
              newEvents.push(ev(adj.id, '🧪 Отрута!', 'debuff', actor.id))
            }
          }
        }
      }
      break
    }

    // ── Mage fire path (handled above as 'fireball', 'fire_orb', 'armageddon') ──

    // ── Mage water path ───────────────────────────────────────────────────────
    case 'freeze': {
      if (!target) break
      const lvl = actor.level ?? 2
      const acc = lvl >= 4 ? 0.80 : 0.75
      const dur = lvl >= 4 ? 2 : 1
      newLogs.push(log(`❄ ${actor.name} — Заморожування!`, 'attack'))
      const res = resolveAttack(actor, target, units, {
        accBonus: acc - actor.accuracy,
        dmgMin: 0, dmgMax: 0,
        ignoreEvasion: false,
        elemPath: 'water',
      })
      if (!res.hit) { newLogs.push(...res.logs); newEvents.push(...res.events); break }
      if (res.evaded) { newLogs.push(...res.logs); newEvents.push(...res.events); break }
      hitLanded = true
      const tgt = getUnit(target.id)
      if (tgt.hp > 0) {
        if (tgt.buffs.some(b => b.type === 'frozen')) {
          newLogs.push(log(`❄ ${target.name} вже заморожений!`, 'info'))
        } else {
          update({ ...tgt, buffs: [...tgt.buffs, makeBuff('frozen', 1, dur + 1)] })
          newLogs.push(log(`❄ ${target.name} заморожений на ${dur} хід${dur > 1 ? 'и' : ''}!`, 'debuff'))
          newEvents.push(ev(target.id, `❄ Заморожено!`, 'debuff', actor.id))
        }
      }
      break
    }

    case 'blizzard': {
      if (actor.buffs.some(b => b.type === 'cooldown' && b.actionKey === 'blizzard')) break
      const enemies = units.filter(u => u.side === enemySide && u.hp > 0)
      if (!enemies.length) break
      newLogs.push(log(`❄ ${actor.name} — Пурга!`, 'attack'))
      hitLanded = true
      for (const snap of enemies) {
        const e = getUnit(snap.id)
        if (e.hp === 0) continue
        if (Math.random() < 0.35) {
          if (!e.buffs.some(b => b.type === 'frozen')) {
            const dur = 1 + Math.floor(Math.random() * 3)
            update({ ...e, buffs: [...e.buffs, makeBuff('frozen', 1, dur + 1)] })
            newLogs.push(log(`❄ ${e.name} заморожений на ${dur} хід${dur > 1 ? 'и' : ''}!`, 'debuff'))
            newEvents.push(ev(e.id, `❄ Заморожено!`, 'debuff', actor.id))
          }
        }
      }
      const actorAfterBlizzard = getUnit(actor.id)
      update({ ...actorAfterBlizzard, buffs: [...actorAfterBlizzard.buffs, makeBuff('cooldown', 0, 4, 'blizzard')] })
      break
    }

    case 'frost_bolt': break
    case 'ice_shield': break
    case 'tidal_heal': break

    // ── Mage earth path ───────────────────────────────────────────────────────
    case 'rock_throw': {
      if (!target) break
      const lvl = actor.level ?? 2
      const flatDmg = lvl >= 5 ? 25 : lvl >= 4 ? 22 : lvl >= 3 ? 18 : 15
      const passiveChance = lvl >= 5 ? 0.70 : lvl >= 3 ? 0.65 : 0.60
      const accDownVal = lvl >= 5 ? 0.15 : lvl >= 4 ? 0.10 : lvl >= 3 ? 0.07 : 0.05
      newLogs.push(log(`🪨 ${actor.name} — Кидок каменю!`, 'attack'))
      const res = resolveAttack(actor, target, units, {
        accBonus: 0.80 - actor.accuracy,
        dmgMin: flatDmg, dmgMax: flatDmg,
        ignoreEvasion: true,
        elemPath: 'earth',
      })
      newLogs.push(...res.logs); newEvents.push(...res.events)
      if (res.damage > 0) {
        update({ ...target, hp: Math.max(0, target.hp - res.damage) })
        if (getUnit(target.id).hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
      }
      if (res.hit) {
        hitLanded = true
        const tgt = getUnit(target.id)
        if (tgt.hp > 0 && Math.random() < passiveChance) {
          update({ ...tgt, buffs: [...tgt.buffs, makeBuff('accuracy_down', accDownVal, 3)] })
          newLogs.push(log(`🪨 ${target.name} дезорієнтований! -${Math.round(accDownVal*100)}% точн. на 3 ходи`, 'debuff'))
          newEvents.push(ev(target.id, `🪨 -${Math.round(accDownVal*100)}% точн.`, 'debuff', actor.id))
        }
      }
      break
    }

    case 'stone_skin': {
      if (!target) break
      const tgtSnap = getUnit(target.id)
      if (tgtSnap.buffs.some(b => b.type === 'defense_up' && b.actionKey === 'stone_skin')) {
        newLogs.push(log(`🪨 ${target.name} вже під захистом кам'яної шкіри!`, 'info'))
        break
      }
      const lvl = actor.level ?? 3
      const defBonus = lvl >= 5 ? 0.40 : lvl >= 4 ? 0.30 : 0.25
      update({ ...tgtSnap, buffs: [...tgtSnap.buffs, makeBuff('defense_up', defBonus, 2, 'stone_skin')] })
      newLogs.push(log(`🪨 ${actor.name} — Кам'яна шкіра на ${target.name}! +${Math.round(defBonus*100)}% захист на 2 ходи`, 'buff'))
      newEvents.push(ev(target.id, `🪨 +${Math.round(defBonus*100)}% захист`, 'buff', actor.id))
      break
    }

    case 'earthquake': {
      if (actor.buffs.some(b => b.type === 'cooldown' && b.actionKey === 'earthquake')) break
      const enemies = units.filter(u => u.side === enemySide && u.hp > 0)
      if (!enemies.length) break
      newLogs.push(log(`🪨 ${actor.name} — Землетрус!`, 'attack'))
      hitLanded = true
      for (const snap of enemies) {
        const e = getUnit(snap.id)
        if (e.hp === 0) continue
        const flatDmg = Math.floor(25 + Math.random() * 11)
        update({ ...e, hp: Math.max(0, e.hp - flatDmg) })
        newLogs.push(log(`🪨 ${e.name} -${flatDmg} урону`, 'attack'))
        newEvents.push(ev(e.id, `🪨 -${flatDmg}`, 'damage', actor.id))
        if (getUnit(e.id).hp === 0) newLogs.push(log(`☠ ${e.name} гине!`, 'death'))
        if (Math.random() < 0.70) {
          const eNow = getUnit(e.id)
          if (eNow.hp > 0) {
            const accDown = 0.50
            const dur = 2 + Math.floor(Math.random() * 3)
            update({ ...eNow, buffs: [...eNow.buffs, makeBuff('accuracy_down', accDown, dur)] })
            newLogs.push(log(`🪨 ${e.name} дезорієнтований! -${Math.round(accDown*100)}% точн. на ${dur} хід${dur === 1 ? '' : 'и'}`, 'debuff'))
            newEvents.push(ev(e.id, `🪨 -${Math.round(accDown*100)}% точн.`, 'debuff', actor.id))
          }
        }
      }
      const actorAfterEq = getUnit(actor.id)
      update({ ...actorAfterEq, buffs: [...actorAfterEq.buffs, makeBuff('cooldown', 0, 5, 'earthquake')] })
      break
    }

    case 'fortress_aura': {
      if (actor.buffs.some(b => b.type === 'cooldown' && b.actionKey === 'fortress_aura')) break
      const allies = units.filter(u => u.side === actor.side && u.hp > 0)
      newLogs.push(log(`🪨 ${actor.name} — Фортеця! Кожен союзник отримує +33% захист`, 'buff'))
      for (const snap of allies) {
        const a = getUnit(snap.id)
        const dur = 1 + Math.floor(Math.random() * 3)
        update({ ...a, buffs: [...a.buffs, makeBuff('fortress_buff', 0.33, dur)] })
      }
      newEvents.push(ev(actor.id, '🪨 Фортеця!', 'buff'))
      const actorAfterFort = getUnit(actor.id)
      update({ ...actorAfterFort, buffs: [...actorAfterFort.buffs, makeBuff('cooldown', 0, 5, 'fortress_aura')] })
      break
    }

    // ── Mage air path ─────────────────────────────────────────────────────────
    case 'lightning_bolt': {
      if (!target) break
      const lvl = actor.level ?? 2
      const mult = lvl >= 4 ? 3 : lvl >= 3 ? 2.5 : 2
      const chainCount = lvl >= 4 ? 2 : lvl >= 3 ? 1 : 0
      newLogs.push(log(`⚡ ${actor.name} — Блискавка!`, 'attack'))
      const res = resolveAttack(actor, target, units, { dmgMult: mult, elemPath: 'air' })
      newLogs.push(...res.logs); newEvents.push(...res.events)
      if (res.damage > 0) {
        update({ ...target, hp: Math.max(0, target.hp - res.damage) })
        if (getUnit(target.id).hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
      }
      if (res.hit && !res.evaded) hitLanded = true
      // Chain to extra targets
      if (chainCount > 0 && res.hit && !res.evaded) {
        const extras = units
          .filter(u => u.side === enemySide && u.hp > 0 && u.id !== target.id)
          .sort(() => Math.random() - 0.5)
          .slice(0, chainCount)
        for (const snap of extras) {
          const e = getUnit(snap.id)
          if (e.hp === 0) continue
          const chainRes = resolveAttack(actor, e, units, { dmgMult: mult * 0.6, elemPath: 'air' })
          newLogs.push(...chainRes.logs); newEvents.push(...chainRes.events)
          if (chainRes.damage > 0) {
            update({ ...e, hp: Math.max(0, e.hp - chainRes.damage) })
            if (getUnit(e.id).hp === 0) newLogs.push(log(`☠ ${e.name} гине!`, 'death'))
          }
        }
      }
      break
    }

    case 'gust': {
      if (!target) break
      const lvl = actor.level ?? 2
      const dmgByLvl: Record<number, number> = { 2: 15, 3: 17, 4: 21, 5: 25 }
      const accByLvl: Record<number, number>  = { 2: 0.85, 3: 0.85, 4: 0.85, 5: 0.90 }
      const redPctByLvl: Record<number, number> = { 2: 0.40, 3: 0.50, 4: 0.60, 5: 0.70 }
      const chanceByLvl: Record<number, number> = { 2: 0.50, 3: 0.50, 4: 0.50, 5: 0.60 }
      const durByLvl: Record<number, number>    = { 2: 3, 3: 4, 4: 4, 5: 5 }
      const fixedDmg = dmgByLvl[lvl] ?? 15
      const accTarget = accByLvl[lvl] ?? 0.85
      const redPct = redPctByLvl[lvl] ?? 0.40
      const chance = chanceByLvl[lvl] ?? 0.50
      const dur = durByLvl[lvl] ?? 3
      newLogs.push(log(`💨 ${actor.name} — Порив вітру!`, 'attack'))
      const res = resolveAttack(actor, target, units, { accBonus: accTarget - actor.accuracy, dmgMin: fixedDmg, dmgMax: fixedDmg })
      newLogs.push(...res.logs); newEvents.push(...res.events)
      if (res.damage > 0) {
        update({ ...target, hp: Math.max(0, target.hp - res.damage) })
        if (getUnit(target.id).hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
      }
      if (res.hit && !res.evaded) {
        hitLanded = true
        const tgt = getUnit(target.id)
        if (tgt.hp > 0 && !tgt.buffs.some(b => b.type === 'initiative_down') && Math.random() < chance) {
          const initRed = Math.round(tgt.initiative * redPct)
          update({ ...tgt, buffs: [...tgt.buffs, makeBuff('initiative_down', initRed, dur)] })
          newLogs.push(log(`💨 ${target.name} сповільнений! -${Math.round(redPct*100)}% ініціативи на ${dur} ходи`, 'debuff'))
          newEvents.push(ev(target.id, `💨 -${Math.round(redPct*100)}% ініц.`, 'debuff', actor.id))
        }
      }
      break
    }

    case 'tailwind': {
      if (actor.buffs.some(b => b.type === 'cooldown' && b.actionKey === 'tailwind')) break
      const lvl = actor.level ?? 3
      const initPct = lvl >= 5 ? 0.35 : lvl >= 4 ? 0.30 : 0.25
      const accBonus2 = lvl >= 5 ? 0.15 : lvl >= 4 ? 0.12 : 0.10
      const dur2 = lvl >= 5 ? 3 : 2
      const allies = units.filter(u => u.side === actor.side && u.hp > 0)
      newLogs.push(log(`💨 ${actor.name} — Попутний вітер! Всі союзники +${Math.round(initPct*100)}% ініц., +${Math.round(accBonus2*100)}% точн. на ${dur2} ходи`, 'buff'))
      newEvents.push(ev(actor.id, `💨 Попутний вітер!`, 'buff'))
      for (const snap of allies) {
        const a = getUnit(snap.id)
        const initBonus2 = Math.round(a.initiative * initPct)
        update({ ...a, buffs: [...a.buffs, makeBuff('initiative_up', initBonus2, dur2), makeBuff('accuracy_up', accBonus2, dur2)] })
      }
      const actorAfterTail = getUnit(actor.id)
      update({ ...actorAfterTail, buffs: [...actorAfterTail.buffs, makeBuff('cooldown', 0, 4, 'tailwind')] })
      break
    }

    case 'thunder_storm': {
      const enemies = units.filter(u => u.side === enemySide && u.hp > 0)
      if (!enemies.length) break
      newLogs.push(log(`⚡ ${actor.name} — Гроза!`, 'attack'))
      for (const snap of enemies) {
        const e = getUnit(snap.id)
        if (e.hp === 0) continue
        const res = resolveAttack(actor, e, units, { dmgMult: 2, elemPath: 'air' })
        newLogs.push(...res.logs); newEvents.push(...res.events)
        if (res.damage > 0) {
          update({ ...e, hp: Math.max(0, e.hp - res.damage) })
          if (getUnit(e.id).hp === 0) newLogs.push(log(`☠ ${e.name} гине!`, 'death'))
        }
        if (res.hit && !res.evaded) hitLanded = true
      }
      break
    }

    case 'hurricane': {
      if (!target) break
      if (actor.buffs.some(b => b.type === 'cooldown' && b.actionKey === 'hurricane')) break
      newLogs.push(log(`🌪 ${actor.name} — Ураган!`, 'attack'))
      const res = resolveAttack(actor, target, units, { accBonus: 0.85 - actor.accuracy, dmgMin: 30, dmgMax: 40, elemPath: 'air' })
      newLogs.push(...res.logs); newEvents.push(...res.events)
      if (res.damage > 0) {
        update({ ...target, hp: Math.max(0, target.hp - res.damage) })
        if (getUnit(target.id).hp === 0) newLogs.push(log(`☠ ${target.name} гине!`, 'death'))
      }
      if (res.hit && !res.evaded) {
        hitLanded = true
        const tgt = getUnit(target.id)
        if (tgt.hp > 0) {
          update({ ...tgt, buffs: [...tgt.buffs, makeBuff('accuracy_down', 1.0, 2)] })
          newLogs.push(log(`⚡ ${target.name} — Громова дезорієнтація! -100% точності на 2 ходи`, 'debuff'))
          newEvents.push(ev(target.id, '⚡ Дезорієнтація!', 'debuff', actor.id))
        }
        for (const adjSnap of getAdjacentEnemies(target, units, enemySide)) {
          const adj = getUnit(adjSnap.id)
          if (adj.hp === 0) continue
          const adjRes = resolveAttack(actor, adj, units, { dmgMult: 0.5, accBonus: 0.85 - actor.accuracy, dmgMin: 30, dmgMax: 40, elemPath: 'air' })
          newLogs.push(...adjRes.logs); newEvents.push(...adjRes.events)
          if (adjRes.damage > 0) {
            update({ ...adj, hp: Math.max(0, adj.hp - adjRes.damage) })
            if (getUnit(adj.id).hp === 0) newLogs.push(log(`☠ ${adj.name} гине!`, 'death'))
          }
        }
      }
      const actorNow = getUnit(actor.id)
      update({ ...actorNow, buffs: [...actorNow.buffs, makeBuff('cooldown', 0, 4, 'hurricane')] })
      break
    }
  }

  // ── Counter-attack passive (champion warrior) ──────────────────────────────
  if (targetId) {
    const prevTarget = prevUnitMap.get(targetId)
    const currTarget = getUnit(targetId)
    const frontRowAlive = units.filter(u => u.side === currTarget?.side && u.row === 0 && u.hp > 0).length > 0
    const eligibleToCounter = !!currTarget && (currTarget.row === 0 || !frontRowAlive)
    if (prevTarget && currTarget && prevTarget.hp > currTarget.hp && currTarget.hp > 0 && currTarget.counter > 0 && eligibleToCounter && Math.random() < currTarget.counter) {
      const actorNow = getUnit(actor.id)
      if (actorNow.hp > 0) {
        const rawDmg = Math.round((currTarget.minDmg + currTarget.maxDmg) / 2 * 0.5)
        const finalDmg = Math.max(1, Math.round(rawDmg * (1 - actorNow.defense)))
        update({ ...actorNow, hp: Math.max(0, actorNow.hp - finalDmg) })
        newLogs.push(log(`⚡ ${currTarget.name} — Контратака! ${actorNow.name} -${finalDmg}`, 'attack'))
        newEvents.push(ev(actor.id, `⚡ Контратака -${finalDmg}`, 'damage', currTarget.id))
        if (getUnit(actor.id).hp === 0) newLogs.push(log(`☠ ${actorNow.name} гине від контратаки!`, 'death'))
      }
    }
  }

  // ── XP: per kill (+50) and per hit (+10) ──────────────────────────────────
  let pendingCatapultLevelUp: string | undefined
  if (actor.class === 'warrior' || actor.class === 'archer' || actor.class === 'mage' || actor.class === 'catapult') {
    const kills = units.filter(u => {
      const prev = prevUnitMap.get(u.id)
      return prev && prev.hp > 0 && u.hp === 0 && u.side !== actor.side
    }).length
    const xpGain = kills * 50 + (hitLanded ? 10 : 0)
    if (xpGain > 0) {
      const fresh = getUnit(actor.id)
      const cap = state.fortressLevelCap
      if (actor.class === 'warrior') {
        const { unit: updatedWarrior, pendingChoice } = grantWarriorXp(fresh, xpGain, newLogs, newEvents, cap)
        update(updatedWarrior)
        if (pendingChoice) {
          newLogs.push(log(`⭐ ${fresh.name} готовий до вибору шляху!`, 'buff'))
          newEvents.push(ev(fresh.id, '⭐ Вибір шляху!', 'buff'))
          pendingWarriorLevelUp = fresh.id
        }
      } else if (actor.class === 'archer') update(grantArcherXp(fresh, xpGain, newLogs, newEvents, cap))
      else if (actor.class === 'mage') {
        const { unit: updatedMage, pendingChoice } = grantMageXp(fresh, xpGain, newLogs, newEvents, cap)
        update(updatedMage)
        if (pendingChoice) {
          newLogs.push(log(`⭐ ${fresh.name} готовий до вибору шляху!`, 'buff'))
          newEvents.push(ev(fresh.id, '⭐ Вибір шляху!', 'buff'))
          pendingMageLevelUp = fresh.id
        }
      } else {
        const { unit: updatedCat, pendingChoice } = grantCatapultXp(fresh, xpGain, newLogs, newEvents, cap)
        update(updatedCat)
        if (pendingChoice) {
          newLogs.push(log(`⭐ ${fresh.name} готова до еволюції!`, 'buff'))
          newEvents.push(ev(fresh.id, '⭐ Еволюція!', 'buff'))
          pendingCatapultLevelUp = fresh.id
        }
      }
    }
  }

  return { units, newLogs, newEvents, pendingWarriorLevelUp, pendingMageLevelUp, pendingCatapultLevelUp }
}

// ── AI decision ────────────────────────────────────────────────────────────────
function aiDecide(actor: GameUnit, state: BattleState): { action: ActionKey; targetId: string | null; secondTargetId?: string | null } {
  const playerUnits = state.units.filter(u => u.hp > 0 && u.side === 'player')
  const aiAllies    = state.units.filter(u => u.hp > 0 && u.side === 'ai' && u.id !== actor.id)
  const weakest     = [...playerUnits].sort((a, b) => a.hp - b.hp)[0]
  const strongest   = [...playerUnits].sort((a, b) => b.hp - a.hp)[0]

  if (actor.class === 'warrior') {
    const lvl = actor.level ?? 1
    const wPath = actor.warriorPath

    // Champion path AI
    if (wPath === 'champion') {
      const onCooldown = actor.buffs.some(b => b.type === 'cooldown' && b.actionKey === 'shkvall')
      if (lvl >= 5 && !onCooldown && Math.random() < 0.65) {
        const strikeTargets = getValidTargets(actor, 'shkvall', state.units)
        const t = state.units.filter(u => strikeTargets.includes(u.id) && u.hp > 0).sort((a, b) => a.hp - b.hp)[0]
        if (t) return { action: 'shkvall', targetId: t.id }
      }
      const strikeTgts = getValidTargets(actor, 'strike', state.units)
      const t = state.units.filter(u => strikeTgts.includes(u.id) && u.hp > 0).sort((a, b) => a.hp - b.hp)[0]
      return { action: 'strike', targetId: t?.id ?? null }
    }

    if (lvl >= 4) {
      // Consecration: heal/cleanse hurt ally
      const needsHelp = aiAllies.filter(a =>
        a.hp < a.maxHp * 0.55 || a.buffs.some(b => b.type === 'armor_break')
      ).sort((a, b) => a.hp - b.hp)[0]
      if (needsHelp && Math.random() < 0.40) return { action: 'consecration', targetId: needsHelp.id }
    }

    if (lvl >= 3) {
      // Battle Cry: use if allies don't already have morale buff
      const allyCried = aiAllies.some(u => u.buffs.some(b => b.type === 'morale_up'))
      if (!allyCried && Math.random() < 0.35) return { action: 'battle_cry', targetId: null }
    }

    if (lvl >= 2) {
      // Provoke: use if not already taunting and player has front-row units
      const alreadyTaunting = actor.buffs.some(b => b.type === 'taunt')
      const playerFront = playerUnits.filter(u => u.row === 0)
      if (!alreadyTaunting && playerFront.length > 0 && Math.random() < 0.30) {
        return { action: 'provoke', targetId: null }
      }
    }

    if (actor.hp < actor.maxHp * 0.35 && Math.random() < 0.50) return { action: 'shield', targetId: null }
    const strikeAction: ActionKey = lvl >= 4 && wPath === 'paladin' ? 'sacred_strike' : 'strike'
    const validIds = getValidTargets(actor, strikeAction, state.units)
    const validUnits = state.units.filter(u => validIds.includes(u.id) && u.hp > 0)
    const target = validUnits.sort((a, b) => a.hp - b.hp)[0]
    return { action: strikeAction, targetId: target?.id ?? null }
  }

  if (actor.class === 'archer') {
    const lvl = actor.level ?? 1
    const hasAimed = actor.buffs.some(b => b.type === 'aimed')

    if (lvl >= 3 && playerUnits.length > 0 && !actor.buffs.some(b => b.type === 'cooldown' && b.actionKey === 'double_shot') && Math.random() < 0.40) {
      return { action: 'double_shot', targetId: weakest?.id ?? null }
    }
    if (lvl >= 2) {
      const unpoisoned = playerUnits.filter(u => !u.buffs.some(b => b.type === 'poison'))
      if (unpoisoned.length > 0 && Math.random() < 0.35) {
        const bigTarget = unpoisoned.sort((a, b) => b.hp - a.hp)[0]
        return { action: 'poison_shot', targetId: bigTarget.id }
      }
    }
    if (!hasAimed && playerUnits.length > 0 && Math.random() < 0.30) return { action: 'aim', targetId: null }
    return { action: 'shot', targetId: weakest?.id ?? null }
  }

  if (actor.class === 'mage') {
    const path = actor.magePath
    const lvl = actor.level ?? 1
    if (!path || lvl === 1) {
      return { action: 'magic_bolt', targetId: weakest?.id ?? null }
    }
    const actions = getMainActions('mage', lvl, path)
    const onCooldown = (a: ActionKey) => actor.buffs.some(b => b.type === 'cooldown' && b.actionKey === a)

    // Water mage: dedicated logic
    if (path === 'water') {
      const canBlizzard = actions.includes('blizzard') && !onCooldown('blizzard')
      if (canBlizzard && playerUnits.length >= 2 && Math.random() < 0.60) {
        return { action: 'blizzard', targetId: null }
      }
      const notFrozen = playerUnits.filter(u => !u.buffs.some(b => b.type === 'frozen'))
      const freezeTarget = notFrozen.sort((a, b) => b.initiative - a.initiative)[0] ?? weakest
      return { action: 'freeze', targetId: freezeTarget?.id ?? playerUnits[0]?.id ?? null }
    }

    // Earth mage: dedicated logic
    if (path === 'earth') {
      const canEarthquake = actions.includes('earthquake') && !onCooldown('earthquake')
      const canFortress   = actions.includes('fortress_aura') && !onCooldown('fortress_aura')
      const canStoneSkin  = actions.includes('stone_skin')
      if (canEarthquake && playerUnits.length >= 2 && Math.random() < 0.65) {
        return { action: 'earthquake', targetId: null }
      }
      if (canFortress && Math.random() < 0.40) {
        const allyNeedsHelp = [...aiAllies, actor].some(u => u.hp < u.maxHp * 0.70)
        if (allyNeedsHelp) return { action: 'fortress_aura', targetId: actor.id }
      }
      if (canStoneSkin && Math.random() < 0.35) {
        const unbuffedAlly = [...aiAllies, actor]
          .filter(u => !u.buffs.some(b => b.type === 'defense_up' && b.actionKey === 'stone_skin'))
          .sort((a, b) => a.hp - b.hp)[0]
        if (unbuffedAlly) return { action: 'stone_skin', targetId: unbuffedAlly.id }
      }
      return { action: 'rock_throw', targetId: weakest?.id ?? playerUnits[0]?.id ?? null }
    }

    // Air mage: dedicated logic
    if (path === 'air') {
      if (actions.includes('hurricane') && !onCooldown('hurricane') && weakest && Math.random() < 0.70) {
        return { action: 'hurricane', targetId: weakest.id }
      }
      if (actions.includes('tailwind') && !onCooldown('tailwind') && Math.random() < 0.50) {
        return { action: 'tailwind', targetId: null }
      }
      return { action: 'gust', targetId: weakest?.id ?? playerUnits[0]?.id ?? null }
    }

    const aoEActions = ['armageddon', 'blizzard', 'earthquake', 'thunder_storm', 'fire_orb']
    const singleActions = ['fireball', 'frost_bolt', 'rock_throw', 'gust']
    const supportActions = ['ice_shield', 'stone_skin', 'tidal_heal', 'fortress_aura']
    const hasAoE = actions.some(a => aoEActions.includes(a) && !onCooldown(a))
    const hasSingle = actions.some(a => singleActions.includes(a))
    const hasSupport = actions.some(a => supportActions.includes(a))

    // Prefer AoE when multiple enemies
    if (hasAoE && playerUnits.length >= 2 && Math.random() < 0.55) {
      const aoA = actions.find(a => aoEActions.includes(a) && !onCooldown(a))!
      return { action: aoA, targetId: null }
    }
    // Support when allies need help
    if (hasSupport && Math.random() < 0.35) {
      const suppA = actions.find(a => ['ice_shield', 'stone_skin', 'fortress_aura'].includes(a))
      if (suppA) {
        const needsHelp = [...aiAllies, actor].filter(u => u.hp < u.maxHp * 0.65).sort((a, b) => a.hp - b.hp)[0]
        if (needsHelp) return { action: suppA, targetId: needsHelp.id }
      }
      if (actions.includes('tidal_heal') && aiAllies.some(u => u.hp < u.maxHp * 0.5)) return { action: 'tidal_heal', targetId: null }
    }
    // Single target
    if (hasSingle && weakest) {
      const singA = actions.find(a => singleActions.includes(a))!
      return { action: singA, targetId: weakest.id }
    }
    // Fallback
    return { action: actions[0], targetId: playerUnits.length ? weakest?.id ?? null : null }
  }

  if (actor.class === 'catapult') {
    if (!playerUnits.length) return { action: 'barrage', targetId: null }
    const path = actor.catapultPath
    const lvl = actor.level ?? 1

    if (path === 'ballista') {
      if (lvl >= 3) {
        const t1 = weakest
        const t2 = playerUnits.find(u => u.id !== t1?.id) ?? t1
        return { action: 'twin_bolt', targetId: t1?.id ?? null, secondTargetId: t2?.id ?? null }
      }
      return { action: 'ballista_shot', targetId: weakest?.id ?? null }
    }

    if (path === 'trebuchet') {
      const bestTarget = [...playerUnits].sort((a, b) =>
        getAdjacentEnemies(b, state.units, actor.side as Side).length -
        getAdjacentEnemies(a, state.units, actor.side as Side).length
      )[0]
      return { action: lvl >= 3 ? 'plague_volley' : 'trebuchet_volley', targetId: bestTarget?.id ?? weakest?.id ?? null }
    }

    // lv1: original logic
    const rowCounts = ([0, 1] as Row[]).map(r => ({
      row: r, units: playerUnits.filter(u => u.row === r),
    }))
    const densest = rowCounts.filter(r => r.units.length > 0).sort((a, b) => b.units.length - a.units.length)[0]
    if (densest && densest.units.length >= 2 && Math.random() < 0.55) {
      const t = densest.units[Math.floor(Math.random() * densest.units.length)]
      return { action: 'grapeshot', targetId: t.id }
    }
    const scored = playerUnits.map(e => ({
      id: e.id,
      score: playerUnits.filter(o => o.id !== e.id && Math.abs(o.row - e.row) <= 1 && Math.abs(o.slot - e.slot) <= 1).length,
    }))
    return { action: 'barrage', targetId: scored.reduce((a, b) => a.score >= b.score ? a : b).id }
  }

  return { action: 'strike', targetId: weakest?.id ?? null }
}

// ── Action definitions ─────────────────────────────────────────────────────────
export const ACTIONS: Record<ActionKey, ActionDef> = {
  strike:          { key: 'strike',          label: 'Удар',              desc: 'Ближній бій — сусідні слоти',              needsTarget: true,  targetSide: 'ai'   },
  shield:          { key: 'shield',          label: 'Щит',               desc: '+50% броні цей хід',                       needsTarget: false, targetSide: null   },
  battle_cry:      { key: 'battle_cry',      label: 'Бойовий клич',      desc: '+15 моралі всім союзникам на 2 ходи',      needsTarget: false, targetSide: null   },
  sacred_strike:   { key: 'sacred_strike',   label: 'Священний удар',    desc: 'Удар + -10% броні цілі на 1 хід',          needsTarget: true,  targetSide: 'ai'   },
  consecration:    { key: 'consecration',    label: 'Освячення',         desc: '+25 HP союзнику',                           needsTarget: true,  targetSide: 'ally' },
  provoke:         { key: 'provoke',         label: 'Провокація',        desc: 'Вороги переднього ряду б\'ють тільки тебе + +20% броні на 1 хід', needsTarget: false, targetSide: null },
  shkvall:         { key: 'shkvall',         label: 'Шквал',             desc: 'Подвійний удар по одній цілі. Перезарядка 3 ходи.',               needsTarget: true,  targetSide: 'ai'  },
  shot:            { key: 'shot',            label: 'Постріл',           desc: 'Атака будь-якого ворога. Lv2+: 25% отруєння. Lv3: 33% крит ×2', needsTarget: true,  targetSide: 'ai'   },
  aim:             { key: 'aim',             label: 'Прицілення',        desc: '+50% точності та +50% ініціативи на 3 власних ходи', needsTarget: false, targetSide: null   },
  poison_shot:     { key: 'poison_shot',     label: 'Отруєна стріла',    desc: 'Постріл + 4 урону/хід на 3 ходи',          needsTarget: true,  targetSide: 'ai'   },
  double_shot:     { key: 'double_shot',     label: 'Подвійний постріл', desc: '2 стріли по 75% урону, друга -15% точн. Кд 2 ходи.',  needsTarget: true,  targetSide: 'ai'   },
  magic_bolt:      { key: 'magic_bolt',      label: 'Магічний болт',     desc: 'Магічна атака по одній цілі (тип: Сила)', needsTarget: true,  targetSide: 'ai'   },
  chain_lightning: { key: 'chain_lightning', label: 'Ланцюгова молнія',  desc: 'Б\'є всіх ворогів одночасно',              needsTarget: false, targetSide: null   },
  fireball:        { key: 'fireball',        label: 'Фаєрбол',           desc: 'Вогняна атака, 25% підпал на 3 ходи',     needsTarget: true,  targetSide: 'ai'   },
  fire_orb:        { key: 'fire_orb',        label: 'Вогняний шар',      desc: 'Вогняна атака + 50% урону сусідам',       needsTarget: true,  targetSide: 'ai'   },
  armageddon:      { key: 'armageddon',      label: 'Армагедон',         desc: '40-45 урон по всіх ворогах (90% точн., кд 4 ходи)', needsTarget: false, targetSide: null },
  ignite:          { key: 'ignite',          label: 'Підпал',            desc: 'Удар + підпал (X урону/хід N ходів)',      needsTarget: true,  targetSide: 'ai'   },
  inferno:         { key: 'inferno',         label: 'Інферно',           desc: 'Фаєрбол ×4 по ВСІХ ворогах + підпал',     needsTarget: false, targetSide: null   },
  freeze:          { key: 'freeze',          label: 'Заморожування',     desc: '75–80% влучн. Ціль пропускає 1–2 ходи',  needsTarget: true,  targetSide: 'ai'   },
  blizzard:        { key: 'blizzard',        label: 'Пурга',             desc: '35% шанс заморозки кожного на 1–3 ходи (кд 4 ходи)', needsTarget: false, targetSide: null },
  frost_bolt:      { key: 'frost_bolt',      label: 'Льодяна стріла',    desc: 'Урон + зменшення точності / заморожує',    needsTarget: true,  targetSide: 'ai'   },
  ice_shield:      { key: 'ice_shield',      label: 'Крижаний щит',      desc: '+захист союзнику (+ регенерація на lv3+)', needsTarget: true,  targetSide: 'ally' },
  tidal_heal:      { key: 'tidal_heal',      label: 'Цілюща хвиля',      desc: 'Лікує +20 HP всій команді',               needsTarget: false, targetSide: null   },
  rock_throw:      { key: 'rock_throw',      label: 'Кидок каменю',      desc: '80% влучн. Ігнорує ухил. 60–70% шанс -точн. ворогу',  needsTarget: true,  targetSide: 'ai'   },
  stone_skin:      { key: 'stone_skin',      label: 'Кам\'яна шкіра',    desc: '+25–40% захист союзнику на 2 ходи (не стакується)',    needsTarget: true,  targetSide: 'ally' },
  earthquake:      { key: 'earthquake',      label: 'Землетрус',          desc: '25–35 урон по всіх + 70% дезорієнтація -50% точн. 2–4 ходи (кд 5 ходів)', needsTarget: false, targetSide: null   },
  fortress_aura:   { key: 'fortress_aura',   label: 'Фортеця',            desc: '+33% захист всій команді на 1–3 ходи (кд 4 ходи)',   needsTarget: false, targetSide: null   },
  lightning_bolt:  { key: 'lightning_bolt',  label: 'Блискавка',         desc: 'Висока крит. шанс, ланцюгується на lv3+', needsTarget: true,  targetSide: 'ai'   },
  gust:            { key: 'gust',            label: 'Порив вітру',       desc: 'Урон + 50% шанс -ініціативи ворогу',     needsTarget: true,  targetSide: 'ai'   },
  tailwind:        { key: 'tailwind',        label: 'Попутний вітер',    desc: '+ініціатива і +точність всім союзникам (кд 4 ходи)',  needsTarget: false, targetSide: null   },
  thunder_storm:   { key: 'thunder_storm',   label: 'Гроза',             desc: 'Блискавка ×2 по ВСІХ ворогах',            needsTarget: false, targetSide: null   },
  hurricane:       { key: 'hurricane',       label: 'Ураган',            desc: '30-40 урон + область 50% + Дезорієнтація (кд 4 ходи)', needsTarget: true,  targetSide: 'ai' },
  barrage:          { key: 'barrage',          label: 'Удар по площі',     desc: 'Ціль + сусіди отримують 25–50% урону',        needsTarget: true,  targetSide: 'ai' },
  grapeshot:        { key: 'grapeshot',        label: 'Картеч',            desc: 'Весь ряд цілі з -40% урону',                  needsTarget: true,  targetSide: 'ai' },
  ballista_shot:    { key: 'ballista_shot',    label: 'Прицільний постріл', desc: '32 урону, 95% точність',                     needsTarget: true,  targetSide: 'ai' },
  twin_bolt:        { key: 'twin_bolt',        label: 'Подвійний болт',    desc: '2 постріли по 35 урону — обираєш 2 цілі',     needsTarget: true,  targetSide: 'ai' },
  trebuchet_volley: { key: 'trebuchet_volley', label: 'Залп Требюше',      desc: '45 урону + 60% урону сусідам (75% точн.)',    needsTarget: true,  targetSide: 'ai' },
  plague_volley:    { key: 'plague_volley',    label: 'Чумний залп',       desc: '60 урону + 60% по сусідах + 60% отруєння',   needsTarget: true,  targetSide: 'ai' },
}

export function getMainActions(cls: UnitClass, level?: number, magePath?: MagePath, catapultPath?: CatapultPath, warriorPath?: WarriorPath): ActionKey[] {
  if (cls === 'warrior') {
    const lvl = level ?? 1
    if (lvl >= 3 && warriorPath) return WARRIOR_PATHS[warriorPath][lvl]?.actions ?? ['strike']
    return WARRIOR_LEVELS[lvl]?.actions ?? ['strike', 'shield']
  }
  if (cls === 'archer') {
    const lvl = level ?? 1
    return ARCHER_LEVELS[lvl]?.actions ?? ['shot', 'aim']
  }
  if (cls === 'mage') {
    const lvl = level ?? 1
    if (lvl === 1 || !magePath) return MAGE_BASE.actions as ActionKey[]
    return (MAGE_PATHS[magePath][lvl]?.actions ?? MAGE_BASE.actions) as ActionKey[]
  }
  if (cls === 'catapult') {
    const lvl = level ?? 1
    if (lvl === 1 || !catapultPath) return CATAPULT_BASE.actions as ActionKey[]
    return (CATAPULT_PATHS[catapultPath][lvl]?.actions ?? CATAPULT_BASE.actions) as ActionKey[]
  }
  return ['chain_lightning', 'fireball']
}

// getMainActions needs tailwind (no-target action):
// tailwind is included in MAGE_PATHS[air][3-5].actions and handled by getMainActions automatically

// ── Initial state ──────────────────────────────────────────────────────────────
const TURN_RESET = {
  selectedAction: null as ActionKey | null,
  needsTarget: false,
}

export function createInitialState(counts?: ArmyCounts, prebuiltPlayerUnits?: GameUnit[], aiCounts?: ArmyCounts, prebuiltAiUnits?: GameUnit[], fortressLevelCap?: number): BattleState {
  const playerUnits = prebuiltPlayerUnits
    ?? (counts ? buildCustomArmy(counts, 'player') : buildCustomArmy({ warriors: 3, archers: 2, mages: 1, catapults: 0 }, 'player'))
  const aiUnits = prebuiltAiUnits ?? (aiCounts ? buildCustomArmy(aiCounts, 'ai') : buildDefaultAIArmy())
  const units = [...playerUnits, ...aiUnits]
  const queue = buildQueue(units)
  const first = units.find(u => u.id === queue[0])!
  return {
    units, queue, queueIdx: 0,
    phase: first.side === 'player' ? 'player-turn' : 'ai-thinking',
    winner: null,
    log: [{ id: ++_logId, text: '⚔ Бій починається!', type: 'info' }],
    round: 1, events: [], ...TURN_RESET,
    ...(fortressLevelCap !== undefined ? { fortressLevelCap } : {}),
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
      if (!ACTIONS[a].needsTarget) {
        const ticked = tickBuffs(actor)
        const s0 = { ...state, units: state.units.map(u => u.id === actor.id ? ticked : u) }
        const { units, newLogs, newEvents, pendingWarriorLevelUp, pendingMageLevelUp, pendingCatapultLevelUp } = executeAction(s0, ticked, a, null)
        const next = advanceQueue({ ...s0, units, log: [...s0.log, ...newLogs], ...TURN_RESET, events: newEvents })
        if (pendingWarriorLevelUp) return { ...next, pendingWarriorLevelUp }
        if (pendingCatapultLevelUp) return { ...next, pendingCatapultLevelUp }
        return pendingMageLevelUp ? { ...next, pendingMageLevelUp } : next
      }
      return { ...state, selectedAction: a, needsTarget: true, events: [], pendingFirstTarget: undefined }
    }

    case 'CONFIRM_TARGET': {
      const actor = state.units.find(u => u.id === state.queue[state.queueIdx])
      if (!actor || !state.selectedAction) return state
      // Twin bolt: store first target, wait for second
      if (state.selectedAction === 'twin_bolt' && state.pendingFirstTarget === undefined) {
        return { ...state, pendingFirstTarget: action.targetId }
      }
      const ticked1 = tickBuffs(actor)
      const s1 = { ...state, units: state.units.map(u => u.id === actor.id ? ticked1 : u) }
      const mainTarget = s1.pendingFirstTarget ?? action.targetId
      const second     = s1.pendingFirstTarget ? action.targetId : undefined
      const { units, newLogs, newEvents, pendingWarriorLevelUp, pendingMageLevelUp, pendingCatapultLevelUp } = executeAction(s1, ticked1, s1.selectedAction!, mainTarget, second)
      const next = advanceQueue({ ...s1, units, log: [...s1.log, ...newLogs], ...TURN_RESET, events: newEvents, pendingFirstTarget: undefined })
      if (pendingWarriorLevelUp) return { ...next, pendingWarriorLevelUp }
      if (pendingCatapultLevelUp) return { ...next, pendingCatapultLevelUp }
      return pendingMageLevelUp ? { ...next, pendingMageLevelUp } : next
    }

    case 'CHOOSE_WARRIOR_PATH': {
      const warrior = state.units.find(u => u.id === action.unitId)
      if (!warrior || warrior.class !== 'warrior') return state
      const leveled = applyWarriorPath(warrior, action.path, 3)
      const units = state.units.map(u => u.id === action.unitId ? leveled : u)
      const pathName = action.path === 'champion' ? 'Чемпіон' : 'Паладін'
      return {
        ...state, units, pendingWarriorLevelUp: undefined,
        log: [...state.log, { id: ++_logId, text: `⭐ ${warrior.name} обирає шлях ${pathName} — ${WARRIOR_PATHS[action.path][3].name}!`, type: 'buff' }],
        events: [ev(action.unitId, `⭐ ${pathName}!`, 'buff')],
      }
    }

    case 'CHOOSE_MAGE_PATH': {
      const mage = state.units.find(u => u.id === action.unitId)
      if (!mage || mage.class !== 'mage') return state
      const leveled = applyMagePath(mage, action.path, 2)
      const units = state.units.map(u => u.id === action.unitId ? leveled : u)
      const pathNames: Record<string, string> = { fire: 'Вогонь', water: 'Вода', earth: 'Земля', air: 'Повітря' }
      return {
        ...state, units, pendingMageLevelUp: undefined,
        log: [...state.log, { id: ++_logId, text: `⭐ ${mage.name} обирає шлях ${pathNames[action.path]} — ${MAGE_PATHS[action.path][2].name}!`, type: 'buff' }],
        events: [ev(action.unitId, `⭐ ${pathNames[action.path]}!`, 'buff')],
      }
    }

    case 'CHOOSE_CATAPULT_PATH': {
      const cat = state.units.find(u => u.id === action.unitId)
      if (!cat || cat.class !== 'catapult') return state
      const leveled = applyCatapultPath(cat, action.path, 2)
      const units = state.units.map(u => u.id === action.unitId ? leveled : u)
      const pathNames: Record<CatapultPath, string> = { ballista: 'Баліста', trebuchet: 'Требюше' }
      return {
        ...state, units, pendingCatapultLevelUp: undefined,
        log: [...state.log, { id: ++_logId, text: `⭐ ${cat.name} → ${CATAPULT_PATHS[action.path][2].name}!`, type: 'buff' }],
        events: [ev(action.unitId, `⭐ ${pathNames[action.path]}!`, 'buff')],
      }
    }

    case 'CANCEL_ACTION':
      return { ...state, selectedAction: null, needsTarget: false }

    case 'AI_TAKE_TURN': {
      // If AI warrior needs path choice, auto-pick paladin
      if (state.pendingWarriorLevelUp) {
        const warrior = state.units.find(u => u.id === state.pendingWarriorLevelUp)
        if (warrior && warrior.side === 'ai') {
          const leveled = applyWarriorPath(warrior, 'paladin', 3)
          const units = state.units.map(u => u.id === warrior.id ? leveled : u)
          return advanceQueue({
            ...state, units, pendingWarriorLevelUp: undefined,
            log: [...state.log, { id: ++_logId, text: `⭐ ${warrior.name} → ${WARRIOR_PATHS.paladin[3].name}!`, type: 'buff' }],
            events: [],
          })
        }
      }
      // If AI mage needs path choice, auto-pick
      if (state.pendingMageLevelUp) {
        const mage = state.units.find(u => u.id === state.pendingMageLevelUp)
        if (mage && mage.side === 'ai') {
          const paths: MagePath[] = ['fire', 'water', 'earth', 'air']
          const picked = paths[Math.floor(Math.random() * paths.length)]
          const leveled = applyMagePath(mage, picked, 2)
          const units = state.units.map(u => u.id === mage.id ? leveled : u)
          return advanceQueue({
            ...state, units, pendingMageLevelUp: undefined,
            log: [...state.log, { id: ++_logId, text: `⭐ ${mage.name} обирає ${picked}`, type: 'buff' }],
            events: [],
          })
        }
      }
      // If AI catapult needs path choice, auto-pick
      if (state.pendingCatapultLevelUp) {
        const cat = state.units.find(u => u.id === state.pendingCatapultLevelUp)
        if (cat && cat.side === 'ai') {
          const paths: CatapultPath[] = ['ballista', 'trebuchet']
          const picked = paths[Math.floor(Math.random() * paths.length)]
          const leveled = applyCatapultPath(cat, picked, 2)
          const units = state.units.map(u => u.id === cat.id ? leveled : u)
          return advanceQueue({
            ...state, units, pendingCatapultLevelUp: undefined,
            log: [...state.log, { id: ++_logId, text: `⭐ ${cat.name} → ${CATAPULT_PATHS[picked][2].name}!`, type: 'buff' }],
            events: [],
          })
        }
      }
      const actorId = state.queue[state.queueIdx]
      const actor = state.units.find(u => u.id === actorId)
      if (!actor || actor.hp === 0 || actor.side !== 'ai') return advanceQueue(state)
      const { action: act, targetId, secondTargetId } = aiDecide(actor, state)
      if (!act || (ACTIONS[act].needsTarget && !targetId)) return advanceQueue(state)
      const ticked2 = tickBuffs(actor)
      const s2 = { ...state, units: state.units.map(u => u.id === actorId ? ticked2 : u) }
      const { units, newLogs, newEvents, pendingWarriorLevelUp, pendingMageLevelUp, pendingCatapultLevelUp } = executeAction(s2, ticked2, act, targetId, secondTargetId)
      const next = advanceQueue({ ...s2, units, log: [...s2.log, ...newLogs], ...TURN_RESET, events: newEvents })
      if (pendingWarriorLevelUp) return { ...next, pendingWarriorLevelUp }
      if (pendingCatapultLevelUp) return { ...next, pendingCatapultLevelUp }
      return pendingMageLevelUp ? { ...next, pendingMageLevelUp } : next
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

  let idx = state.queueIdx + 1
  while (idx < state.queue.length && (units.find(u => u.id === state.queue[idx])?.hp ?? 0) === 0) idx++

  let queue = state.queue
  let round = state.round

  if (idx >= queue.length) {
    round++
    // Award round-survival XP to all living units
    const roundLogs: LogEntry[] = []
    const roundEvents: BattleEvent[] = []
    const roundCap = state.fortressLevelCap
    for (const u of units.filter(x => (x.class === 'warrior' || x.class === 'archer' || x.class === 'mage' || x.class === 'catapult') && x.hp > 0)) {
      if (u.class === 'warrior') {
        const { unit: updated } = grantWarriorXp(u, 15, roundLogs, roundEvents, roundCap)
        units = units.map(x => x.id === updated.id ? updated : x)
      } else if (u.class === 'archer') {
        const updated = grantArcherXp(u, 15, roundLogs, roundEvents, roundCap)
        units = units.map(x => x.id === updated.id ? updated : x)
      } else if (u.class === 'mage') {
        const { unit: updated } = grantMageXp(u, 15, roundLogs, roundEvents, roundCap)
        units = units.map(x => x.id === updated.id ? updated : x)
      } else if (u.class === 'catapult') {
        const { unit: updated } = grantCatapultXp(u, 15, roundLogs, roundEvents, roundCap)
        units = units.map(x => x.id === updated.id ? updated : x)
      }
    }
    state = {
      ...state, units,
      log: [...state.log,
        { id: ++_logId, text: `── Раунд ${round} ──`, type: 'info' },
        ...roundLogs,
      ],
      events: roundEvents.length ? roundEvents : state.events,
    }
    queue = buildQueue(units)
    idx = 0
  }

  // Apply DoT and regen at start of next unit's turn
  const nextId = queue[idx]
  const nextUnit = units.find(u => u.id === nextId)
  if (nextUnit && nextUnit.hp > 0) {
    // Poison
    if (nextUnit.buffs.some(b => b.type === 'poison')) {
      const dmg = nextUnit.buffs.filter(b => b.type === 'poison').reduce((s, b) => s + b.value, 0)
      const newHp = Math.max(0, nextUnit.hp - dmg)
      units = units.map(u => u.id === nextId ? {
        ...u, hp: newHp,
        buffs: u.buffs.map(b => b.type === 'poison' ? { ...b, turnsLeft: b.turnsLeft - 1 } : b).filter(b => b.turnsLeft > 0),
      } : u)
      state = { ...state, log: [...state.log, { id: ++_logId, text: `🧪 ${nextUnit.name} отруєний: -${dmg} HP`, type: 'debuff' }] }
      if (newHp === 0) {
        state = { ...state, log: [...state.log, { id: ++_logId, text: `☠ ${nextUnit.name} гине від отрути!`, type: 'death' }] }
        const pa = units.filter(u => u.side === 'player' && u.hp > 0).length
        const aa = units.filter(u => u.side === 'ai' && u.hp > 0).length
        if (pa === 0) return { ...state, units, phase: 'game-over', winner: 'ai' }
        if (aa === 0) return { ...state, units, phase: 'game-over', winner: 'player' }
      }
    }
    // Burning
    const nextUnitNow = units.find(u => u.id === nextId)!
    if (nextUnitNow.hp > 0 && nextUnitNow.buffs.some(b => b.type === 'burning')) {
      const dmg = nextUnitNow.buffs.filter(b => b.type === 'burning').reduce((s, b) => s + b.value, 0)
      const newHp = Math.max(0, nextUnitNow.hp - dmg)
      units = units.map(u => u.id === nextId ? {
        ...u, hp: newHp,
        buffs: u.buffs.map(b => b.type === 'burning' ? { ...b, turnsLeft: b.turnsLeft - 1 } : b).filter(b => b.turnsLeft > 0),
      } : u)
      state = { ...state, log: [...state.log, { id: ++_logId, text: `🔥 ${nextUnitNow.name} палає: -${dmg} HP`, type: 'debuff' }] }
      if (newHp === 0) {
        state = { ...state, log: [...state.log, { id: ++_logId, text: `☠ ${nextUnitNow.name} згорів!`, type: 'death' }] }
        const pa = units.filter(u => u.side === 'player' && u.hp > 0).length
        const aa = units.filter(u => u.side === 'ai' && u.hp > 0).length
        if (pa === 0) return { ...state, units, phase: 'game-over', winner: 'ai' }
        if (aa === 0) return { ...state, units, phase: 'game-over', winner: 'player' }
      }
    }
    // Regen
    const nextUnitNow2 = units.find(u => u.id === nextId)!
    if (nextUnitNow2.hp > 0 && nextUnitNow2.buffs.some(b => b.type === 'regen')) {
      const heal = nextUnitNow2.buffs.filter(b => b.type === 'regen').reduce((s, b) => s + b.value, 0)
      const newHp = Math.min(nextUnitNow2.maxHp, nextUnitNow2.hp + heal)
      const amt = newHp - nextUnitNow2.hp
      units = units.map(u => u.id === nextId ? {
        ...u, hp: newHp,
        buffs: u.buffs.map(b => b.type === 'regen' ? { ...b, turnsLeft: b.turnsLeft - 1 } : b).filter(b => b.turnsLeft > 0),
      } : u)
      if (amt > 0) state = { ...state, log: [...state.log, { id: ++_logId, text: `💚 ${nextUnitNow2.name} відновлює ${amt} HP`, type: 'heal' }] }
    }
    // Frozen: skip turn
    const nextUnitNow3 = units.find(u => u.id === nextId)!
    if (nextUnitNow3.hp > 0 && nextUnitNow3.buffs.some(b => b.type === 'frozen')) {
      units = units.map(u => u.id === nextId ? {
        ...u,
        buffs: u.buffs.map(b => b.type === 'frozen' ? { ...b, turnsLeft: b.turnsLeft - 1 } : b).filter(b => b.turnsLeft > 0),
      } : u)
      state = { ...state, log: [...state.log, { id: ++_logId, text: `❄ ${nextUnitNow3.name} заморожений — пропускає хід`, type: 'info' }] }
      // Skip: advance to the next unit after this one
      return advanceQueue({ ...state, units, queue, queueIdx: idx, round, phase: 'ai-thinking', ...TURN_RESET })
    }
  }

  const next = units.find(u => u.id === queue[idx])
  const phase: Phase = next?.side === 'player' ? 'player-turn' : 'ai-thinking'
  return { ...state, units, queue, queueIdx: idx, round, phase, ...TURN_RESET }
}
