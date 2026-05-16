import type { Card, GameState, Meld } from './types'
import { meldValue, findMeldsInHand, totalMeldValue, canAddToMeld, isValidMeld } from './meld'
import { handCardValue, RANK_NUM } from './cards'

// Return sorted indices of cards AI wants to keep (ascending priority = discard last)
function cardPriority(card: Card): number {
  if (card.isJoker) return 1000
  if (['J','Q','K','10'].includes(card.rank)) return 5
  if (card.rank === 'A') return 6
  return parseInt(card.rank) ?? 5
}

export function aiChooseDiscard(hand: Card[], melds: Meld[]): Card {
  // Keep cards that participate in melds or near-melds
  // Discard highest-value card that doesn't fit
  const usefulIds = new Set<string>()

  // Mark cards in found melds
  const found = findMeldsInHand(hand)
  found.forEach(m => m.forEach(c => usefulIds.add(c.id)))

  // Cards not in useful sets, sort by value desc → discard highest
  const useless = hand.filter(c => !usefulIds.has(c.id))
  if (useless.length > 0) {
    return useless.sort((a, b) => handCardValue(b, true) - handCardValue(a, true))[0]
  }

  // All cards are in melds — discard lowest priority card from smallest meld
  return hand.sort((a, b) => cardPriority(a) - cardPriority(b))[0]
}

export interface AIDecision {
  drawFromDiscard: boolean
  meldsToPlay: Card[][]      // sets to lay down
  cardsToAddToMeld: { meldId: string; cards: Card[] }[]
  discardCard: Card
}

export function computeAITurn(state: GameState): AIDecision {
  const hand = [...state.aiHand]
  const topDiscard = state.discardPile[state.discardPile.length - 1]

  // Decide: draw from discard?
  let drawFromDiscard = false
  if (topDiscard && state.aiHasMelded) {
    // Check if discard helps complete a meld
    const testHand = [topDiscard, ...hand]
    const withDiscard = findMeldsInHand(testHand)
    const withoutDiscard = findMeldsInHand(hand)
    if (totalMeldValue(withDiscard) > totalMeldValue(withoutDiscard) + handCardValue(topDiscard, true)) {
      drawFromDiscard = true
    }
  }

  // Simulate drawing
  const workingHand = drawFromDiscard
    ? [topDiscard, ...hand]
    : hand // deck draw handled externally; AI gets a random card added before this runs

  // Find melds to play
  const meldsToPlay: Card[][] = []
  const usedIds = new Set<string>()

  if (!state.aiHasMelded) {
    // Find combination of melds totaling 51+
    const candidates = findMeldsInHand(workingHand)
    // Greedy: add melds until 51+ or no more
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
    // Already melded — lay down any valid sets
    const candidates = findMeldsInHand(workingHand)
    for (const m of candidates) {
      if (m.some(c => usedIds.has(c.id))) continue
      meldsToPlay.push(m)
      m.forEach(c => usedIds.add(c.id))
    }
  }

  // Try adding remaining cards to existing melds
  const cardsToAddToMeld: { meldId: string; cards: Card[] }[] = []
  const remaining = workingHand.filter(c => !usedIds.has(c.id))
  for (const card of remaining) {
    for (const meld of state.melds) {
      const combined = [...meld.cards, card]
      if (isValidMeld(combined)) {
        cardsToAddToMeld.push({ meldId: meld.id, cards: [card] })
        usedIds.add(card.id)
        break
      }
    }
  }

  // Discard
  const afterPlaying = workingHand.filter(c => !usedIds.has(c.id))
  const discardCard = afterPlaying.length > 0
    ? aiChooseDiscard(afterPlaying, state.melds)
    : afterPlaying[0] ?? workingHand[workingHand.length - 1]

  return { drawFromDiscard, meldsToPlay, cardsToAddToMeld, discardCard }
}
