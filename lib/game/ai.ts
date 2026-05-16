import type { Card, GameState, Meld } from './types'
import { meldValue, findMeldsInHand, totalMeldValue, isValidMeld, isBurningGroup } from './meld'
import { handCardValue } from './cards'

function cardPriority(card: Card): number {
  if (card.isJoker) return 1000
  if (['J','Q','K','10'].includes(card.rank)) return 5
  if (card.rank === 'A') return 6
  return parseInt(card.rank) ?? 5
}

export function aiChooseDiscard(hand: Card[], melds: Meld[]): Card {
  const usefulIds = new Set<string>()
  findMeldsInHand(hand).forEach(m => m.forEach(c => usefulIds.add(c.id)))
  const useless = hand.filter(c => !usefulIds.has(c.id))
  if (useless.length > 0) {
    return useless.sort((a, b) => handCardValue(b, true) - handCardValue(a, true))[0]
  }
  return [...hand].sort((a, b) => cardPriority(a) - cardPriority(b))[0]
}

export interface AIDecision {
  drawFromDiscard: boolean
  meldsToPlay: Card[][]
  cardsToAddToMeld: { meldId: string; cards: Card[] }[]
  discardCard: Card
  // Burning meld decision
  burnAction: 'steal' | 'burn' | null
  burningMeldId: string | null
  jokerReplacementCards: Card[]   // 2 cards to replace joker in burning meld
}

export function computeAITurn(state: GameState): AIDecision {
  const hand = [...state.aiHand]
  const topDiscard = state.discardPile[state.discardPile.length - 1]

  let drawFromDiscard = false
  if (topDiscard && state.aiHasMelded) {
    const testHand = [topDiscard, ...hand]
    const withDiscard = findMeldsInHand(testHand)
    const withoutDiscard = findMeldsInHand(hand)
    if (totalMeldValue(withDiscard) > totalMeldValue(withoutDiscard) + handCardValue(topDiscard, true)) {
      drawFromDiscard = true
    }
  }

  const workingHand = drawFromDiscard ? [topDiscard, ...hand] : hand

  const meldsToPlay: Card[][] = []
  const usedIds = new Set<string>()

  if (!state.aiHasMelded) {
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
    }
  } else {
    const candidates = findMeldsInHand(workingHand)
    for (const m of candidates) {
      if (m.some(c => usedIds.has(c.id))) continue
      meldsToPlay.push(m)
      m.forEach(c => usedIds.add(c.id))
    }
  }

  const cardsToAddToMeld: { meldId: string; cards: Card[] }[] = []
  const remaining = workingHand.filter(c => !usedIds.has(c.id))
  for (const card of remaining) {
    for (const meld of state.melds) {
      if (isBurningGroup(meld)) continue // don't add to burning set
      const combined = [...meld.cards, card]
      if (isValidMeld(combined)) {
        cardsToAddToMeld.push({ meldId: meld.id, cards: [card] })
        usedIds.add(card.id)
        break
      }
    }
  }

  // Burning meld decision
  let burnAction: 'steal' | 'burn' | null = null
  let burningMeldId: string | null = null
  const jokerReplacementCards: Card[] = []

  const burningMeld = state.melds.find(m => m.id === state.burningMeldId)
  if (burningMeld && state.burningHasJoker) {
    // AI tries to steal joker from burning meld by providing 2 cards
    const available = workingHand.filter(c => !usedIds.has(c.id) && !c.isJoker)
    if (available.length >= 2) {
      // Use the lowest-value 2 cards as payment
      const sorted = [...available].sort((a, b) => handCardValue(a, true) - handCardValue(b, true))
      jokerReplacementCards.push(sorted[0], sorted[1])
      burnAction = 'steal'
      burningMeldId = state.burningMeldId
    } else {
      burnAction = 'burn'
      burningMeldId = state.burningMeldId
    }
  } else if (state.burningMeldId) {
    burnAction = 'burn'
    burningMeldId = state.burningMeldId
  }

  const afterPlaying = workingHand.filter(c => !usedIds.has(c.id))
  const discardCard = afterPlaying.length > 0
    ? aiChooseDiscard(afterPlaying, state.melds)
    : workingHand[workingHand.length - 1]

  return { drawFromDiscard, meldsToPlay, cardsToAddToMeld, discardCard, burnAction, burningMeldId, jokerReplacementCards }
}
