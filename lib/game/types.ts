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
  owner: 'human' | 'ai'
  type: 'group' | 'sequence'
}

export type PlayerKey = 'human' | 'ai'

export type Phase =
  | 'player-draw'
  | 'player-action'
  | 'ai-turn'
  | 'round-end'
  | 'game-end'

export interface RoundScore {
  human: number
  ai: number
}

export interface GameState {
  roundNumber: number         // 1-7
  dealerIndex: 0 | 1         // 0=human, 1=ai
  currentPlayer: PlayerKey
  phase: Phase

  deck: Card[]
  discardPile: Card[]
  trumpCard: Card | null
  trumpSuit: Suit | null

  playerHand: Card[]
  aiHand: Card[]
  melds: Meld[]

  playerHasMelded: boolean
  aiHasMelded: boolean

  roundScores: RoundScore[]

  selectedCardIds: string[]
  stagedMelds: Card[][]
  message: string
  drawnThisTurn: boolean

  // Swap mode
  swapMode: boolean
  swapFirstCardId: string | null

  // Burning sets (4-card group)
  burningMeldId: string | null    // meld pending burn resolution
  burningHasJoker: boolean        // burning meld contains a Joker
}
