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

/**
 * Deal cards to N players.
 * firstPlayerIndex gets 15 cards (non-dealer); all others get 14.
 * Cards dealt round-robin starting from firstPlayerIndex.
 */
export function dealToPlayers(deck: Card[], numPlayers: number, firstPlayerIndex: number): {
  hands: Card[][]
  remaining: Card[]
} {
  const d = [...deck]
  const hands: Card[][] = Array.from({ length: numPlayers }, () => [])
  const totalCards = 15 + 14 * (numPlayers - 1)
  for (let i = 0; i < totalCards; i++) {
    const pi = (firstPlayerIndex + i) % numPlayers
    hands[pi].push(d.shift()!)
  }
  return { hands, remaining: d }
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
