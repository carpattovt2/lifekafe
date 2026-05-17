import type { Card, GameState, Meld } from './types'
import { meldValue, findMeldsInHand, totalMeldValue, canAddToMeld, isValidMeld, isBurningGroup, findUsefulCardIds, isValidGroup } from './meld'
import { handCardValue } from './cards'

function cardPriority(card: Card): number {
  if (card.isJoker) return 1000
  if (['J','Q','K','10'].includes(card.rank)) return 5
  if (card.rank === 'A') return 6
  return parseInt(card.rank) ?? 5
}

function meldProbability(turnCount: number): number {
  if (turnCount <= 5)  return 0.20
  if (turnCount <= 10) return 0.40
  if (turnCount <= 15) return 0.60
  if (turnCount <= 20) return 0.80
  return 1.00
}

export function aiChooseDiscard(hand: Card[], tableMelds: Meld[]): Card {
  const nonJokers = hand.filter(c => !c.isJoker)
  const pool = nonJokers.length > 0 ? nonJokers : hand

  const humanMelds = tableMelds.filter(m => m.ownerIndex === 0)
  const usefulToHuman = new Set<string>()
  for (const card of pool) {
    for (const meld of humanMelds) {
      if (canAddToMeld(meld, [card])) { usefulToHuman.add(card.id); break }
    }
  }

  const usefulIds = findUsefulCardIds(pool, tableMelds)
  const useless   = pool.filter(c => !usefulIds.has(c.id))
  const notUsefulToHuman = useless.filter(c => !usefulToHuman.has(c.id))
  const candidates = notUsefulToHuman.length > 0 ? notUsefulToHuman : useless

  if (candidates.length > 0) {
    return candidates.sort((a, b) => handCardValue(b) - handCardValue(a))[0]
  }
  return [...pool].sort((a, b) => cardPriority(a) - cardPriority(b))[0]
}

export interface AIDecision {
  drawFromDiscard: boolean
  meldsToPlay: Card[][]
  cardsToAddToMeld: { meldId: string; cards: Card[] }[]
  discardCard: Card
  burnAction: 'steal' | 'burn' | null
  jokerReplacementCards: Card[]
}

export function computeAITurn(state: GameState, playerIndex: number): AIDecision {
  const player     = state.players[playerIndex]
  const hand       = [...player.hand]
  const topDiscard = state.discardPile[state.discardPile.length - 1]
  const topDeck    = state.deck[0]  // peek at deck top (not drawn yet, but used for planning)

  const circlesCompleted = state.players.length
    ? Math.min(...state.players.map(p => p.turnCount))
    : 0
  const meldingAllowed = circlesCompleted >= 2

  // ── Choose draw source ──────────────────────────────────────────────────
  // Prefer discard only if already melded AND it significantly improves melds
  let drawFromDiscard = false
  if (topDiscard && player.hasMelded) {
    const withD    = findMeldsInHand([topDiscard, ...hand])
    const withoutD = findMeldsInHand(hand)
    if (totalMeldValue(withD) > totalMeldValue(withoutD) + handCardValue(topDiscard)) {
      drawFromDiscard = true
    }
  }

  // ── Working hand: includes the card AI is about to draw ─────────────────
  // This lets AI plan melds with its full 15-card hand (pre-discard)
  const drawnCard   = drawFromDiscard ? topDiscard : topDeck
  const workingHand = drawnCard ? [...hand, drawnCard] : hand

  const meldsToPlay: Card[][] = []
  const usedIds = new Set<string>()

  if (!meldingAllowed) {
    // Circles 1 & 2: no melding allowed
  } else if (!player.hasMelded) {
    // Find valid meld combinations totalling 51+
    const candidates = findMeldsInHand(workingHand)
    for (const m of candidates) {
      if (m.some(c => usedIds.has(c.id))) continue
      // Hard validation: no more than 4 cards in a group (must be valid meld)
      if (!isValidMeld(m)) continue
      if (isValidGroup(m) && m.length > 4) continue
      meldsToPlay.push(m)
      m.forEach(c => usedIds.add(c.id))
      if (totalMeldValue(meldsToPlay) >= 51) break
    }
    if (totalMeldValue(meldsToPlay) < 51) {
      meldsToPlay.length = 0
      usedIds.clear()
    } else {
      const prob = meldProbability(player.turnCount)
      const roll = Math.random()
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[AI ${playerIndex}] turn=${player.turnCount} prob=${prob.toFixed(2)} roll=${roll.toFixed(2)} meldVal=${totalMeldValue(meldsToPlay)} hand=${workingHand.length}`)
      }
      if (roll > prob) { meldsToPlay.length = 0; usedIds.clear() }
    }
  } else {
    // Already melded — lay down any additional valid sets
    const candidates = findMeldsInHand(workingHand)
    for (const m of candidates) {
      if (m.some(c => usedIds.has(c.id))) continue
      if (!isValidMeld(m)) continue
      if (isValidGroup(m) && m.length > 4) continue
      meldsToPlay.push(m)
      m.forEach(c => usedIds.add(c.id))
    }
  }

  // ── Add single cards to existing table melds ───────────────────────────
  const cardsToAddToMeld: { meldId: string; cards: Card[] }[] = []
  if (meldingAllowed && (player.hasMelded || meldsToPlay.length > 0)) {
    const remaining = workingHand.filter(c => !usedIds.has(c.id))
    for (const card of remaining) {
      for (const meld of state.melds) {
        if (isBurningGroup(meld)) continue           // never add to 4-card group (burns)
        if (meld.cards.length >= 4 && meld.type === 'group') continue  // hard cap
        if (!canAddToMeld(meld, [card])) continue    // validates duplicate + validity
        cardsToAddToMeld.push({ meldId: meld.id, cards: [card] })
        usedIds.add(card.id)
        break
      }
    }
  }

  // ── Burning meld resolution ────────────────────────────────────────────
  let burnAction: 'steal' | 'burn' | null = null
  const jokerReplacementCards: Card[] = []
  if (state.burningMeldId && state.burningHasJoker) {
    const available = workingHand.filter(c => !usedIds.has(c.id) && !c.isJoker)
    if (available.length >= 2) {
      const sorted = [...available].sort((a, b) => handCardValue(a) - handCardValue(b))
      jokerReplacementCards.push(sorted[0], sorted[1])
      burnAction = 'steal'
    } else {
      burnAction = 'burn'
    }
  } else if (state.burningMeldId) {
    burnAction = 'burn'
  }

  const afterPlaying = workingHand.filter(c => !usedIds.has(c.id))
  const discardCard  = afterPlaying.length > 0
    ? aiChooseDiscard(afterPlaying, state.melds)
    : workingHand[workingHand.length - 1]

  return { drawFromDiscard, meldsToPlay, cardsToAddToMeld, discardCard, burnAction, jokerReplacementCards }
}
