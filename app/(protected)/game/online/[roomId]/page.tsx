'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/LanguageContext'
import type { Card, GameState, Meld, Player, Phase, Suit } from '@/lib/game/types'
import { createDeck, shuffle, dealToPlayers, handCardValue, suitSymbol } from '@/lib/game/cards'
import {
  isValidMeld, meldType, meldValue, canAddToMeld,
  totalMeldValue, isBurningGroup, sortedMeldCards, isValidGroup, canStealJoker,
} from '@/lib/game/meld'
import { computeAITurn } from '@/lib/game/ai'

type OnlineGameState = GameState & {
  turnStartedAt: string
  seatUserIds: (string | null)[]
}

type RoomPlayer = {
  seat_index: number
  user_id: string | null
  nickname: string
  is_bot: boolean
  is_connected: boolean
}

// ── Game logic helpers ───────────────────────────────────────────────────────
let _mid = Date.now()
const mkId = () => `m${++_mid}`
function makeMeld(cards: Card[], owner: number): Meld { const tp = meldType(cards); return { id: mkId(), cards: sortedMeldCards(cards, tp), ownerIndex: owner, type: tp } }
function updatedMeld(meld: Meld, extra: Card[]): Meld { return { ...meld, cards: sortedMeldCards([...meld.cards, ...extra], meld.type) } }
function burnIntoDiscard(pile: Card[], burned: Card[]): Card[] { const m = Math.floor(pile.length / 2); return [...pile.slice(0, m), ...burned, ...pile.slice(m)] }
function calcPenalty(hand: Card[], hasMelded: boolean): number {
  if (!hand.length) return 0
  if (hasMelded && hand.some(c => c.isJoker)) return 10
  return Math.min(10, Math.round(hand.reduce((s, c) => s + handCardValue(c), 0) / 10))
}
function reshuffleIfEmpty(s: OnlineGameState): OnlineGameState {
  if (s.deck.length > 0) return s
  const top = s.discardPile[s.discardPile.length - 1]
  return { ...s, deck: shuffle(s.discardPile.slice(0, -1)), discardPile: top ? [top] : [] }
}
function nextIdx(cur: number, n: number) { return (cur + 1) % n }
function circlesDone(players: Player[]) { return players.length ? Math.min(...players.map(p => p.turnCount)) : 0 }
function mutPlayer(s: OnlineGameState, i: number, patch: Partial<Player>): Player[] { return s.players.map((p, idx) => idx === i ? { ...p, ...patch } : p) }
function finishRound(state: OnlineGameState, winner: number, allAtOnce: boolean, lastJoker: boolean): OnlineGameState {
  const bonus = allAtOnce ? (lastJoker ? -20 : -10) : -5
  const scores = state.players.map((p, i) => i === winner ? bonus : !p.hasMelded ? 10 : calcPenalty(p.hand, p.hasMelded))
  const nextPhase: Phase = state.roundNumber >= 7 ? 'game-end' : 'round-end'
  return { ...state, roundScores: [...state.roundScores, scores], phase: nextPhase, message: '', selectedCardIds: [], stagedMelds: [], burningMeldId: null, burningHasJoker: false, takenTrumpCard: null, firstMeldSingleCardLeft: false }
}
function advanceTurn(state: OnlineGameState): OnlineGameState {
  const ni = nextIdx(state.currentPlayerIndex, state.numPlayers)
  const nxt = state.players[ni]
  return { ...state, currentPlayerIndex: ni, phase: nxt.isHuman ? 'player-draw' : 'ai-turn', drawnThisTurn: false, drawnFromDiscardCardId: null, selectedCardIds: [], stagedMelds: [], message: '', takenTrumpCard: null, turnStartedAt: new Date().toISOString() }
}

// ── AI turn runner (returns new state) ──────────────────────────────────────
function runAITurn(state: OnlineGameState): OnlineGameState {
  const cp = state.currentPlayerIndex, player = state.players[cp]
  let s = reshuffleIfEmpty({ ...state })
  const decision = computeAITurn(s, cp)
  let hand = [...player.hand], deck = [...s.deck], disc = [...s.discardPile], melds = [...s.melds], hasMelded = player.hasMelded
  let firstMeldOneCard = false
  const used = new Set<string>()

  if (decision.drawFromDiscard && disc.length) { hand = [...hand, disc[disc.length - 1]]; disc = disc.slice(0, -1) }
  else if (deck.length) { hand = [...hand, deck[0]]; deck = deck.slice(1) }

  if (decision.meldsToPlay.length) {
    for (const mc of decision.meldsToPlay) { if (!isValidMeld(mc)) continue; melds = [...melds, makeMeld(mc, cp)]; mc.forEach(c => used.add(c.id)) }
    hasMelded = true; hand = hand.filter(c => !used.has(c.id))
    if (!player.hasMelded && hand.length === 1) firstMeldOneCard = true
  }
  if (hasMelded) {
    for (const { meldId, cards } of decision.cardsToAddToMeld) {
      const meld = melds.find(m => m.id === meldId); if (!meld || !canAddToMeld(meld, cards)) continue
      melds = melds.map(m => m.id === meldId ? updatedMeld(m, cards) : m); cards.forEach(c => used.add(c.id)); hand = hand.filter(c => !cards.some(x => x.id === c.id))
    }
  }

  let bmId = s.burningMeldId, bmJoker = s.burningHasJoker
  const newBurn = melds.find(m => isBurningGroup(m) && m.id !== bmId)
  if (newBurn && !bmId) { bmId = newBurn.id; bmJoker = newBurn.cards.some(c => c.isJoker) }
  if (bmId) {
    const bm = melds.find(m => m.id === bmId)
    if (bm) {
      if (decision.burnAction === 'steal' && bmJoker && decision.jokerReplacementCards.length >= 2) {
        const joker = bm.cards.find(c => c.isJoker)!, r = decision.jokerReplacementCards.filter(c => hand.some(h => h.id === c.id)).slice(0, 2)
        if (r.length >= 2) { disc = burnIntoDiscard(disc, [...bm.cards.filter(c => !c.isJoker), r[0], r[1]]); melds = melds.filter(m => m.id !== bmId); hand = [...hand.filter(c => c.id !== r[0].id && c.id !== r[1].id), joker] }
        else { disc = burnIntoDiscard(disc, bm.cards); melds = melds.filter(m => m.id !== bmId) }
      } else { disc = burnIntoDiscard(disc, bm.cards); melds = melds.filter(m => m.id !== bmId) }
    }
    bmId = null; bmJoker = false
  }

  const dc = hand.find(c => c.id === decision.discardCard?.id) ?? hand[hand.length - 1]
  const newPlayers = state.players.map((p, i) => i === cp ? { ...p, hand: dc ? hand.filter(c => c.id !== dc.id) : [], hasMelded, turnCount: p.turnCount + 1 } : p)
  const aiAllAtOnce = !player.hasMelded
  const partial = { ...s, players: newPlayers, deck, discardPile: disc, melds, burningMeldId: null, burningHasJoker: false, firstMeldSingleCardLeft: false } as OnlineGameState

  if (!dc || !newPlayers[cp].hand.length) {
    const fin = finishRound(partial, cp, !dc ? aiAllAtOnce : firstMeldOneCard, dc?.isJoker ?? false)
    return { ...fin, turnStartedAt: new Date().toISOString() }
  }
  partial.discardPile = [...disc, dc]
  return advanceTurn(partial)
}

// ── Minimal card renderer ────────────────────────────────────────────────────
function OCard({ card, selected, faceDown, small, onClick, dimmed }: {
  card: Card; selected?: boolean; faceDown?: boolean; small?: boolean; onClick?: () => void; dimmed?: boolean
}) {
  const w = small ? 38 : 52, h = small ? 54 : 74
  const sym = card.suit === 'hearts' ? '♥' : card.suit === 'diamonds' ? '♦' : card.suit === 'clubs' ? '♣' : card.suit === 'spades' ? '♠' : '★'
  const red = card.suit === 'hearts' || card.suit === 'diamonds'
  const col = red ? '#e63946' : '#1a1a2e'

  if (faceDown) return (
    <div style={{ width: w, height: h, borderRadius: 4, border: '2px solid var(--border)', background: 'repeating-linear-gradient(45deg,#1e293b,#1e293b 4px,#0f172a 4px,#0f172a 8px)', flexShrink: 0, opacity: dimmed ? 0.5 : 1 }} />
  )
  if (card.isJoker) return (
    <div onClick={onClick} style={{ width: w, height: h, borderRadius: 4, border: `2px solid ${selected ? '#22d3ee' : '#ffd700'}`, background: '#fffef0', cursor: onClick ? 'pointer' : 'default', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transform: selected ? 'translateY(-7px)' : 'none', transition: 'transform 0.1s', boxShadow: selected ? '0 0 8px rgba(34,211,238,0.7)' : '0 3px 6px rgba(0,0,0,0.4)', opacity: dimmed ? 0.5 : 1, userSelect: 'none' }}>
      <div style={{ fontSize: small ? 14 : 20, color: '#ffd700' }}>★</div>
      <div style={{ fontSize: small ? 4 : 6, fontFamily: "'Press Start 2P',monospace", color: '#888', marginTop: 1 }}>JOKER</div>
    </div>
  )
  return (
    <div onClick={onClick} style={{ width: w, height: h, borderRadius: 4, border: `2px solid ${selected ? '#22d3ee' : '#ccc8b8'}`, background: '#fffef0', cursor: onClick ? 'pointer' : 'default', position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', transform: selected ? 'translateY(-7px)' : 'none', transition: 'transform 0.1s', boxShadow: selected ? '0 0 8px rgba(34,211,238,0.7)' : '0 3px 6px rgba(0,0,0,0.4)', opacity: dimmed ? 0.5 : 1, userSelect: 'none' }}>
      <div style={{ position: 'absolute', top: 2, left: 3, color: col, fontWeight: 700, fontSize: small ? 8 : 10, lineHeight: 1 }}>{card.rank}</div>
      <div style={{ color: col, fontSize: small ? 14 : 18, lineHeight: 1 }}>{sym}</div>
      <div style={{ position: 'absolute', bottom: 2, right: 3, color: col, fontWeight: 700, fontSize: small ? 8 : 10, lineHeight: 1, transform: 'rotate(180deg)' }}>{card.rank}</div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function OnlineRoomPage({ params }: { params: { roomId: string } }) {
  const supabase = createClient()
  const router = useRouter()
  const { t } = useLanguage()
  const to = t.online, tg = t.game

  const [userId, setUserId] = useState<string | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [mySeatIndex, setMySeatIndex] = useState<number | null>(null)
  const [roomPlayers, setRoomPlayers] = useState<RoomPlayer[]>([])
  const [gameState, setGameState] = useState<OnlineGameState | null>(null)
  const [loading, setLoading] = useState(true)
  const [initError, setInitError] = useState<string | null>(null)
  const [roomStatus, setRoomStatus] = useState<string>('waiting')
  const [msg, setMsg] = useState('')

  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([])
  const [stagedMelds, setStagedMelds] = useState<Card[][]>([])
  const [showJokerDlg, setShowJokerDlg] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)

  const savingRef = useRef(false)
  const gsRef = useRef<OnlineGameState | null>(null); gsRef.current = gameState
  const seatRef = useRef<number | null>(null); seatRef.current = mySeatIndex
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Init
  useEffect(() => {
    async function init() {
      try {
        const { data: { user }, error: authErr } = await supabase.auth.getUser()
        if (authErr || !user) { router.push('/game'); return }
        setUserId(user.id)

        const { data: room, error: roomErr } = await supabase
          .from('game_rooms').select('*').eq('id', params.roomId).single()
        if (roomErr || !room) {
          setInitError(`Room not found (${roomErr?.message ?? 'unknown'})`)
          setLoading(false); return
        }

        setIsHost(room.host_id === user.id)
        setRoomStatus(room.status ?? 'waiting')
        if (room.game_state) setGameState(room.game_state as OnlineGameState)

        const { data: players, error: playersErr } = await supabase
          .from('room_players').select('*').eq('room_id', params.roomId).order('seat_index')
        if (!playersErr && players) {
          setRoomPlayers(players as RoomPlayer[])
          const mine = players.find((p: any) => p.user_id === user.id)
          if (mine) setMySeatIndex(mine.seat_index)
        }
      } catch (e: any) {
        setInitError(e?.message ?? 'Init failed')
      }
      setLoading(false)
    }
    init()
  }, [params.roomId])

  // Poll for game_state when it's null (race-condition after host starts game, or friend accepted before game started)
  useEffect(() => {
    if (loading || gameState) return
    const interval = setInterval(async () => {
      const { data: room } = await supabase
        .from('game_rooms').select('game_state,status').eq('id', params.roomId).single()
      if (room?.game_state) {
        setGameState(room.game_state as OnlineGameState)
        clearInterval(interval)
      }
      if (room?.status) setRoomStatus(room.status)
    }, 2000)
    return () => clearInterval(interval)
  }, [loading, gameState, params.roomId])

  // Realtime
  useEffect(() => {
    const ch = supabase.channel(`ogame-${params.roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_rooms', filter: `id=eq.${params.roomId}` },
        (p) => {
          if (p.new?.status) setRoomStatus(p.new.status)
          if (p.new?.game_state) {
            setGameState(p.new.game_state as OnlineGameState)
            setSelectedCardIds([]); setStagedMelds([]); setMsg('')
          }
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${params.roomId}` },
        async () => {
          const { data } = await supabase.from('room_players').select('*').eq('room_id', params.roomId).order('seat_index')
          if (data) setRoomPlayers(data as RoomPlayer[])
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [params.roomId])

  // Save helper
  const save = useCallback(async (ns: OnlineGameState) => {
    if (savingRef.current) return
    savingRef.current = true
    await supabase.from('game_rooms').update({
      game_state: ns,
      status: ns.phase === 'game-end' ? 'finished' : 'in_progress',
      updated_at: new Date().toISOString(),
    }).eq('id', params.roomId)
    savingRef.current = false
  }, [params.roomId])

  // Stats on game-end
  useEffect(() => {
    if (!gameState || gameState.phase !== 'game-end' || !userId || mySeatIndex === null) return
    const totals = gameState.roundScores.reduce((acc, r) => acc.map((s, i) => s + (r[i] ?? 0)), Array(gameState.numPlayers).fill(0) as number[])
    const min = Math.min(...totals)
    const won = totals[mySeatIndex] === min
    const rwon = gameState.roundScores.filter(r => r[mySeatIndex] === Math.min(...r)).length
    supabase.from('game_profiles').select('games_played,games_won,rounds_won').eq('user_id', userId).single().then(({ data }) => {
      if (!data) return
      supabase.from('game_profiles').update({ games_played: (data.games_played || 0) + 1, games_won: (data.games_won || 0) + (won ? 1 : 0), rounds_won: (data.rounds_won || 0) + rwon }).eq('user_id', userId)
    })
  }, [gameState?.phase])

  // Bot turns (host)
  useEffect(() => {
    if (!isHost || !gameState || gameState.phase !== 'ai-turn') return
    if (gameState.players[gameState.currentPlayerIndex].isHuman) return
    const t = setTimeout(() => {
      const gs = gsRef.current; if (!gs || gs.phase !== 'ai-turn') return
      save(runAITurn(gs))
    }, 1000)
    return () => clearTimeout(t)
  }, [isHost, gameState?.phase, gameState?.currentPlayerIndex])

  // Timer
  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (!gameState || mySeatIndex === null || gameState.currentPlayerIndex !== mySeatIndex) { setTimeLeft(null); return }
    if (gameState.phase !== 'player-draw' && gameState.phase !== 'player-action') { setTimeLeft(null); return }
    const limit = gameState.players[mySeatIndex].turnCount < 2 ? 120 : 45
    const started = new Date(gameState.turnStartedAt).getTime()
    const calc = () => Math.max(0, limit - (Date.now() - started) / 1000)
    setTimeLeft(Math.floor(calc()))
    timerRef.current = setInterval(() => {
      const left = calc(); setTimeLeft(Math.floor(left))
      if (left <= 0) { if (timerRef.current) clearInterval(timerRef.current); doAutoDiscard() }
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [gameState?.currentPlayerIndex, gameState?.turnStartedAt, mySeatIndex])

  // ── Auto-discard ─────────────────────────────────────────────────────────
  async function doAutoDiscard() {
    const gs = gsRef.current, seat = seatRef.current
    if (!gs || seat === null || savingRef.current) return
    if (gs.currentPlayerIndex !== seat) return
    let s = gs
    if (s.phase === 'player-draw') {
      const rs = reshuffleIfEmpty(s); if (!rs.deck.length) return
      const card = rs.deck[0]
      s = { ...rs, deck: rs.deck.slice(1), players: mutPlayer(rs, seat, { hand: [...rs.players[seat].hand, card] }), drawnThisTurn: true, phase: 'player-action' }
    }
    const p = s.players[seat]; if (!p.hand.length) return
    const highest = [...p.hand].sort((a, b) => handCardValue(b) - handCardValue(a))[0]
    await doDiscard(s, highest.id)
  }

  // ── Core discard ─────────────────────────────────────────────────────────
  async function doDiscard(state: OnlineGameState, cardId: string) {
    const cp = state.currentPlayerIndex, player = state.players[cp]
    const card = player.hand.find(c => c.id === cardId); if (!card) return
    const newHand = player.hand.filter(c => c.id !== cardId)

    if (state.burningMeldId) {
      const bm = state.melds.find(m => m.id === state.burningMeldId)
      if (bm) {
        const burnDisc = burnIntoDiscard(state.discardPile, bm.cards)
        const s2: OnlineGameState = { ...state, discardPile: burnDisc, melds: state.melds.filter(m => m.id !== state.burningMeldId), players: mutPlayer(state, cp, { hand: newHand }), burningMeldId: null, burningHasJoker: false }
        if (!newHand.length) { await save({ ...finishRound(s2, cp, !player.hasMelded, false), turnStartedAt: new Date().toISOString() }); return }
        await save(advanceTurn({ ...s2, players: mutPlayer(s2, cp, { turnCount: player.turnCount + 1 }) })); return
      }
    }

    if (!newHand.length) {
      const fin = finishRound({ ...state, discardPile: [...state.discardPile, card], players: mutPlayer(state, cp, { hand: newHand }) }, cp, !player.hasMelded, card.isJoker)
      await save({ ...fin, turnStartedAt: new Date().toISOString() }); return
    }
    await save(advanceTurn({ ...state, discardPile: [...state.discardPile, card], players: mutPlayer(state, cp, { hand: newHand, turnCount: player.turnCount + 1 }) }))
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async function actDrawDeck() {
    if (!gameState || mySeatIndex === null || savingRef.current) return
    if (gameState.currentPlayerIndex !== mySeatIndex || gameState.phase !== 'player-draw') return
    const rs = reshuffleIfEmpty(gameState); if (!rs.deck.length) { setMsg('Deck empty'); return }
    const card = rs.deck[0]
    await save({ ...rs, deck: rs.deck.slice(1), players: mutPlayer(rs, mySeatIndex, { hand: [...rs.players[mySeatIndex].hand, card] }), drawnThisTurn: true, phase: 'player-action', message: '' })
  }

  async function actDrawDiscard() {
    if (!gameState || mySeatIndex === null || savingRef.current) return
    if (gameState.currentPlayerIndex !== mySeatIndex || gameState.phase !== 'player-draw') return
    const top = gameState.discardPile[gameState.discardPile.length - 1]; if (!top) return
    if (circlesDone(gameState.players) < 2) { setMsg(tg.noMeldCircle); return }
    await save({ ...gameState, discardPile: gameState.discardPile.slice(0, -1), players: mutPlayer(gameState, mySeatIndex, { hand: [...gameState.players[mySeatIndex].hand, top] }), drawnThisTurn: true, drawnFromDiscardCardId: top.id, phase: 'player-action' })
  }

  async function actTakeTrump() {
    if (!gameState || mySeatIndex === null || savingRef.current || !gameState.trumpCard) return
    if (circlesDone(gameState.players) < 2) { setMsg(tg.trumpCircleReq); return }
    const card = gameState.trumpCard
    await save({ ...gameState, trumpCard: null, trumpSuit: null, takenTrumpCard: card, players: mutPlayer(gameState, mySeatIndex, { hand: [...gameState.players[mySeatIndex].hand, card] }), drawnThisTurn: true, phase: 'player-action' })
  }

  async function actReturnTrump() {
    if (!gameState || mySeatIndex === null || savingRef.current) return
    const card = gameState.takenTrumpCard; if (!card) return
    await save({ ...gameState, trumpCard: card, trumpSuit: card.suit as Suit, takenTrumpCard: null, players: mutPlayer(gameState, mySeatIndex, { hand: gameState.players[mySeatIndex].hand.filter(c => c.id !== card.id) }) })
  }

  function toggleCard(id: string) {
    if (!gameState || mySeatIndex === null || gameState.currentPlayerIndex !== mySeatIndex) return
    setSelectedCardIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  function stageMeld() {
    if (!gameState || mySeatIndex === null) return
    if (circlesDone(gameState.players) < 2) { setMsg(tg.noMeldCircle); return }
    if (selectedCardIds.length < 3) { setMsg('Select 3+ cards'); return }
    const sel = gameState.players[mySeatIndex].hand.filter(c => selectedCardIds.includes(c.id))
    if (!isValidMeld(sel)) { setMsg('Invalid meld'); return }
    setStagedMelds(p => [...p, sel]); setSelectedCardIds([]); setMsg('')
  }

  async function commitMelds(jokerPositions: Record<string, number> = {}) {
    if (!gameState || mySeatIndex === null || savingRef.current) return
    const player = gameState.players[mySeatIndex]
    const total = totalMeldValue(stagedMelds)
    if (!player.hasMelded && total < 51) { setMsg(`Need 51+ pts (have ${total})`); return }

    const newMelds = stagedMelds.map(cards => {
      const tp = meldType(cards)
      if (tp === 'sequence' && Object.keys(jokerPositions).length > 0) {
        const jokers = cards.filter(c => c.isJoker)
        if (jokers.length > 0) {
          const pos: Record<string, number> = {}
          jokers.forEach(j => { if (jokerPositions[j.id]) pos[j.id] = jokerPositions[j.id] })
          if (Object.keys(pos).length > 0) return { id: mkId(), cards: sortedMeldCards(cards, 'sequence', pos), ownerIndex: mySeatIndex, type: 'sequence' as const, jokerPositions: pos }
        }
      }
      return makeMeld(cards, mySeatIndex)
    })
    const usedIds = new Set(stagedMelds.flat().map(c => c.id))
    const newHand = player.hand.filter(c => !usedIds.has(c.id))
    const allMelds = [...gameState.melds, ...newMelds]
    const allAtOnce = !player.hasMelded

    setStagedMelds([]); setSelectedCardIds([]); setShowJokerDlg(false)

    const base: OnlineGameState = { ...gameState, players: mutPlayer(gameState, mySeatIndex, { hand: newHand, hasMelded: true }), melds: allMelds, stagedMelds: [], selectedCardIds: [] }
    const burn = newMelds.find(m => isBurningGroup(m))
    if (burn) {
      const hj = burn.cards.some(c => c.isJoker)
      if (!newHand.length && !hj) { await save({ ...finishRound(base, mySeatIndex, allAtOnce, false), turnStartedAt: new Date().toISOString() }); return }
      await save({ ...base, burningMeldId: burn.id, burningHasJoker: hj }); return
    }
    if (!newHand.length) { await save({ ...finishRound(base, mySeatIndex, allAtOnce, false), turnStartedAt: new Date().toISOString() }); return }
    await save(base)
  }

  async function actAddToMeld(meldId: string) {
    if (!gameState || mySeatIndex === null || savingRef.current || !selectedCardIds.length) return
    if (circlesDone(gameState.players) < 2) { setMsg(tg.noAddCircle); return }
    const player = gameState.players[mySeatIndex]
    const sel = player.hand.filter(c => selectedCardIds.includes(c.id))
    const meld = gameState.melds.find(m => m.id === meldId)
    if (!meld || !canAddToMeld(meld, sel)) { setMsg('Cannot add'); return }

    const usedIds = new Set(sel.map(c => c.id))
    const nm = updatedMeld(meld, sel)
    const newHand = player.hand.filter(c => !usedIds.has(c.id))
    const addAllAtOnce = !player.hasMelded
    setSelectedCardIds([])
    const base: OnlineGameState = { ...gameState, players: mutPlayer(gameState, mySeatIndex, { hand: newHand, hasMelded: true }), melds: gameState.melds.map(m => m.id === meld.id ? nm : m), selectedCardIds: [] }
    if (isBurningGroup(nm)) {
      const hj = nm.cards.some(c => c.isJoker)
      if (!newHand.length && !hj) { await save({ ...finishRound(base, mySeatIndex, addAllAtOnce, false), turnStartedAt: new Date().toISOString() }); return }
      await save({ ...base, burningMeldId: nm.id, burningHasJoker: hj }); return
    }
    if (!newHand.length) { await save({ ...finishRound(base, mySeatIndex, addAllAtOnce, false), turnStartedAt: new Date().toISOString() }); return }
    await save(base)
  }

  async function actStealJoker(meldId: string) {
    if (!gameState || mySeatIndex === null || savingRef.current) return
    if (circlesDone(gameState.players) < 2) { setMsg(tg.noStealCircle); return }
    const player = gameState.players[mySeatIndex]
    const meld = gameState.melds.find(m => m.id === meldId); if (!meld) return

    if (meld.type === 'group') {
      if (selectedCardIds.length !== 2) { setMsg('Select 2 cards'); return }
      const sel2 = player.hand.filter(c => selectedCardIds.includes(c.id))
      const jokerG = meld.cards.find(c => c.isJoker); if (!jokerG) return
      const realCards = [...meld.cards.filter(c => !c.isJoker), ...sel2]
      if (!isValidGroup(realCards)) { setMsg('Invalid replacement'); return }
      const used2 = new Set(sel2.map(c => c.id))
      const burnCards = sortedMeldCards(realCards, 'group')
      setSelectedCardIds([])
      await save({ ...gameState, players: mutPlayer(gameState, mySeatIndex, { hand: [...player.hand.filter(c => !used2.has(c.id)), jokerG] }), melds: gameState.melds.filter(m => m.id !== meld.id), discardPile: burnIntoDiscard(gameState.discardPile, burnCards), selectedCardIds: [] })
      return
    }

    if (selectedCardIds.length !== 1) { setMsg('Select 1 card'); return }
    const realCard = player.hand.find(c => c.id === selectedCardIds[0]); if (!realCard) return
    const { canSteal, jokerIndex } = canStealJoker(meld, realCard)
    if (!canSteal) { setMsg('Cannot replace joker'); return }
    const joker = meld.cards[jokerIndex]
    const newMeldCards = sortedMeldCards(meld.cards.map((c, i) => i === jokerIndex ? realCard : c), meld.type)
    setSelectedCardIds([])
    await save({ ...gameState, players: mutPlayer(gameState, mySeatIndex, { hand: [...player.hand.filter(c => c.id !== realCard.id), joker] }), melds: gameState.melds.map(m => m.id === meld.id ? { ...m, cards: newMeldCards } : m), selectedCardIds: [] })
  }

  async function actDiscard(cardId: string) {
    if (!gameState || mySeatIndex === null || savingRef.current) return
    if (gameState.currentPlayerIndex !== mySeatIndex || gameState.phase !== 'player-action') return

    // Enforce: if drew from discard, must use it in a meld or return it
    if (gameState.drawnFromDiscardCardId && cardId !== gameState.drawnFromDiscardCardId) {
      const allMeldIds = new Set(gameState.melds.flatMap(m => m.cards.map(c => c.id)))
      if (!allMeldIds.has(gameState.drawnFromDiscardCardId)) { setMsg(tg.mustMeldReturn); return }
    }
    await doDiscard(gameState, cardId)
  }

  async function actReturnToDiscard() {
    if (!gameState || mySeatIndex === null || savingRef.current || !gameState.drawnFromDiscardCardId) return
    const drawnCard = gameState.players[mySeatIndex].hand.find(c => c.id === gameState.drawnFromDiscardCardId); if (!drawnCard) return
    await save({ ...gameState, discardPile: [...gameState.discardPile, drawnCard], players: mutPlayer(gameState, mySeatIndex, { hand: gameState.players[mySeatIndex].hand.filter(c => c.id !== drawnCard.id) }), drawnThisTurn: false, drawnFromDiscardCardId: null, phase: 'player-draw', stagedMelds: [], selectedCardIds: [] })
  }

  async function actNextRound() {
    if (!gameState || !isHost || savingRef.current || gameState.phase !== 'round-end') return
    const d = [...shuffle(createDeck())], flipped = d.shift()!
    let trumpCard: Card | null = null, trumpSuit: Suit | null = null, jokerFirst: Card | null = null
    if (flipped.isJoker) jokerFirst = flipped; else { trumpCard = flipped; trumpSuit = flipped.suit as Suit }
    const nd = nextIdx(gameState.dealerIndex, gameState.numPlayers), fi = nextIdx(nd, gameState.numPlayers)
    const { hands, remaining } = dealToPlayers(d, gameState.numPlayers, fi)
    const players = gameState.players.map((p, i) => ({ ...p, hand: [...hands[i]], hasMelded: false, turnCount: 0 }))
    if (jokerFirst) { const fp = players[fi]; remaining.push(fp.hand.splice(Math.floor(Math.random() * fp.hand.length), 1)[0]); fp.hand.push(jokerFirst) }
    await save({ ...gameState, roundNumber: gameState.roundNumber + 1, dealerIndex: nd, currentPlayerIndex: fi, phase: players[fi].isHuman ? 'player-draw' : 'ai-turn', deck: remaining, discardPile: [], trumpCard, trumpSuit, takenTrumpCard: null, players, melds: [], selectedCardIds: [], stagedMelds: [], drawnThisTurn: false, drawnFromDiscardCardId: null, message: '', burningMeldId: null, burningHasJoker: false, firstMeldSingleCardLeft: false, turnStartedAt: new Date().toISOString() })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
      <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 11, color: 'var(--muted)' }}>{to.connecting}...</div>
    </div>
  )

  if (initError) return (
    <div style={{ maxWidth: 480, margin: '40px auto', padding: '0 16px', textAlign: 'center' }}>
      <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 10, color: '#ef4444', marginBottom: 16 }}>Connection error</div>
      <div style={{ fontFamily: "'VT323',monospace", fontSize: 18, color: 'var(--muted)', marginBottom: 20 }}>{initError}</div>
      <button className="pixel-btn" onClick={() => router.push('/game')} style={{ fontSize: 9, padding: '10px 14px' }}>← Back</button>
    </div>
  )

  if (!gameState) return (
    <div style={{ maxWidth: 480, margin: '40px auto', padding: '0 16px', textAlign: 'center' }}>
      <h1 style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 12, color: 'var(--c-journal)', marginBottom: 20 }}>🌐 {to.lobbyTitle ?? 'Lobby'}</h1>

      {/* Players already in room */}
      {roomPlayers.length > 0 && (
        <div className="pixel-card" style={{ padding: 14, marginBottom: 16, textAlign: 'left' }}>
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: 'var(--muted)', marginBottom: 10 }}>{to.players}</div>
          {roomPlayers.map(p => (
            <div key={p.seat_index} style={{ fontFamily: "'VT323',monospace", fontSize: 20, color: 'var(--text)', padding: '4px 0', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--muted)', fontSize: 14 }}>{p.seat_index + 1}.</span>
              {p.is_bot ? '🤖 ' : ''}{p.nickname}
              {p.seat_index === 0 && <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: '#22d3ee', border: '1px solid #22d3ee', padding: '2px 4px' }}>{to.host}</span>}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontFamily: "'VT323',monospace", fontSize: 20, color: 'var(--muted)', marginBottom: 20 }}>
        {to.waitingForHost}
      </div>
      <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 8, color: 'var(--muted)', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e', animation: 'pulse 1.5s infinite' }} />
        {to.connecting}
      </div>
      <button className="pixel-btn" onClick={() => router.push('/game')} style={{ fontSize: 9, padding: '10px 14px' }}>← Back</button>
    </div>
  )

  const isMyTurn = mySeatIndex !== null && gameState.currentPlayerIndex === mySeatIndex
  const myPlayer = mySeatIndex !== null ? gameState.players[mySeatIndex] : null
  const myHand = myPlayer?.hand ?? []
  const stagedIds = stagedMelds.flat().map(c => c.id)
  const circles = circlesDone(gameState.players)
  const canMeld = circles >= 2
  const topDiscard = gameState.discardPile[gameState.discardPile.length - 1]
  const totals = gameState.roundScores.reduce((acc, r) => acc.map((s, i) => s + (r[i] ?? 0)), Array(gameState.numPlayers).fill(0) as number[])
  const pNames = gameState.players.map((_, i) => roomPlayers.find(r => r.seat_index === i)?.nickname ?? `P${i + 1}`)
  const sl: React.CSSProperties = { fontFamily: "'Press Start 2P',monospace", fontSize: 8, color: 'var(--muted)', marginBottom: 6 }

  // Game end
  if (gameState.phase === 'game-end') {
    const min = Math.min(...totals), wIdx = totals.indexOf(min)
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 16px', textAlign: 'center' }}>
        <h1 style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 13, color: 'var(--c-journal)', marginBottom: 20 }}>{to.finalScores}</h1>
        {mySeatIndex !== null && totals[mySeatIndex] === min && (
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 14, color: '#ffd700', marginBottom: 16, textShadow: '0 0 12px rgba(255,215,0,0.6)' }}>{to.youWin}</div>
        )}
        <div className="pixel-card" style={{ padding: 14, marginBottom: 16 }}>
          {gameState.players.map((_, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)', fontFamily: "'VT323',monospace" }}>
              <span style={{ fontSize: 20, color: i === wIdx ? '#ffd700' : 'var(--text)' }}>{i === wIdx ? '🏆 ' : ''}{pNames[i]}{i === mySeatIndex ? <span style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 6, color: 'var(--c-dash)', marginLeft: 6 }}>(YOU)</span> : null}</span>
              <span style={{ fontSize: 22, color: i === wIdx ? '#ffd700' : 'var(--text)' }}>{totals[i]}</span>
            </div>
          ))}
        </div>
        <div style={{ fontFamily: "'VT323',monospace", fontSize: 15, color: 'var(--muted)', marginBottom: 16 }}>{to.lowestWins}</div>
        <button className="pixel-btn pixel-btn-success" onClick={() => router.push('/game')} style={{ width: '100%', justifyContent: 'center', fontSize: 12, padding: '14px 0' }}>{to.newGame}</button>
      </div>
    )
  }

  // Round end
  if (gameState.phase === 'round-end') {
    const last = gameState.roundScores[gameState.roundScores.length - 1] ?? []
    const minR = Math.min(...last)
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 16px', textAlign: 'center' }}>
        <h1 style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 11, color: 'var(--c-dash)', marginBottom: 20 }}>{to.roundEnd} — {tg.roundDone} {gameState.roundNumber}</h1>
        <div className="pixel-card" style={{ padding: 14, marginBottom: 16 }}>
          {gameState.players.map((_, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontFamily: "'VT323',monospace" }}>
              <span style={{ fontSize: 19, color: last[i] === minR ? '#22c55e' : 'var(--text)' }}>{pNames[i]}{i === mySeatIndex ? ' ◄' : ''}</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ fontSize: 19, color: (last[i] ?? 0) < 0 ? '#22c55e' : '#ef4444' }}>{(last[i] ?? 0) > 0 ? '+' : ''}{last[i] ?? 0}</span>
                <span style={{ fontSize: 17, color: 'var(--muted)' }}>Σ{totals[i]}</span>
              </div>
            </div>
          ))}
        </div>
        {isHost
          ? <button className="pixel-btn pixel-btn-success" onClick={actNextRound} style={{ width: '100%', justifyContent: 'center', fontSize: 12, padding: '14px 0' }}>{to.nextRound}</button>
          : <div style={{ fontFamily: "'VT323',monospace", fontSize: 19, color: 'var(--muted)' }}>{to.waitingForHost}</div>
        }
      </div>
    )
  }

  // Active game
  const curName = pNames[gameState.currentPlayerIndex]
  const isAITurn = gameState.phase === 'ai-turn'
  const canActDiscard = isMyTurn && gameState.phase === 'player-action'

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '10px 8px', userSelect: 'none' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: 'var(--muted)' }}>{tg.roundDone} {gameState.roundNumber}/7 · {tg.circle} {circles + 1}</div>
        {isMyTurn && timeLeft !== null && (
          <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 16, color: timeLeft <= 10 ? '#ef4444' : timeLeft <= 20 ? '#f97316' : '#22c55e', textShadow: timeLeft <= 10 ? '0 0 10px rgba(239,68,68,0.6)' : undefined, minWidth: 50, textAlign: 'center' }}>
            {timeLeft}s
          </div>
        )}
        <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 7, color: 'var(--muted)' }}>{tg.scores}: {totals.map((s, i) => `${pNames[i]}:${s}`).join(' ')}</div>
      </div>

      {/* Turn banner */}
      {isMyTurn && (gameState.phase === 'player-draw' || gameState.phase === 'player-action') && (
        <div style={{ background: 'rgba(34,211,238,0.1)', border: '2px solid var(--c-dash)', padding: '7px 10px', marginBottom: 8, textAlign: 'center', fontFamily: "'Press Start 2P',monospace", fontSize: 10, color: 'var(--c-dash)', letterSpacing: 1 }}>{to.yourTurn}</div>
      )}
      {!isMyTurn && !['round-end', 'game-end'].includes(gameState.phase) && (
        <div style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)', padding: '5px 10px', marginBottom: 8, textAlign: 'center', fontFamily: "'VT323',monospace", fontSize: 17, color: 'var(--muted)' }}>
          {curName} — {isAITurn ? tg.aiThinking + '...' : to.waitYourTurn}
        </div>
      )}

      {/* Other players */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {gameState.players.map((p, i) => {
          if (i === mySeatIndex) return null
          const isCur = i === gameState.currentPlayerIndex
          return (
            <div key={i} style={{ flex: '1 1 130px', background: isCur ? 'rgba(34,211,238,0.08)' : 'var(--bg2)', border: `2px solid ${isCur ? 'var(--c-dash)' : 'var(--border)'}`, padding: '6px 8px', borderRadius: 2 }}>
              <div style={{ fontFamily: "'VT323',monospace", fontSize: 17, color: isCur ? 'var(--c-dash)' : 'var(--text)', marginBottom: 3 }}>
                {isCur ? '▶ ' : ''}{pNames[i]}{!p.isHuman ? ' 🤖' : ''}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {p.hand.slice(0, 10).map((_, ci) => (
                  <OCard key={ci} card={{ id: `b${i}${ci}`, suit: 'spades', rank: '2', isJoker: false }} faceDown small />
                ))}
                {p.hand.length > 10 && <span style={{ fontFamily: "'VT323',monospace", fontSize: 14, color: 'var(--muted)', alignSelf: 'center' }}>+{p.hand.length - 10}</span>}
              </div>
              <div style={{ fontFamily: "'VT323',monospace", fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                {p.hand.length} {tg.cardsLabel} {p.hasMelded ? '✓' : '○'}
              </div>
            </div>
          )
        })}
      </div>

      {/* Table */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap' }}>
        {/* Deck */}
        <div style={{ textAlign: 'center' }}>
          <div style={sl}>{tg.deck} ({gameState.deck.length})</div>
          <div onClick={isMyTurn && gameState.phase === 'player-draw' ? actDrawDeck : undefined} style={{ cursor: isMyTurn && gameState.phase === 'player-draw' ? 'pointer' : 'default' }}>
            <OCard card={{ id: 'dk', suit: 'spades', rank: '2', isJoker: false }} faceDown />
          </div>
        </div>

        {/* Discard */}
        <div style={{ textAlign: 'center' }}>
          <div style={sl}>{tg.discardPile}</div>
          {topDiscard
            ? <OCard card={topDiscard} onClick={isMyTurn && gameState.phase === 'player-draw' && canMeld ? actDrawDiscard : undefined} />
            : <div style={{ width: 52, height: 74, border: '2px dashed var(--border)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 18 }}>—</div>}
        </div>

        {/* Trump */}
        <div style={{ textAlign: 'center' }}>
          <div style={sl}>{tg.trump}</div>
          {gameState.trumpCard
            ? <div><OCard card={gameState.trumpCard} onClick={isMyTurn && gameState.phase === 'player-draw' && canMeld ? actTakeTrump : undefined} /><div style={{ fontFamily: "'VT323',monospace", fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{canMeld ? tg.takeTrump.slice(0, 12) : ''}</div></div>
            : <div style={{ width: 52, height: 74, border: '2px dashed var(--border)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 20 }}>
              {gameState.trumpSuit ? suitSymbol(gameState.trumpSuit as any) : '—'}
            </div>}
          {gameState.takenTrumpCard && isMyTurn && (
            <button className="pixel-btn" onClick={actReturnTrump} style={{ fontSize: 7, padding: '3px 5px', marginTop: 4, width: '100%' }}>{tg.returnTrump}</button>
          )}
        </div>

        {/* Melds */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={sl}>{tg.table}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {gameState.melds.map(meld => {
              const burn = meld.id === gameState.burningMeldId
              const mine = meld.ownerIndex === mySeatIndex
              const canAdd = canActDiscard && canMeld && selectedCardIds.length > 0
              const hasJoker = meld.cards.some(c => c.isJoker)
              return (
                <div key={meld.id} style={{ background: burn ? 'rgba(251,146,60,0.1)' : 'rgba(0,0,0,0.25)', border: `2px solid ${burn ? '#fb923c' : mine ? '#22c55e' : 'var(--border)'}`, padding: '4px 5px', borderRadius: 2, boxShadow: burn ? '0 0 8px rgba(251,146,60,0.4)' : undefined }}>
                  <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 5, color: 'var(--muted)', marginBottom: 3 }}>{pNames[meld.ownerIndex]} · {meldValue(meld.cards)}pt</div>
                  <div style={{ display: 'flex', gap: 2 }}>{meld.cards.map(c => <OCard key={c.id} card={c} small />)}</div>
                  <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                    {canAdd && <button className="pixel-btn" onClick={() => actAddToMeld(meld.id)} style={{ fontSize: 6, padding: '2px 4px' }}>{tg.addToSet}</button>}
                    {canActDiscard && canMeld && hasJoker && <button className="pixel-btn pixel-btn-warning" onClick={() => actStealJoker(meld.id)} style={{ fontSize: 6, padding: '2px 4px' }}>{tg.stealJoker}</button>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Message */}
      {msg && <div style={{ fontFamily: "'VT323',monospace", fontSize: 17, color: '#ef4444', marginBottom: 6, textAlign: 'center' }}>{msg}</div>}

      {/* Staged melds */}
      {stagedMelds.length > 0 && (
        <div style={{ padding: '6px 8px', background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.25)', marginBottom: 8 }}>
          <div style={sl}>{tg.staged}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{stagedMelds.map((g, gi) => <div key={gi} style={{ display: 'flex', gap: 2 }}>{g.map(c => <OCard key={c.id} card={c} small />)}</div>)}</div>
        </div>
      )}

      {/* My hand */}
      {myPlayer && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ ...sl, display: 'flex', justifyContent: 'space-between' }}>
            <span>{tg.yourHand} ({myHand.length}) {myPlayer.hasMelded ? '✓' : canMeld ? '' : `— Circle ${circles + 1}/3`}</span>
            {isMyTurn && gameState.phase === 'player-action' && selectedCardIds.length === 0 && <span style={{ color: 'var(--muted)', fontSize: 7 }}>tap card to select</span>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {myHand.map(card => {
              const staged = stagedIds.includes(card.id)
              return (
                <OCard key={card.id} card={card} selected={selectedCardIds.includes(card.id)} dimmed={staged}
                  onClick={canActDiscard ? () => toggleCard(card.id) : undefined} />
              )
            })}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {isMyTurn && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
          {gameState.phase === 'player-draw' && <>
            <button className="pixel-btn pixel-btn-success" onClick={actDrawDeck} style={{ fontSize: 9, padding: '10px 12px' }}>{tg.drawDeck}</button>
            {topDiscard && canMeld && <button className="pixel-btn" onClick={actDrawDiscard} style={{ fontSize: 9, padding: '10px 12px' }}>{tg.drawDiscard}</button>}
            {gameState.trumpCard && canMeld && <button className="pixel-btn" onClick={actTakeTrump} style={{ fontSize: 9, padding: '10px 12px' }}>{tg.takeTrump}</button>}
          </>}
          {gameState.phase === 'player-action' && <>
            {selectedCardIds.length >= 3 && !selectedCardIds.some(id => stagedIds.includes(id)) && (
              <button className="pixel-btn" onClick={stageMeld} style={{ fontSize: 9, padding: '10px 12px' }}>{tg.stageMeld}</button>
            )}
            {stagedMelds.length > 0 && <>
              <button className="pixel-btn pixel-btn-success" onClick={() => {
                const hasJokerSeq = stagedMelds.some(m => meldType(m) === 'sequence' && m.some(c => c.isJoker))
                if (hasJokerSeq) setShowJokerDlg(true); else commitMelds()
              }} style={{ fontSize: 9, padding: '10px 12px' }}>{tg.commitMelds}</button>
              <button className="pixel-btn pixel-btn-danger" onClick={() => { setStagedMelds([]); setSelectedCardIds([]) }} style={{ fontSize: 9, padding: '10px 12px' }}>{tg.clearStaged}</button>
            </>}
            {selectedCardIds.length === 1 && !stagedMelds.length && (
              <button className="pixel-btn pixel-btn-danger" onClick={() => { const id = selectedCardIds[0]; setSelectedCardIds([]); actDiscard(id) }} style={{ fontSize: 9, padding: '10px 12px' }}>{tg.discardBtn}</button>
            )}
            {gameState.drawnFromDiscardCardId && (
              <button className="pixel-btn" onClick={actReturnToDiscard} style={{ fontSize: 9, padding: '10px 12px' }}>{tg.returnDiscard}</button>
            )}
          </>}
        </div>
      )}

      {/* Joker position dialog */}
      {showJokerDlg && (
        <div className="modal-overlay" onClick={() => setShowJokerDlg(false)}>
          <div className="pixel-card" style={{ padding: 18, minWidth: 280 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Press Start 2P',monospace", fontSize: 8, marginBottom: 10 }}>{tg.jokerPosTitle}</div>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: 15, color: 'var(--muted)', marginBottom: 12 }}>{tg.jokerPosHint}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(n => {
                const rank = n === 11 ? 'J' : n === 12 ? 'Q' : n === 13 ? 'K' : n === 14 ? 'A' : String(n)
                return (
                  <button key={n} className="pixel-btn" onClick={() => {
                    const pos: Record<string, number> = {}
                    stagedMelds.forEach(meld => { const j = meld.find(c => c.isJoker); if (j) pos[j.id] = n })
                    commitMelds(pos)
                  }} style={{ fontSize: 10, padding: '6px 8px' }}>{rank}</button>
                )
              })}
            </div>
            <button className="pixel-btn pixel-btn-danger" onClick={() => setShowJokerDlg(false)} style={{ width: '100%', justifyContent: 'center', marginTop: 10, fontSize: 8 }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
