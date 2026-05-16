import type { Card, Suit, Rank } from './types'

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
const RANKS: Rank[] = ['A','2','3','4','5','6','7','8','9','10','J','Q','K']

let _idCounter = 0
function uid() { return `c${++_idCounter}` }

// 106 cards: 52×2 + 2 Jokers
export function createDeck(): Card[] {
  const cards: Card[] = []
  for (let deckNum = 0; deckNum < 2; deckNum++) {
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

// Deal 15 cards to first hand (non-dealer), 14 to second (dealer)
export function dealInitialHands(deck: Card[]): {
  firstHand: Card[]   // 15 cards → non-dealer (goes first)
  secondHand: Card[]  // 14 cards → dealer
  remaining: Card[]
} {
  const d = [...deck]
  const firstHand: Card[] = []
  const secondHand: Card[] = []
  for (let i = 0; i < 29; i++) {
    if (i % 2 === 0) firstHand.push(d.shift()!)
    else secondHand.push(d.shift()!)
  }
  return { firstHand, secondHand, remaining: d }
}

export const RANK_NUM: Record<string, number> = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5,
  '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13,
}

export function meldCardValue(rank: Rank): number {
  if (rank === 'Joker') return 0
  if (rank === 'A') return 1
  if (['10', 'J', 'Q', 'K'].includes(rank)) return 10
  return parseInt(rank)
}

export function handCardValue(card: Card, hasMelded: boolean): number {
  if (card.isJoker) return 10
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
