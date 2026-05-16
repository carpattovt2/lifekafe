'use client'

import { useReducer, useEffect } from 'react'
import type { Card, GameState, Meld, PlayerKey, RoundScore, Suit } from '@/lib/game/types'
import { createDeck, shuffle, dealInitialHands, handCardValue, suitSymbol, isRed, RANK_NUM } from '@/lib/game/cards'
import {
  isValidMeld, meldType, meldValue, canAddToMeld, canStealJoker,
  totalMeldValue, findMeldsInHand, isBurningGroup, sortedMeldCards,
} from '@/lib/game/meld'
import { computeAITurn } from '@/lib/game/ai'

// ── ID counter ────────────────────────────────────────────────────────────────
let _meldId = 0
const mkMeldId = () => `m${++_meldId}`

// ── Helpers ───────────────────────────────────────────────────────────────────
function removeCards(hand: Card[], ids: Set<string>): Card[] {
  return hand.filter(c => !ids.has(c.id))
}

function calcHandPenalty(hand: Card[], hasMelded: boolean): number {
  if (hand.length === 0) return 0
  const raw = hand.reduce((s, c) => s + handCardValue(c, hasMelded), 0)
  return Math.min(10, Math.round(raw / 10))
}

function reshuffleDeckState(state: GameState): GameState {
  if (state.deck.length > 0) return state
  const top  = state.discardPile[state.discardPile.length - 1]
  const rest = state.discardPile.slice(0, -1)
  return { ...state, deck: shuffle(rest), discardPile: [top] }
}

// Insert burned cards into the MIDDLE of the discard pile (not drawable)
function burnIntoDiscard(discardPile: Card[], burnedCards: Card[]): Card[] {
  const mid = Math.floor(discardPile.length / 2)
  return [...discardPile.slice(0, mid), ...burnedCards, ...discardPile.slice(mid)]
}

// Make a sorted meld from cards
function makeMeld(cards: Card[], owner: 'human' | 'ai'): Meld {
  const type = meldType(cards)
  return { id: mkMeldId(), cards: sortedMeldCards(cards, type), owner, type }
}

// After adding cards to a meld, re-sort and check for burning
function updatedMeld(meld: Meld, newCards: Card[]): Meld {
  const cards = sortedMeldCards([...meld.cards, ...newCards], meld.type)
  return { ...meld, cards }
}

// Check melds for a newly-burning group (exactly 4 cards, group type)
function findBurningMeld(melds: Meld[], triggeredMeldId?: string): Meld | null {
  if (triggeredMeldId) {
    const m = melds.find(m => m.id === triggeredMeldId)
    if (m && isBurningGroup(m)) return m
  }
  return null
}

// ── Initial state ─────────────────────────────────────────────────────────────
function makeInitial(): GameState {
  return {
    roundNumber: 1,
    dealerIndex: Math.random() < 0.5 ? 0 : 1,
    currentPlayer: 'human',
    phase: 'player-draw',
    deck: [], discardPile: [], trumpCard: null, trumpSuit: null,
    playerHand: [], aiHand: [], melds: [],
    playerHasMelded: false, aiHasMelded: false,
    roundScores: [],
    selectedCardIds: [], stagedMelds: [],
    message: '', drawnThisTurn: false,
    swapMode: false, swapFirstCardId: null,
    burningMeldId: null, burningHasJoker: false,
  }
}

function dealRound(base: GameState): GameState {
  const rawDeck = shuffle(createDeck())
  const d = [...rawDeck]

  // 1. Flip trump card FIRST (before dealing)
  const flipped = d.shift()!
  let trumpCard: Card | null = null
  let trumpSuit: Suit | null = null
  let jokerForFirst: Card | null = null
  let discardPile: Card[] = []

  if (flipped.isJoker) {
    jokerForFirst = flipped      // no trump this round
  } else {
    trumpCard = flipped
    trumpSuit = flipped.suit as Suit
    discardPile = [flipped]
  }

  // 2. Deal: human-goes-first when AI is dealer
  const humanGoesFirst = base.dealerIndex === 1
  const firstPlayer: PlayerKey = humanGoesFirst ? 'human' : 'ai'

  const { firstHand, secondHand, remaining } = dealInitialHands(d)
  // firstHand=15 cards (non-dealer), secondHand=14 (dealer)
  let playerHand = humanGoesFirst ? [...firstHand]  : [...secondHand]
  let aiHand     = humanGoesFirst ? [...secondHand] : [...firstHand]
  let finalDeck  = [...remaining]

  // 3. Handle Joker-as-trump: give Joker to first player (they have 15), swap out 1 random
  if (jokerForFirst) {
    if (firstPlayer === 'human') {
      const idx = Math.floor(Math.random() * playerHand.length)
      finalDeck.push(playerHand.splice(idx, 1)[0]) // removed card goes to bottom of deck
      playerHand.push(jokerForFirst)
    } else {
      const idx = Math.floor(Math.random() * aiHand.length)
      finalDeck.push(aiHand.splice(idx, 1)[0])
      aiHand.push(jokerForFirst)
    }
  }

  const jokerMsg = jokerForFirst ? ' Trump was Joker — you got it as bonus!' : ''

  return {
    ...base,
    deck: finalDeck,
    discardPile,
    trumpCard,
    trumpSuit,
    playerHand,
    aiHand,
    melds: [],
    playerHasMelded: false, aiHasMelded: false,
    selectedCardIds: [], stagedMelds: [],
    currentPlayer: firstPlayer,
    phase: firstPlayer === 'human' ? 'player-draw' : 'ai-turn',
    message: firstPlayer === 'human' ? `Your turn — draw a card.${jokerMsg}` : 'AI is playing…',
    drawnThisTurn: false,
    swapMode: false, swapFirstCardId: null,
    burningMeldId: null, burningHasJoker: false,
  }
}

// ── Reducer ───────────────────────────────────────────────────────────────────
type Action =
  | { type: 'INIT_ROUND' }
  | { type: 'DRAW_DECK' }
  | { type: 'DRAW_DISCARD' }
  | { type: 'TOGGLE_CARD'; cardId: string }
  | { type: 'TOGGLE_SWAP_MODE' }
  | { type: 'SWAP_CARD'; cardId: string }
  | { type: 'STAGE_MELD' }
  | { type: 'CLEAR_STAGED' }
  | { type: 'COMMIT_MELDS' }
  | { type: 'ADD_TO_MELD'; meldId: string }
  | { type: 'STEAL_JOKER'; meldId: string }
  | { type: 'BURN_MELD' }
  | { type: 'REPLACE_BURNING_JOKER' }   // use 2 selected cards to take joker
  | { type: 'DISCARD'; cardId: string }
  | { type: 'AI_TURN_DONE'; next: Partial<GameState> }
  | { type: 'NEXT_ROUND' }
  | { type: 'END_GAME_EARLY' }

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {

    case 'INIT_ROUND': return dealRound(state)

    case 'DRAW_DECK': {
      if (state.drawnThisTurn || state.phase !== 'player-draw') return state
      let s = reshuffleDeckState(state)
      if (s.deck.length === 0) return { ...s, message: 'Deck is empty!' }
      const card = s.deck[0]
      return {
        ...s, deck: s.deck.slice(1),
        playerHand: [...s.playerHand, card],
        drawnThisTurn: true, phase: 'player-action',
        message: `Drew ${card.isJoker ? 'JOKER' : card.rank + ' of ' + card.suit}. Meld or discard.`,
      }
    }

    case 'DRAW_DISCARD': {
      if (state.drawnThisTurn || state.phase !== 'player-draw') return state
      const top = state.discardPile[state.discardPile.length - 1]
      if (!top) return { ...state, message: 'Discard pile is empty.' }
      if (top.id === state.trumpCard?.id && state.playerHand.length > 1)
        return { ...state, message: 'Trump card: only take it if going out this turn!' }
      if (!state.playerHasMelded && top.id !== state.trumpCard?.id)
        return { ...state, message: 'Draw from discard only after your first meld (51+ pts).' }
      return {
        ...state, discardPile: state.discardPile.slice(0, -1),
        playerHand: [...state.playerHand, top],
        drawnThisTurn: true, phase: 'player-action',
        message: `Took ${top.isJoker ? 'JOKER' : top.rank + ' ' + suitSymbol(top.suit)} from discard.`,
      }
    }

    case 'TOGGLE_SWAP_MODE':
      return { ...state, swapMode: !state.swapMode, swapFirstCardId: null, selectedCardIds: [] }

    case 'SWAP_CARD': {
      const { swapFirstCardId, playerHand } = state
      if (!swapFirstCardId) {
        // First tap
        return { ...state, swapFirstCardId: action.cardId }
      }
      if (swapFirstCardId === action.cardId) {
        // Tap same card → cancel
        return { ...state, swapFirstCardId: null }
      }
      // Second tap → swap positions
      const i = playerHand.findIndex(c => c.id === swapFirstCardId)
      const j = playerHand.findIndex(c => c.id === action.cardId)
      if (i < 0 || j < 0) return { ...state, swapFirstCardId: null }
      const newHand = [...playerHand]
      ;[newHand[i], newHand[j]] = [newHand[j], newHand[i]]
      return { ...state, playerHand: newHand, swapFirstCardId: null, message: 'Cards swapped!' }
    }

    case 'TOGGLE_CARD': {
      if (state.swapMode) return state // ignore in swap mode
      const already = state.selectedCardIds.includes(action.cardId)
      return {
        ...state,
        selectedCardIds: already
          ? state.selectedCardIds.filter(id => id !== action.cardId)
          : [...state.selectedCardIds, action.cardId],
      }
    }

    case 'STAGE_MELD': {
      if (state.selectedCardIds.length < 3) return { ...state, message: 'Select at least 3 cards.' }
      const selected = state.playerHand.filter(c => state.selectedCardIds.includes(c.id))
      if (!isValidMeld(selected)) return { ...state, message: 'Not a valid meld. Check the rules.' }
      return {
        ...state, stagedMelds: [...state.stagedMelds, selected],
        selectedCardIds: [],
        message: `Meld staged (${meldValue(selected)} pts). Stage more or commit.`,
      }
    }

    case 'CLEAR_STAGED':
      return { ...state, stagedMelds: [], selectedCardIds: [], message: 'Staged melds cleared.' }

    case 'COMMIT_MELDS': {
      if (state.stagedMelds.length === 0) return { ...state, message: 'No staged melds.' }
      const total = totalMeldValue(state.stagedMelds)
      if (!state.playerHasMelded && total < 51)
        return { ...state, message: `First meld needs 51+ points. You have ${total}.` }
      const usedIds = new Set(state.stagedMelds.flat().map(c => c.id))
      const newMelds = state.stagedMelds.map(cards => makeMeld(cards, 'human'))
      const newHand  = removeCards(state.playerHand, usedIds)
      const allMelds = [...state.melds, ...newMelds]

      // Check for burning: any new meld that's a 4-card group?
      const burningMeld = newMelds.find(m => isBurningGroup(m)) ?? null
      if (burningMeld) {
        const hasJoker = burningMeld.cards.some(c => c.isJoker)
        if (newHand.length === 0 && !hasJoker) {
          return finishRound({ ...state, playerHand: newHand, melds: allMelds, playerHasMelded: true, stagedMelds: [] }, 'human', true, false)
        }
        return {
          ...state, playerHand: newHand, melds: allMelds, playerHasMelded: true,
          stagedMelds: [], selectedCardIds: [],
          burningMeldId: burningMeld.id, burningHasJoker: hasJoker,
          message: hasJoker
            ? `🔥 4-of-a-kind with JOKER! Select 2 cards to steal Joker, or click BURN.`
            : `🔥 4-of-a-kind! Set will burn on discard.`,
        }
      }

      if (newHand.length === 0) {
        return finishRound({ ...state, playerHand: newHand, melds: allMelds, playerHasMelded: true, stagedMelds: [] }, 'human', true, false)
      }
      return {
        ...state, playerHand: newHand, melds: allMelds, playerHasMelded: true,
        stagedMelds: [], selectedCardIds: [],
        message: `Melded ${total} pts! Now add to sets or discard.`,
      }
    }

    case 'ADD_TO_MELD': {
      if (state.selectedCardIds.length === 0) return { ...state, message: 'Select cards to add.' }
      const selected = state.playerHand.filter(c => state.selectedCardIds.includes(c.id))
      const meld = state.melds.find(m => m.id === action.meldId)
      if (!meld) return state
      if (!canAddToMeld(meld, selected)) return { ...state, message: 'Cannot add those cards to that set.' }
      const usedIds = new Set(selected.map(c => c.id))
      const newMeld  = updatedMeld(meld, selected)
      let newMelds   = state.melds.map(m => m.id === meld.id ? newMeld : m)
      const newHand  = removeCards(state.playerHand, usedIds)

      // Check if the new meld is now a 4-card group (burning!)
      if (isBurningGroup(newMeld)) {
        const hasJoker = newMeld.cards.some(c => c.isJoker)
        if (newHand.length === 0 && !hasJoker) {
          return finishRound({ ...state, playerHand: newHand, melds: newMelds, selectedCardIds: [] }, 'human', true, false)
        }
        return {
          ...state, playerHand: newHand, melds: newMelds, selectedCardIds: [],
          burningMeldId: newMeld.id, burningHasJoker: hasJoker,
          message: hasJoker
            ? `🔥 4-of-a-kind with JOKER! Select 2 cards to steal Joker, or BURN.`
            : `🔥 4-of-a-kind! Set burns when you discard.`,
        }
      }

      if (newHand.length === 0) {
        return finishRound({ ...state, playerHand: newHand, melds: newMelds, selectedCardIds: [] }, 'human', true, false)
      }
      return { ...state, playerHand: newHand, melds: newMelds, selectedCardIds: [], message: 'Added to set!' }
    }

    case 'STEAL_JOKER': {
      if (state.selectedCardIds.length !== 1) return { ...state, message: 'Select exactly 1 card to replace the Joker.' }
      const realCard = state.playerHand.find(c => c.id === state.selectedCardIds[0])!
      const meld = state.melds.find(m => m.id === action.meldId)
      if (!meld) return state
      const { canSteal, jokerIndex } = canStealJoker(meld, realCard)
      if (!canSteal) return { ...state, message: 'Cannot replace Joker with that card.' }
      const joker = meld.cards[jokerIndex]
      const newMeldCards = sortedMeldCards(
        meld.cards.map((c, i) => i === jokerIndex ? realCard : c),
        meld.type,
      )
      const newMelds = state.melds.map(m => m.id === meld.id ? { ...m, cards: newMeldCards } : m)
      const newHand  = [...state.playerHand.filter(c => c.id !== realCard.id), joker]
      return { ...state, playerHand: newHand, melds: newMelds, selectedCardIds: [], message: 'Joker stolen! ★' }
    }

    case 'REPLACE_BURNING_JOKER': {
      if (state.selectedCardIds.length !== 2) return { ...state, message: 'Select exactly 2 cards to replace the Joker.' }
      const burningMeld = state.melds.find(m => m.id === state.burningMeldId)
      if (!burningMeld) return state
      const joker = burningMeld.cards.find(c => c.isJoker)
      if (!joker) return state
      const replacers = state.playerHand.filter(c => state.selectedCardIds.includes(c.id))
      if (replacers.length !== 2) return state
      // Player pays 2 cards → burning meld gets them, joker goes to player hand, set burns
      const fullSet  = [...burningMeld.cards.filter(c => !c.isJoker), ...replacers]
      const newDiscard = burnIntoDiscard(state.discardPile, fullSet)
      const newMelds = state.melds.filter(m => m.id !== state.burningMeldId)
      const usedIds  = new Set(replacers.map(c => c.id))
      const newHand  = [...removeCards(state.playerHand, usedIds), joker]
      return {
        ...state, playerHand: newHand, melds: newMelds,
        discardPile: newDiscard, selectedCardIds: [],
        burningMeldId: null, burningHasJoker: false,
        message: 'Joker rescued! ★ Burning set consumed.',
      }
    }

    case 'BURN_MELD': {
      const burningMeld = state.melds.find(m => m.id === state.burningMeldId)
      if (!burningMeld) return { ...state, burningMeldId: null, burningHasJoker: false }
      const newDiscard = burnIntoDiscard(state.discardPile, burningMeld.cards)
      const newMelds   = state.melds.filter(m => m.id !== state.burningMeldId)
      return {
        ...state, melds: newMelds, discardPile: newDiscard,
        burningMeldId: null, burningHasJoker: false,
        message: '🔥 Set burned — cards gone to middle of discard.',
      }
    }

    case 'DISCARD': {
      if (state.phase !== 'player-action') return state
      if (!state.drawnThisTurn) return { ...state, message: 'Draw a card first.' }

      // Auto-burn pending burning meld (no Joker, or player chose not to act)
      let s = state
      if (s.burningMeldId) {
        const bm = s.melds.find(m => m.id === s.burningMeldId)
        if (bm) {
          const newDiscard = burnIntoDiscard(s.discardPile, bm.cards)
          s = { ...s, melds: s.melds.filter(m => m.id !== s.burningMeldId), discardPile: newDiscard, burningMeldId: null, burningHasJoker: false }
        }
      }

      const card = s.playerHand.find(c => c.id === action.cardId)
      if (!card) return s
      const newHand    = s.playerHand.filter(c => c.id !== action.cardId)
      const newDiscard = [...s.discardPile, card]
      if (newHand.length === 0) {
        return finishRound({ ...s, playerHand: newHand, discardPile: newDiscard }, 'human', false, card.isJoker)
      }
      return {
        ...s, playerHand: newHand, discardPile: newDiscard,
        selectedCardIds: [], stagedMelds: [],
        drawnThisTurn: false, currentPlayer: 'ai', phase: 'ai-turn',
        message: "AI's turn…",
      }
    }

    case 'AI_TURN_DONE':
      return { ...state, ...action.next }

    case 'NEXT_ROUND': {
      if (state.roundNumber >= 7) return { ...state, phase: 'game-end' }
      return dealRound({ ...state, roundNumber: state.roundNumber + 1, dealerIndex: state.dealerIndex === 0 ? 1 : 0 })
    }

    case 'END_GAME_EARLY': {
      const penaltyRound: RoundScore = { human: 25, ai: 0 }
      return { ...state, roundScores: [...state.roundScores, penaltyRound], phase: 'game-end', message: 'Early end — +25 penalty.' }
    }

    default: return state
  }
}

// ── Round finish ──────────────────────────────────────────────────────────────
function finishRound(state: GameState, winner: PlayerKey, meldedOut: boolean, lastJoker: boolean): GameState {
  const bonus = meldedOut ? (lastJoker ? -20 : -10) : -5
  const humanScore = winner === 'human' ? bonus : !state.playerHasMelded ? 10 : calcHandPenalty(state.playerHand, state.playerHasMelded)
  const aiScore    = winner === 'ai'    ? bonus : !state.aiHasMelded    ? 10 : calcHandPenalty(state.aiHand,     state.aiHasMelded)
  return {
    ...state,
    roundScores: [...state.roundScores, { human: humanScore, ai: aiScore }],
    phase: 'round-end',
    message: `Round ${state.roundNumber} over! ${winner === 'human' ? 'You' : 'AI'} won.`,
    selectedCardIds: [], stagedMelds: [],
    burningMeldId: null, burningHasJoker: false,
  }
}

// ── Card display ──────────────────────────────────────────────────────────────
function CardView({
  card, faceDown = false, selected = false, swapSelected = false, onClick, small = false, glow = false,
}: {
  card: Card; faceDown?: boolean; selected?: boolean; swapSelected?: boolean
  onClick?: () => void; small?: boolean; glow?: boolean
}) {
  const w = small ? 38 : 48
  const h = small ? 54 : 68
  const redCard = isRed(card.suit)
  const sym     = suitSymbol(card.suit)
  const borderColor = swapSelected ? 'var(--yellow)' : selected ? 'var(--c-dash)' : 'var(--border)'
  const shadowColor = glow ? '0 0 10px rgba(251,146,60,0.8), ' : ''

  return (
    <div
      onClick={onClick}
      style={{
        width: w, height: h, flexShrink: 0,
        border: `2px solid ${borderColor}`,
        borderRadius: 3,
        background: faceDown ? 'var(--bg3)' : '#f8f4ec',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        position: 'relative', fontSize: small ? 9 : 11,
        boxShadow: `${shadowColor}${selected || swapSelected ? `0 0 6px ${borderColor}` : '2px 2px 0 rgba(0,0,0,0.5)'}`,
        transform: selected || swapSelected ? 'translateY(-6px)' : 'none',
        transition: 'transform 0.1s, box-shadow 0.1s',
        userSelect: 'none',
      }}
    >
      {faceDown ? (
        <div style={{
          width: '100%', height: '100%',
          background: 'repeating-linear-gradient(45deg,var(--bg3),var(--bg3) 3px,var(--border) 3px,var(--border) 6px)',
          borderRadius: 2,
        }} />
      ) : card.isJoker ? (
        <div style={{ color: '#8b5cf6', fontFamily: "'Press Start 2P',monospace", fontSize: small ? 7 : 9, textAlign: 'center', lineHeight: 1.4 }}>
          ★<br />JKR
        </div>
      ) : (
        <>
          <div style={{ position: 'absolute', top: 2, left: 3, color: redCard ? '#dc2626' : '#1e293b', fontWeight: 700 }}>{card.rank}</div>
          <div style={{ fontSize: small ? 16 : 20, color: redCard ? '#dc2626' : '#1e293b' }}>{sym}</div>
          <div style={{ position: 'absolute', bottom: 2, right: 3, color: redCard ? '#dc2626' : '#1e293b', fontWeight: 700, transform: 'rotate(180deg)' }}>{card.rank}</div>
        </>
      )}
    </div>
  )
}

// ── Meld display ──────────────────────────────────────────────────────────────
function MeldView({ meld, onAdd, onSteal, burning }: {
  meld: Meld; onAdd?: () => void; onSteal?: () => void; burning?: boolean
}) {
  return (
    <div style={{
      background: meld.owner === 'human' ? 'rgba(74,222,128,0.08)' : 'rgba(6,182,212,0.08)',
      border: `2px solid ${burning ? '#fb923c' : meld.owner === 'human' ? 'var(--c-weight)' : 'var(--c-dash)'}`,
      boxShadow: burning ? '0 0 12px rgba(251,146,60,0.6)' : undefined,
      padding: '6px 8px', borderRadius: 2,
      display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start',
    }}>
      <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: burning ? 'var(--c-journal)' : 'var(--muted)', marginBottom: 2 }}>
        {burning ? '🔥 ' : ''}{meld.owner === 'human' ? 'YOU' : 'AI'} · {meld.type.toUpperCase()} · {meldValue(meld.cards)} pts
      </div>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {meld.cards.map(c => <CardView key={c.id} card={c} small glow={burning && c.isJoker} />)}
      </div>
      {(onAdd || onSteal) && (
        <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
          {onAdd  && <button onClick={onAdd}  className="pixel-btn pixel-btn-secondary" style={{ fontSize: 7, padding: '3px 6px' }}>+ ADD</button>}
          {onSteal && meld.cards.some(c => c.isJoker) && (
            <button onClick={onSteal} className="pixel-btn pixel-btn-warning" style={{ fontSize: 7, padding: '3px 6px' }}>STEAL ★</button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Score display ─────────────────────────────────────────────────────────────
function ScoreBoard({ scores }: { scores: RoundScore[] }) {
  const ht = scores.reduce((s, r) => s + r.human, 0)
  const at = scores.reduce((s, r) => s + r.ai, 0)
  return (
    <div style={{ fontFamily: "'VT323',monospace", fontSize: 16 }}>
      <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 8, color: 'var(--muted)', marginBottom: 6 }}>SCORES</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto repeat(7,1fr) auto', gap: 2, fontSize: 14 }}>
        {['','R1','R2','R3','R4','R5','R6','R7','Σ'].map((h,i) => (
          <div key={i} style={{ color:'var(--muted)',textAlign:'center',padding:'2px 4px',fontFamily:"'Press Start 2P',monospace",fontSize:7 }}>{h}</div>
        ))}
        {['YOU',...scores.map(s=>s.human),ht].map((v,i) => (
          <div key={i} style={{ textAlign:'center',padding:'2px 4px',color:i===0?'var(--c-weight)':'var(--text)' }}>{v}</div>
        ))}
        {['AI',...scores.map(s=>s.ai),at].map((v,i) => (
          <div key={i} style={{ textAlign:'center',padding:'2px 4px',color:i===0?'var(--c-dash)':'var(--text)' }}>{v}</div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function JokerGame() {
  const [state, dispatch] = useReducer(reducer, undefined, makeInitial)

  useEffect(() => { dispatch({ type: 'INIT_ROUND' }) }, [])

  // AI turn automation
  useEffect(() => {
    if (state.phase !== 'ai-turn') return
    const timer = setTimeout(() => {
      let s = reshuffleDeckState({ ...state })
      const decision = computeAITurn(s)

      let aiHand     = [...s.aiHand]
      let deck       = [...s.deck]
      let discardPile = [...s.discardPile]
      let melds      = [...s.melds]
      let aiHasMelded = s.aiHasMelded

      // Draw
      if (decision.drawFromDiscard && discardPile.length > 0) {
        aiHand = [...aiHand, discardPile[discardPile.length - 1]]
        discardPile = discardPile.slice(0, -1)
      } else if (deck.length > 0) {
        aiHand = [...aiHand, deck[0]]
        deck = deck.slice(1)
      }

      const usedIds = new Set<string>()

      // Play melds
      if (decision.meldsToPlay.length > 0) {
        for (const meldCards of decision.meldsToPlay) {
          melds = [...melds, makeMeld(meldCards, 'ai')]
          meldCards.forEach(c => usedIds.add(c.id))
        }
        aiHasMelded = true
        aiHand = aiHand.filter(c => !usedIds.has(c.id))
      }

      // Add to existing melds
      for (const { meldId, cards } of decision.cardsToAddToMeld) {
        const meld = melds.find(m => m.id === meldId)
        if (meld) {
          const nm = updatedMeld(meld, cards)
          melds = melds.map(m => m.id === meldId ? nm : m)
          cards.forEach(c => usedIds.add(c.id))
          aiHand = aiHand.filter(c => !cards.map(x => x.id).includes(c.id))
        }
      }

      // Handle burning meld
      let burningMeldId = s.burningMeldId
      let burningHasJoker = s.burningHasJoker

      // Check if AI's actions created a new burning group
      const newBurning = melds.find(m => isBurningGroup(m) && m.id !== burningMeldId)
      if (newBurning && !burningMeldId) {
        burningMeldId = newBurning.id
        burningHasJoker = newBurning.cards.some(c => c.isJoker)
      }

      // AI resolves burning
      if (burningMeldId) {
        if (decision.burnAction === 'steal' && burningHasJoker) {
          const bm = melds.find(m => m.id === burningMeldId)
          if (bm) {
            const joker = bm.cards.find(c => c.isJoker)!
            const replacers = decision.jokerReplacementCards.filter(c => aiHand.some(h => h.id === c.id))
            if (replacers.length >= 2 && joker) {
              const fullSet = [...bm.cards.filter(c => !c.isJoker), replacers[0], replacers[1]]
              discardPile = burnIntoDiscard(discardPile, fullSet)
              melds = melds.filter(m => m.id !== burningMeldId)
              aiHand = [...aiHand.filter(c => c.id !== replacers[0].id && c.id !== replacers[1].id), joker]
            } else {
              discardPile = burnIntoDiscard(discardPile, bm.cards)
              melds = melds.filter(m => m.id !== burningMeldId)
            }
          }
        } else {
          // Burn it
          const bm = melds.find(m => m.id === burningMeldId)
          if (bm) {
            discardPile = burnIntoDiscard(discardPile, bm.cards)
            melds = melds.filter(m => m.id !== burningMeldId)
          }
        }
        burningMeldId = null
        burningHasJoker = false
      }

      // Discard
      const discardCard = aiHand.find(c => c.id === decision.discardCard.id) ?? aiHand[aiHand.length - 1]
      if (!discardCard) {
        dispatch({ type: 'AI_TURN_DONE', next: finishRound({ ...s, aiHand: [], deck, discardPile, melds, aiHasMelded, burningMeldId: null, burningHasJoker: false }, 'ai', true, false) })
        return
      }
      aiHand = aiHand.filter(c => c.id !== discardCard.id)
      discardPile = [...discardPile, discardCard]

      if (aiHand.length === 0) {
        dispatch({ type: 'AI_TURN_DONE', next: finishRound({ ...s, aiHand, deck, discardPile, melds, aiHasMelded, burningMeldId: null, burningHasJoker: false }, 'ai', false, discardCard.isJoker) })
        return
      }

      dispatch({
        type: 'AI_TURN_DONE',
        next: {
          aiHand, deck, discardPile, melds, aiHasMelded,
          burningMeldId: null, burningHasJoker: false,
          currentPlayer: 'human', phase: 'player-draw',
          drawnThisTurn: false, selectedCardIds: [], stagedMelds: [],
          message: 'Your turn — draw a card.',
        },
      })
    }, 1400)
    return () => clearTimeout(timer)
  }, [state.phase, state.roundNumber])

  const topDiscard = state.discardPile[state.discardPile.length - 1]
  const humanTotal = state.roundScores.reduce((s, r) => s + r.human, 0)
  const aiTotal    = state.roundScores.reduce((s, r) => s + r.ai, 0)

  // ── End screens ─────────────────────────────────────────────────────────────
  if (state.phase === 'game-end') {
    const humanWins = humanTotal < aiTotal
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 16px' }}>
        <h1 style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 13, color: 'var(--c-journal)', marginBottom: 24 }}>♦ JOKER — FINAL</h1>
        <div className="pixel-card card-journal" style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 11, color: humanWins ? 'var(--c-weight)' : 'var(--red)', marginBottom: 16 }}>
            {humanWins ? '🏆 YOU WIN!' : '💀 AI WINS'}
          </div>
          <div style={{ fontSize: 20, color: 'var(--muted)', marginBottom: 16 }}>You: {humanTotal} · AI: {aiTotal} (lowest wins)</div>
          <ScoreBoard scores={state.roundScores} />
        </div>
        <button className="pixel-btn pixel-btn-primary" onClick={() => dispatch({ type: 'INIT_ROUND' })}>NEW GAME</button>
      </div>
    )
  }

  if (state.phase === 'round-end') {
    const last = state.roundScores[state.roundScores.length - 1]
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 16px' }}>
        <h1 style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 12, color: 'var(--c-journal)', marginBottom: 20 }}>♦ ROUND {state.roundNumber} DONE</h1>
        <div className="pixel-card card-journal" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 20, marginBottom: 8 }}>
            You: <span style={{ color: last.human <= 0 ? 'var(--green)' : 'var(--red)' }}>{last.human > 0 ? '+' : ''}{last.human}</span>
            &nbsp;· AI: <span style={{ color: last.ai <= 0 ? 'var(--green)' : 'var(--red)' }}>{last.ai > 0 ? '+' : ''}{last.ai}</span>
          </div>
          <div style={{ fontSize: 16, color: 'var(--muted)', marginBottom: 16 }}>Running: You {humanTotal} · AI {aiTotal}</div>
          <ScoreBoard scores={state.roundScores} />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {state.roundNumber < 7 && (
            <button className="pixel-btn pixel-btn-primary" onClick={() => dispatch({ type: 'NEXT_ROUND' })}>
              NEXT ROUND ({state.roundNumber + 1}/7)
            </button>
          )}
          <button className="pixel-btn pixel-btn-danger" onClick={() => dispatch({ type: 'END_GAME_EARLY' })}>
            END GAME{state.roundNumber < 7 ? ' (+25 penalty)' : ''}
          </button>
        </div>
      </div>
    )
  }

  // ── Main game ────────────────────────────────────────────────────────────────
  const inAction = state.phase === 'player-action'
  const inDraw   = state.phase === 'player-draw'

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '16px', userSelect: 'none' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 11, color: 'var(--c-journal)', margin: 0 }}>♦ JOKER</h1>
        <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 8, color: 'var(--muted)' }}>
          ROUND {state.roundNumber}/7 · {state.currentPlayer === 'human' ? 'YOUR TURN' : "AI'S TURN"}
          {state.trumpSuit && ` · TRUMP: ${suitSymbol(state.trumpSuit)}`}
        </div>
        <ScoreBoard scores={state.roundScores} />
      </div>

      {/* Message */}
      <div style={{
        background: state.burningMeldId ? 'rgba(251,146,60,0.15)' : 'var(--bg3)',
        border: `1px solid ${state.burningMeldId ? 'var(--c-journal)' : 'var(--border)'}`,
        padding: '8px 12px', marginBottom: 12, fontSize: 16, minHeight: 36,
        color: state.burningMeldId ? 'var(--yellow)' : 'var(--text)',
      }}>
        {state.message || '…'}
      </div>

      {/* AI hand */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 8, color: 'var(--c-dash)', marginBottom: 6 }}>
          AI HAND ({state.aiHand.length}){state.aiHasMelded ? ' · MELDED' : ''}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {state.aiHand.map(c => <CardView key={c.id} card={c} faceDown small />)}
        </div>
      </div>

      {/* Table center */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap' }}>
        {/* Deck */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: 'var(--muted)', marginBottom: 4 }}>DECK ({state.deck.length})</div>
          {state.deck.length > 0 ? (
            <CardView card={state.deck[0]} faceDown onClick={inDraw ? () => dispatch({ type: 'DRAW_DECK' }) : undefined} />
          ) : (
            <div style={{ width: 48, height: 68, border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 12 }}>∅</div>
          )}
        </div>
        {/* Discard */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: 'var(--muted)', marginBottom: 4 }}>DISCARD</div>
          {topDiscard
            ? <CardView card={topDiscard} onClick={inDraw ? () => dispatch({ type: 'DRAW_DISCARD' }) : undefined} />
            : <div style={{ width: 48, height: 68, border: '2px dashed var(--border)' }} />}
        </div>
        {/* Trump */}
        {state.trumpCard && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: 'var(--c-journal)', marginBottom: 4 }}>
              TRUMP {state.trumpSuit ? suitSymbol(state.trumpSuit) : ''}
            </div>
            <CardView card={state.trumpCard} />
          </div>
        )}
        {/* Staged melds */}
        {state.stagedMelds.length > 0 && (
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: 'var(--yellow)', marginBottom: 4 }}>
              STAGED ({totalMeldValue(state.stagedMelds)} pts)
            </div>
            {state.stagedMelds.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 3, marginBottom: 4, flexWrap: 'wrap' }}>
                {m.map(c => <CardView key={c.id} card={c} small />)}
                <span style={{ fontSize: 13, color: 'var(--muted)', alignSelf: 'center' }}>{meldValue(m)}pt</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Melds on table */}
      {state.melds.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: 'var(--muted)', marginBottom: 6 }}>TABLE</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {state.melds.map(meld => (
              <MeldView
                key={meld.id}
                meld={meld}
                burning={meld.id === state.burningMeldId}
                onAdd={inAction && state.selectedCardIds.length > 0 && meld.id !== state.burningMeldId
                  ? () => dispatch({ type: 'ADD_TO_MELD', meldId: meld.id }) : undefined}
                onSteal={inAction && state.selectedCardIds.length === 1 && meld.id !== state.burningMeldId
                  ? () => dispatch({ type: 'STEAL_JOKER', meldId: meld.id }) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Player hand */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 8, color: 'var(--c-weight)', marginBottom: 6 }}>
          YOUR HAND ({state.playerHand.length}) {state.playerHasMelded ? '· MELDED' : '· need 51+'}
          {state.swapMode && <span style={{ color: 'var(--yellow)', marginLeft: 10 }}>SWAP MODE {state.swapFirstCardId ? '— tap 2nd card' : '— tap 1st card'}</span>}
          {!state.swapMode && state.selectedCardIds.length > 0 && (
            <span style={{ color: 'var(--yellow)', marginLeft: 10 }}>
              {state.selectedCardIds.length} selected
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {state.playerHand.map(card => (
            <CardView
              key={card.id}
              card={card}
              selected={!state.swapMode && state.selectedCardIds.includes(card.id)}
              swapSelected={state.swapMode && state.swapFirstCardId === card.id}
              onClick={
                state.swapMode
                  ? () => dispatch({ type: 'SWAP_CARD', cardId: card.id })
                  : inAction
                    ? () => dispatch({ type: 'TOGGLE_CARD', cardId: card.id })
                    : undefined
              }
            />
          ))}
        </div>
      </div>

      {/* Controls */}
      {inDraw && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="pixel-btn pixel-btn-primary" onClick={() => dispatch({ type: 'DRAW_DECK' })}>DRAW DECK</button>
          <button className="pixel-btn pixel-btn-secondary" onClick={() => dispatch({ type: 'DRAW_DISCARD' })}
            disabled={!topDiscard || (!state.playerHasMelded && topDiscard?.id !== state.trumpCard?.id)}>
            DRAW DISCARD
          </button>
        </div>
      )}

      {inAction && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Swap mode toggle */}
          <button
            className={`pixel-btn ${state.swapMode ? 'pixel-btn-warning' : 'pixel-btn-secondary'}`}
            onClick={() => dispatch({ type: 'TOGGLE_SWAP_MODE' })}
          >
            {state.swapMode ? '✓ SWAP MODE' : '⇄ SWAP'}
          </button>

          {!state.swapMode && (
            <>
              {/* Burning meld actions */}
              {state.burningMeldId && state.burningHasJoker && state.selectedCardIds.length === 2 && (
                <button className="pixel-btn pixel-btn-warning" onClick={() => dispatch({ type: 'REPLACE_BURNING_JOKER' })}>
                  RESCUE JOKER (2 cards)
                </button>
              )}
              {state.burningMeldId && (
                <button className="pixel-btn pixel-btn-danger" onClick={() => dispatch({ type: 'BURN_MELD' })}>
                  🔥 BURN SET
                </button>
              )}

              {/* Normal meld actions */}
              {!state.burningMeldId && (
                <>
                  <button className="pixel-btn pixel-btn-success"
                    onClick={() => dispatch({ type: 'STAGE_MELD' })}
                    disabled={state.selectedCardIds.length < 3}>
                    STAGE MELD
                  </button>
                  {state.stagedMelds.length > 0 && (
                    <>
                      <button className="pixel-btn pixel-btn-primary" onClick={() => dispatch({ type: 'COMMIT_MELDS' })}>
                        COMMIT ({totalMeldValue(state.stagedMelds)} pts)
                      </button>
                      <button className="pixel-btn pixel-btn-secondary" onClick={() => dispatch({ type: 'CLEAR_STAGED' })}>
                        CLEAR
                      </button>
                    </>
                  )}
                </>
              )}

              {/* Discard */}
              {state.selectedCardIds.length === 1 && (
                <button className="pixel-btn pixel-btn-warning"
                  onClick={() => dispatch({ type: 'DISCARD', cardId: state.selectedCardIds[0] })}>
                  DISCARD
                </button>
              )}
            </>
          )}

          <div style={{ fontSize: 14, color: 'var(--muted)' }}>
            {state.swapMode
              ? 'Tap two cards to swap their positions.'
              : 'Tap cards to select · STAGE sets · ADD to table · DISCARD 1 card.'}
          </div>
        </div>
      )}

      {state.phase === 'ai-turn' && (
        <div style={{ fontSize: 18, color: 'var(--muted)' }}>AI is thinking<span className="blink">…</span></div>
      )}
    </div>
  )
}
