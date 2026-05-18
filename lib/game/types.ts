export type CardBack = 'night' | 'elegant' | 'dragon' | 'runes' | 'poker' | 'sea' | 'vip' | 'vegas'
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'Joker'

export interface Card {
  id: string
  suit: Suit | 'joker'
  rank: Rank
  isJoker: boolean
  jokerNum?: 1 | 2   // distinguishes the two jokers (1=white/gold, 2=gold/black)
}

export interface Meld {
  id: string
  cards: Card[]
  ownerIndex: number
  type: 'group' | 'sequence'
  // For sequences: maps each joker's card ID → rank number it represents (1-14)
  jokerPositions?: Record<string, number>
}

export interface Player {
  id: string
  name: string
  isHuman: boolean
  hand: Card[]
  hasMelded: boolean
  turnCount: number
}

export type Phase =
  | 'setup'
  | 'player-draw'
  | 'player-action'
  | 'ai-turn'
  | 'round-end'
  | 'game-end'

export interface GameState {
  phase: Phase
  numPlayers: number
  roundNumber: number
  dealerIndex: number
  currentPlayerIndex: number

  deck: Card[]
  discardPile: Card[]
  trumpCard: Card | null
  trumpSuit: Suit | null
  takenTrumpCard: Card | null   // stored when player takes trump (for return)

  players: Player[]
  melds: Meld[]

  roundScores: number[][]

  selectedCardIds: string[]
  stagedMelds: Card[][]
  drawnThisTurn: boolean
  drawnFromDiscardCardId: string | null
  message: string
  // Tracks when player's first meld leaves exactly 1 card (will discard for -10)
  firstMeldSingleCardLeft: boolean

  burningMeldId: string | null
  burningHasJoker: boolean
}
