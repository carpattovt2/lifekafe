import type { Card, GameState, Meld } from './types'
import { meldValue, findMeldsInHand, totalMeldValue, canAddToMeld, isValidMeld, isBurningGroup } from './meld'
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

export function aiChooseDiscard(hand: Card[], melds: Meld[]): Card {
  // Never discard a Joker unless it is the only card in hand
  const nonJokers = hand.filter(c => !c.isJoker)
  const pool = nonJokers.length > 0 ? nonJokers : hand  // fall back to Joker only if no choice

  const usefulIds = new Set<string>()
  findMeldsInHand(pool).forEach(m => m.forEach(c => usefulIds.add(c.id)))
  const useless = pool.filter(c => !usefulIds.has(c.id))
  if (useless.length > 0) {
    return useless.sort((a, b) => handCardValue(b) - handCardValue(a))[0]
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

  // Decide draw from discard
  let drawFromDiscard = false
  if (topDiscard && player.hasMelded) {
    const withD  = findMeldsInHand([topDiscard, ...hand])
    const withoutD = findMeldsInHand(hand)
    if (totalMeldValue(withD) > totalMeldValue(withoutD) + handCardValue(topDiscard)) {
      drawFromDiscard = true
    }
  }

  const workingHand = drawFromDiscard ? [topDiscard, ...hand] : hand

  const meldsToPlay: Card[][] = []
  const usedIds = new Set<string>()

  if (!player.hasMelded) {
    // Only meld if 51+ is possible AND probability check passes
    const candidates = findMeldsInHand(workingHand)
    for (const m of candidates) {
      if (m.some(c => usedIds.has(c.id))) continue
      meldsToPlay.push(m)
      m.forEach(c => usedIds.add(c.id))
      if (totalMeldValue(meldsToPlay) >= 51) break
    }
    if (totalMeldValue(meldsToPlay) < 51) {
      meldsToPlay.length = 0
      usedIds.clear()
    } else {
      // Apply probability: maybe don't meld yet
      const prob = meldProbability(player.turnCount)
      if (Math.random() > prob) {
        meldsToPlay.length = 0
        usedIds.clear()
      }
    }
  } else {
    // Already melded — lay down any valid sets
    const candidates = findMeldsInHand(workingHand)
    for (const m of candidates) {
      if (m.some(c => usedIds.has(c.id))) continue
      meldsToPlay.push(m)
      m.forEach(c => usedIds.add(c.id))
    }
  }

  // Add cards to existing melds — ONLY if player has already melded 51+
  const cardsToAddToMeld: { meldId: string; cards: Card[] }[] = []
  if (player.hasMelded || meldsToPlay.length > 0) {
    const remaining = workingHand.filter(c => !usedIds.has(c.id))
    for (const card of remaining) {
      for (const meld of state.melds) {
        if (isBurningGroup(meld)) continue
        if (!canAddToMeld(meld, [card])) continue
        cardsToAddToMeld.push({ meldId: meld.id, cards: [card] })
        usedIds.add(card.id)
        break
      }
    }
  }

  // Burning meld resolution
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
  const discardCard = afterPlaying.length > 0
    ? aiChooseDiscard(afterPlaying, state.melds)
    : workingHand[workingHand.length - 1]

  return { drawFromDiscard, meldsToPlay, cardsToAddToMeld, discardCard, burnAction, jokerReplacementCards }
}
