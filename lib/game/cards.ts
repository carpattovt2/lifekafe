import type { Card, Suit, Rank } from './types'

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
const RANKS: Rank[] = ['A','2','3','4','5','6','7','8','9','10','J','Q','K']

let _idCounter = 0
function uid() { return `c${++_idCounter}` }

export function createDeck(): Card[] {
  const cards: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ id: uid(), suit, rank, isJoker: false })
    }
  }
  cards.push({ id: uid(), suit: 'joker', rank: 'Joker', isJoker: true })
  cards.push({ id: uid(), suit: 'joker', rank: 'Joker', isJoker: true })
  return cards
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function dealInitialHands(deck: Card[]): {
  playerHand: Card[]
  aiHand: Card[]
  remaining: Card[]
} {
  // Non-dealer (human if dealer=ai, ai if dealer=human) gets 15, dealer gets 14
  // We'll always make player first dealt = human for simplicity here,
  // caller decides who gets 15 vs 14 based on dealerIndex
  const d = [...deck]
  const playerHand: Card[] = []
  const aiHand: Card[] = []
  // Alternate: non-dealer gets odd cards (1,3,5...), dealer gets even (2,4,6...)
  // Deal 29 cards total (15+14)
  for (let i = 0; i < 29; i++) {
    if (i % 2 === 0) playerHand.push(d.shift()!)
    else aiHand.push(d.shift()!)
  }
  return { playerHand, aiHand, remaining: d }
}

// Rank numeric value for sequence ordering
export const RANK_NUM: Record<string, number> = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5,
  '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13,
}

// Card point value for MELD SCORING
export function meldCardValue(rank: Rank): number {
  if (rank === 'Joker') return 0 // Joker value depends on context
  if (rank === 'A') return 1     // low ace in sequence = 1
  if (['10', 'J', 'Q', 'K'].includes(rank)) return 10
  return parseInt(rank)
}

// Card point value for END-OF-ROUND HAND SCORING (penalty)
export function handCardValue(card: Card, hasMelded: boolean): number {
  if (card.isJoker) return hasMelded ? 10 : 10
  if (card.rank === 'A') return 10
  if (['10', 'J', 'Q', 'K'].includes(card.rank)) return 10
  return parseInt(card.rank)
}

export function suitSymbol(suit: Suit | 'joker'): string {
  switch (suit) {
    case 'hearts':   return '♥'
    case 'diamonds': return '♦'
    case 'clubs':    return '♣'
    case 'spades':   return '♠'
    case 'joker':    return '★'
  }
}

export function isRed(suit: Suit | 'joker'): boolean {
  return suit === 'hearts' || suit === 'diamonds'
}
