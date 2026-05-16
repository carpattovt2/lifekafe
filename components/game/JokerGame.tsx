'use client'

import { useReducer, useEffect, useCallback } from 'react'
import type { Card, GameState, Meld, Phase, PlayerKey, RoundScore } from '@/lib/game/types'
import { createDeck, shuffle, dealInitialHands, handCardValue, suitSymbol, isRed } from '@/lib/game/cards'
import {
  isValidMeld, meldType, meldValue, canAddToMeld,
  canStealJoker, totalMeldValue, findMeldsInHand,
} from '@/lib/game/meld'
import { computeAITurn } from '@/lib/game/ai'

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
  }
}

function dealRound(base: GameState): GameState {
  const deck = shuffle(createDeck())
  const { playerHand: ph, aiHand: ah, remaining } = dealInitialHands(deck)
  // If AI is dealer, human goes first (15 cards); if human is dealer, AI goes first
  const humanGoesFirst = base.dealerIndex === 1 // AI is dealer
  const playerHand = humanGoesFirst ? ph : ah.slice(0, 14)
  const aiHand     = humanGoesFirst ? ah.slice(0, 14) : ph
  // trump card = top of remaining
  const trumpCard = remaining.shift()!
  const discardPile = [trumpCard]
  const firstPlayer: PlayerKey = humanGoesFirst ? 'human' : 'ai'
  return {
    ...base,
    deck: remaining,
    discardPile,
    trumpCard,
    trumpSuit: trumpCard.isJoker ? null : trumpCard.suit as any,
    playerHand: humanGoesFirst ? [...ph] : [...ah.slice(0,14)],
    aiHand:     humanGoesFirst ? [...ah.slice(0,14)] : [...ph],
    melds: [],
    playerHasMelded: false, aiHasMelded: false,
    selectedCardIds: [], stagedMelds: [],
    currentPlayer: firstPlayer,
    phase: firstPlayer === 'human' ? 'player-draw' : 'ai-turn',
    message: firstPlayer === 'human' ? 'Your turn — draw a card.' : 'AI is playing…',
    drawnThisTurn: false,
  }
}

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

function reshuffleDeck(state: GameState): GameState {
  if (state.deck.length > 0) return state
  const top = state.discardPile[state.discardPile.length - 1]
  const rest = state.discardPile.slice(0, -1)
  return { ...state, deck: shuffle(rest), discardPile: [top] }
}

// ── Reducer ───────────────────────────────────────────────────────────────────
type Action =
  | { type: 'INIT_ROUND' }
  | { type: 'DRAW_DECK' }
  | { type: 'DRAW_DISCARD' }
  | { type: 'TOGGLE_CARD'; cardId: string }
  | { type: 'STAGE_MELD' }
  | { type: 'CLEAR_STAGED' }
  | { type: 'COMMIT_MELDS' }
  | { type: 'ADD_TO_MELD'; meldId: string }
  | { type: 'STEAL_JOKER'; meldId: string }
  | { type: 'DISCARD'; cardId: string }
  | { type: 'AI_TURN_DONE'; next: Partial<GameState> }
  | { type: 'NEXT_ROUND' }
  | { type: 'END_GAME_EARLY' }

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {

    case 'INIT_ROUND': return dealRound(state)

    case 'DRAW_DECK': {
      if (state.drawnThisTurn || state.phase !== 'player-draw') return state
      let s = reshuffleDeck(state)
      if (s.deck.length === 0) return { ...s, message: 'Deck is empty!' }
      const card = s.deck[0]
      return {
        ...s,
        deck: s.deck.slice(1),
        playerHand: [...s.playerHand, card],
        drawnThisTurn: true,
        phase: 'player-action',
        message: `Drew ${card.rank}${card.isJoker ? '' : ' of ' + card.suit}. Now meld or discard.`,
      }
    }

    case 'DRAW_DISCARD': {
      if (state.drawnThisTurn || state.phase !== 'player-draw') return state
      const top = state.discardPile[state.discardPile.length - 1]
      if (!top) return { ...state, message: 'Discard pile is empty.' }
      // Trump card: can only take if going out this turn
      if (top.id === state.trumpCard?.id && state.playerHand.length > 1) {
        return { ...state, message: 'Trump card can only be taken if you go out this turn!' }
      }
      // Must have already melded (or it's the trump exception)
      if (!state.playerHasMelded && top.id !== state.trumpCard?.id) {
        return { ...state, message: 'You can only draw from discard after your first meld (51+ pts).' }
      }
      return {
        ...state,
        discardPile: state.discardPile.slice(0, -1),
        playerHand: [...state.playerHand, top],
        drawnThisTurn: true,
        phase: 'player-action',
        message: `Took ${top.rank}${top.isJoker ? '' : ' of ' + top.suit} from discard. Now meld or discard.`,
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

    case 'STAGE_MELD': {
      if (state.selectedCardIds.length < 3) return { ...state, message: 'Select at least 3 cards.' }
      const selected = state.playerHand.filter(c => state.selectedCardIds.includes(c.id))
      if (!isValidMeld(selected)) return { ...state, message: 'Not a valid meld. Check the rules.' }
      return {
        ...state,
        stagedMelds: [...state.stagedMelds, selected],
        selectedCardIds: [],
        message: `Meld staged! (${meldValue(selected)} pts). Stage more or commit.`,
      }
    }

    case 'CLEAR_STAGED':
      return { ...state, stagedMelds: [], selectedCardIds: [], message: 'Staged melds cleared.' }

    case 'COMMIT_MELDS': {
      if (state.stagedMelds.length === 0) return { ...state, message: 'No staged melds.' }
      const total = totalMeldValue(state.stagedMelds)
      if (!state.playerHasMelded && total < 51) {
        return { ...state, message: `First meld needs 51+ points. You have ${total}.` }
      }
      const usedIds = new Set(state.stagedMelds.flat().map(c => c.id))
      const newMelds: Meld[] = state.stagedMelds.map(cards => ({
        id: mkMeldId(), cards, owner: 'human', type: meldType(cards),
      }))
      const newHand = removeCards(state.playerHand, usedIds)
      // Check if went out
      if (newHand.length === 0) {
        return finishRound({ ...state, playerHand: newHand, melds: [...state.melds, ...newMelds], playerHasMelded: true, stagedMelds: [] }, 'human', true, false)
      }
      return {
        ...state,
        playerHand: newHand,
        melds: [...state.melds, ...newMelds],
        playerHasMelded: true,
        stagedMelds: [],
        selectedCardIds: [],
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
      const updatedMeld: Meld = { ...meld, cards: [...meld.cards, ...selected] }
      const newMelds = state.melds.map(m => m.id === meld.id ? updatedMeld : m)
      const newHand = removeCards(state.playerHand, usedIds)
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
      const newMeldCards = [...meld.cards]
      newMeldCards[jokerIndex] = realCard
      const updatedMeld: Meld = { ...meld, cards: newMeldCards }
      const newMelds = state.melds.map(m => m.id === meld.id ? updatedMeld : m)
      // realCard leaves hand, joker enters hand
      const newHand = [...state.playerHand.filter(c => c.id !== realCard.id), joker]
      return { ...state, playerHand: newHand, melds: newMelds, selectedCardIds: [], message: 'Joker stolen!' }
    }

    case 'DISCARD': {
      if (state.phase !== 'player-action') return state
      if (!state.drawnThisTurn) return { ...state, message: 'Draw a card first.' }
      const card = state.playerHand.find(c => c.id === action.cardId)
      if (!card) return state
      const newHand = state.playerHand.filter(c => c.id !== action.cardId)
      const isGoingOut = newHand.length === 0
      const newDiscard = [...state.discardPile, card]
      if (isGoingOut) {
        return finishRound({ ...state, playerHand: newHand, discardPile: newDiscard }, 'human', false, card.isJoker)
      }
      return {
        ...state,
        playerHand: newHand,
        discardPile: newDiscard,
        selectedCardIds: [],
        stagedMelds: [],
        drawnThisTurn: false,
        currentPlayer: 'ai',
        phase: 'ai-turn',
        message: "AI's turn…",
      }
    }

    case 'AI_TURN_DONE':
      return { ...state, ...action.next }

    case 'NEXT_ROUND': {
      if (state.roundNumber >= 7) {
        return { ...state, phase: 'game-end', message: 'Game over!' }
      }
      return dealRound({
        ...state,
        roundNumber: state.roundNumber + 1,
        dealerIndex: state.dealerIndex === 0 ? 1 : 0,
        phase: 'player-draw',
      })
    }

    case 'END_GAME_EARLY': {
      const penaltyRound: RoundScore = { human: 25, ai: 0 } // initiator pays
      return {
        ...state,
        roundScores: [...state.roundScores, penaltyRound],
        phase: 'game-end',
        message: 'Early end — +25 penalty applied.',
      }
    }

    default: return state
  }
}

// ── Round end helper ──────────────────────────────────────────────────────────
function finishRound(
  state: GameState,
  winner: PlayerKey,
  meldedOut: boolean,  // went out by melding (not discarding)
  lastCardJoker: boolean,
): GameState {
  const winnerBonus = meldedOut
    ? (lastCardJoker ? -20 : -10)
    : -5

  const humanPenalty = winner === 'human'
    ? winnerBonus
    : !state.playerHasMelded
      ? 10
      : calcHandPenalty(state.playerHand, state.playerHasMelded)

  const aiPenalty = winner === 'ai'
    ? winnerBonus
    : !state.aiHasMelded
      ? 10
      : calcHandPenalty(state.aiHand, state.aiHasMelded)

  const score: RoundScore = { human: humanPenalty, ai: aiPenalty }

  return {
    ...state,
    roundScores: [...state.roundScores, score],
    phase: 'round-end',
    message: `Round ${state.roundNumber} over! ${winner === 'human' ? 'You' : 'AI'} won.`,
    selectedCardIds: [],
    stagedMelds: [],
  }
}

// ── Card display ──────────────────────────────────────────────────────────────
function CardView({
  card, faceDown = false, selected = false, onClick, small = false,
}: {
  card: Card; faceDown?: boolean; selected?: boolean
  onClick?: () => void; small?: boolean
}) {
  const w = small ? 38 : 48
  const h = small ? 54 : 68
  const isRedCard = isRed(card.suit)
  const sym = suitSymbol(card.suit)

  return (
    <div
      onClick={onClick}
      style={{
        width: w, height: h, flexShrink: 0,
        border: selected ? '2px solid var(--c-dash)' : '2px solid var(--border)',
        borderRadius: 3,
        background: faceDown ? 'var(--bg3)' : '#f8f4ec',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        position: 'relative', fontSize: small ? 9 : 11,
        boxShadow: selected ? '0 0 6px var(--c-dash)' : '2px 2px 0 rgba(0,0,0,0.5)',
        transform: selected ? 'translateY(-6px)' : 'none',
        transition: 'transform 0.1s, box-shadow 0.1s',
        userSelect: 'none',
      }}
    >
      {faceDown ? (
        <div style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'repeating-linear-gradient(45deg, var(--bg3), var(--bg3) 3px, var(--border) 3px, var(--border) 6px)',
          borderRadius: 2,
        }} />
      ) : card.isJoker ? (
        <div style={{ color: '#8b5cf6', fontFamily: "'Press Start 2P', monospace", fontSize: small ? 7 : 9, textAlign: 'center', lineHeight: 1.4 }}>
          ★<br />JKR
        </div>
      ) : (
        <>
          <div style={{ position: 'absolute', top: 2, left: 3, color: isRedCard ? '#dc2626' : '#1e293b', fontWeight: 700 }}>
            {card.rank}
          </div>
          <div style={{ fontSize: small ? 16 : 20, color: isRedCard ? '#dc2626' : '#1e293b' }}>{sym}</div>
          <div style={{ position: 'absolute', bottom: 2, right: 3, color: isRedCard ? '#dc2626' : '#1e293b', fontWeight: 700, transform: 'rotate(180deg)' }}>
            {card.rank}
          </div>
        </>
      )}
    </div>
  )
}

// ── Meld display ──────────────────────────────────────────────────────────────
function MeldView({
  meld, onAddClick, onStealClick, isSelected,
}: {
  meld: Meld; onAddClick?: () => void; onStealClick?: () => void; isSelected?: boolean
}) {
  return (
    <div style={{
      background: meld.owner === 'human' ? 'rgba(74,222,128,0.08)' : 'rgba(6,182,212,0.08)',
      border: `1px solid ${meld.owner === 'human' ? 'var(--c-weight)' : 'var(--c-dash)'}`,
      padding: '6px 8px', borderRadius: 2,
      display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start',
    }}>
      <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: 'var(--muted)', marginBottom: 2 }}>
        {meld.owner === 'human' ? 'YOU' : 'AI'} · {meld.type.toUpperCase()} · {meldValue(meld.cards)} pts
      </div>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {meld.cards.map(c => <CardView key={c.id} card={c} small />)}
      </div>
      {(onAddClick || onStealClick) && (
        <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
          {onAddClick && (
            <button onClick={onAddClick} className="pixel-btn pixel-btn-secondary" style={{ fontSize: 7, padding: '3px 6px' }}>
              + ADD
            </button>
          )}
          {onStealClick && meld.cards.some(c => c.isJoker) && (
            <button onClick={onStealClick} className="pixel-btn pixel-btn-warning" style={{ fontSize: 7, padding: '3px 6px' }}>
              STEAL ★
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Score display ─────────────────────────────────────────────────────────────
function ScoreBoard({ scores }: { scores: RoundScore[] }) {
  const humanTotal = scores.reduce((s, r) => s + r.human, 0)
  const aiTotal    = scores.reduce((s, r) => s + r.ai, 0)
  return (
    <div style={{ fontFamily: "'VT323', monospace", fontSize: 16 }}>
      <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: 'var(--muted)', marginBottom: 6 }}>SCORES</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto repeat(7, 1fr) auto', gap: 2, fontSize: 14 }}>
        {['', 'R1','R2','R3','R4','R5','R6','R7','Σ'].map((h, i) => (
          <div key={i} style={{ color: 'var(--muted)', textAlign: 'center', padding: '2px 4px',
            fontFamily: "'Press Start 2P', monospace", fontSize: 7 }}>{h}</div>
        ))}
        {['YOU', ...scores.map(s => s.human), humanTotal].map((v, i) => (
          <div key={i} style={{ textAlign: 'center', padding: '2px 4px', color: i === 0 ? 'var(--c-weight)' : 'var(--text)' }}>{v}</div>
        ))}
        {['AI', ...scores.map(s => s.ai), aiTotal].map((v, i) => (
          <div key={i} style={{ textAlign: 'center', padding: '2px 4px', color: i === 0 ? 'var(--c-dash)' : 'var(--text)' }}>{v}</div>
        ))}
      </div>
    </div>
  )
}

// ── Main game component ───────────────────────────────────────────────────────
export default function JokerGame() {
  const [state, dispatch] = useReducer(reducer, undefined, makeInitial)

  // Start first round on mount
  useEffect(() => {
    dispatch({ type: 'INIT_ROUND' })
  }, [])

  // AI turn automation
  useEffect(() => {
    if (state.phase !== 'ai-turn') return
    const timer = setTimeout(() => {
      // Give AI a card from deck if needed
      let s = { ...state }
      s = reshuffleDeckState(s)
      const decision = computeAITurn(s)

      let aiHand = [...s.aiHand]
      let deck = [...s.deck]
      let discardPile = [...s.discardPile]
      let melds = [...s.melds]

      // Draw
      if (decision.drawFromDiscard && discardPile.length > 0) {
        aiHand = [...aiHand, discardPile[discardPile.length - 1]]
        discardPile = discardPile.slice(0, -1)
      } else if (deck.length > 0) {
        aiHand = [...aiHand, deck[0]]
        deck = deck.slice(1)
      }

      let aiHasMelded = s.aiHasMelded

      // Play melds
      const usedIds = new Set<string>()
      if (decision.meldsToPlay.length > 0) {
        for (const meldCards of decision.meldsToPlay) {
          melds = [...melds, { id: mkMeldId(), cards: meldCards, owner: 'ai', type: meldType(meldCards) }]
          meldCards.forEach(c => usedIds.add(c.id))
        }
        aiHasMelded = true
        aiHand = aiHand.filter(c => !usedIds.has(c.id))
      }

      // Add to existing melds
      for (const { meldId, cards } of decision.cardsToAddToMeld) {
        const meld = melds.find(m => m.id === meldId)
        if (meld) {
          melds = melds.map(m => m.id === meldId ? { ...m, cards: [...m.cards, ...cards] } : m)
          cards.forEach(c => usedIds.add(c.id))
          aiHand = aiHand.filter(c => !cards.map(x => x.id).includes(c.id))
        }
      }

      // Discard
      const discard = aiHand.find(c => c.id === decision.discardCard.id) ?? aiHand[aiHand.length - 1]
      if (!discard) {
        // AI is out
        const next: Partial<GameState> = { aiHand: [], deck, discardPile, melds, aiHasMelded }
        const nextState = finishRound({ ...s, ...next }, 'ai', true, false)
        dispatch({ type: 'AI_TURN_DONE', next: nextState })
        return
      }
      aiHand = aiHand.filter(c => c.id !== discard.id)
      discardPile = [...discardPile, discard]

      if (aiHand.length === 0) {
        const nextState = finishRound({ ...s, aiHand, deck, discardPile, melds, aiHasMelded }, 'ai', false, discard.isJoker)
        dispatch({ type: 'AI_TURN_DONE', next: nextState })
        return
      }

      dispatch({
        type: 'AI_TURN_DONE',
        next: {
          aiHand, deck, discardPile, melds, aiHasMelded,
          currentPlayer: 'human',
          phase: 'player-draw',
          drawnThisTurn: false,
          selectedCardIds: [],
          stagedMelds: [],
          message: 'Your turn — draw a card.',
        },
      })
    }, 1200)
    return () => clearTimeout(timer)
  }, [state.phase, state.roundNumber])

  const topDiscard = state.discardPile[state.discardPile.length - 1]
  const humanTotal = state.roundScores.reduce((s, r) => s + r.human, 0)
  const aiTotal    = state.roundScores.reduce((s, r) => s + r.ai, 0)

  function toggle(id: string) { dispatch({ type: 'TOGGLE_CARD', cardId: id }) }

  // ── Render ────────────────────────────────────────────────────────────────
  if (state.phase === 'game-end') {
    const humanWins = humanTotal < aiTotal
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 16px' }}>
        <h1 style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 13, color: 'var(--c-journal)', marginBottom: 24 }}>
          ♦ JOKER — FINAL SCORES
        </h1>
        <div className="pixel-card card-journal" style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 11, color: humanWins ? 'var(--c-weight)' : 'var(--red)', marginBottom: 16 }}>
            {humanWins ? '🏆 YOU WIN!' : '💀 AI WINS'}
          </div>
          <div style={{ fontSize: 20, color: 'var(--muted)', marginBottom: 16 }}>
            You: {humanTotal} pts · AI: {aiTotal} pts<br />
            (lowest score wins)
          </div>
          <ScoreBoard scores={state.roundScores} />
        </div>
        <button className="pixel-btn pixel-btn-primary" onClick={() => dispatch({ type: 'INIT_ROUND' })}>
          NEW GAME
        </button>
      </div>
    )
  }

  if (state.phase === 'round-end') {
    const lastScore = state.roundScores[state.roundScores.length - 1]
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 16px' }}>
        <h1 style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 12, color: 'var(--c-journal)', marginBottom: 20 }}>
          ♦ ROUND {state.roundNumber} COMPLETE
        </h1>
        <div className="pixel-card card-journal" style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: 'var(--muted)', marginBottom: 12 }}>ROUND RESULT</div>
          <div style={{ fontSize: 20, marginBottom: 8 }}>
            You: <span style={{ color: lastScore.human <= 0 ? 'var(--green)' : 'var(--red)' }}>{lastScore.human > 0 ? '+' : ''}{lastScore.human}</span>
            &nbsp;&nbsp;AI: <span style={{ color: lastScore.ai <= 0 ? 'var(--green)' : 'var(--red)' }}>{lastScore.ai > 0 ? '+' : ''}{lastScore.ai}</span>
          </div>
          <div style={{ fontSize: 18, color: 'var(--muted)', marginBottom: 16 }}>
            Running: You {humanTotal} · AI {aiTotal}
          </div>
          <ScoreBoard scores={state.roundScores} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {state.roundNumber < 7 && (
            <button className="pixel-btn pixel-btn-primary" onClick={() => dispatch({ type: 'NEXT_ROUND' })}>
              NEXT ROUND ({state.roundNumber + 1}/7)
            </button>
          )}
          <button className="pixel-btn pixel-btn-danger" onClick={() => dispatch({ type: 'END_GAME_EARLY' })}>
            END GAME {state.roundNumber < 7 ? '(+25 penalty)' : ''}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '16px', userSelect: 'none' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 11, color: 'var(--c-journal)', margin: 0 }}>
          ♦ JOKER
        </h1>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: 'var(--muted)' }}>
          ROUND {state.roundNumber}/7 · {state.currentPlayer === 'human' ? 'YOUR TURN' : "AI'S TURN"}
        </div>
        <ScoreBoard scores={state.roundScores} />
      </div>

      {/* Message bar */}
      <div style={{
        background: 'var(--bg3)', border: '1px solid var(--border)',
        padding: '8px 12px', marginBottom: 12, fontSize: 16, minHeight: 36,
        color: state.message.includes('!') ? 'var(--yellow)' : 'var(--text)',
      }}>
        {state.message || '…'}
      </div>

      {/* AI hand */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: 'var(--c-dash)', marginBottom: 6 }}>
          AI HAND ({state.aiHand.length}) {state.aiHasMelded ? '· MELDED' : ''}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {state.aiHand.map(c => <CardView key={c.id} card={c} faceDown small />)}
        </div>
      </div>

      {/* Table: deck / discard / trump */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap' }}>
        {/* Deck */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: 'var(--muted)', marginBottom: 4 }}>
            DECK ({state.deck.length})
          </div>
          {state.deck.length > 0 ? (
            <CardView
              card={state.deck[0]}
              faceDown
              onClick={state.phase === 'player-draw' ? () => dispatch({ type: 'DRAW_DECK' }) : undefined}
            />
          ) : (
            <div style={{ width: 48, height: 68, border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--muted)' }}>∅</div>
          )}
        </div>

        {/* Discard */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: 'var(--muted)', marginBottom: 4 }}>
            DISCARD
          </div>
          {topDiscard ? (
            <CardView
              card={topDiscard}
              onClick={state.phase === 'player-draw' ? () => dispatch({ type: 'DRAW_DISCARD' }) : undefined}
            />
          ) : (
            <div style={{ width: 48, height: 68, border: '2px dashed var(--border)' }} />
          )}
        </div>

        {/* Trump */}
        {state.trumpCard && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: 'var(--c-journal)', marginBottom: 4 }}>
              TRUMP {state.trumpSuit ? suitSymbol(state.trumpSuit as any) : ''}
            </div>
            <CardView card={state.trumpCard} />
          </div>
        )}

        {/* Staged melds preview */}
        {state.stagedMelds.length > 0 && (
          <div style={{ flex: 1, minWidth: 150 }}>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: 'var(--yellow)', marginBottom: 4 }}>
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
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: 'var(--muted)', marginBottom: 6 }}>MELDS ON TABLE</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {state.melds.map(meld => (
              <MeldView
                key={meld.id}
                meld={meld}
                onAddClick={state.phase === 'player-action' && state.selectedCardIds.length > 0
                  ? () => dispatch({ type: 'ADD_TO_MELD', meldId: meld.id })
                  : undefined}
                onStealClick={state.phase === 'player-action' && state.selectedCardIds.length === 1
                  ? () => dispatch({ type: 'STEAL_JOKER', meldId: meld.id })
                  : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Player hand */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: 'var(--c-weight)', marginBottom: 6 }}>
          YOUR HAND ({state.playerHand.length}) {state.playerHasMelded ? '· MELDED' : '· need 51+'}
          {state.selectedCardIds.length > 0 && (
            <span style={{ color: 'var(--yellow)', marginLeft: 10 }}>
              {state.selectedCardIds.length} selected
              ({state.playerHand.filter(c => state.selectedCardIds.includes(c.id)).reduce((s, c) => s + (c.isJoker ? 0 : ['10','J','Q','K'].includes(c.rank) ? 10 : c.rank === 'A' ? 1 : parseInt(c.rank)), 0)} pts)
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {state.playerHand.map(card => (
            <CardView
              key={card.id}
              card={card}
              selected={state.selectedCardIds.includes(card.id)}
              onClick={state.phase === 'player-action' ? () => toggle(card.id) : undefined}
            />
          ))}
        </div>
      </div>

      {/* Action buttons */}
      {state.phase === 'player-draw' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="pixel-btn pixel-btn-primary" onClick={() => dispatch({ type: 'DRAW_DECK' })}>
            DRAW FROM DECK
          </button>
          <button
            className="pixel-btn pixel-btn-secondary"
            onClick={() => dispatch({ type: 'DRAW_DISCARD' })}
            disabled={!topDiscard || (!state.playerHasMelded && topDiscard?.id !== state.trumpCard?.id)}
          >
            DRAW DISCARD
          </button>
        </div>
      )}

      {state.phase === 'player-action' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="pixel-btn pixel-btn-success" onClick={() => dispatch({ type: 'STAGE_MELD' })}
            disabled={state.selectedCardIds.length < 3}>
            STAGE MELD
          </button>
          {state.stagedMelds.length > 0 && (
            <>
              <button className="pixel-btn pixel-btn-primary" onClick={() => dispatch({ type: 'COMMIT_MELDS' })}>
                COMMIT MELDS ({totalMeldValue(state.stagedMelds)} pts)
              </button>
              <button className="pixel-btn pixel-btn-secondary" onClick={() => dispatch({ type: 'CLEAR_STAGED' })}>
                CLEAR STAGED
              </button>
            </>
          )}
          {state.selectedCardIds.length === 1 && (
            <button
              className="pixel-btn pixel-btn-warning"
              onClick={() => {
                const id = state.selectedCardIds[0]
                dispatch({ type: 'DISCARD', cardId: id })
              }}
            >
              DISCARD SELECTED
            </button>
          )}
          <div style={{ fontSize: 14, color: 'var(--muted)', alignSelf: 'center' }}>
            Click a card in hand to select, then STAGE MELD, add to table set, or DISCARD.
          </div>
        </div>
      )}

      {state.phase === 'ai-turn' && (
        <div style={{ fontSize: 18, color: 'var(--muted)' }}>
          AI is thinking<span className="blink">…</span>
        </div>
      )}
    </div>
  )
}

// Helper: reshuffleDeck as pure function for use outside reducer
function reshuffleDeckState(state: GameState): GameState {
  if (state.deck.length > 0) return state
  const top = state.discardPile[state.discardPile.length - 1]
  const rest = state.discardPile.slice(0, -1)
  return { ...state, deck: shuffle(rest), discardPile: [top] }
}
