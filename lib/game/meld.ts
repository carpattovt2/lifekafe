import type { Card, Meld, Suit } from './types'
import { RANK_NUM, meldCardValue } from './cards'

// ── Validation ────────────────────────────────────────────────────────────────

export function isValidGroup(cards: Card[]): boolean {
  const jokers = cards.filter(c => c.isJoker)
  const real   = cards.filter(c => !c.isJoker)
  if (cards.length < 3 || cards.length > 4) return false
  if (jokers.length > 2) return false
  if (real.length === 0) return false
  const rank  = real[0].rank
  const suits = new Set(real.map(c => c.suit))
  return real.every(c => c.rank === rank) && suits.size === real.length
}

export function isValidSequence(cards: Card[]): boolean {
  const jokers = cards.filter(c => c.isJoker)
  const real   = cards.filter(c => !c.isJoker)
  if (cards.length < 3) return false
  if (jokers.length > 2) return false
  if (real.length === 0) return false

  const suit = real[0].suit as Suit
  if (real.some(c => c.suit !== suit)) return false

  const nums = real.map(c => RANK_NUM[c.rank]).sort((a, b) => a - b)
  if (new Set(nums).size !== nums.length) return false // duplicates

  // Try A-low (A=1) and A-high (A=14)
  return trySequenceFit(nums, jokers.length, cards.length) ||
         (nums.includes(1) && trySequenceFit(nums.map(n => n === 1 ? 14 : n).sort((a,b)=>a-b), jokers.length, cards.length))
}

function trySequenceFit(sortedNums: number[], jokerCount: number, totalLen: number): boolean {
  const min = sortedNums[0], max = sortedNums[sortedNums.length - 1]
  const range = max - min + 1
  if (range > totalLen) return false              // span too wide even with jokers
  if (range > 13) return false                    // max sequence length
  const gaps = range - sortedNums.length          // how many cards need jokers
  return gaps <= jokerCount
}

export function isValidMeld(cards: Card[]): boolean {
  return isValidGroup(cards) || isValidSequence(cards)
}

export function meldType(cards: Card[]): 'group' | 'sequence' {
  return isValidGroup(cards) ? 'group' : 'sequence'
}

// Can `cards` be appended to an existing meld?
export function canAddToMeld(meld: Meld, cards: Card[]): boolean {
  const combined = [...meld.cards, ...cards]
  if (meld.type === 'group') return isValidGroup(combined)
  return isValidSequence(combined)
}

// ── Joker stealing ─────────────────────────────────────────────────────────────
// Can the player replace the joker in meld with `realCard`?
export function canStealJoker(meld: Meld, realCard: Card): { canSteal: boolean; jokerIndex: number } {
  if (realCard.isJoker) return { canSteal: false, jokerIndex: -1 }
  for (let i = 0; i < meld.cards.length; i++) {
    if (!meld.cards[i].isJoker) continue
    const without = [...meld.cards]
    without[i] = realCard
    if (meld.type === 'group' ? isValidGroup(without) : isValidSequence(without)) {
      return { canSteal: true, jokerIndex: i }
    }
  }
  return { canSteal: false, jokerIndex: -1 }
}

// ── Scoring ───────────────────────────────────────────────────────────────────

export function meldValue(cards: Card[]): number {
  const jokers = cards.filter(c => c.isJoker)
  const real   = cards.filter(c => !c.isJoker)
  let total = real.reduce((s, c) => s + meldCardValue(c.rank), 0)

  if (jokers.length > 0) {
    if (isValidGroup(cards)) {
      // Joker = value of that rank
      const rank = real[0]?.rank
      if (rank) total += jokers.length * meldCardValue(rank)
    } else if (isValidSequence(cards)) {
      // Joker fills the gap — use average or infer from position
      // Simplified: sum of the range / total cards, approximated as 10 per joker
      total += jokers.length * 8 // reasonable approximation
    }
  }
  return total
}

// Find all valid melds in a hand (returns groups of card IDs)
export function findMeldsInHand(hand: Card[]): Card[][] {
  const found: Card[][] = []

  // Find groups
  const byRank: Record<string, Card[]> = {}
  hand.filter(c => !c.isJoker).forEach(c => {
    if (!byRank[c.rank]) byRank[c.rank] = []
    byRank[c.rank].push(c)
  })
  for (const cards of Object.values(byRank)) {
    if (cards.length >= 3) found.push(cards.slice(0, 4))
    if (cards.length >= 3 && cards.length < 4) found.push(cards.slice(0, 3))
  }

  // Find sequences per suit
  const bySuit: Record<string, Card[]> = {}
  hand.filter(c => !c.isJoker).forEach(c => {
    const k = c.suit as string
    if (!bySuit[k]) bySuit[k] = []
    bySuit[k].push(c)
  })
  for (const cards of Object.values(bySuit)) {
    const sorted = [...cards].sort((a, b) => RANK_NUM[a.rank] - RANK_NUM[b.rank])
    // Find consecutive runs of 3+
    let run: Card[] = [sorted[0]]
    for (let i = 1; i < sorted.length; i++) {
      if (RANK_NUM[sorted[i].rank] === RANK_NUM[sorted[i-1].rank] + 1) {
        run.push(sorted[i])
      } else {
        if (run.length >= 3) found.push([...run])
        run = [sorted[i]]
      }
    }
    if (run.length >= 3) found.push([...run])
  }

  return found
}

export function totalMeldValue(melds: Card[][]): number {
  return melds.reduce((s, m) => s + meldValue(m), 0)
}
