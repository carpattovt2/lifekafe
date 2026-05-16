import type { Card, Meld, Suit } from './types'
import { RANK_NUM, meldCardValue } from './cards'

// ── Suit ordering for group sorting: ♠♥♦♣ ────────────────────────────────────
const SUIT_ORDER: Record<string, number> = { spades: 0, hearts: 1, diamonds: 2, clubs: 3, joker: 9 }

// ── Sort meld cards for display ───────────────────────────────────────────────
export function sortedMeldCards(cards: Card[], type: 'group' | 'sequence'): Card[] {
  if (type === 'group') {
    return [...cards].sort((a, b) => {
      if (a.isJoker && b.isJoker) return 0
      if (a.isJoker) return 1
      if (b.isJoker) return -1
      return (SUIT_ORDER[a.suit] ?? 9) - (SUIT_ORDER[b.suit] ?? 9)
    })
  }
  // Sequence: A→K, jokers placed in their gap position
  const jokers = cards.filter(c => c.isJoker)
  const real   = [...cards.filter(c => !c.isJoker)]
    .sort((a, b) => RANK_NUM[a.rank] - RANK_NUM[b.rank])

  if (jokers.length === 0) return real

  // Insert jokers into their inferred gap positions
  const result: Card[] = []
  let jLeft = jokers.length
  for (let i = 0; i < real.length; i++) {
    result.push(real[i])
    if (i < real.length - 1 && jLeft > 0) {
      const gap = RANK_NUM[real[i + 1].rank] - RANK_NUM[real[i].rank] - 1
      for (let g = 0; g < gap && jLeft > 0; g++) {
        result.push(jokers[jokers.length - jLeft--])
      }
    }
  }
  while (jLeft > 0) result.push(jokers[jokers.length - jLeft--])
  return result
}

// ── Validation ────────────────────────────────────────────────────────────────

// Groups allow up to 4 cards total (one per suit).
// Two identical cards (same rank + same suit) are invalid even in double deck.
export function isValidGroup(cards: Card[]): boolean {
  const jokers = cards.filter(c => c.isJoker)
  const real   = cards.filter(c => !c.isJoker)
  if (cards.length < 3 || cards.length > 4) return false
  if (jokers.length > 2) return false
  if (real.length === 0) return false
  const rank  = real[0].rank
  const suits = new Set(real.map(c => c.suit))
  // suits.size < real.length means duplicate suit (identical card from double deck)
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
  // No duplicate ranks (same card twice is invalid)
  if (new Set(nums).size !== nums.length) return false

  return trySequenceFit(nums, jokers.length, cards.length) ||
         (nums.includes(1) && trySequenceFit(
           nums.map(n => n === 1 ? 14 : n).sort((a, b) => a - b),
           jokers.length, cards.length,
         ))
}

function trySequenceFit(sortedNums: number[], jokerCount: number, totalLen: number): boolean {
  const min = sortedNums[0], max = sortedNums[sortedNums.length - 1]
  const range = max - min + 1
  if (range > totalLen) return false
  if (range > 13) return false
  const gaps = range - sortedNums.length
  return gaps <= jokerCount
}

export function isValidMeld(cards: Card[]): boolean {
  return isValidGroup(cards) || isValidSequence(cards)
}

export function meldType(cards: Card[]): 'group' | 'sequence' {
  return isValidGroup(cards) ? 'group' : 'sequence'
}

export function canAddToMeld(meld: Meld, cards: Card[]): boolean {
  const combined = [...meld.cards, ...cards]
  if (meld.type === 'group') return isValidGroup(combined)
  return isValidSequence(combined)
}

export function canStealJoker(meld: Meld, realCard: Card): { canSteal: boolean; jokerIndex: number } {
  if (realCard.isJoker) return { canSteal: false, jokerIndex: -1 }
  for (let i = 0; i < meld.cards.length; i++) {
    if (!meld.cards[i].isJoker) continue
    const test = [...meld.cards]
    test[i] = realCard
    if (meld.type === 'group' ? isValidGroup(test) : isValidSequence(test)) {
      return { canSteal: true, jokerIndex: i }
    }
  }
  return { canSteal: false, jokerIndex: -1 }
}

// ── Value ─────────────────────────────────────────────────────────────────────

export function meldValue(cards: Card[]): number {
  const jokers = cards.filter(c => c.isJoker)
  const real   = cards.filter(c => !c.isJoker)
  let total = real.reduce((s, c) => s + meldCardValue(c.rank), 0)
  if (jokers.length > 0) {
    if (isValidGroup(cards)) {
      const rank = real[0]?.rank
      if (rank) total += jokers.length * meldCardValue(rank)
    } else {
      total += jokers.length * 8
    }
  }
  return total
}

export function findMeldsInHand(hand: Card[]): Card[][] {
  const found: Card[][] = []

  // Groups (same rank, unique suits)
  const byRank: Record<string, Card[]> = {}
  hand.filter(c => !c.isJoker).forEach(c => {
    if (!byRank[c.rank]) byRank[c.rank] = []
    byRank[c.rank].push(c)
  })
  for (const cards of Object.values(byRank)) {
    const unique = cards.filter((c, i, a) =>
      a.findIndex(x => x.suit === c.suit) === i  // keep first of each suit
    )
    if (unique.length >= 3) {
      found.push(unique.slice(0, 4))
      if (unique.length >= 4) found.push(unique.slice(0, 3))
    }
  }

  // Sequences (same suit, consecutive)
  const bySuit: Record<string, Card[]> = {}
  hand.filter(c => !c.isJoker).forEach(c => {
    const k = c.suit as string
    if (!bySuit[k]) bySuit[k] = []
    bySuit[k].push(c)
  })
  for (const cards of Object.values(bySuit)) {
    // Only one card per rank (avoid duplicates from double deck)
    const unique = cards.filter((c, i, a) =>
      a.findIndex(x => x.rank === c.rank) === i
    )
    const sorted = [...unique].sort((a, b) => RANK_NUM[a.rank] - RANK_NUM[b.rank])
    let run: Card[] = [sorted[0]]
    for (let i = 1; i < sorted.length; i++) {
      if (RANK_NUM[sorted[i].rank] === RANK_NUM[sorted[i - 1].rank] + 1) {
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

// Check if a group meld is a 4-card set (eligible for burning)
export function isBurningGroup(meld: Meld): boolean {
  return meld.type === 'group' && meld.cards.length === 4
}
