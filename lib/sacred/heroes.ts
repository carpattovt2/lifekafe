import type { GameUnit, Side } from './types'

export type HeroId = 'artan' | 'sybilla'

export type PerkId =
  | 'mobility'          // Артан lv2: +5 ініціатива, +5% ухилення
  | 'noble_strike'      // Артан lv2: активація — атаки форс-хіт 3 ходи
  | 'vitality'          // Артан lv3: +50 max HP
  | 'armor_pierce'      // Артан lv3: ігнорує 50% броні
  | 'bloodthirst'       // Артан lv4: крит 15% x2.5
  | 'mage_slayer'       // Артан lv4: +20% до всіх елем. резистів
  | 'flank_strike'      // Артан lv5 (ульта): союзники +50% точн, +25% урон 2 ходи
  | 'mass_heal'         // Сивілла lv2: масове лікування 10 HP
  | 'enhanced_heal'     // Сивілла lv2: Благословіння → 25 HP
  | 'mass_heal_2'       // Сивілла lv3 (потреб. mass_heal): → 14 HP
  | 'enhanced_heal_2'   // Сивілла lv3: Благословіння → 35 HP
  | 'mass_heal_3'       // Сивілла lv4 (потреб. mass_heal_2): → 18 HP
  | 'enhanced_heal_3'   // Сивілла lv4: Благословіння → 45 HP
  | 'prophecy'          // Сивілла lv5 (ульта): лікування всіх +20 + зняття дебафів

export interface PerkDef {
  id: PerkId
  heroId: HeroId
  name: string
  desc: string
  availableAtLevel: number
  prerequisite?: PerkId
}

export const PERK_DEFS: PerkDef[] = [
  // ── Артан ──────────────────────────────────────────────────────────────────────
  { id: 'mobility',       heroId: 'artan',   availableAtLevel: 2, name: 'Мобільність',           desc: '+5 ініціативи та +5% ухилення (пасивно)' },
  { id: 'noble_strike',   heroId: 'artan',   availableAtLevel: 2, name: 'Благородний удар',       desc: 'Дія: наступні 3 ходи атаки непромахуються, ворог не ухиляється (КД 3 ходи)' },
  { id: 'vitality',       heroId: 'artan',   availableAtLevel: 3, name: 'Живучість',               desc: '+50 максимального HP (пасивно)' },
  { id: 'armor_pierce',   heroId: 'artan',   availableAtLevel: 3, name: 'Бронебойність',           desc: 'Атаки ігнорують 50% броні ворога (пасивно)' },
  { id: 'bloodthirst',    heroId: 'artan',   availableAtLevel: 4, name: 'Кровожадність',           desc: '+15% шанс крит. удару, ×2.5 множник (пасивно)' },
  { id: 'mage_slayer',    heroId: 'artan',   availableAtLevel: 4, name: 'Магоборець',              desc: '+20% опір будь-якому магічному урону (пасивно)' },
  { id: 'flank_strike',   heroId: 'artan',   availableAtLevel: 5, name: 'Фланговий удар',          desc: 'Ульта: всі союзники +50% точності та +25% урону на 2 ходи (КД 3 ходи)' },
  // ── Сивілла ────────────────────────────────────────────────────────────────────
  { id: 'mass_heal',      heroId: 'sybilla', availableAtLevel: 2, name: 'Масове лікування',        desc: 'Нова дія: лікує всіх союзників на 10 HP' },
  { id: 'enhanced_heal',  heroId: 'sybilla', availableAtLevel: 2, name: 'Посилене лікування',      desc: 'Благословіння лікує на 25 HP (замість 15)' },
  { id: 'mass_heal_2',    heroId: 'sybilla', availableAtLevel: 3, prerequisite: 'mass_heal',        name: 'Масове лікування II',     desc: 'Масове лікування → 14 HP кожному союзнику' },
  { id: 'enhanced_heal_2',heroId: 'sybilla', availableAtLevel: 3, name: 'Посилення лікування II',  desc: 'Благословіння лікує на 35 HP' },
  { id: 'mass_heal_3',    heroId: 'sybilla', availableAtLevel: 4, prerequisite: 'mass_heal_2',      name: 'Масове лікування III',    desc: 'Масове лікування → 18 HP кожному союзнику' },
  { id: 'enhanced_heal_3',heroId: 'sybilla', availableAtLevel: 4, name: 'Посилення лікування III', desc: 'Благословіння лікує на 45 HP' },
  { id: 'prophecy',       heroId: 'sybilla', availableAtLevel: 5, name: 'Пророчество',              desc: 'Ульта: лікує всіх союзників на 20 HP та знімає негативні бафи (КД 3 ходи)' },
]

export interface HeroState {
  heroId: HeroId
  level: number
  xp: number
  xpToNext: number
  hp: number
  maxHp: number
  isAlive: boolean
  chosenPerks: PerkId[]
  pendingPerkPool: PerkId[]
}

const ARTAN_LEVELS: Record<number, { hp: number; minDmg: number; maxDmg: number; xpToNext: number }> = {
  1: { hp: 100, minDmg: 18, maxDmg: 23, xpToNext: 100 },
  2: { hp: 125, minDmg: 21, maxDmg: 26, xpToNext: 200 },
  3: { hp: 150, minDmg: 25, maxDmg: 29, xpToNext: 350 },
  4: { hp: 175, minDmg: 28, maxDmg: 35, xpToNext: 500 },
  5: { hp: 200, minDmg: 33, maxDmg: 40, xpToNext: Infinity },
}

const SYBILLA_LEVELS: Record<number, { hp: number; xpToNext: number }> = {
  1: { hp:  85, xpToNext: 100 },
  2: { hp:  95, xpToNext: 200 },
  3: { hp: 110, xpToNext: 350 },
  4: { hp: 125, xpToNext: 500 },
  5: { hp: 140, xpToNext: Infinity },
}

export function createHeroState(heroId: HeroId): HeroState {
  if (heroId === 'artan') {
    const d = ARTAN_LEVELS[1]
    return { heroId, level: 1, xp: 0, xpToNext: d.xpToNext, hp: d.hp, maxHp: d.hp, isAlive: true, chosenPerks: [], pendingPerkPool: [] }
  }
  const d = SYBILLA_LEVELS[1]
  return { heroId, level: 1, xp: 0, xpToNext: d.xpToNext, hp: d.hp, maxHp: d.hp, isAlive: true, chosenPerks: [], pendingPerkPool: [] }
}

export function getNewPerksForLevel(heroId: HeroId, level: number): PerkId[] {
  return PERK_DEFS.filter(p => p.heroId === heroId && p.availableAtLevel === level).map(p => p.id)
}

export function getAvailablePerks(state: HeroState): PerkId[] {
  return state.pendingPerkPool.filter(id => {
    const def = PERK_DEFS.find(p => p.id === id)
    if (!def) return false
    if (def.prerequisite && !state.chosenPerks.includes(def.prerequisite)) return false
    return true
  })
}

export function applyXpToHero(state: HeroState, xpGain: number): { state: HeroState; levelsGained: number } {
  if (xpGain <= 0 || state.level >= 5) return { state, levelsGained: 0 }
  let current = state
  let levelsGained = 0
  let remaining = xpGain

  while (remaining > 0 && current.level < 5) {
    const newXp = current.xp + remaining
    if (newXp < current.xpToNext) {
      current = { ...current, xp: newXp }
      remaining = 0
    } else {
      remaining = 0  // cap at one level per battle application
      const newLevel = current.level + 1
      const hasVitality = current.chosenPerks.includes('vitality')
      const baseHp = current.heroId === 'artan' ? ARTAN_LEVELS[newLevel].hp : SYBILLA_LEVELS[newLevel].hp
      const newMaxHp = baseHp + (hasVitality ? 50 : 0)
      const newXpToNext = current.heroId === 'artan' ? ARTAN_LEVELS[newLevel].xpToNext : SYBILLA_LEVELS[newLevel].xpToNext
      const hpGain = newMaxHp - current.maxHp
      const newPool = [...current.pendingPerkPool, ...getNewPerksForLevel(current.heroId, newLevel)]
      current = {
        ...current,
        level: newLevel,
        xp: 0,
        xpToNext: newXpToNext,
        maxHp: newMaxHp,
        hp: Math.min(current.hp + Math.max(0, hpGain), newMaxHp),
        pendingPerkPool: newPool,
      }
      levelsGained++
    }
  }
  return { state: current, levelsGained }
}

export function choosePerk(state: HeroState, perkId: PerkId): HeroState {
  const newChosen = [...state.chosenPerks, perkId]
  const newPool = state.pendingPerkPool.filter(p => p !== perkId)
  let newState: HeroState = { ...state, chosenPerks: newChosen, pendingPerkPool: newPool }
  if (perkId === 'vitality') {
    newState = { ...newState, maxHp: state.maxHp + 50, hp: state.hp + 50 }
  }
  return newState
}

export function computeSingleHealAmt(chosenPerks: PerkId[]): number {
  if (chosenPerks.includes('enhanced_heal_3')) return 45
  if (chosenPerks.includes('enhanced_heal_2')) return 35
  if (chosenPerks.includes('enhanced_heal'))   return 25
  return 15
}

export function computeMassHealAmt(chosenPerks: PerkId[]): number {
  if (chosenPerks.includes('mass_heal_3')) return 18
  if (chosenPerks.includes('mass_heal_2')) return 14
  return 10
}

export function heroSlotsFromLevel(heroLevel: number): number {
  return heroLevel + 2  // lv1→3, lv2→4, lv3→5, lv4→6, lv5→7 regular unit slots
}

export function buildHeroUnit(state: HeroState, side: Side): GameUnit {
  const { heroId, level, hp, maxHp, chosenPerks, xp } = state

  if (heroId === 'artan') {
    const d = ARTAN_LEVELS[level]
    const hasMobility    = chosenPerks.includes('mobility')
    const hasBloodthirst = chosenPerks.includes('bloodthirst')
    const hasMageSlayer  = chosenPerks.includes('mage_slayer')
    return {
      id: 'hero_artan',
      side,
      row: 0 as const,
      slot: 0,
      class: 'warrior' as const,
      name: 'Артан',
      isHero: true,
      heroId: 'artan',
      hp,
      maxHp,
      minDmg: d.minDmg,
      maxDmg: d.maxDmg,
      accuracy: 0.85,
      defense: 0.15,
      evasion: 0.05 + (hasMobility ? 0.05 : 0),
      initiative: 55 + (hasMobility ? 5 : 0),
      morale: 75,
      critChance: hasBloodthirst ? 0.15 : 0,
      critMult:   hasBloodthirst ? 2.5  : 2.0,
      counter: 0,
      buffs: [],
      hasActed: false,
      level,
      xp,
      xpToNext: d.xpToNext === Infinity ? Infinity : d.xpToNext,
      fireRes:  hasMageSlayer ? 0.20 : 0,
      waterRes: hasMageSlayer ? 0.20 : 0,
      earthRes: hasMageSlayer ? 0.20 : 0,
      airRes:   hasMageSlayer ? 0.20 : 0,
      nobleStrikePerk: chosenPerks.includes('noble_strike'),
      flankStrikePerk: chosenPerks.includes('flank_strike'),
      armorPiercePerk: chosenPerks.includes('armor_pierce'),
    }
  }

  // Сивілла
  const d = SYBILLA_LEVELS[level]
  const singleHealAmt = computeSingleHealAmt(chosenPerks)
  const massHealAmt   = computeMassHealAmt(chosenPerks)
  return {
    id: 'hero_sybilla',
    side,
    row: 1 as const,
    slot: 0,
    class: 'mage' as const,
    name: 'Сивілла',
    isHero: true,
    heroId: 'sybilla',
    hp,
    maxHp,
    minDmg: 0,
    maxDmg: 0,
    accuracy: 0.85,
    defense: 0,
    evasion: 0.10,
    initiative: 20,
    morale: 75,
    critChance: 0,
    critMult: 2.0,
    counter: 0,
    buffs: [],
    hasActed: false,
    level,
    xp,
    xpToNext: d.xpToNext === Infinity ? Infinity : d.xpToNext,
    fireRes: 0, waterRes: 0, earthRes: 0, airRes: 0,
    heroHealAmt: singleHealAmt,
    heroMassHealAmt: massHealAmt,
    massHealPerk: chosenPerks.includes('mass_heal'),
    prophecyPerk: chosenPerks.includes('prophecy'),
  }
}

export const HERO_REVIVE_COST = 15
export const HERO_HIRE_COST = 5
