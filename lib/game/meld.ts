import type { Card, Meld, Suit } from './types'
import { RANK_NUM, meldCardValue } from './cards'

const SUIT_ORDER: Record<string, number> = { spades: 0, hearts: 1, diamonds: 2, clubs: 3, joker: 9 }

// ── Ace position detection ─────────────────────────────────────────────────────
// Returns true if Ace is in high position (after K) based on other cards in sequence
function isAceHighInCards(cards: Card[]): boolean {
  const real = cards.filter(c => !c.isJoker)
  const hasAce = real.some(c => c.rank === 'A')
  if (!hasAce) return false
  const has2 = real.some(c => c.rank === '2')
  const hasK = real.some(c => c.rank === 'K')
  // High: has K, no 2 (or 3 that would indicate low ace)
  if (hasK && !has2) return true
  // Low: has 2
  if (has2) return false
  // No 2 or K: ambiguous, default low
  return false
}

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

  // Sequence: sort A→K respecting ace-high / ace-low position
  const jokers = cards.filter(c => c.isJoker)
  const aces   = cards.filter(c => !c.isJoker && c.rank === 'A')
  const rest   = cards.filter(c => !c.isJoker && c.rank !== 'A')
    .sort((a, b) => RANK_NUM[a.rank] - RANK_NUM[b.rank])

  let sorted: Card[]
  if (aces.length > 0 && isAceHighInCards(cards)) {
    // A comes after K: [...rest, A]
    sorted = [...rest, ...aces]
  } else {
    // A comes before 2: [A, ...rest]
    sorted = [...aces, ...rest]
  }

  if (jokers.length === 0) return sorted

  // Insert jokers into gaps
  const result: Card[] = []
  let jLeft = jokers.length
  for (let i = 0; i < sorted.length; i++) {
    result.push(sorted[i])
    if (i < sorted.length - 1 && jLeft > 0) {
      const aNum = sorted[i].rank === 'A' && isAceHighInCards(cards) ? 14 : RANK_NUM[sorted[i].rank] ?? 1
      const bNum = sorted[i+1].rank === 'A' ? 14 : RANK_NUM[sorted[i+1].rank] ?? 1
      const gap  = bNum - aNum - 1
      for (let g = 0; g < gap && jLeft > 0; g++) {
        result.push(jokers[jokers.length - jLeft--])
      }
    }
  }
  while (jLeft > 0) result.push(jokers[jokers.length - jLeft--])
  return result
}

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
  if (new Set(nums).size !== nums.length) return false  // duplicate ranks = invalid

  // Try A-low (A=1)
  const lowOk = tryFit(nums, jokers.length, cards.length)

  // Try A-high (A=14) only if Ace is present
  const aceHighNums = nums.includes(1)
    ? nums.map(n => n === 1 ? 14 : n).sort((a, b) => a - b)
    : null
  const highOk = aceHighNums !== null && tryFit(aceHighNums, jokers.length, cards.length)

  if (!lowOk && !highOk) return false

  // Reject if Ace appears in BOTH low and high positions simultaneously
  // (i.e., you can't have a sequence that wraps A-2-...-K-A)
  if (lowOk && highOk) {
    // This would mean A is valid both ways — reject: A can only be at one end
    // In practice this only happens with jokers filling large gaps
    // Simple heuristic: if both work and there's an actual Ace card, reject
    if (nums.includes(1)) return false
  }

  return true
}

function tryFit(sortedNums: number[], jokerCount: number, totalLen: number): boolean {
  const min = sortedNums[0], max = sortedNums[sortedNums.length - 1]
  const range = max - min + 1
  if (range > totalLen) return false
  if (range > 13) return false
  return (range - sortedNums.length) <= jokerCount
}

export function isValidMeld(cards: Card[]): boolean {
  return isValidGroup(cards) || isValidSequence(cards)
}

export function meldType(cards: Card[]): 'group' | 'sequence' {
  return isValidGroup(cards) ? 'group' : 'sequence'
}

// Check for exact duplicate card in existing meld (same rank + same suit, not same ID)
function hasDuplicateInMeld(meld: Meld, newCards: Card[]): boolean {
  for (const nc of newCards) {
    if (nc.isJoker) continue
    if (meld.cards.some(e => !e.isJoker && e.rank === nc.rank && e.suit === nc.suit)) {
      return true
    }
  }
  return false
}

export function canAddToMeld(meld: Meld, cards: Card[]): boolean {
  if (hasDuplicateInMeld(meld, cards)) return false
  const combined = [...meld.cards, ...cards]
  if (meld.type === 'group') return isValidGroup(combined)
  return isValidSequence(combined)
}

export function canStealJoker(meld: Meld, realCard: Card): { canSteal: boolean; jokerIndex: number } {
  if (realCard.isJoker) return { canSteal: false, jokerIndex: -1 }
  // Check for duplicate before stealing
  if (meld.cards.some(e => !e.isJoker && e.rank === realCard.rank && e.suit === realCard.suit)) {
    return { canSteal: false, jokerIndex: -1 }
  }
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

// ── Scoring ───────────────────────────────────────────────────────────────────

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

  // Groups — avoid duplicate suits (double deck)
  const byRank: Record<string, Card[]> = {}
  hand.filter(c => !c.isJoker).forEach(c => {
    if (!byRank[c.rank]) byRank[c.rank] = []
    byRank[c.rank].push(c)
  })
  for (const cards of Object.values(byRank)) {
    // Keep only first card per suit (no identical duplicates)
    const unique = cards.filter((c, _, a) => a.findIndex(x => x.suit === c.suit) === cards.indexOf(c))
    if (unique.length >= 4) { found.push(unique.slice(0, 4)); found.push(unique.slice(0, 3)) }
    else if (unique.length >= 3) { found.push(unique.slice(0, 3)) }
  }

  // Sequences — avoid duplicate ranks in same suit (double deck)
  const bySuit: Record<string, Card[]> = {}
  hand.filter(c => !c.isJoker).forEach(c => {
    const k = c.suit as string
    if (!bySuit[k]) bySuit[k] = []
    bySuit[k].push(c)
  })
  for (const cards of Object.values(bySuit)) {
    const unique = cards.filter((c, _, a) => a.findIndex(x => x.rank === c.rank) === cards.indexOf(c))
    const sorted = [...unique].sort((a, b) => RANK_NUM[a.rank] - RANK_NUM[b.rank])
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

export function isBurningGroup(meld: Meld): boolean {
  return meld.type === 'group' && meld.cards.length === 4
}
