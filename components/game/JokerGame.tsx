'use client'

import { useReducer, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { Card, CardBack, GameState, Meld, Player, Phase, Suit } from '@/lib/game/types'
import { createDeck, shuffle, dealToPlayers, handCardValue, suitSymbol, isRed, RANK_NUM } from '@/lib/game/cards'
import {
  isValidMeld, meldType, meldValue, canAddToMeld, canStealJoker,
  totalMeldValue, findMeldsInHand, isBurningGroup, sortedMeldCards,
} from '@/lib/game/meld'
import { computeAITurn } from '@/lib/game/ai'
import { useLanguage } from '@/lib/LanguageContext'

// ── Sound hook ────────────────────────────────────────────────────────────────
function useGameSounds(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null)

  function getCtx() {
    if (typeof window === 'undefined') return null
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume()
    return ctxRef.current
  }

  const play = useCallback((type: 'draw' | 'discard' | 'meld' | 'burn') => {
    if (!enabled) return
    try {
      const ctx = getCtx(); if (!ctx) return
      const gain = ctx.createGain(); gain.connect(ctx.destination)
      const osc  = ctx.createOscillator(); osc.connect(gain)
      const now  = ctx.currentTime
      switch (type) {
        case 'draw':
          osc.type = 'sine'; osc.frequency.setValueAtTime(520, now); osc.frequency.linearRampToValueAtTime(780, now + 0.12)
          gain.gain.setValueAtTime(0.18, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
          osc.start(now); osc.stop(now + 0.18); break
        case 'discard':
          osc.type = 'triangle'; osc.frequency.setValueAtTime(280, now)
          gain.gain.setValueAtTime(0.22, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09)
          osc.start(now); osc.stop(now + 0.09); break
        case 'meld': {
          const o2 = ctx.createOscillator(), g2 = ctx.createGain()
          o2.connect(g2); g2.connect(ctx.destination)
          osc.type = 'sine'; o2.type = 'sine'
          osc.frequency.value = 523; o2.frequency.value = 659
          gain.gain.setValueAtTime(0.16, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28)
          g2.gain.setValueAtTime(0.12, now); g2.gain.exponentialRampToValueAtTime(0.001, now + 0.28)
          osc.start(now); o2.start(now); osc.stop(now + 0.3); o2.stop(now + 0.3); break }
        case 'burn':
          osc.type = 'sawtooth'; osc.frequency.setValueAtTime(180, now); osc.frequency.linearRampToValueAtTime(40, now + 0.5)
          gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
          osc.start(now); osc.stop(now + 0.5); break
      }
    } catch {}
  }, [enabled])

  return { play }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
let _meldId = 0
const mkMeldId = () => `m${++_meldId}`

function makeMeld(cards: Card[], ownerIndex: number): Meld {
  const type = meldType(cards)
  return { id: mkMeldId(), cards: sortedMeldCards(cards, type), ownerIndex, type }
}
function updatedMeld(meld: Meld, extra: Card[]): Meld {
  return { ...meld, cards: sortedMeldCards([...meld.cards, ...extra], meld.type) }
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
  const top = state.discardPile[state.discardPile.length - 1]
  const rest = state.discardPile.slice(0, -1)
  return { ...state, deck: shuffle(rest), discardPile: top ? [top] : [] }
}
function nextPlayerIndex(cur: number, n: number) { return (cur + 1) % n }
function circlesCompleted(players: Player[]) {
  return players.length ? Math.min(...players.map(p => p.turnCount)) : 0
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
function createPlayers(n: number): Player[] {
  const players: Player[] = [{ id: 'human', name: 'You', isHuman: true, hand: [], hasMelded: false, turnCount: 0 }]
  for (let i = 1; i < n; i++) players.push({ id: `ai${i}`, name: `AI ${i}`, isHuman: false, hand: [], hasMelded: false, turnCount: 0 })
  return players
}

function dealRound(base: GameState): GameState {
  const raw = shuffle(createDeck()); const d = [...raw]
  const flipped = d.shift()!
  let trumpCard: Card | null = null, trumpSuit: Suit | null = null, jokerForFirst: Card | null = null
  if (flipped.isJoker) jokerForFirst = flipped
  else { trumpCard = flipped; trumpSuit = flipped.suit as Suit }
  const firstIdx = nextPlayerIndex(base.dealerIndex, base.numPlayers)
  const { hands, remaining } = dealToPlayers(d, base.numPlayers, firstIdx)
  const players = base.players.map((p, i) => ({ ...p, hand: [...hands[i]], hasMelded: false, turnCount: 0 }))
  if (jokerForFirst) {
    const fp = players[firstIdx]
    remaining.push(fp.hand.splice(Math.floor(Math.random() * fp.hand.length), 1)[0])
    fp.hand.push(jokerForFirst)
  }
  const firstPhase: Phase = players[firstIdx].isHuman ? 'player-draw' : 'ai-turn'
  return {
    ...base, roundNumber: base.roundNumber, deck: remaining, discardPile: [],
    trumpCard, trumpSuit, players, melds: [],
    selectedCardIds: [], stagedMelds: [],
    drawnThisTurn: false, drawnFromDiscardCardId: null,
    currentPlayerIndex: firstIdx, phase: firstPhase,
    message: players[firstIdx].isHuman ? 'Your turn — draw from deck.' : `${players[firstIdx].name} is playing…`,
    burningMeldId: null, burningHasJoker: false,
  }
}

function mutPlayer(state: GameState, i: number, patch: Partial<Player>): Player[] {
  return state.players.map((p, idx) => idx === i ? { ...p, ...patch } : p)
}
function finishRound(state: GameState, winnerIdx: number, meldedOut: boolean, lastJoker: boolean): GameState {
  const winner = state.players[winnerIdx]
  const bonus = meldedOut ? (lastJoker ? -20 : -10) : (winner.isHuman ? -5 : -10)
  const scores = state.players.map((p, i) => {
    if (i === winnerIdx) return bonus
    if (!p.hasMelded) return 10
    return calcPenalty(p.hand)
  })
  return {
    ...state, roundScores: [...state.roundScores, scores], phase: 'round-end',
    message: `Round ${state.roundNumber} over! ${state.players[winnerIdx].name} won.`,
    selectedCardIds: [], stagedMelds: [], burningMeldId: null, burningHasJoker: false,
  }
}
function advanceTurn(state: GameState): GameState {
  const next = nextPlayerIndex(state.currentPlayerIndex, state.numPlayers)
  const nxt  = state.players[next]
  return {
    ...state, currentPlayerIndex: next,
    phase: nxt.isHuman ? 'player-draw' : 'ai-turn',
    drawnThisTurn: false, drawnFromDiscardCardId: null,
    selectedCardIds: [], stagedMelds: [],
    message: nxt.isHuman ? 'Your turn — draw from deck.' : `${nxt.name} is playing…`,
  }
}

// ── Reducer ───────────────────────────────────────────────────────────────────
type Action =
  | { type: 'START_GAME'; numPlayers: number }
  | { type: 'INIT_ROUND' }
  | { type: 'DRAW_DECK' }
  | { type: 'DRAW_DISCARD' }
  | { type: 'TAKE_TRUMP' }
  | { type: 'TOGGLE_CARD'; cardId: string }
  | { type: 'REORDER_HAND'; fromIndex: number; toIndex: number }
  | { type: 'REORDER_HAND_TO'; hand: Card[] }   // for sort
  | { type: 'STAGE_MELD' }
  | { type: 'CLEAR_STAGED' }
  | { type: 'COMMIT_MELDS' }
  | { type: 'ADD_TO_MELD'; meldId: string }
  | { type: 'STEAL_JOKER'; meldId: string }
  | { type: 'BURN_MELD' }
  | { type: 'REPLACE_BURNING_JOKER' }
  | { type: 'RETURN_TO_DISCARD' }
  | { type: 'DISCARD'; cardId: string }
  | { type: 'AI_TURN_DONE'; next: Partial<GameState> }
  | { type: 'NEXT_ROUND' }
  | { type: 'END_GAME_EARLY' }

function reducer(state: GameState, action: Action): GameState {
  const cp = state.currentPlayerIndex, cur = state.players[cp]
  switch (action.type) {
    case 'START_GAME': {
      const players = createPlayers(action.numPlayers)
      return dealRound({ ...makeSetupState(), numPlayers: action.numPlayers, players, dealerIndex: Math.floor(Math.random() * action.numPlayers) })
    }
    case 'INIT_ROUND': return dealRound(state)
    case 'DRAW_DECK': {
      if (state.drawnThisTurn || state.phase !== 'player-draw') return state
      let s = reshuffleIfEmpty(state)
      if (!s.deck.length) return { ...s, message: 'Deck is empty!' }
      const card = s.deck[0]
      return { ...s, deck: s.deck.slice(1), players: mutPlayer(s, cp, { hand: [...cur.hand, card] }), drawnThisTurn: true, phase: 'player-action',
        message: `Drew ${card.isJoker ? 'JOKER' : card.rank + ' ' + suitSymbol(card.suit)}.` }
    }
    case 'DRAW_DISCARD': {
      if (state.drawnThisTurn || state.phase !== 'player-draw') return state
      const top = state.discardPile[state.discardPile.length - 1]
      if (!top) return { ...state, message: 'Discard pile is empty.' }
      if (circlesCompleted(state.players) < 2) return { ...state, message: 'Cannot draw from discard until circle 3.' }
      const label = top.isJoker ? 'JOKER' : `${top.rank} ${suitSymbol(top.suit)}`
      return { ...state, discardPile: state.discardPile.slice(0, -1),
        players: mutPlayer(state, cp, { hand: [...cur.hand, top] }),
        drawnThisTurn: true, drawnFromDiscardCardId: top.id, phase: 'player-action',
        message: cur.hasMelded ? `Took ${label} — free draw.` : `Took ${label} — must use in first meld this turn!` }
    }
    case 'TAKE_TRUMP': {
      if (state.drawnThisTurn || state.phase !== 'player-draw' || !state.trumpCard) return state
      const card = state.trumpCard
      return { ...state, trumpCard: null, trumpSuit: null, players: mutPlayer(state, cp, { hand: [...cur.hand, card] }),
        drawnThisTurn: true, phase: 'player-action', message: `Took TRUMP — MUST go out this turn!` }
    }
    case 'TOGGLE_CARD': {
      const already = state.selectedCardIds.includes(action.cardId)
      return { ...state, selectedCardIds: already ? state.selectedCardIds.filter(id => id !== action.cardId) : [...state.selectedCardIds, action.cardId] }
    }
    case 'REORDER_HAND': {
      const h = [...cur.hand]; const card = h.splice(action.fromIndex, 1)[0]; h.splice(action.toIndex, 0, card)
      return { ...state, players: mutPlayer(state, cp, { hand: h }) }
    }
    case 'REORDER_HAND_TO':
      return { ...state, players: mutPlayer(state, 0, { hand: action.hand }) }
    case 'STAGE_MELD': {
      if (circlesCompleted(state.players) < 2) return { ...state, message: `Cannot meld until circle 3 (circle ${circlesCompleted(state.players) + 1}/3 now).` }
      if (state.selectedCardIds.length < 3) return { ...state, message: 'Select at least 3 cards.' }
      const selected = cur.hand.filter(c => state.selectedCardIds.includes(c.id))
      if (!isValidMeld(selected)) return { ...state, message: 'Not a valid meld. Check rules.' }
      return { ...state, stagedMelds: [...state.stagedMelds, selected], selectedCardIds: [], message: `Staged (${meldValue(selected)} pts). Stage more or commit.` }
    }
    case 'CLEAR_STAGED': return { ...state, stagedMelds: [], selectedCardIds: [], message: 'Cleared.' }
    case 'COMMIT_MELDS': {
      if (!state.stagedMelds.length) return { ...state, message: 'No staged melds.' }
      const total = totalMeldValue(state.stagedMelds)
      if (!cur.hasMelded && total < 51) return { ...state, message: `First meld needs 51+ pts. You have ${total}.` }
      const usedIds  = new Set(state.stagedMelds.flat().map(c => c.id))
      const newMelds = state.stagedMelds.map(cards => makeMeld(cards, cp))
      const newHand  = cur.hand.filter(c => !usedIds.has(c.id))
      const allMelds = [...state.melds, ...newMelds]
      const discardUsed = state.drawnFromDiscardCardId && usedIds.has(state.drawnFromDiscardCardId)
      const burning = newMelds.find(m => isBurningGroup(m))
      if (burning) {
        const hasJ = burning.cards.some(c => c.isJoker)
        if (!newHand.length && !hasJ) return finishRound({ ...state, players: mutPlayer(state, cp, { hand: newHand, hasMelded: true }), melds: allMelds, stagedMelds: [] }, cp, true, false)
        return { ...state, players: mutPlayer(state, cp, { hand: newHand, hasMelded: true }), melds: allMelds, stagedMelds: [], selectedCardIds: [],
          drawnFromDiscardCardId: discardUsed ? null : state.drawnFromDiscardCardId,
          burningMeldId: burning.id, burningHasJoker: hasJ, message: hasJ ? '🔥 4-of-a-kind with JOKER! RESCUE or BURN.' : '🔥 4-of-a-kind! Burns on discard.' }
      }
      if (!newHand.length) return finishRound({ ...state, players: mutPlayer(state, cp, { hand: newHand, hasMelded: true }), melds: allMelds, stagedMelds: [] }, cp, true, false)
      return { ...state, players: mutPlayer(state, cp, { hand: newHand, hasMelded: true }), melds: allMelds, stagedMelds: [], selectedCardIds: [],
        drawnFromDiscardCardId: discardUsed ? null : state.drawnFromDiscardCardId, message: `Melded ${total} pts!` }
    }
    case 'ADD_TO_MELD': {
      if (circlesCompleted(state.players) < 2) return { ...state, message: 'Cannot add to sets until round 3.' }
      if (!state.selectedCardIds.length) return { ...state, message: 'Select cards to add.' }
      const selected = cur.hand.filter(c => state.selectedCardIds.includes(c.id))
      const meld = state.melds.find(m => m.id === action.meldId); if (!meld) return state
      if (!canAddToMeld(meld, selected)) return { ...state, message: 'Cannot add those cards to that set.' }
      const usedIds = new Set(selected.map(c => c.id))
      const newMeld = updatedMeld(meld, selected)
      let newMelds  = state.melds.map(m => m.id === meld.id ? newMeld : m)
      const newHand = cur.hand.filter(c => !usedIds.has(c.id))
      const discardUsed = state.drawnFromDiscardCardId && usedIds.has(state.drawnFromDiscardCardId)
      if (isBurningGroup(newMeld)) {
        const hasJ = newMeld.cards.some(c => c.isJoker)
        if (!newHand.length && !hasJ) return finishRound({ ...state, players: mutPlayer(state, cp, { hand: newHand }), melds: newMelds, selectedCardIds: [] }, cp, true, false)
        return { ...state, players: mutPlayer(state, cp, { hand: newHand }), melds: newMelds, selectedCardIds: [],
          drawnFromDiscardCardId: discardUsed ? null : state.drawnFromDiscardCardId,
          burningMeldId: newMeld.id, burningHasJoker: hasJ, message: hasJ ? '🔥 4-of-a-kind with JOKER! RESCUE or BURN.' : '🔥 Burns on discard.' }
      }
      if (!newHand.length) return finishRound({ ...state, players: mutPlayer(state, cp, { hand: newHand }), melds: newMelds, selectedCardIds: [] }, cp, true, false)
      return { ...state, players: mutPlayer(state, cp, { hand: newHand }), melds: newMelds, selectedCardIds: [],
        drawnFromDiscardCardId: discardUsed ? null : state.drawnFromDiscardCardId, message: 'Added!' }
    }
    case 'STEAL_JOKER': {
      if (circlesCompleted(state.players) < 2) return { ...state, message: 'Cannot steal Joker until round 3.' }
      if (state.selectedCardIds.length !== 1) return { ...state, message: 'Select exactly 1 card.' }
      const realCard = cur.hand.find(c => c.id === state.selectedCardIds[0])!
      const meld = state.melds.find(m => m.id === action.meldId); if (!meld) return state
      const { canSteal, jokerIndex } = canStealJoker(meld, realCard)
      if (!canSteal) return { ...state, message: 'Cannot replace Joker with that card.' }
      const joker = meld.cards[jokerIndex]
      const newMeldCards = sortedMeldCards(meld.cards.map((c, i) => i === jokerIndex ? realCard : c), meld.type)
      const newMelds = state.melds.map(m => m.id === meld.id ? { ...m, cards: newMeldCards } : m)
      return { ...state, players: mutPlayer(state, cp, { hand: [...cur.hand.filter(c => c.id !== realCard.id), joker] }), melds: newMelds, selectedCardIds: [], message: 'Joker stolen! ★' }
    }
    case 'REPLACE_BURNING_JOKER': {
      if (state.selectedCardIds.length !== 2) return { ...state, message: 'Select exactly 2 cards.' }
      const bm = state.melds.find(m => m.id === state.burningMeldId); if (!bm) return state
      const joker = bm.cards.find(c => c.isJoker); if (!joker) return state
      const replacers = cur.hand.filter(c => state.selectedCardIds.includes(c.id)); if (replacers.length !== 2) return state
      const fullSet = [...bm.cards.filter(c => !c.isJoker), ...replacers]
      const usedIds = new Set(replacers.map(c => c.id))
      return { ...state, players: mutPlayer(state, cp, { hand: [...cur.hand.filter(c => !usedIds.has(c.id)), joker] }),
        melds: state.melds.filter(m => m.id !== state.burningMeldId),
        discardPile: burnIntoDiscard(state.discardPile, fullSet),
        selectedCardIds: [], burningMeldId: null, burningHasJoker: false, message: 'Joker rescued! ★' }
    }
    case 'BURN_MELD': {
      const bm = state.melds.find(m => m.id === state.burningMeldId); if (!bm) return { ...state, burningMeldId: null, burningHasJoker: false }
      return { ...state, melds: state.melds.filter(m => m.id !== state.burningMeldId),
        discardPile: burnIntoDiscard(state.discardPile, bm.cards),
        burningMeldId: null, burningHasJoker: false, message: '🔥 Set burned!' }
    }
    case 'RETURN_TO_DISCARD': {
      const drawnId = state.drawnFromDiscardCardId; if (!drawnId) return state
      const card = cur.hand.find(c => c.id === drawnId); if (!card) return { ...state, drawnFromDiscardCardId: null, phase: 'player-draw', drawnThisTurn: false }
      const newHand   = cur.hand.filter(c => c.id !== drawnId)
      const newStaged = state.stagedMelds.map(m => m.filter(c => c.id !== drawnId)).filter(m => m.length > 0)
      return { ...state, players: mutPlayer(state, cp, { hand: newHand }), discardPile: [...state.discardPile, card],
        stagedMelds: newStaged, selectedCardIds: state.selectedCardIds.filter(id => id !== drawnId),
        drawnThisTurn: false, drawnFromDiscardCardId: null, phase: 'player-draw', message: 'Card returned. Draw from deck or discard.' }
    }
    case 'DISCARD': {
      if (state.phase !== 'player-action') return state
      if (!state.drawnThisTurn) return { ...state, message: 'Draw a card first.' }
      if (state.drawnFromDiscardCardId) {
        const drawn = cur.hand.find(c => c.id === state.drawnFromDiscardCardId)
        const inStaged = state.stagedMelds.flat().some(c => c.id === state.drawnFromDiscardCardId)
        if (drawn && !inStaged) return { ...state, message: '⚠ Use the drawn card in a meld — or click RETURN TO DISCARD.' }
      }
      let s = state
      if (s.burningMeldId) {
        const bm = s.melds.find(m => m.id === s.burningMeldId)
        if (bm) s = { ...s, melds: s.melds.filter(m => m.id !== s.burningMeldId), discardPile: burnIntoDiscard(s.discardPile, bm.cards), burningMeldId: null, burningHasJoker: false }
      }
      const card = s.players[cp].hand.find(c => c.id === action.cardId); if (!card) return s
      const newHand = s.players[cp].hand.filter(c => c.id !== action.cardId)
      const pile    = [...s.discardPile, card]
      const upd     = mutPlayer(s, cp, { hand: newHand, turnCount: s.players[cp].turnCount + 1 })
      if (!newHand.length) return finishRound({ ...s, players: upd, discardPile: pile }, cp, false, card.isJoker)
      return advanceTurn({ ...s, players: upd, discardPile: pile })
    }
    case 'AI_TURN_DONE': return { ...state, ...action.next }
    case 'NEXT_ROUND': {
      if (state.roundNumber >= 7) return { ...state, phase: 'game-end' }
      return dealRound({ ...state, roundNumber: state.roundNumber + 1, dealerIndex: nextPlayerIndex(state.dealerIndex, state.numPlayers) })
    }
    case 'END_GAME_EARLY': {
      const penalty = state.players.map((_, i) => i === 0 ? 25 : 0)
      return { ...state, roundScores: [...state.roundScores, penalty], phase: 'game-end', message: 'Early end — +25 penalty.' }
    }
    default: return state
  }
}

// ── AI turn runner ────────────────────────────────────────────────────────────
function runAITurn(state: GameState, dispatch: (a: Action) => void) {
  const cp = state.currentPlayerIndex, player = state.players[cp]
  let s = reshuffleIfEmpty({ ...state })
  const decision = computeAITurn(s, cp)
  let hand = [...player.hand], deck = [...s.deck], discardPile = [...s.discardPile], melds = [...s.melds], hasMelded = player.hasMelded
  const usedIds = new Set<string>()
  if (decision.drawFromDiscard && discardPile.length) { hand = [...hand, discardPile[discardPile.length - 1]]; discardPile = discardPile.slice(0, -1) }
  else if (deck.length) { hand = [...hand, deck[0]]; deck = deck.slice(1) }
  if (decision.meldsToPlay.length) {
    for (const mc of decision.meldsToPlay) { melds = [...melds, makeMeld(mc, cp)]; mc.forEach(c => usedIds.add(c.id)) }
    hasMelded = true; hand = hand.filter(c => !usedIds.has(c.id))
  }
  if (hasMelded) {
    for (const { meldId, cards } of decision.cardsToAddToMeld) {
      const meld = melds.find(m => m.id === meldId); if (!meld) continue
      const nm = updatedMeld(meld, cards); melds = melds.map(m => m.id === meldId ? nm : m)
      cards.forEach(c => usedIds.add(c.id)); hand = hand.filter(c => !cards.map(x => x.id).includes(c.id))
    }
  }
  let burningMeldId = s.burningMeldId, burningHasJoker = s.burningHasJoker
  const newBurning = melds.find(m => isBurningGroup(m) && m.id !== burningMeldId)
  if (newBurning && !burningMeldId) { burningMeldId = newBurning.id; burningHasJoker = newBurning.cards.some(c => c.isJoker) }
  if (burningMeldId) {
    const bm = melds.find(m => m.id === burningMeldId)
    if (bm) {
      if (decision.burnAction === 'steal' && burningHasJoker && decision.jokerReplacementCards.length >= 2) {
        const joker = bm.cards.find(c => c.isJoker)!
        const r = decision.jokerReplacementCards.filter(c => hand.some(h => h.id === c.id)).slice(0, 2)
        if (r.length >= 2) { discardPile = burnIntoDiscard(discardPile, [...bm.cards.filter(c => !c.isJoker), r[0], r[1]]); melds = melds.filter(m => m.id !== burningMeldId); hand = [...hand.filter(c => c.id !== r[0].id && c.id !== r[1].id), joker] }
        else { discardPile = burnIntoDiscard(discardPile, bm.cards); melds = melds.filter(m => m.id !== burningMeldId) }
      } else { discardPile = burnIntoDiscard(discardPile, bm.cards); melds = melds.filter(m => m.id !== burningMeldId) }
    }
    burningMeldId = null; burningHasJoker = false
  }
  const dc = hand.find(c => c.id === decision.discardCard.id) ?? hand[hand.length - 1]
  const newPlayers = state.players.map((p, i) => i === cp ? { ...p, hand: dc ? hand.filter(c => c.id !== dc.id) : [], hasMelded, turnCount: p.turnCount + 1 } : p)
  if (!dc) { dispatch({ type: 'AI_TURN_DONE', next: finishRound({ ...s, players: newPlayers, deck, discardPile, melds, burningMeldId: null, burningHasJoker: false }, cp, true, false) }); return }
  const finalHand = newPlayers[cp].hand
  discardPile = [...discardPile, dc]
  if (!finalHand.length) { dispatch({ type: 'AI_TURN_DONE', next: finishRound({ ...s, players: newPlayers, deck, discardPile, melds, burningMeldId: null, burningHasJoker: false }, cp, false, dc.isJoker) }); return }
  const nextIdx = nextPlayerIndex(cp, state.numPlayers), nxt = newPlayers[nextIdx]
  dispatch({ type: 'AI_TURN_DONE', next: { players: newPlayers, deck, discardPile, melds, burningMeldId: null, burningHasJoker: false, currentPlayerIndex: nextIdx, phase: nxt.isHuman ? 'player-draw' : 'ai-turn', drawnThisTurn: false, drawnFromDiscardCardId: null, selectedCardIds: [], stagedMelds: [], message: nxt.isHuman ? 'Your turn — draw from deck.' : `${nxt.name} is playing…` } })
}

// ── Card back renderer ────────────────────────────────────────────────────────
function renderCardBack(back: CardBack, w: number, h: number) {
  switch (back) {
    case 'classic': return (
      <div style={{ width: '100%', height: '100%', borderRadius: 2,
        background: 'repeating-linear-gradient(-45deg, #1a3a6b 0px, #1a3a6b 4px, #2855a0 4px, #2855a0 9px)' }} />
    )
    case 'pixel': return (
      <div style={{ width: '100%', height: '100%', borderRadius: 2,
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 4px, transparent 4px, transparent 8px), repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 4px, transparent 4px, transparent 8px)',
        background: '#0a0a2a',
        backgroundSize: '8px 8px', }} />
    )
    case 'dark': return (
      <div style={{ width: '100%', height: '100%', borderRadius: 2, background: '#0f0f1f',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 3, padding: 4, fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>
        {Array.from({ length: 12 }).map((_, i) => <span key={i}>✦</span>)}
      </div>
    )
  }
}

// ── CardView ──────────────────────────────────────────────────────────────────
function CardView({ card, faceDown = false, selected = false, dimmed = false, onClick, small = false, glow = false, lifted = false, animClass = '', cardBack = 'classic' as CardBack, highlight = null as 'green' | 'yellow' | null, onPointerDown, onPointerUp, onPointerMove }: {
  card: Card; faceDown?: boolean; selected?: boolean; dimmed?: boolean; onClick?: () => void
  small?: boolean; glow?: boolean; lifted?: boolean; animClass?: string; cardBack?: CardBack
  highlight?: 'green' | 'yellow' | null
  onPointerDown?: (e: React.PointerEvent) => void
  onPointerUp?: (e: React.PointerEvent) => void
  onPointerMove?: (e: React.PointerEvent) => void
}) {
  const w = small ? 42 : 56, h = small ? 58 : 80
  const red = isRed(card.suit); const sym = suitSymbol(card.suit)
  const rankFontSize = small ? 12 : 16; const suitFontSize = small ? 24 : 36
  const suitColor = red ? '#e63946' : '#1a1a1a'
  const borderColor = glow ? '#fb923c' : selected ? '#22d3ee' : 'transparent'

  const hlClass = !selected && !glow && !lifted
    ? (highlight === 'green' ? 'card-highlight-green' : highlight === 'yellow' ? 'card-highlight-yellow' : '')
    : ''

  return (
    <div
      onClick={onClick}
      onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerMove={onPointerMove}
      className={`${animClass} ${hlClass}`}
      style={{
        width: w, height: h, flexShrink: 0, borderRadius: 4,
        border: `2px solid ${borderColor || (glow ? '#fb923c' : selected ? '#22d3ee' : '#c8c0a8')}`,
        background: faceDown ? '#2d2d44' : '#fffef0',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
        opacity: dimmed ? 0.48 : 1,
        boxShadow: glow ? '0 0 10px rgba(251,146,60,0.8)' : selected ? '0 0 8px rgba(34,211,238,0.7)' : lifted ? '0 12px 28px rgba(0,0,0,0.75)' : '2px 3px 0 rgba(0,0,0,0.45)',
        transform: selected ? 'translateY(-8px)' : lifted ? 'scale(1.1) translateY(-10px)' : 'none',
        transition: 'transform 0.1s, box-shadow 0.1s, opacity 0.12s',
        userSelect: 'none',
      }}
    >
      {faceDown ? (
        renderCardBack(cardBack, w, h)
      ) : card.isJoker ? (
        <div style={{
          width: '100%', height: '100%', borderRadius: 3,
          background: 'linear-gradient(135deg, #5b21b6 0%, #9333ea 40%, #fbbf24 100%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'inset 0 0 12px rgba(251,191,36,0.4)',
        }}>
          <div style={{ fontSize: small ? 20 : 30, lineHeight: 1, color: '#ffd700', textShadow: '0 0 8px rgba(255,215,0,0.9)' }}>★</div>
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: small ? 6 : 8, color: '#ffd700', marginTop: 3, letterSpacing: 1 }}>JKR</div>
        </div>
      ) : (
        <>
          <div style={{ position: 'absolute', top: 3, left: 4, color: suitColor, fontWeight: 800, fontSize: rankFontSize, lineHeight: 1 }}>{card.rank}</div>
          <div style={{ color: suitColor, fontSize: suitFontSize, lineHeight: 1 }}>{sym}</div>
          <div style={{ position: 'absolute', bottom: 3, right: 4, color: suitColor, fontWeight: 800, fontSize: rankFontSize, lineHeight: 1, transform: 'rotate(180deg)' }}>{card.rank}</div>
        </>
      )}
    </div>
  )
}

// ── DraggableHand ─────────────────────────────────────────────────────────────
type DragState = { cardId: string; fromIndex: number; toIndex: number; x: number; y: number } | null

function DraggableHand({ hand, selectedIds, stagedIds, drawnCardId, onToggle, onReorder, cardBack, highlights }: {
  hand: Card[]; selectedIds: string[]; stagedIds: string[]; drawnCardId?: string | null
  onToggle: (id: string) => void; onReorder: (from: number, to: number) => void
  cardBack: CardBack; highlights: Map<string, 'green' | 'yellow'>
}) {
  const [drag, setDrag] = useState<DragState>(null)
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardElsRef = useRef<Map<string, HTMLElement>>(new Map())

  const calcDropIndex = useCallback((cx: number, cy: number, dragId: string): number => {
    const positions = hand.filter(c => c.id !== dragId).map(c => {
      const el = cardElsRef.current.get(c.id); if (!el) return null
      const r = el.getBoundingClientRect()
      return { origIdx: hand.indexOf(c), cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
    }).filter(Boolean) as { origIdx: number; cx: number; cy: number }[]
    if (!positions.length) return 0
    let minDist = Infinity, nearest = positions[0]
    for (const pos of positions) { const d = Math.hypot(cx - pos.cx, cy - pos.cy); if (d < minDist) { minDist = d; nearest = pos } }
    const el = hand[nearest.origIdx] ? cardElsRef.current.get(hand[nearest.origIdx].id) : null
    return el ? (cx > el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2 ? nearest.origIdx + 1 : nearest.origIdx) : nearest.origIdx
  }, [hand])

  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => { const ti = calcDropIndex(e.clientX, e.clientY, drag.cardId); setDrag(d => d ? { ...d, x: e.clientX, y: e.clientY, toIndex: ti } : null) }
    const onUp   = (e: PointerEvent) => { setDrag(prev => { if (prev) { const ti = calcDropIndex(e.clientX, e.clientY, prev.cardId); if (ti !== prev.fromIndex) onReorder(prev.fromIndex, ti) } return null }) }
    document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp)
    return () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp) }
  }, [drag, calcDropIndex, onReorder])

  const visible = hand.map((card, i) => ({ card, origIndex: i })).filter(item => !drag || item.card.id !== drag.cardId)
  const withGap: ({ type: 'card'; card: Card; origIndex: number } | { type: 'gap' })[] = []
  let gapDone = false
  for (let i = 0; i <= visible.length; i++) {
    if (drag && !gapDone && (i === visible.length || (visible[i] && visible[i].origIndex >= drag.toIndex))) { withGap.push({ type: 'gap' }); gapDone = true }
    if (i < visible.length) withGap.push({ type: 'card', ...visible[i] })
  }
  if (drag && !gapDone) withGap.push({ type: 'gap' })

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, position: 'relative', touchAction: 'none' }}>
      {withGap.map((item, ri) => {
        if (item.type === 'gap') return (
          <div key="gap" style={{ width: 56, height: 80, border: '2px dashed var(--c-dash)', borderRadius: 4, flexShrink: 0, background: 'rgba(34,211,238,0.08)' }} />
        )
        const { card, origIndex } = item
        const isSelected = !drag && selectedIds.includes(card.id)
        const isStaged   = stagedIds.includes(card.id)
        const isDrawn    = card.id === drawnCardId
        return (
          <div key={card.id} ref={el => { if (el) cardElsRef.current.set(card.id, el); else cardElsRef.current.delete(card.id) }} style={{ flexShrink: 0 }}>
            <CardView card={card} selected={isSelected && !isStaged} dimmed={isStaged} cardBack={cardBack}
              animClass={isDrawn ? 'card-draw-in' : ''}
              highlight={!isSelected && !isStaged ? (highlights.get(card.id) ?? null) : null}
              onClick={drag ? undefined : () => onToggle(card.id)}
              onPointerDown={(e: React.PointerEvent) => {
                e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId)
                const { clientX, clientY } = e
                timerRef.current = setTimeout(() => { startDrag(card.id, origIndex, clientX, clientY); timerRef.current = null }, 200)
              }}
              onPointerUp={() => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null } }}
              onPointerMove={(e: React.PointerEvent) => { if (timerRef.current && Math.hypot(e.movementX, e.movementY) > 3) { clearTimeout(timerRef.current); timerRef.current = null } }}
            />
          </div>
        )
      })}
      {drag && (() => { const d = hand.find(c => c.id === drag.cardId); if (!d) return null; return (
        <div style={{ position: 'fixed', left: drag.x - 28, top: drag.y - 40, zIndex: 999, pointerEvents: 'none' }}>
          <CardView card={d} lifted cardBack={cardBack} />
        </div>
      ) })()}
    </div>
  )
  function startDrag(cardId: string, fromIndex: number, x: number, y: number) { setDrag({ cardId, fromIndex, toIndex: fromIndex, x, y }) }
}

// ── MeldView ──────────────────────────────────────────────────────────────────
function MeldView({ meld, playerNames, onAdd, onSteal, burning, cardBack, addLabel = '+ADD', stealLabel = 'STEAL★' }: {
  meld: Meld; playerNames: string[]; onAdd?: () => void; onSteal?: () => void; burning?: boolean
  cardBack: CardBack; addLabel?: string; stealLabel?: string
}) {
  return (
    <div style={{
      background: meld.ownerIndex === 0 ? 'rgba(74,222,128,0.1)' : 'rgba(6,182,212,0.1)',
      border: `2px solid ${burning ? '#fb923c' : meld.ownerIndex === 0 ? 'var(--c-weight)' : 'var(--c-dash)'}`,
      boxShadow: burning ? '0 0 14px rgba(251,146,60,0.7)' : undefined,
      padding: '6px 8px', borderRadius: 3, display: 'inline-flex', flexDirection: 'column', gap: 4, flexShrink: 0,
    }}>
      <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: burning ? 'var(--c-journal)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
        {burning ? '🔥 ' : ''}{playerNames[meld.ownerIndex] ?? `P${meld.ownerIndex}`} · {meld.type.toUpperCase()} · {meldValue(meld.cards)} pts
      </div>
      <div style={{ display: 'flex', gap: 3 }}>
        {meld.cards.map(c => <CardView key={c.id} card={c} small cardBack={cardBack} glow={burning && c.isJoker} />)}
      </div>
      {(onAdd || (onSteal && meld.cards.some(c => c.isJoker))) && (
        <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
          {onAdd   && <button onClick={onAdd}   className="pixel-btn pixel-btn-secondary" style={{ fontSize: 7, padding: '3px 6px' }}>{addLabel}</button>}
          {onSteal && meld.cards.some(c => c.isJoker) && <button onClick={onSteal} className="pixel-btn pixel-btn-warning" style={{ fontSize: 7, padding: '3px 6px' }}>{stealLabel}</button>}
        </div>
      )}
    </div>
  )
}

// ── CompactScore ──────────────────────────────────────────────────────────────
function CompactScore({ players, roundScores, youLabel, scoreLabel }: {
  players: Player[]; roundScores: number[][]
  youLabel: string; scoreLabel: string
}) {
  const [expanded, setExpanded] = useState(false)
  const totals = players.map((_, pi) => roundScores.reduce((s, r) => s + (r[pi] ?? 0), 0))

  if (!expanded) return (
    <div onClick={() => setExpanded(true)} style={{ cursor: 'pointer', fontSize: 13, fontFamily: "'VT323',monospace", color: 'var(--text)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      {players.map((p, i) => (
        <span key={i} style={{ color: p.isHuman ? 'var(--c-weight)' : 'var(--c-dash)' }}>
          {p.isHuman ? youLabel : p.name}: <b>{totals[i]}</b>
          {roundScores.map((r, ri) => <span key={ri} style={{ color: 'var(--muted)', marginLeft: 2 }}>R{ri+1}:{r[i] ?? '-'}</span>)}
        </span>
      ))}
      <span style={{ color: 'var(--muted)', fontSize: 11 }}>▼</span>
    </div>
  )

  return (
    <div onClick={() => setExpanded(false)} style={{ cursor: 'pointer' }}>
      <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: 'var(--muted)', marginBottom: 4 }}>{scoreLabel} ▲</div>
      <div style={{ display: 'grid', gridTemplateColumns: `auto repeat(7,1fr) auto`, gap: 2, minWidth: 280, fontSize: 13, fontFamily: "'VT323',monospace" }}>
        {['','R1','R2','R3','R4','R5','R6','R7','Σ'].map((h,i) => (
          <div key={i} style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 5, color: 'var(--muted)', textAlign: 'center', padding: '1px 2px' }}>{h}</div>
        ))}
        {players.map((p, pi) => (
          [p.isHuman ? youLabel.toUpperCase() : p.name, ...roundScores.map(r => r[pi] ?? ''), totals[pi]].map((v, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '1px 3px', color: i === 0 ? (p.isHuman ? 'var(--c-weight)' : 'var(--c-dash)') : 'var(--text)' }}>{v}</div>
          ))
        ))}
      </div>
    </div>
  )
}

// ── RoundEndOverlay ───────────────────────────────────────────────────────────
function RoundEndOverlay({ state, tg, youLabel, onNextRound, onEndGame }: {
  state: GameState; tg: any; youLabel: string; onNextRound: () => void; onEndGame: () => void
}) {
  const last   = state.roundScores[state.roundScores.length - 1] ?? []
  const totals = state.players.map((_, pi) => state.roundScores.reduce((s, r) => s + (r[pi] ?? 0), 0))
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'flex-end', backdropFilter: 'blur(4px)' }}>
      <div className="round-end-panel" style={{
        width: '100%', background: 'linear-gradient(180deg, #0d2e1a 0%, #163d24 100%)',
        borderTop: '3px solid var(--c-weight)', padding: 24, maxHeight: '85vh', overflowY: 'auto',
      }}>
        <h2 style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 12, color: 'var(--c-weight)', marginBottom: 16, textAlign: 'center' }}>
          {tg.roundDone} {state.roundNumber} — COMPLETE
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${state.players.length}, 1fr)`, gap: 12, marginBottom: 20 }}>
          {state.players.map((p, i) => (
            <div key={i} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', padding: 12, borderRadius: 4, textAlign: 'center' }}>
              <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 8, color: p.isHuman ? 'var(--c-weight)' : 'var(--c-dash)', marginBottom: 8 }}>
                {p.isHuman ? youLabel : p.name}
              </div>
              <div style={{ fontSize: 26, fontFamily: "'Press Start 2P',monospace", color: (last[i] ?? 0) <= 0 ? 'var(--green)' : 'var(--red)' }}>
                {(last[i] ?? 0) > 0 ? '+' : ''}{last[i] ?? 0}
              </div>
              <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>{tg.running} {totals[i]}</div>
              {p.hand.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center', marginTop: 8 }}>
                  {p.hand.slice(0, 6).map(c => <CardView key={c.id} card={c} small />)}
                  {p.hand.length > 6 && <span style={{ color: 'var(--muted)', fontSize: 13, alignSelf: 'center' }}>+{p.hand.length - 6}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {state.roundNumber < 7 && (
            <button className="pixel-btn pixel-btn-success" onClick={onNextRound} style={{ fontSize: 11, padding: '12px 24px' }}>
              {tg.nextRound} ({state.roundNumber + 1}/7) ►
            </button>
          )}
          <button className="pixel-btn pixel-btn-danger" onClick={onEndGame} style={{ fontSize: 9 }}>
            {tg.endGame}{state.roundNumber < 7 ? ' (+25)' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main JokerGame ────────────────────────────────────────────────────────────
export default function JokerGame() {
  const [state, dispatch] = useReducer(reducer, undefined, makeSetupState)
  const { t } = useLanguage(); const tg = t.game

  // Local UI state
  const [cardBack, setCardBack]         = useState<CardBack>('classic')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [sortMode, setSortMode]         = useState<'none' | 'suit' | 'rank'>('none')
  const [origOrder, setOrigOrder]       = useState<string[]>([])
  const [drawnCardId, setDrawnCardId]   = useState<string | null>(null)

  const { play } = useGameSounds(soundEnabled)

  // AI turn automation
  useEffect(() => {
    if (state.phase !== 'ai-turn') return
    const timer = setTimeout(() => runAITurn(state, dispatch), 1200)
    return () => clearTimeout(timer)
  }, [state.phase, state.currentPlayerIndex, state.roundNumber])

  // Animate newly drawn card
  useEffect(() => {
    if (state.phase === 'player-action' && state.drawnThisTurn) {
      const human = state.players[0]
      const lastCard = human?.hand[human.hand.length - 1]
      if (lastCard) { setDrawnCardId(lastCard.id); play('draw'); setTimeout(() => setDrawnCardId(null), 220) }
    }
  }, [state.drawnThisTurn])

  const human        = state.players[0]
  const topDiscard   = state.discardPile[state.discardPile.length - 1]
  const stagedIds    = new Set(state.stagedMelds.flat().map(c => c.id))
  const playerNames  = state.players.map(p => p.isHuman ? 'You' : p.name)
  const youLabel     = t.nav.dashboard === 'Дашборд' ? 'Ти' : 'You'
  const inDraw       = state.phase === 'player-draw'
  const inAction     = state.phase === 'player-action'
  const isMyTurn     = state.players[state.currentPlayerIndex]?.isHuman
  const circles      = circlesCompleted(state.players)

  // Card highlights
  const highlights = useMemo(() => {
    const map = new Map<string, 'green' | 'yellow'>()
    if (!human?.hand) return map
    // Green: can be added to table melds
    for (const card of human.hand) {
      for (const meld of state.melds) {
        if (canAddToMeld(meld, [card])) { map.set(card.id, 'green'); break }
      }
    }
    // Yellow: part of potential melds in hand (not yet green)
    const potentials = findMeldsInHand(human.hand)
    potentials.forEach(m => m.forEach(c => { if (!map.has(c.id)) map.set(c.id, 'yellow') }))
    return map
  }, [human?.hand, state.melds])

  // Sort hand
  function handleSort() {
    const hand = human?.hand ?? []
    if (sortMode === 'none') {
      setOrigOrder(hand.map(c => c.id)); setSortMode('suit')
      const sorted = [...hand].sort((a, b) => {
        const SO: Record<string, number> = { spades: 0, hearts: 1, diamonds: 2, clubs: 3, joker: 9 }
        return (SO[a.suit] ?? 9) - (SO[b.suit] ?? 9)
      })
      dispatch({ type: 'REORDER_HAND_TO', hand: sorted })
    } else if (sortMode === 'suit') {
      setSortMode('rank')
      const sorted = [...hand].sort((a, b) => {
        if (a.isJoker) return 1; if (b.isJoker) return -1
        return (RANK_NUM[a.rank] ?? 0) - (RANK_NUM[b.rank] ?? 0)
      })
      dispatch({ type: 'REORDER_HAND_TO', hand: sorted })
    } else {
      setSortMode('none')
      const restored = origOrder.map(id => hand.find(c => c.id === id)).filter(Boolean) as Card[]
      const extra    = hand.filter(c => !origOrder.includes(c.id))
      dispatch({ type: 'REORDER_HAND_TO', hand: [...restored, ...extra] })
    }
  }

  function handleDiscard(cardId: string) { play('discard'); dispatch({ type: 'DISCARD', cardId }) }
  function handleCommit() { play('meld'); dispatch({ type: 'COMMIT_MELDS' }) }
  function handleBurn()   { play('burn'); dispatch({ type: 'BURN_MELD' }) }

  // ── Setup screen ─────────────────────────────────────────────────────────
  if (state.phase === 'setup') {
    const BACKS: { key: CardBack; label: string }[] = [
      { key: 'classic', label: 'Classic' }, { key: 'pixel', label: 'Pixel' }, { key: 'dark', label: 'Dark' },
    ]
    return (
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '40px 16px', textAlign: 'center' }}>
        <h1 style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 16, color: 'var(--c-journal)', marginBottom: 28 }}>{tg.title}</h1>
        <div className="pixel-card card-journal" style={{ padding: 28, marginBottom: 16 }}>
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 10, color: 'var(--muted)', marginBottom: 16 }}>{tg.choosePlayers}</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 24 }}>
            {[2,3,4,5].map(n => (
              <button key={n} className="pixel-btn pixel-btn-primary" style={{ fontSize: 14, padding: '14px 22px' }}
                onClick={() => dispatch({ type: 'START_GAME', numPlayers: n })}>{n}P</button>
            ))}
          </div>
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 8, color: 'var(--muted)', marginBottom: 10 }}>CARD BACK</div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 16 }}>
            {BACKS.map(({ key, label }) => (
              <div key={key} onClick={() => setCardBack(key)} style={{ cursor: 'pointer', border: `3px solid ${cardBack === key ? 'var(--c-dash)' : 'var(--border)'}`, borderRadius: 6, padding: 4, width: 60, height: 82, overflow: 'hidden', boxShadow: cardBack === key ? '0 0 8px rgba(34,211,238,0.5)' : undefined }}>
                {renderCardBack(key, 52, 72)}
                <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 5, color: cardBack === key ? 'var(--c-dash)' : 'var(--muted)', textAlign: 'center', marginTop: 3 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 15, color: 'var(--muted)' }}>{tg.youAreP1}</div>
        </div>
      </div>
    )
  }

  // ── Round end overlay ────────────────────────────────────────────────────
  if (state.phase === 'round-end') {
    return (
      <>
        {/* Keep game visible in background */}
        <div style={{ opacity: 0.3, pointerEvents: 'none' }}>
          <div style={{ height: 200, background: 'var(--bg)' }} />
        </div>
        <RoundEndOverlay state={state} tg={tg} youLabel={youLabel}
          onNextRound={() => dispatch({ type: 'NEXT_ROUND' })}
          onEndGame={() => dispatch({ type: 'END_GAME_EARLY' })} />
      </>
    )
  }

  // ── Game end screen ──────────────────────────────────────────────────────
  if (state.phase === 'game-end') {
    const totals   = state.players.map((_, pi) => state.roundScores.reduce((s, r) => s + (r[pi] ?? 0), 0))
    const minScore = Math.min(...totals)
    const winner   = state.players[totals.indexOf(minScore)]
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
          <CompactScore players={state.players} roundScores={state.roundScores} youLabel={youLabel} scoreLabel={tg.scores} />
        </div>
        <button className="pixel-btn pixel-btn-primary" onClick={() => dispatch({ type: 'INIT_ROUND' })}>{tg.newGame}</button>
      </div>
    )
  }

  // ── Main game ────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 840, margin: '0 auto', padding: '12px 16px', userSelect: 'none' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 10, color: 'var(--c-journal)', margin: 0 }}>{tg.title}</h1>
          <button onClick={() => setSoundEnabled(e => !e)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', padding: 2 }} title="Toggle sound">
            {soundEnabled ? '🔊' : '🔇'}
          </button>
        </div>
        <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: 'var(--muted)' }}>
          R{state.roundNumber}/7 · {state.trumpSuit ? `${tg.trump}: ${suitSymbol(state.trumpSuit)}` : tg.noTrump}
          &nbsp;·&nbsp;{tg.circle} {circles + 1} {circles >= 2 ? '✓' : `(meld at 3)`}
        </div>
        <CompactScore players={state.players} roundScores={state.roundScores} youLabel={youLabel} scoreLabel={tg.scores} />
      </div>

      {/* Message */}
      <div style={{
        background: state.burningMeldId ? 'rgba(251,146,60,0.18)' : 'var(--bg3)',
        border: `1px solid ${state.burningMeldId ? 'var(--c-journal)' : 'var(--border)'}`,
        padding: '8px 12px', marginBottom: 10, fontSize: 16, minHeight: 34,
        color: state.burningMeldId ? 'var(--yellow)' : 'var(--text)',
      }}>{state.message || '…'}</div>

      {/* Turn indicator */}
      {isMyTurn ? (
        <div className="player-turn-bar" style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid var(--c-weight)', padding: '5px 10px', marginBottom: 10, fontSize: 13, color: 'var(--c-weight)', borderRadius: 2 }}>
          ● YOUR TURN — {inDraw ? 'Draw a card' : 'Meld, add to sets, or discard'}
        </div>
      ) : state.phase === 'ai-turn' ? (
        <div style={{ padding: '5px 10px', marginBottom: 10, fontSize: 14, color: 'var(--muted)', border: '1px solid var(--border)' }}>
          <span className="ai-spinner">⟳</span> {state.players[state.currentPlayerIndex]?.name} {tg.aiThinking}…
        </div>
      ) : null}

      {/* AI players */}
      {state.players.slice(1).map((p, i) => (
        <div key={p.id} style={{ marginBottom: 8 }}>
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: state.currentPlayerIndex === i+1 ? 'var(--yellow)' : 'var(--c-dash)', marginBottom: 4 }}>
            {p.name} ({p.hand.length}){p.hasMelded ? tg.melded : ''}{state.currentPlayerIndex === i+1 ? ' ◄' : ''}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {p.hand.map(c => <CardView key={c.id} card={c} faceDown small cardBack={cardBack} />)}
          </div>
        </div>
      ))}

      {/* Center table */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: 'var(--muted)', marginBottom: 4 }}>{tg.deck} ({state.deck.length})</div>
          {state.deck.length > 0
            ? <CardView card={state.deck[0]} faceDown cardBack={cardBack} onClick={inDraw ? () => dispatch({ type: 'DRAW_DECK' }) : undefined} />
            : <div style={{ width: 56, height: 80, border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 14, borderRadius: 4 }}>∅</div>}
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: 'var(--muted)', marginBottom: 4 }}>{tg.discardPile}</div>
          {topDiscard
            ? <CardView card={topDiscard} onClick={inDraw ? () => dispatch({ type: 'DRAW_DISCARD' }) : undefined} />
            : <div style={{ width: 56, height: 80, border: '2px dashed var(--border)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>—</div>}
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: 'var(--c-journal)', marginBottom: 4 }}>
            {tg.trump} {state.trumpSuit ? suitSymbol(state.trumpSuit) : ''}
          </div>
          {state.trumpCard ? (
            <div>
              <CardView card={state.trumpCard} />
              {inDraw && !state.drawnThisTurn && (
                <button className="pixel-btn pixel-btn-warning" onClick={() => dispatch({ type: 'TAKE_TRUMP' })} style={{ fontSize: 6, padding: '3px 6px', marginTop: 4, width: '100%' }}>{tg.takeTrump}</button>
              )}
            </div>
          ) : <div style={{ width: 56, height: 80, border: '2px dashed var(--border)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>—</div>}
        </div>
        {state.stagedMelds.length > 0 && (
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: 'var(--yellow)', marginBottom: 4 }}>{tg.staged} ({totalMeldValue(state.stagedMelds)} pts)</div>
            {state.stagedMelds.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 3, marginBottom: 4, flexWrap: 'wrap' }}>
                {m.map(c => <CardView key={c.id} card={c} small cardBack={cardBack} />)}
                <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>{meldValue(m)}pt</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Table melds — horizontal scroll */}
      {state.melds.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: 'var(--muted)', marginBottom: 5 }}>{tg.table} ({state.melds.length} sets)</div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, WebkitOverflowScrolling: 'touch' as any }}>
            {state.melds.map(meld => (
              <MeldView key={meld.id} meld={meld} playerNames={playerNames} cardBack={cardBack}
                burning={meld.id === state.burningMeldId}
                addLabel={tg.addToSet} stealLabel={tg.stealJoker}
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
      {human && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: 'var(--c-weight)' }}>
              {tg.yourHand} ({human.hand.length}) {human.hasMelded ? tg.melded : tg.needPts}
            </span>
            {state.drawnFromDiscardCardId && <span style={{ color: 'var(--yellow)', fontSize: 13 }}>⚠ use drawn card!</span>}
            {state.selectedCardIds.length > 0 && <span style={{ color: 'var(--yellow)', fontSize: 13 }}>{state.selectedCardIds.length} sel.</span>}
            <button
              onClick={handleSort}
              className="pixel-btn pixel-btn-secondary"
              style={{ fontSize: 7, padding: '4px 8px', marginLeft: 'auto' }}
            >
              SORT: {sortMode === 'none' ? '—' : sortMode === 'suit' ? '♠♥♦♣' : 'A→K'}
            </button>
          </div>
          <DraggableHand
            hand={human.hand} selectedIds={state.selectedCardIds} stagedIds={Array.from(stagedIds)}
            drawnCardId={drawnCardId} cardBack={cardBack} highlights={highlights}
            onToggle={id => inAction && dispatch({ type: 'TOGGLE_CARD', cardId: id })}
            onReorder={(from, to) => dispatch({ type: 'REORDER_HAND', fromIndex: from, toIndex: to })}
          />
          {/* Legend */}
          <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
            <span style={{ color: '#22c55e' }}>■</span> Can add to table set
            <span style={{ color: '#fbbf24', marginLeft: 4 }}>■</span> Potential meld in hand
          </div>
        </div>
      )}

      {/* ── Action buttons ── */}
      {inDraw && isMyTurn && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="pixel-btn"
            onClick={() => dispatch({ type: 'DRAW_DECK' })}
            style={{ flex: 1, minWidth: 140, justifyContent: 'center', fontSize: 11, padding: '13px 18px', background: '#1d4ed8', color: '#fff', border: '2px solid #3b82f6', boxShadow: '4px 4px 0 rgba(0,0,0,0.6)' }}
          >
            {tg.drawDeck}
          </button>
          <button
            className="pixel-btn"
            onClick={() => dispatch({ type: 'DRAW_DISCARD' })}
            disabled={!topDiscard || circles < 2}
            title={circles < 2 ? tg.noMeldCircle : ''}
            style={{ flex: 1, minWidth: 140, justifyContent: 'center', fontSize: 11, padding: '13px 18px', background: circles >= 2 && topDiscard ? '#b45309' : '#4b4b6a', color: '#fff', border: `2px solid ${circles >= 2 && topDiscard ? '#fb923c' : 'var(--border)'}`, boxShadow: '4px 4px 0 rgba(0,0,0,0.6)', opacity: !topDiscard || circles < 2 ? 0.55 : 1 }}
          >
            {tg.drawDiscard}
          </button>
        </div>
      )}

      {inAction && isMyTurn && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {state.burningMeldId ? (
            <>
              {state.burningHasJoker && state.selectedCardIds.length === 2 && (
                <button className="pixel-btn pixel-btn-warning" onClick={() => { play('meld'); dispatch({ type: 'REPLACE_BURNING_JOKER' }) }}>{tg.rescueJoker}</button>
              )}
              <button className="pixel-btn pixel-btn-danger" onClick={handleBurn}>{tg.burnSet}</button>
            </>
          ) : (
            <>
              <button className="pixel-btn pixel-btn-success" onClick={() => dispatch({ type: 'STAGE_MELD' })} disabled={state.selectedCardIds.length < 3}>{tg.stageMeld}</button>
              {state.stagedMelds.length > 0 && (
                <>
                  <button className="pixel-btn pixel-btn-primary" onClick={handleCommit}>{tg.commitMelds} ({totalMeldValue(state.stagedMelds)} pts)</button>
                  <button className="pixel-btn pixel-btn-secondary" onClick={() => dispatch({ type: 'CLEAR_STAGED' })}>{tg.clearStaged}</button>
                </>
              )}
            </>
          )}
          {state.selectedCardIds.length === 1 && !state.burningMeldId && (
            <button className="pixel-btn" onClick={() => handleDiscard(state.selectedCardIds[0])}
              style={{ background: '#7c2d12', color: '#fff', border: '2px solid #ea580c', fontSize: 11, padding: '11px 18px' }}>
              {tg.discardBtn}
            </button>
          )}
          {(() => {
            const drawnId = state.drawnFromDiscardCardId; if (!drawnId) return null
            const stillUnused = human?.hand.some(c => c.id === drawnId) && !state.stagedMelds.flat().some(c => c.id === drawnId)
            if (!stillUnused) return null
            return <button className="pixel-btn pixel-btn-secondary" onClick={() => dispatch({ type: 'RETURN_TO_DISCARD' })} style={{ borderColor: 'var(--yellow)', color: 'var(--yellow)' }}>{tg.returnDiscard}</button>
          })()}
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Long-press drag · tap select · STAGE→COMMIT</span>
        </div>
      )}
    </div>
  )
}
