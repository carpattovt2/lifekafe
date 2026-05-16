'use client'

import { useReducer, useEffect, useRef, useState, useCallback } from 'react'
import type { Card, GameState, Meld, Player, Phase, Suit } from '@/lib/game/types'
import { createDeck, shuffle, dealToPlayers, handCardValue, suitSymbol, isRed, RANK_NUM } from '@/lib/game/cards'
import {
  isValidMeld, meldType, meldValue, canAddToMeld, canStealJoker,
  totalMeldValue, findMeldsInHand, isBurningGroup, sortedMeldCards,
} from '@/lib/game/meld'
import { computeAITurn } from '@/lib/game/ai'
import { useLanguage } from '@/lib/LanguageContext'

// ── Helpers ───────────────────────────────────────────────────────────────────
let _meldId = 0
const mkMeldId = () => `m${++_meldId}`

function makeMeld(cards: Card[], ownerIndex: number): Meld {
  const type = meldType(cards)
  return { id: mkMeldId(), cards: sortedMeldCards(cards, type), ownerIndex, type }
}

function updatedMeld(meld: Meld, extra: Card[]): Meld {
  const cards = sortedMeldCards([...meld.cards, ...extra], meld.type)
  return { ...meld, cards }
}

function burnIntoDiscard(pile: Card[], burned: Card[]): Card[] {
  const mid = Math.floor(pile.length / 2)
  return [...pile.slice(0, mid), ...burned, ...pile.slice(mid)]
}

function calcPenalty(hand: Card[]): number {
  if (!hand.length) return 0
  return Math.min(10, Math.round(hand.reduce((s, c) => s + handCardValue(c), 0) / 10))
}

function reshuffleIfEmpty(state: GameState): GameState {
  if (state.deck.length > 0) return state
  const top  = state.discardPile[state.discardPile.length - 1]
  const rest = state.discardPile.slice(0, -1)
  return { ...state, deck: shuffle(rest), discardPile: top ? [top] : [] }
}

function nextPlayerIndex(current: number, numPlayers: number) {
  return (current + 1) % numPlayers
}

// ── Initial / deal ────────────────────────────────────────────────────────────
function makeSetupState(): GameState {
  return {
    phase: 'setup', numPlayers: 2, roundNumber: 1, dealerIndex: 0,
    currentPlayerIndex: 0, deck: [], discardPile: [],
    trumpCard: null, trumpSuit: null, players: [], melds: [],
    roundScores: [], selectedCardIds: [], stagedMelds: [],
    drawnThisTurn: false, drawnFromDiscardCardId: null, message: '',
    burningMeldId: null, burningHasJoker: false,
  }
}

function createPlayers(numPlayers: number): Player[] {
  const players: Player[] = [{ id: 'human', name: 'You', isHuman: true, hand: [], hasMelded: false, turnCount: 0 }]
  for (let i = 1; i < numPlayers; i++) {
    players.push({ id: `ai${i}`, name: `AI ${i}`, isHuman: false, hand: [], hasMelded: false, turnCount: 0 })
  }
  return players
}

// How many complete circles everyone has finished
function circlesCompleted(players: Player[]): number {
  if (!players.length) return 0
  return Math.min(...players.map(p => p.turnCount))
}

function dealRound(base: GameState): GameState {
  const raw = shuffle(createDeck())
  const d   = [...raw]

  // Flip trump FIRST (kept separate from discard pile)
  const flipped = d.shift()!
  let trumpCard: Card | null = null
  let trumpSuit: Suit | null = null
  let jokerForFirst: Card | null = null

  if (flipped.isJoker) {
    jokerForFirst = flipped  // No trump suit this round
  } else {
    trumpCard = flipped
    trumpSuit = flipped.suit as Suit
  }

  const firstPlayerIndex = nextPlayerIndex(base.dealerIndex, base.numPlayers)
  // All players get exactly 14 cards; first player draws from deck on turn 1
  const { hands, remaining } = dealToPlayers(d, base.numPlayers, firstPlayerIndex)

  const players = base.players.map((p, i) => ({
    ...p,
    hand: [...hands[i]],
    hasMelded: false,
    turnCount: 0,
  }))

  // Joker-as-trump: give to first player (remove 1 random card → back to 14)
  if (jokerForFirst) {
    const fp  = players[firstPlayerIndex]
    const rmIdx = Math.floor(Math.random() * fp.hand.length)
    remaining.push(fp.hand.splice(rmIdx, 1)[0])
    fp.hand.push(jokerForFirst)
  }

  const firstPhase: Phase = players[firstPlayerIndex].isHuman ? 'player-draw' : 'ai-turn'
  const jokerMsg = jokerForFirst ? ' (Trump was Joker — given to you!)' : ''

  return {
    ...base,
    roundNumber: base.roundNumber,
    deck: remaining,
    discardPile: [],        // ← EMPTY at round start
    trumpCard,
    trumpSuit,
    players,
    melds: [],
    selectedCardIds: [], stagedMelds: [],
    drawnThisTurn: false, drawnFromDiscardCardId: null,
    currentPlayerIndex: firstPlayerIndex,
    phase: firstPhase,
    message: players[firstPlayerIndex].isHuman
      ? `Your turn — draw from deck.${jokerMsg}`
      : `${players[firstPlayerIndex].name} is playing…`,
    burningMeldId: null, burningHasJoker: false,
  }
}

// ── Reducer ───────────────────────────────────────────────────────────────────
type Action =
  | { type: 'START_GAME'; numPlayers: number }
  | { type: 'INIT_ROUND' }
  | { type: 'DRAW_DECK' }
  | { type: 'DRAW_DISCARD' }
  | { type: 'TOGGLE_CARD'; cardId: string }
  | { type: 'REORDER_HAND'; fromIndex: number; toIndex: number }
  | { type: 'STAGE_MELD' }
  | { type: 'CLEAR_STAGED' }
  | { type: 'COMMIT_MELDS' }
  | { type: 'ADD_TO_MELD'; meldId: string }
  | { type: 'STEAL_JOKER'; meldId: string }
  | { type: 'BURN_MELD' }
  | { type: 'REPLACE_BURNING_JOKER' }
  | { type: 'TAKE_TRUMP' }
  | { type: 'RETURN_TO_DISCARD' }
  | { type: 'DISCARD'; cardId: string }
  | { type: 'AI_TURN_DONE'; next: Partial<GameState> }
  | { type: 'NEXT_ROUND' }
  | { type: 'END_GAME_EARLY' }

function mutPlayer(state: GameState, index: number, patch: Partial<Player>): Player[] {
  return state.players.map((p, i) => i === index ? { ...p, ...patch } : p)
}

function checkBurning(melds: Meld[], triggeredId: string): { burningMeldId: string | null; burningHasJoker: boolean } {
  const m = melds.find(x => x.id === triggeredId)
  if (m && isBurningGroup(m)) {
    return { burningMeldId: m.id, burningHasJoker: m.cards.some(c => c.isJoker) }
  }
  return { burningMeldId: null, burningHasJoker: false }
}

function finishRound(state: GameState, winnerIndex: number, meldedOut: boolean, lastJoker: boolean): GameState {
  const winner = state.players[winnerIndex]
  // Melded out all at once: -10 (or -20 if last card was Joker)
  // Gradual exit (discard last card): -5 for human, -10 for AI
  const bonus = meldedOut
    ? (lastJoker ? -20 : -10)
    : (winner.isHuman ? -5 : -10)
  const scores = state.players.map((p, i) => {
    if (i === winnerIndex) return bonus
    if (!p.hasMelded) return 10
    return calcPenalty(p.hand)
  })
  return {
    ...state,
    roundScores: [...state.roundScores, scores],
    phase: 'round-end',
    message: `Round ${state.roundNumber} over! ${state.players[winnerIndex].name} won.`,
    selectedCardIds: [], stagedMelds: [],
    burningMeldId: null, burningHasJoker: false,
  }
}

function advanceTurn(state: GameState): GameState {
  const next = nextPlayerIndex(state.currentPlayerIndex, state.numPlayers)
  const nextPlayer = state.players[next]
  return {
    ...state,
    currentPlayerIndex: next,
    phase: nextPlayer.isHuman ? 'player-draw' : 'ai-turn',
    drawnThisTurn: false, drawnFromDiscardCardId: null,
    selectedCardIds: [], stagedMelds: [],
    message: nextPlayer.isHuman ? 'Your turn — draw a card.' : `${nextPlayer.name} is playing…`,
  }
}

function reducer(state: GameState, action: Action): GameState {
  const cp = state.currentPlayerIndex
  const cur = state.players[cp]

  switch (action.type) {
    case 'START_GAME': {
      const players = createPlayers(action.numPlayers)
      const base: GameState = { ...makeSetupState(), numPlayers: action.numPlayers, players, dealerIndex: Math.floor(Math.random() * action.numPlayers) }
      return dealRound(base)
    }

    case 'INIT_ROUND': return dealRound(state)

    case 'DRAW_DECK': {
      if (state.drawnThisTurn || state.phase !== 'player-draw') return state
      let s = reshuffleIfEmpty(state)
      if (!s.deck.length) return { ...s, message: 'Deck is empty!' }
      const card = s.deck[0]
      const players = mutPlayer(s, cp, { hand: [...cur.hand, card] })
      return { ...s, deck: s.deck.slice(1), players, drawnThisTurn: true, phase: 'player-action',
        message: `Drew ${card.isJoker ? 'JOKER' : card.rank + ' ' + suitSymbol(card.suit)}. Meld or discard.` }
    }

    case 'DRAW_DISCARD': {
      if (state.drawnThisTurn || state.phase !== 'player-draw') return state
      const top = state.discardPile[state.discardPile.length - 1]
      if (!top) return { ...state, message: 'Discard pile is empty.' }
      // Circle restriction — discard draw only available from circle 3
      if (circlesCompleted(state.players) < 2)
        return { ...state, message: 'Cannot draw from discard until circle 3.' }
      // Allow in two cases:
      //  a) player already melded 51+ → free draw
      //  b) player not yet melded → must use drawn card for first meld (enforced by drawnFromDiscardCardId)
      const label = top.isJoker ? 'JOKER' : `${top.rank} ${suitSymbol(top.suit)}`
      const msg = cur.hasMelded
        ? `Took ${label} — free draw. Meld or discard.`
        : `Took ${label} — must use in first meld (51+) this turn!`
      return {
        ...state, discardPile: state.discardPile.slice(0, -1),
        players: mutPlayer(state, cp, { hand: [...cur.hand, top] }),
        drawnThisTurn: true, drawnFromDiscardCardId: top.id, phase: 'player-action',
        message: msg,
      }
    }

    case 'TAKE_TRUMP': {
      if (state.drawnThisTurn || state.phase !== 'player-draw' || !state.trumpCard) return state
      const card = state.trumpCard
      return {
        ...state,
        trumpCard: null, trumpSuit: null,
        players: mutPlayer(state, cp, { hand: [...cur.hand, card] }),
        drawnThisTurn: true, phase: 'player-action',
        message: `Took TRUMP ${card.rank} ${suitSymbol(card.suit)}. You MUST go out this turn!`,
      }
    }

    case 'TOGGLE_CARD': {
      const already = state.selectedCardIds.includes(action.cardId)
      return {
        ...state,
        selectedCardIds: already
          ? state.selectedCardIds.filter(id => id !== action.cardId)
          : [...state.selectedCardIds, action.cardId],
      }
    }

    case 'REORDER_HAND': {
      const h = [...cur.hand]
      const card = h.splice(action.fromIndex, 1)[0]
      h.splice(action.toIndex, 0, card)
      return { ...state, players: mutPlayer(state, cp, { hand: h }) }
    }

    case 'STAGE_MELD': {
      if (circlesCompleted(state.players) < 2)
        return { ...state, message: `Cannot meld until round 3 (circle ${circlesCompleted(state.players) + 1}/3 now).` }
      if (state.selectedCardIds.length < 3) return { ...state, message: 'Select at least 3 cards.' }
      const selected = cur.hand.filter(c => state.selectedCardIds.includes(c.id))
      if (!isValidMeld(selected)) return { ...state, message: 'Not a valid meld. Check rules.' }
      return { ...state, stagedMelds: [...state.stagedMelds, selected], selectedCardIds: [],
        message: `Staged (${meldValue(selected)} pts). Stage more or commit.` }
    }

    case 'CLEAR_STAGED':
      return { ...state, stagedMelds: [], selectedCardIds: [], message: 'Cleared.' }

    case 'COMMIT_MELDS': {
      if (!state.stagedMelds.length) return { ...state, message: 'No staged melds.' }
      const total = totalMeldValue(state.stagedMelds)
      if (!cur.hasMelded && total < 51)
        return { ...state, message: `First meld needs 51+ pts. You have ${total}.` }
      const usedIds  = new Set(state.stagedMelds.flat().map(c => c.id))
      const newMelds = state.stagedMelds.map(cards => makeMeld(cards, cp))
      const newHand  = cur.hand.filter(c => !usedIds.has(c.id))
      const allMelds = [...state.melds, ...newMelds]
      // Clear drawnFromDiscardCardId if drawn card was used
      const discardUsed = state.drawnFromDiscardCardId && usedIds.has(state.drawnFromDiscardCardId)

      const burning = newMelds.find(m => isBurningGroup(m))
      if (burning) {
        const hasJ = burning.cards.some(c => c.isJoker)
        if (!newHand.length && !hasJ) return finishRound({ ...state, players: mutPlayer(state, cp, { hand: newHand, hasMelded: true }), melds: allMelds, stagedMelds: [] }, cp, true, false)
        return { ...state, players: mutPlayer(state, cp, { hand: newHand, hasMelded: true }), melds: allMelds,
          stagedMelds: [], selectedCardIds: [],
          drawnFromDiscardCardId: discardUsed ? null : state.drawnFromDiscardCardId,
          burningMeldId: burning.id, burningHasJoker: hasJ,
          message: hasJ ? '🔥 4-of-a-kind with JOKER! Select 2 cards → RESCUE JOKER, or BURN.' : '🔥 4-of-a-kind! Burns on discard.' }
      }

      if (!newHand.length)
        return finishRound({ ...state, players: mutPlayer(state, cp, { hand: newHand, hasMelded: true }), melds: allMelds, stagedMelds: [] }, cp, true, false)

      return { ...state, players: mutPlayer(state, cp, { hand: newHand, hasMelded: true }),
        melds: allMelds, stagedMelds: [], selectedCardIds: [],
        drawnFromDiscardCardId: discardUsed ? null : state.drawnFromDiscardCardId,
        message: `Melded ${total} pts! Add to sets or discard.` }
    }

    case 'ADD_TO_MELD': {
      if (circlesCompleted(state.players) < 2)
        return { ...state, message: `Cannot add to sets until round 3.` }
      if (!state.selectedCardIds.length) return { ...state, message: 'Select cards to add.' }
      const selected = cur.hand.filter(c => state.selectedCardIds.includes(c.id))
      const meld = state.melds.find(m => m.id === action.meldId)
      if (!meld) return state
      if (!canAddToMeld(meld, selected)) return { ...state, message: 'Cannot add those cards to that set.' }
      const usedIds   = new Set(selected.map(c => c.id))
      const newMeld   = updatedMeld(meld, selected)
      let newMelds    = state.melds.map(m => m.id === meld.id ? newMeld : m)
      const newHand   = cur.hand.filter(c => !usedIds.has(c.id))
      const discardUsed = state.drawnFromDiscardCardId && usedIds.has(state.drawnFromDiscardCardId)

      if (isBurningGroup(newMeld)) {
        const hasJ = newMeld.cards.some(c => c.isJoker)
        if (!newHand.length && !hasJ) return finishRound({ ...state, players: mutPlayer(state, cp, { hand: newHand }), melds: newMelds, selectedCardIds: [] }, cp, true, false)
        return { ...state, players: mutPlayer(state, cp, { hand: newHand }), melds: newMelds, selectedCardIds: [],
          drawnFromDiscardCardId: discardUsed ? null : state.drawnFromDiscardCardId,
          burningMeldId: newMeld.id, burningHasJoker: hasJ,
          message: hasJ ? '🔥 4-of-a-kind with JOKER! RESCUE or BURN.' : '🔥 4-of-a-kind! Burns on discard.' }
      }
      if (!newHand.length) return finishRound({ ...state, players: mutPlayer(state, cp, { hand: newHand }), melds: newMelds, selectedCardIds: [] }, cp, true, false)
      return { ...state, players: mutPlayer(state, cp, { hand: newHand }), melds: newMelds, selectedCardIds: [],
        drawnFromDiscardCardId: discardUsed ? null : state.drawnFromDiscardCardId,
        message: 'Added to set!' }
    }

    case 'STEAL_JOKER': {
      if (circlesCompleted(state.players) < 2)
        return { ...state, message: `Cannot steal Joker until round 3.` }
      if (state.selectedCardIds.length !== 1) return { ...state, message: 'Select exactly 1 card.' }
      const realCard = cur.hand.find(c => c.id === state.selectedCardIds[0])!
      const meld = state.melds.find(m => m.id === action.meldId)
      if (!meld) return state
      const { canSteal, jokerIndex } = canStealJoker(meld, realCard)
      if (!canSteal) return { ...state, message: 'Cannot replace Joker with that card.' }
      const joker = meld.cards[jokerIndex]
      const newMeldCards = sortedMeldCards(meld.cards.map((c, i) => i === jokerIndex ? realCard : c), meld.type)
      const newMelds = state.melds.map(m => m.id === meld.id ? { ...m, cards: newMeldCards } : m)
      const newHand  = [...cur.hand.filter(c => c.id !== realCard.id), joker]
      return { ...state, players: mutPlayer(state, cp, { hand: newHand }), melds: newMelds, selectedCardIds: [], message: 'Joker stolen! ★' }
    }

    case 'REPLACE_BURNING_JOKER': {
      if (state.selectedCardIds.length !== 2) return { ...state, message: 'Select exactly 2 cards.' }
      const bm = state.melds.find(m => m.id === state.burningMeldId)
      if (!bm) return state
      const joker = bm.cards.find(c => c.isJoker)
      if (!joker) return state
      const replacers = cur.hand.filter(c => state.selectedCardIds.includes(c.id))
      if (replacers.length !== 2) return state
      const fullSet = [...bm.cards.filter(c => !c.isJoker), ...replacers]
      const usedIds = new Set(replacers.map(c => c.id))
      const newHand = [...cur.hand.filter(c => !usedIds.has(c.id)), joker]
      const newMelds = state.melds.filter(m => m.id !== state.burningMeldId)
      return { ...state, players: mutPlayer(state, cp, { hand: newHand }), melds: newMelds,
        discardPile: burnIntoDiscard(state.discardPile, fullSet),
        selectedCardIds: [], burningMeldId: null, burningHasJoker: false,
        message: 'Joker rescued! ★ Burning set consumed.' }
    }

    case 'BURN_MELD': {
      const bm = state.melds.find(m => m.id === state.burningMeldId)
      if (!bm) return { ...state, burningMeldId: null, burningHasJoker: false }
      return { ...state, melds: state.melds.filter(m => m.id !== state.burningMeldId),
        discardPile: burnIntoDiscard(state.discardPile, bm.cards),
        burningMeldId: null, burningHasJoker: false,
        message: '🔥 Set burned.' }
    }

    case 'RETURN_TO_DISCARD': {
      const drawnId = state.drawnFromDiscardCardId
      if (!drawnId) return state
      const card = cur.hand.find(c => c.id === drawnId)
      if (!card) return { ...state, drawnFromDiscardCardId: null, phase: 'player-draw', drawnThisTurn: false }
      // Remove from hand, clear from staged melds if present, put back on top of discard pile
      const newHand   = cur.hand.filter(c => c.id !== drawnId)
      const newStaged = state.stagedMelds
        .map(m => m.filter(c => c.id !== drawnId))
        .filter(m => m.length > 0)
      return {
        ...state,
        players: mutPlayer(state, cp, { hand: newHand }),
        discardPile: [...state.discardPile, card],
        stagedMelds: newStaged,
        selectedCardIds: state.selectedCardIds.filter(id => id !== drawnId),
        drawnThisTurn: false,
        drawnFromDiscardCardId: null,
        phase: 'player-draw',
        message: 'Card returned. Draw from deck or discard again.',
      }
    }

    case 'DISCARD': {
      if (state.phase !== 'player-action') return state
      if (!state.drawnThisTurn) return { ...state, message: 'Draw a card first.' }

      // Discard-from-pile guard — always offer RETURN TO DISCARD as escape
      if (state.drawnFromDiscardCardId) {
        const drawnCard = cur.hand.find(c => c.id === state.drawnFromDiscardCardId)
        const inStaged  = state.stagedMelds.flat().some(c => c.id === state.drawnFromDiscardCardId)
        if (drawnCard && !inStaged) {
          return { ...state, message: '⚠ Use the drawn card in a meld — or click RETURN TO DISCARD.' }
        }
      }

      // Auto-burn pending meld
      let s = state
      if (s.burningMeldId) {
        const bm = s.melds.find(m => m.id === s.burningMeldId)
        if (bm) s = { ...s, melds: s.melds.filter(m => m.id !== s.burningMeldId), discardPile: burnIntoDiscard(s.discardPile, bm.cards), burningMeldId: null, burningHasJoker: false }
      }

      const card    = s.players[cp].hand.find(c => c.id === action.cardId)
      if (!card) return s
      const newHand = s.players[cp].hand.filter(c => c.id !== action.cardId)
      const pile    = [...s.discardPile, card]
      // Increment turnCount so circle tracking is accurate
      const updatedPlayers = mutPlayer(s, cp, { hand: newHand, turnCount: s.players[cp].turnCount + 1 })
      if (!newHand.length) return finishRound({ ...s, players: updatedPlayers, discardPile: pile }, cp, false, card.isJoker)
      return advanceTurn({ ...s, players: updatedPlayers, discardPile: pile })
    }

    case 'AI_TURN_DONE': return { ...state, ...action.next }

    case 'NEXT_ROUND': {
      if (state.roundNumber >= 7) return { ...state, phase: 'game-end' }
      const nextDealer = nextPlayerIndex(state.dealerIndex, state.numPlayers)
      return dealRound({ ...state, roundNumber: state.roundNumber + 1, dealerIndex: nextDealer })
    }

    case 'END_GAME_EARLY': {
      const penalty = state.players.map((_, i) => i === 0 ? 25 : 0)
      return { ...state, roundScores: [...state.roundScores, penalty], phase: 'game-end', message: 'Early end — +25 penalty.' }
    }

    default: return state
  }
}

// ── AI turn effect helper ─────────────────────────────────────────────────────
function runAITurn(state: GameState, dispatch: (a: Action) => void) {
  const cp      = state.currentPlayerIndex
  const player  = state.players[cp]
  let s         = reshuffleIfEmpty({ ...state })
  const decision = computeAITurn(s, cp)

  let hand         = [...player.hand]
  let deck         = [...s.deck]
  let discardPile  = [...s.discardPile]
  let melds        = [...s.melds]
  let hasMelded    = player.hasMelded
  const usedIds    = new Set<string>()

  // Draw
  if (decision.drawFromDiscard && discardPile.length) {
    hand = [...hand, discardPile[discardPile.length - 1]]
    discardPile = discardPile.slice(0, -1)
  } else if (deck.length) {
    hand = [...hand, deck[0]]
    deck = deck.slice(1)
  }

  // Play melds
  if (decision.meldsToPlay.length) {
    for (const mc of decision.meldsToPlay) {
      melds = [...melds, makeMeld(mc, cp)]
      mc.forEach(c => usedIds.add(c.id))
    }
    hasMelded = true
    hand = hand.filter(c => !usedIds.has(c.id))
  }

  // Add to melds — only if hasMelded now
  if (hasMelded) {
    for (const { meldId, cards } of decision.cardsToAddToMeld) {
      const meld = melds.find(m => m.id === meldId)
      if (!meld) continue
      const nm = updatedMeld(meld, cards)
      melds = melds.map(m => m.id === meldId ? nm : m)
      cards.forEach(c => usedIds.add(c.id))
      hand = hand.filter(c => !cards.map(x => x.id).includes(c.id))
    }
  }

  // Handle burning (check newly created 4-card groups)
  let burningMeldId = s.burningMeldId
  let burningHasJoker = s.burningHasJoker
  const newBurning = melds.find(m => isBurningGroup(m) && m.id !== burningMeldId)
  if (newBurning && !burningMeldId) { burningMeldId = newBurning.id; burningHasJoker = newBurning.cards.some(c => c.isJoker) }

  if (burningMeldId) {
    const bm = melds.find(m => m.id === burningMeldId)
    if (bm) {
      if (decision.burnAction === 'steal' && burningHasJoker && decision.jokerReplacementCards.length >= 2) {
        const joker = bm.cards.find(c => c.isJoker)!
        const r = decision.jokerReplacementCards.filter(c => hand.some(h => h.id === c.id)).slice(0, 2)
        if (r.length >= 2) {
          const fullSet = [...bm.cards.filter(c => !c.isJoker), r[0], r[1]]
          discardPile = burnIntoDiscard(discardPile, fullSet)
          melds = melds.filter(m => m.id !== burningMeldId)
          hand = [...hand.filter(c => c.id !== r[0].id && c.id !== r[1].id), joker]
        } else { discardPile = burnIntoDiscard(discardPile, bm.cards); melds = melds.filter(m => m.id !== burningMeldId) }
      } else { discardPile = burnIntoDiscard(discardPile, bm.cards); melds = melds.filter(m => m.id !== burningMeldId) }
    }
    burningMeldId = null; burningHasJoker = false
  }

  // Discard
  const dc = hand.find(c => c.id === decision.discardCard.id) ?? hand[hand.length - 1]
  if (!dc) {
    const newPlayers = state.players.map((p, i) => i === cp ? { ...p, hand: [], hasMelded, turnCount: p.turnCount + 1 } : p)
    const ns = finishRound({ ...s, players: newPlayers, deck, discardPile, melds, burningMeldId: null, burningHasJoker: false }, cp, true, false)
    dispatch({ type: 'AI_TURN_DONE', next: ns })
    return
  }
  hand = hand.filter(c => c.id !== dc.id)
  discardPile = [...discardPile, dc]

  const newPlayers = state.players.map((p, i) => i === cp ? { ...p, hand, hasMelded, turnCount: p.turnCount + 1 } : p)

  if (!hand.length) {
    const ns = finishRound({ ...s, players: newPlayers, deck, discardPile, melds, burningMeldId: null, burningHasJoker: false }, cp, false, dc.isJoker)
    dispatch({ type: 'AI_TURN_DONE', next: ns })
    return
  }

  const nextIdx = nextPlayerIndex(cp, state.numPlayers)
  const nextPlayer = newPlayers[nextIdx]
  dispatch({
    type: 'AI_TURN_DONE',
    next: {
      players: newPlayers, deck, discardPile, melds,
      burningMeldId: null, burningHasJoker: false,
      currentPlayerIndex: nextIdx,
      phase: nextPlayer.isHuman ? 'player-draw' : 'ai-turn',
      drawnThisTurn: false, drawnFromDiscardCardId: null,
      selectedCardIds: [], stagedMelds: [],
      message: nextPlayer.isHuman ? 'Your turn — draw a card.' : `${nextPlayer.name} is playing…`,
    },
  })
}

// ── Card view ─────────────────────────────────────────────────────────────────
function CardView({ card, faceDown = false, selected = false, dimmed = false, onClick, small = false, glow = false, lifted = false, onPointerDown, onPointerUp, onPointerMove }: {
  card: Card; faceDown?: boolean; selected?: boolean; dimmed?: boolean
  onClick?: () => void; small?: boolean; glow?: boolean; lifted?: boolean
  onPointerDown?: (e: React.PointerEvent) => void
  onPointerUp?: (e: React.PointerEvent) => void
  onPointerMove?: (e: React.PointerEvent) => void
}) {
  const w = small ? 36 : 46, h = small ? 52 : 66
  const red = isRed(card.suit)
  const sym = suitSymbol(card.suit)
  return (
    <div onClick={onClick} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerMove={onPointerMove} style={{
      width: w, height: h, flexShrink: 0,
      border: `2px solid ${selected ? 'var(--c-dash)' : 'var(--border)'}`,
      borderRadius: 3,
      background: faceDown ? 'var(--bg3)' : dimmed ? '#c0bdb5' : '#f8f4ec',
      opacity: dimmed ? 0.55 : 1,
      cursor: onClick ? 'pointer' : 'default',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      position: 'relative', fontSize: small ? 9 : 11,
      boxShadow: glow ? '0 0 10px rgba(251,146,60,0.8)' : selected ? '0 0 6px var(--c-dash)' : lifted ? '0 8px 20px rgba(0,0,0,0.7)' : '2px 2px 0 rgba(0,0,0,0.5)',
      transform: selected ? 'translateY(-6px)' : lifted ? 'scale(1.12) translateY(-8px)' : 'none',
      transition: 'transform 0.1s, box-shadow 0.1s, opacity 0.1s',
      userSelect: 'none',
    }}>
      {faceDown ? (
        <div style={{ width: '100%', height: '100%', background: 'repeating-linear-gradient(45deg,var(--bg3),var(--bg3) 3px,var(--border) 3px,var(--border) 6px)', borderRadius: 2 }} />
      ) : card.isJoker ? (
        <div style={{ color: '#8b5cf6', fontFamily: "'Press Start 2P',monospace", fontSize: small ? 7 : 9, textAlign: 'center', lineHeight: 1.4 }}>★<br />JKR</div>
      ) : (
        <>
          <div style={{ position: 'absolute', top: 2, left: 3, color: red ? '#dc2626' : '#1e293b', fontWeight: 700 }}>{card.rank}</div>
          <div style={{ fontSize: small ? 15 : 19, color: red ? '#dc2626' : '#1e293b' }}>{sym}</div>
          <div style={{ position: 'absolute', bottom: 2, right: 3, color: red ? '#dc2626' : '#1e293b', fontWeight: 700, transform: 'rotate(180deg)' }}>{card.rank}</div>
        </>
      )}
    </div>
  )
}

// ── Draggable hand ────────────────────────────────────────────────────────────
type DragState = { cardId: string; fromIndex: number; toIndex: number; x: number; y: number } | null

function DraggableHand({ hand, selectedIds, stagedIds, onToggle, onReorder }: {
  hand: Card[]
  selectedIds: string[]
  stagedIds: string[]
  onToggle: (id: string) => void
  onReorder: (from: number, to: number) => void
}) {
  const [drag, setDrag] = useState<DragState>(null)
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardElsRef = useRef<Map<string, HTMLElement>>(new Map())

  const startDrag = useCallback((cardId: string, fromIndex: number, x: number, y: number) => {
    setDrag({ cardId, fromIndex, toIndex: fromIndex, x, y })
  }, [])

  // Use actual card element positions for multi-row drop support
  const calcDropIndex = useCallback((clientX: number, clientY: number, dragCardId: string): number => {
    const positions = hand
      .filter(c => c.id !== dragCardId)
      .map((c, logicalIdx) => {
        const el = cardElsRef.current.get(c.id)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { origIdx: hand.indexOf(c), cx: r.left + r.width / 2, cy: r.top + r.height / 2, left: r.left, right: r.right }
      })
      .filter(Boolean) as { origIdx: number; cx: number; cy: number; left: number; right: number }[]

    if (!positions.length) return 0

    // Find nearest card by 2D distance
    let minDist = Infinity, nearest = positions[0]
    for (const pos of positions) {
      const dist = Math.hypot(clientX - pos.cx, clientY - pos.cy)
      if (dist < minDist) { minDist = dist; nearest = pos }
    }

    // Insert before or after nearest based on X
    return clientX > nearest.cx ? nearest.origIdx + 1 : nearest.origIdx
  }, [hand])

  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => {
      const toIndex = calcDropIndex(e.clientX, e.clientY, drag.cardId)
      setDrag(d => d ? { ...d, x: e.clientX, y: e.clientY, toIndex } : null)
    }
    const onUp = (e: PointerEvent) => {
      setDrag(prev => {
        if (prev) {
          const to = calcDropIndex(e.clientX, e.clientY, prev.cardId)
          if (to !== prev.fromIndex) onReorder(prev.fromIndex, to)
        }
        return null
      })
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    return () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp) }
  }, [drag, calcDropIndex, onReorder])

  // Build display list: omit dragged card, insert gap at toIndex
  const visible = hand
    .map((card, i) => ({ card, origIndex: i }))
    .filter(item => !drag || item.card.id !== drag.cardId)

  const withGap: ({ type: 'card'; card: Card; origIndex: number } | { type: 'gap' })[] = []
  let gapInserted = false
  for (let i = 0; i <= visible.length; i++) {
    const insertHere = drag && !gapInserted && (
      i === visible.length ||
      (visible[i] && visible[i].origIndex >= drag.toIndex)
    )
    if (insertHere) { withGap.push({ type: 'gap' }); gapInserted = true }
    if (i < visible.length) withGap.push({ type: 'card', ...visible[i] })
  }
  if (drag && !gapInserted) withGap.push({ type: 'gap' })

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, position: 'relative', touchAction: 'none' }}>
      {withGap.map((item, renderIdx) => {
        if (item.type === 'gap') {
          return (
            <div key="gap" style={{
              width: 46, height: 66, borderRadius: 3, flexShrink: 0,
              border: '2px dashed var(--c-dash)',
              background: 'rgba(34,211,238,0.08)',
            }} />
          )
        }
        const { card, origIndex } = item
        const isSelected = !drag && selectedIds.includes(card.id)
        const isStaged   = stagedIds.includes(card.id)
        return (
          <div
            key={card.id}
            ref={el => { if (el) cardElsRef.current.set(card.id, el); else cardElsRef.current.delete(card.id) }}
            style={{ flexShrink: 0 }}
          >
            <CardView
              card={card}
              selected={isSelected && !isStaged}
              dimmed={isStaged}
              onClick={drag ? undefined : () => onToggle(card.id)}
              onPointerDown={(e: React.PointerEvent) => {
                e.preventDefault()
                e.currentTarget.setPointerCapture(e.pointerId)
                const { clientX, clientY } = e
                timerRef.current = setTimeout(() => {
                  startDrag(card.id, origIndex, clientX, clientY)
                  timerRef.current = null
                }, 200)
              }}
              onPointerUp={() => {
                if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
              }}
              onPointerMove={(e: React.PointerEvent) => {
                if (timerRef.current) {
                  if (Math.hypot(e.movementX, e.movementY) > 3) {
                    clearTimeout(timerRef.current); timerRef.current = null
                  }
                }
              }}
            />
          </div>
        )
      })}
      {/* Floating ghost */}
      {drag && (() => {
        const dragged = hand.find(c => c.id === drag.cardId)
        if (!dragged) return null
        return (
          <div style={{ position: 'fixed', left: drag.x - 23, top: drag.y - 33, zIndex: 999, pointerEvents: 'none' }}>
            <CardView card={dragged} lifted />
          </div>
        )
      })()}
    </div>
  )
}

// ── Meld view ─────────────────────────────────────────────────────────────────
function MeldView({ meld, playerNames, onAdd, onSteal, burning, addLabel = '+ADD', stealLabel = 'STEAL★' }: {
  meld: Meld; playerNames: string[]; onAdd?: () => void; onSteal?: () => void; burning?: boolean
  addLabel?: string; stealLabel?: string
}) {
  const ownerName = playerNames[meld.ownerIndex] ?? `P${meld.ownerIndex}`
  return (
    <div style={{
      background: meld.ownerIndex === 0 ? 'rgba(74,222,128,0.08)' : 'rgba(6,182,212,0.08)',
      border: `2px solid ${burning ? '#fb923c' : meld.ownerIndex === 0 ? 'var(--c-weight)' : 'var(--c-dash)'}`,
      boxShadow: burning ? '0 0 12px rgba(251,146,60,0.6)' : undefined,
      padding: '5px 7px', borderRadius: 2, display: 'inline-flex', flexDirection: 'column', gap: 3,
    }}>
      <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: burning ? 'var(--c-journal)' : 'var(--muted)' }}>
        {burning ? '🔥 ' : ''}{ownerName} · {meld.type.toUpperCase()} · {meldValue(meld.cards)} pts
      </div>
      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {meld.cards.map(c => <CardView key={c.id} card={c} small glow={burning && c.isJoker} />)}
      </div>
      {(onAdd || onSteal) && (
        <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
          {onAdd  && <button onClick={onAdd}  className="pixel-btn pixel-btn-secondary" style={{ fontSize: 6, padding: '3px 5px' }}>{addLabel}</button>}
          {onSteal && meld.cards.some(c => c.isJoker) && <button onClick={onSteal} className="pixel-btn pixel-btn-warning" style={{ fontSize: 6, padding: '3px 5px' }}>{stealLabel}</button>}
        </div>
      )}
    </div>
  )
}

// ── Score board ───────────────────────────────────────────────────────────────
function ScoreBoard({ players, roundScores, scoreLabel = 'SCORES', youLabel = 'YOU' }: {
  players: Player[]; roundScores: number[][]
  scoreLabel?: string; youLabel?: string
}) {
  const totals = players.map((_, pi) => roundScores.reduce((s, r) => s + (r[pi] ?? 0), 0))
  return (
    <div style={{ fontFamily: "'VT323',monospace", fontSize: 15, overflowX: 'auto' }}>
      <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: 'var(--muted)', marginBottom: 4 }}>{scoreLabel}</div>
      <div style={{ display: 'grid', gridTemplateColumns: `auto repeat(7,1fr) auto`, gap: 2, minWidth: 300 }}>
        {['','R1','R2','R3','R4','R5','R6','R7','Σ'].map((h,i) => (
          <div key={i} style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: 'var(--muted)', textAlign: 'center', padding: '1px 3px' }}>{h}</div>
        ))}
        {players.map((p, pi) => (
          [p.isHuman ? youLabel.toUpperCase() : p.name, ...roundScores.map(r => r[pi] ?? ''), totals[pi]].map((v, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '1px 3px', color: i === 0 ? (p.isHuman ? 'var(--c-weight)' : 'var(--c-dash)') : 'var(--text)', fontSize: 13 }}>{v}</div>
          ))
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function JokerGame() {
  const [state, dispatch] = useReducer(reducer, undefined, makeSetupState)
  const { t } = useLanguage()
  const tg = t.game

  // AI turn automation
  useEffect(() => {
    if (state.phase !== 'ai-turn') return
    const timer = setTimeout(() => runAITurn(state, dispatch), 1400)
    return () => clearTimeout(timer)
  }, [state.phase, state.currentPlayerIndex, state.roundNumber])

  const human = state.players[0]
  const topDiscard = state.discardPile[state.discardPile.length - 1]
  const stagedIds  = new Set(state.stagedMelds.flat().map(c => c.id))
  const playerNames = state.players.map(p => p.isHuman ? 'You' : p.name)

  // ── Setup screen ──────────────────────────────────────────────────────────
  if (state.phase === 'setup') {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', padding: '40px 16px', textAlign: 'center' }}>
        <h1 style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 16, color: 'var(--c-journal)', marginBottom: 32 }}>{tg.title}</h1>
        <div className="pixel-card card-journal" style={{ padding: 28 }}>
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 10, color: 'var(--muted)', marginBottom: 20 }}>{tg.choosePlayers}</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[2, 3, 4, 5].map(n => (
              <button key={n} className="pixel-btn pixel-btn-primary" style={{ fontSize: 14, padding: '14px 20px' }}
                onClick={() => dispatch({ type: 'START_GAME', numPlayers: n })}>
                {n}P
              </button>
            ))}
          </div>
          <div style={{ marginTop: 20, fontSize: 16, color: 'var(--muted)' }}>{tg.youAreP1}</div>
        </div>
      </div>
    )
  }

  // ── Game end / Round end ──────────────────────────────────────────────────
  if (state.phase === 'game-end') {
    const totals = state.players.map((_, pi) => state.roundScores.reduce((s, r) => s + (r[pi] ?? 0), 0))
    const minScore = Math.min(...totals)
    const winner = state.players[totals.indexOf(minScore)]
    const youLabel = t.nav.dashboard === 'Дашборд' ? 'Ти' : 'You'
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 16px' }}>
        <h1 style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 13, color: 'var(--c-journal)', marginBottom: 24 }}>{tg.finalScores}</h1>
        <div className="pixel-card card-journal" style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 11, color: winner.isHuman ? 'var(--c-weight)' : 'var(--red)', marginBottom: 16 }}>
            {winner.isHuman ? tg.youWin : `💀 ${winner.name} — ${tg.aiWins}`}
          </div>
          <div style={{ fontSize: 18, color: 'var(--muted)', marginBottom: 16 }}>
            {state.players.map((p, i) => `${p.isHuman ? youLabel : p.name}: ${totals[i]}`).join(' · ')}<br />{tg.lowestWins}
          </div>
          <ScoreBoard players={state.players} roundScores={state.roundScores} scoreLabel={tg.scores} youLabel={youLabel} />
        </div>
        <button className="pixel-btn pixel-btn-primary" onClick={() => dispatch({ type: 'INIT_ROUND' })}>{tg.newGame}</button>
      </div>
    )
  }

  if (state.phase === 'round-end') {
    const last = state.roundScores[state.roundScores.length - 1] ?? []
    const totals = state.players.map((_, pi) => state.roundScores.reduce((s, r) => s + (r[pi] ?? 0), 0))
    const youLabel = t.nav.dashboard === 'Дашборд' ? 'Ти' : 'You'
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 16px' }}>
        <h1 style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 12, color: 'var(--c-journal)', marginBottom: 20 }}>{tg.roundDone} {state.roundNumber}</h1>
        <div className="pixel-card card-journal" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 18, marginBottom: 8 }}>
            {state.players.map((p, i) => (
              <span key={i} style={{ marginRight: 16 }}>
                {p.isHuman ? youLabel : p.name}: <span style={{ color: (last[i] ?? 0) <= 0 ? 'var(--green)' : 'var(--red)' }}>{(last[i] ?? 0) > 0 ? '+' : ''}{last[i] ?? 0}</span>
              </span>
            ))}
          </div>
          <div style={{ fontSize: 16, color: 'var(--muted)', marginBottom: 16 }}>
            {tg.running} {state.players.map((p, i) => `${p.isHuman ? youLabel : p.name} ${totals[i]}`).join(' · ')}
          </div>
          <ScoreBoard players={state.players} roundScores={state.roundScores} scoreLabel={tg.scores} youLabel={youLabel} />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {state.roundNumber < 7 && <button className="pixel-btn pixel-btn-primary" onClick={() => dispatch({ type: 'NEXT_ROUND' })}>{tg.nextRound} ({state.roundNumber + 1}/7)</button>}
          <button className="pixel-btn pixel-btn-danger" onClick={() => dispatch({ type: 'END_GAME_EARLY' })}>{tg.endGame}{state.roundNumber < 7 ? ' (+25)' : ''}</button>
        </div>
      </div>
    )
  }

  // ── Main game ─────────────────────────────────────────────────────────────
  const inDraw   = state.phase === 'player-draw'
  const inAction = state.phase === 'player-action'
  const isMyTurn = state.players[state.currentPlayerIndex]?.isHuman
  const youLabel = t.nav.dashboard === 'Дашборд' ? 'Ти' : 'You'

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', padding: '12px 16px', userSelect: 'none' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        <h1 style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 10, color: 'var(--c-journal)', margin: 0 }}>{tg.title}</h1>
        <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: 'var(--muted)' }}>
          R{state.roundNumber}/7 · {state.trumpSuit ? `${tg.trump}: ${suitSymbol(state.trumpSuit)}` : tg.noTrump}
        </div>
        <ScoreBoard players={state.players} roundScores={state.roundScores} scoreLabel={tg.scores} youLabel={youLabel} />
      </div>

      {/* Message */}
      <div style={{
        background: state.burningMeldId ? 'rgba(251,146,60,0.15)' : 'var(--bg3)',
        border: `1px solid ${state.burningMeldId ? 'var(--c-journal)' : 'var(--border)'}`,
        padding: '7px 10px', marginBottom: 10, fontSize: 15, minHeight: 32,
        color: state.burningMeldId ? 'var(--yellow)' : 'var(--text)',
      }}>{state.message || '…'}</div>

      {/* Other players' hands */}
      {state.players.slice(1).map((p, i) => (
        <div key={p.id} style={{ marginBottom: 8 }}>
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: state.currentPlayerIndex === i + 1 ? 'var(--yellow)' : 'var(--c-dash)', marginBottom: 4 }}>
            {p.name} ({p.hand.length}){p.hasMelded ? tg.melded : ''}{state.currentPlayerIndex === i + 1 ? ' ◄' : ''}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {p.hand.map(c => <CardView key={c.id} card={c} faceDown small />)}
          </div>
        </div>
      ))}

      {/* Circle indicator */}
      {(() => {
        const circles = circlesCompleted(state.players)
        return (
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: circles >= 2 ? 'var(--c-weight)' : 'var(--yellow)', marginBottom: 8 }}>
            {tg.circle} {circles + 1} {circles < 2 ? tg.meldLocked : tg.meldOpen}
          </div>
        )
      })()}

      {/* Center: deck / discard / trump / staged */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: 'var(--muted)', marginBottom: 3 }}>{tg.deck} ({state.deck.length})</div>
          {state.deck.length > 0
            ? <CardView card={state.deck[0]} faceDown onClick={inDraw ? () => dispatch({ type: 'DRAW_DECK' }) : undefined} />
            : <div style={{ width: 46, height: 66, border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 11 }}>∅</div>}
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: 'var(--muted)', marginBottom: 3 }}>{tg.discardPile}</div>
          {topDiscard
            ? <CardView card={topDiscard} onClick={inDraw ? () => dispatch({ type: 'DRAW_DISCARD' }) : undefined} />
            : <div style={{ width: 46, height: 66, border: '2px dashed var(--border)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 10 }}>—</div>}
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: 'var(--c-journal)', marginBottom: 3 }}>
            {tg.trump} {state.trumpSuit ? suitSymbol(state.trumpSuit) : ''}
          </div>
          {state.trumpCard ? (
            <div>
              <CardView card={state.trumpCard} />
              {inDraw && !state.drawnThisTurn && (
                <button className="pixel-btn pixel-btn-warning" onClick={() => dispatch({ type: 'TAKE_TRUMP' })}
                  style={{ fontSize: 7, padding: '4px 6px', marginTop: 4, width: '100%' }}>
                  {tg.takeTrump}
                </button>
              )}
            </div>
          ) : (
            <div style={{ width: 46, height: 66, border: '2px dashed var(--border)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 10 }}>—</div>
          )}
        </div>

        {state.stagedMelds.length > 0 && (
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: 'var(--yellow)', marginBottom: 3 }}>{tg.staged} ({totalMeldValue(state.stagedMelds)} pts)</div>
            {state.stagedMelds.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 2, marginBottom: 3, flexWrap: 'wrap' }}>
                {m.map(c => <CardView key={c.id} card={c} small />)}
                <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>{meldValue(m)}pt</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Table melds */}
      {state.melds.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: 'var(--muted)', marginBottom: 5 }}>{tg.table}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {state.melds.map(meld => (
              <MeldView key={meld.id} meld={meld} playerNames={playerNames}
                burning={meld.id === state.burningMeldId}
                onAdd={inAction && state.selectedCardIds.length > 0 && meld.id !== state.burningMeldId
                  ? () => dispatch({ type: 'ADD_TO_MELD', meldId: meld.id }) : undefined}
                onSteal={inAction && state.selectedCardIds.length === 1 && meld.id !== state.burningMeldId
                  ? () => dispatch({ type: 'STEAL_JOKER', meldId: meld.id }) : undefined}
                stealLabel={tg.stealJoker} addLabel={tg.addToSet}
              />
            ))}
          </div>
        </div>
      )}

      {/* Human hand */}
      {human && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: 'var(--c-weight)', marginBottom: 5 }}>
            {tg.yourHand} ({human.hand.length}) {human.hasMelded ? tg.melded : tg.needPts}
            {state.drawnFromDiscardCardId && <span style={{ color: 'var(--yellow)', marginLeft: 8 }}>⚠ use drawn card!</span>}
            {state.selectedCardIds.length > 0 && <span style={{ color: 'var(--yellow)', marginLeft: 8 }}>{state.selectedCardIds.length} selected</span>}
          </div>
          <DraggableHand
            hand={human.hand}
            selectedIds={state.selectedCardIds}
            stagedIds={Array.from(stagedIds)}
            onToggle={id => inAction && dispatch({ type: 'TOGGLE_CARD', cardId: id })}
            onReorder={(from, to) => dispatch({ type: 'REORDER_HAND', fromIndex: from, toIndex: to })}
          />
        </div>
      )}

      {/* Controls */}
      {inDraw && isMyTurn && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="pixel-btn pixel-btn-primary" onClick={() => dispatch({ type: 'DRAW_DECK' })}>{tg.drawDeck}</button>
          <button className="pixel-btn pixel-btn-secondary" onClick={() => dispatch({ type: 'DRAW_DISCARD' })}
            disabled={!topDiscard || circlesCompleted(state.players) < 2}
            title={circlesCompleted(state.players) < 2 ? tg.noMeldCircle : ''}>
            {tg.drawDiscard}
          </button>
        </div>
      )}

      {inAction && isMyTurn && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          {state.burningMeldId ? (
            <>
              {state.burningHasJoker && state.selectedCardIds.length === 2 && (
                <button className="pixel-btn pixel-btn-warning" onClick={() => dispatch({ type: 'REPLACE_BURNING_JOKER' })}>{tg.rescueJoker}</button>
              )}
              <button className="pixel-btn pixel-btn-danger" onClick={() => dispatch({ type: 'BURN_MELD' })}>{tg.burnSet}</button>
            </>
          ) : (
            <>
              <button className="pixel-btn pixel-btn-success" onClick={() => dispatch({ type: 'STAGE_MELD' })} disabled={state.selectedCardIds.length < 3}>{tg.stageMeld}</button>
              {state.stagedMelds.length > 0 && (
                <>
                  <button className="pixel-btn pixel-btn-primary" onClick={() => dispatch({ type: 'COMMIT_MELDS' })}>{tg.commitMelds} ({totalMeldValue(state.stagedMelds)} pts)</button>
                  <button className="pixel-btn pixel-btn-secondary" onClick={() => dispatch({ type: 'CLEAR_STAGED' })}>{tg.clearStaged}</button>
                </>
              )}
            </>
          )}
          {state.selectedCardIds.length === 1 && !state.burningMeldId && (
            <button className="pixel-btn pixel-btn-warning" onClick={() => dispatch({ type: 'DISCARD', cardId: state.selectedCardIds[0] })}>{tg.discardBtn}</button>
          )}
          {(() => {
            const drawnId = state.drawnFromDiscardCardId
            if (!drawnId) return null
            const stillUnused = human?.hand.some(c => c.id === drawnId) &&
              !state.stagedMelds.flat().some(c => c.id === drawnId)
            if (!stillUnused) return null
            return (
              <button className="pixel-btn pixel-btn-secondary"
                onClick={() => dispatch({ type: 'RETURN_TO_DISCARD' })}
                style={{ borderColor: 'var(--yellow)', color: 'var(--yellow)' }}>
                {tg.returnDiscard}
              </button>
            )
          })()}
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Long-press → drag · tap → select · STAGE → COMMIT</div>
        </div>
      )}

      {state.phase === 'ai-turn' && (
        <div style={{ fontSize: 17, color: 'var(--muted)' }}>{state.players[state.currentPlayerIndex]?.name} {tg.aiThinking}<span className="blink">…</span></div>
      )}
    </div>
  )
}
