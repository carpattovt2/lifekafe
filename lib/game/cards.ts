import type { Card, Suit, Rank } from './types'

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
const RANKS: Rank[] = ['A','2','3','4','5','6','7','8','9','10','J','Q','K']

let _idCounter = 0
function uid() { return `c${++_idCounter}` }

// 106 cards: 52×2 + 2 Jokers
export function createDeck(): Card[] {
  const cards: Card[] = []
  for (let d = 0; d < 2; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ id: uid(), suit, rank, isJoker: false })
      }
    }
  }
  cards.push({ id: uid(), suit: 'joker', rank: 'Joker', isJoker: true, jokerNum: 1 })
  cards.push({ id: uid(), suit: 'joker', rank: 'Joker', isJoker: true, jokerNum: 2 })
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

/**
 * Deal 14 cards to each of N players, round-robin from firstPlayerIndex.
 * All players start with equal hands; first player draws from deck at turn start.
 */
export function dealToPlayers(deck: Card[], numPlayers: number, firstPlayerIndex = 0): {
  hands: Card[][]
  remaining: Card[]
} {
  const d = [...deck]
  const hands: Card[][] = Array.from({ length: numPlayers }, () => [])
  const totalCards = 14 * numPlayers
  for (let i = 0; i < totalCards; i++) {
    hands[(firstPlayerIndex + i) % numPlayers].push(d.shift()!)
  }
  // Validate
  if (process.env.NODE_ENV === 'development') {
    hands.forEach((h, i) => { if (h.length !== 14) console.warn(`Player ${i} has ${h.length} cards, expected 14`) })
  }
  return { hands, remaining: d }
}

export function numToRank(n: number): string {
  if (n === 1 || n === 14) return 'A'
  if (n === 11) return 'J'
  if (n === 12) return 'Q'
  if (n === 13) return 'K'
  return String(n)
}

export const RANK_NUM: Record<string, number> = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5,
  '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13,
}

export function meldCardValue(rank: Rank): number {
  if (rank === 'Joker') return 0
  if (rank === 'A') return 1
  if (['10','J','Q','K'].includes(rank)) return 10
  return parseInt(rank)
}

export function handCardValue(card: Card): number {
  if (card.isJoker) return 10
  if (card.rank === 'A') return 10
  if (['10','J','Q','K'].includes(card.rank)) return 10
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
