export type CardBack = 'classic' | 'pixel' | 'dark'
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'Joker'

export interface Card {
  id: string
  suit: Suit | 'joker'
  rank: Rank
  isJoker: boolean
}

export interface Meld {
  id: string
  cards: Card[]
  ownerIndex: number   // player index
  type: 'group' | 'sequence'
}

export interface Player {
  id: string
  name: string
  isHuman: boolean
  hand: Card[]
  hasMelded: boolean
  turnCount: number    // how many turns this player has taken this round (for AI probability)
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
  numPlayers: number           // 2-5
  roundNumber: number          // 1-7
  dealerIndex: number          // player index of current dealer
  currentPlayerIndex: number

  deck: Card[]
  discardPile: Card[]
  trumpCard: Card | null
  trumpSuit: Suit | null

  players: Player[]
  melds: Meld[]

  // [round][playerIndex] = points that round
  roundScores: number[][]

  // Human-turn state
  selectedCardIds: string[]
  stagedMelds: Card[][]
  drawnThisTurn: boolean
  drawnFromDiscardCardId: string | null  // must be used in meld/add before discarding
  message: string

  // Burning sets
  burningMeldId: string | null
  burningHasJoker: boolean
}
