'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/LanguageContext'
import { createDeck, shuffle, dealToPlayers } from '@/lib/game/cards'
import type { Card, CardBack, Suit, GameState } from '@/lib/game/types'

type SetupStep = 'nickname' | 'settings' | 'lobby'
type AnimSpeed = 'fast' | 'normal' | 'slow'
type GameTheme = 'dark' | 'pastel'
type SlotStatus = 'empty' | 'pending' | 'accepted' | 'bot'

interface SlotInfo {
  seatIndex: number
  status: SlotStatus
  nickname?: string
  userId?: string
  invitationId?: string
}

interface PendingInvite {
  seatIndex: number
  userId: string
  nickname: string
  invitationId: string
}

interface Settings {
  numPlayers: number
  cardBack: CardBack
  theme: GameTheme
  speed: AnimSpeed
}

interface FriendProfile {
  user_id: string
  nickname: string
  email: string | null
}

const CARD_BACKS: CardBack[] = ['night','elegant','dragon','runes','poker','sea','vip','vegas']

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

export default function OnlineSetup({ onBack }: { onBack: () => void }) {
  const supabase = createClient()
  const { t } = useLanguage()
  const to = t.online
  const tg = t.game
  const router = useRouter()

  const [step, setStep] = useState<SetupStep>('nickname')
  const [userId, setUserId] = useState<string | null>(null)
  const [myNickname, setMyNickname] = useState('')
  const [nicknameInput, setNicknameInput] = useState('')
  const [savingNick, setSavingNick] = useState(false)

  const [settings, setSettings] = useState<Settings>({
    numPlayers: 2,
    cardBack: 'night',
    theme: 'dark',
    speed: 'fast',
  })

  const [roomId, setRoomId] = useState<string | null>(null)
  const [roomCode, setRoomCode] = useState('')
  const [slots, setSlots] = useState<SlotInfo[]>([])
  const [creatingRoom, setCreatingRoom] = useState(false)
  const [startingGame, setStartingGame] = useState(false)

  const [showFriendPicker, setShowFriendPicker] = useState<number | null>(null)
  const [friends, setFriends] = useState<FriendProfile[]>([])
  const [loadingFriends, setLoadingFriends] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data: profile } = await supabase.from('game_profiles').select('nickname').eq('user_id', user.id).single()
      if (profile?.nickname) {
        setMyNickname(profile.nickname)
        setStep('settings')
      } else {
        setStep('nickname')
      }
    }
    init()
  }, [])

  async function saveNickname() {
    if (!userId || !nicknameInput.trim()) return
    setSavingNick(true)
    await supabase.from('game_profiles').upsert({ user_id: userId, nickname: nicknameInput.trim() }, { onConflict: 'user_id' })
    setMyNickname(nicknameInput.trim())
    setSavingNick(false)
    setStep('settings')
  }

  async function createLobby() {
    if (!userId || !myNickname) return
    setCreatingRoom(true)

    // Clean up any stale waiting rooms from this host's previous sessions
    const { data: staleRooms } = await supabase
      .from('game_rooms').select('id').eq('host_id', userId).eq('status', 'waiting')
    if (staleRooms?.length) {
      for (const r of staleRooms) {
        await supabase.from('room_players').delete().eq('room_id', r.id)
        await supabase.from('game_rooms').delete().eq('id', r.id)
      }
    }

    const code = generateCode()
    const { data: room } = await supabase.from('game_rooms').insert({
      code,
      host_id: userId,
      status: 'waiting',
      max_players: settings.numPlayers,
      current_players: 1,
      settings: { cardBack: settings.cardBack, theme: settings.theme, speed: settings.speed },
    }).select('id').single()

    if (!room) { setCreatingRoom(false); return }

    await supabase.from('room_players').insert({
      room_id: room.id,
      user_id: userId,
      nickname: myNickname,
      seat_index: 0,
      is_bot: false,
      is_ready: true,
    })

    setRoomId(room.id)
    setRoomCode(code)

    const initialSlots: SlotInfo[] = [
      { seatIndex: 0, status: 'accepted', nickname: myNickname, userId },
      ...Array.from({ length: settings.numPlayers - 1 }, (_, i) => ({
        seatIndex: i + 1,
        status: 'empty' as SlotStatus,
      })),
    ]
    setSlots(initialSlots)
    setCreatingRoom(false)
    setStep('lobby')
  }

  const loadFriends = useCallback(async () => {
    if (!userId) return
    setLoadingFriends(true)
    const { data: rows } = await supabase.from('friendships')
      .select('requester_id, receiver_id')
      .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
      .eq('status', 'accepted')
    if (!rows) { setLoadingFriends(false); return }
    const ids = rows.map(r => r.requester_id === userId ? r.receiver_id : r.requester_id)
    if (!ids.length) { setFriends([]); setLoadingFriends(false); return }
    const { data: profiles } = await supabase.from('game_profiles').select('user_id, nickname, email').in('user_id', ids)
    setFriends((profiles ?? []) as FriendProfile[])
    setLoadingFriends(false)
  }, [userId])

  async function inviteFriend(seatIndex: number, friend: FriendProfile) {
    if (!userId || !roomId) return
    if (slots.some(s => s.userId === friend.user_id)) return

    // Create game invitation (sender_id = auth.uid(), so RLS allows this)
    const { data: inv, error: invErr } = await supabase
      .from('game_invitations')
      .insert({ room_id: roomId, sender_id: userId, receiver_id: friend.user_id, status: 'pending' })
      .select('id').single()
    if (invErr || !inv) {
      console.error('[inviteFriend] game_invitations insert failed:', invErr)
      return
    }

    // Send notification to friend
    const { error: notifErr } = await supabase.from('friend_notifications').insert({
      user_id: friend.user_id, from_user_id: userId, type: 'game_invite',
    })
    if (notifErr) console.warn('[inviteFriend] friend_notifications insert failed:', notifErr)

    // Store the seat reservation in game_rooms.settings.pendingInvites
    // (host owns the room row → RLS allows this UPDATE; avoids inserting into room_players
    //  with a foreign user_id which the host's RLS can't do)
    const { data: roomRow } = await supabase
      .from('game_rooms').select('settings').eq('id', roomId).single()
    const existing: PendingInvite[] = roomRow?.settings?.pendingInvites ?? []
    const newPending: PendingInvite[] = [
      ...existing.filter(p => p.seatIndex !== seatIndex),
      { seatIndex, userId: friend.user_id, nickname: friend.nickname || friend.email || '?', invitationId: inv.id },
    ]
    const { error: settingsErr } = await supabase.from('game_rooms')
      .update({ settings: { ...(roomRow?.settings ?? {}), pendingInvites: newPending } })
      .eq('id', roomId)
    if (settingsErr) console.error('[inviteFriend] game_rooms settings update failed:', settingsErr)

    // Immediate local update (subscription will re-confirm)
    setSlots(prev => prev.map(s => s.seatIndex === seatIndex
      ? { seatIndex, status: 'pending', nickname: friend.nickname || friend.email || '?', userId: friend.user_id, invitationId: inv.id }
      : s
    ))
    setShowFriendPicker(null)
  }

  async function addBot(seatIndex: number) {
    if (!roomId) return
    const botNum = seatIndex
    const botName = `Bot ${botNum}`
    await supabase.from('room_players').insert({
      room_id: roomId,
      user_id: null,
      nickname: botName,
      seat_index: seatIndex,
      is_bot: true,
      is_ready: true,
    })
    setSlots(prev => prev.map(s => s.seatIndex === seatIndex
      ? { seatIndex, status: 'bot', nickname: botName }
      : s
    ))
  }

  async function removeSlot(seatIndex: number) {
    if (!roomId) return
    const slot = slots.find(s => s.seatIndex === seatIndex)
    if (!slot) return

    // Remove from room_players (handles bots and accepted human players)
    await supabase.from('room_players').delete().eq('room_id', roomId).eq('seat_index', seatIndex)

    // Decline any pending invitation
    if (slot.invitationId) {
      await supabase.from('game_invitations').update({ status: 'declined' }).eq('id', slot.invitationId)
    } else if (slot.userId) {
      await supabase.from('game_invitations')
        .update({ status: 'declined' })
        .eq('room_id', roomId).eq('receiver_id', slot.userId).eq('status', 'pending')
    }

    // Remove from game_rooms.settings.pendingInvites
    const { data: roomRow } = await supabase.from('game_rooms').select('settings').eq('id', roomId).single()
    if (roomRow?.settings) {
      const pending: PendingInvite[] = roomRow.settings.pendingInvites ?? []
      await supabase.from('game_rooms')
        .update({ settings: { ...roomRow.settings, pendingInvites: pending.filter(p => p.seatIndex !== seatIndex) } })
        .eq('id', roomId)
    }

    setSlots(prev => prev.map(s => s.seatIndex === seatIndex ? { seatIndex, status: 'empty' } : s))
  }

  // Full re-fetch: merges room_players (accepted/bot) with game_rooms.settings.pendingInvites
  async function rebuildSlots(rid: string, numPlayers: number) {
    const [{ data: players }, { data: roomRow }] = await Promise.all([
      supabase.from('room_players').select('*').eq('room_id', rid).order('seat_index'),
      supabase.from('game_rooms').select('settings').eq('id', rid).single(),
    ])
    const pending: PendingInvite[] = roomRow?.settings?.pendingInvites ?? []
    const newSlots: SlotInfo[] = []
    for (let i = 0; i < numPlayers; i++) {
      const p = (players ?? []).find((p: any) => p.seat_index === i)
      if (p) {
        newSlots.push({ seatIndex: i, status: p.is_bot ? 'bot' : 'accepted', nickname: p.nickname, userId: p.user_id })
      } else {
        const inv = pending.find(pi => pi.seatIndex === i)
        if (inv) newSlots.push({ seatIndex: i, status: 'pending', nickname: inv.nickname, userId: inv.userId, invitationId: inv.invitationId })
        else newSlots.push({ seatIndex: i, status: 'empty' })
      }
    }
    setSlots(newSlots)
  }

  // Re-fetch on lobby entry (catches anything missed before subscription starts)
  useEffect(() => {
    if (roomId && step === 'lobby') {
      console.log('[lobby:init] rebuildSlots for roomId:', roomId, 'numPlayers:', settings.numPlayers)
      rebuildSlots(roomId, settings.numPlayers).then(() => {
        console.log('[lobby:init] rebuildSlots done')
      })
    }
  }, [roomId, step])

  // Lobby realtime subscription
  useEffect(() => {
    console.log('[lobby:sub] effect ran — roomId:', roomId, 'step:', step)
    if (!roomId || step !== 'lobby') {
      console.log('[lobby:sub] skipping (no roomId or not lobby step)')
      return
    }

    console.log('[lobby:sub] setting up channel for room:', roomId)

    const channel = supabase.channel(`lobby-${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
        (payload) => {
          console.log('[lobby:INSERT] *** room_players INSERT received ***')
          console.log('[lobby:INSERT] full payload:', JSON.stringify(payload, null, 2))
          const p = payload.new as any
          console.log('[lobby:INSERT] new row → seat:', p.seat_index, 'is_ready:', p.is_ready, 'is_bot:', p.is_bot, 'nickname:', p.nickname)
          setSlots(prev => {
            console.log('[lobby:INSERT] slots BEFORE update:', JSON.stringify(prev))
            const next = prev.map(s =>
              s.seatIndex === p.seat_index
                ? { seatIndex: p.seat_index, status: (p.is_bot ? 'bot' : 'accepted') as SlotStatus, nickname: p.nickname, userId: p.user_id }
                : s
            )
            console.log('[lobby:INSERT] slots AFTER update:', JSON.stringify(next))
            return next
          })
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
        (payload) => {
          console.log('[lobby:UPDATE] *** room_players UPDATE received ***')
          console.log('[lobby:UPDATE] full payload:', JSON.stringify(payload, null, 2))
          const p = payload.new as any
          console.log('[lobby:UPDATE] updated row → seat:', p.seat_index, 'is_ready:', p.is_ready, 'is_bot:', p.is_bot, 'nickname:', p.nickname)
          setSlots(prev => {
            console.log('[lobby:UPDATE] slots BEFORE:', JSON.stringify(prev))
            const next = prev.map(s =>
              s.seatIndex === p.seat_index
                ? { seatIndex: p.seat_index, status: (p.is_bot ? 'bot' : p.is_ready ? 'accepted' : 'pending') as SlotStatus, nickname: p.nickname, userId: p.user_id, invitationId: s.invitationId }
                : s
            )
            console.log('[lobby:UPDATE] slots AFTER:', JSON.stringify(next))
            return next
          })
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
        (payload) => {
          console.log('[lobby:DELETE] room_players DELETE, payload:', JSON.stringify(payload, null, 2))
          rebuildSlots(roomId, settings.numPlayers)
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          const pending: PendingInvite[] = payload.new?.settings?.pendingInvites ?? []
          console.log('[lobby:GR_UPDATE] game_rooms UPDATE received, pendingInvites:', JSON.stringify(pending))
          setSlots(prev => {
            console.log('[lobby:GR_UPDATE] slots BEFORE:', JSON.stringify(prev))
            const next = prev.map(s => {
              if (s.status === 'accepted' || s.status === 'bot') return s
              const inv = pending.find(pi => pi.seatIndex === s.seatIndex)
              if (inv) return { seatIndex: s.seatIndex, status: 'pending' as SlotStatus, nickname: inv.nickname, userId: inv.userId, invitationId: inv.invitationId }
              return { seatIndex: s.seatIndex, status: 'empty' as SlotStatus }
            })
            console.log('[lobby:GR_UPDATE] slots AFTER:', JSON.stringify(next))
            return next
          })
        })
      .subscribe((status, err) => {
        console.log('[lobby:sub] channel status changed:', status, err ?? '')
        if (status === 'SUBSCRIBED') console.log('[lobby:sub] ✅ SUBSCRIBED — listening for changes on room:', roomId)
        if (status === 'CHANNEL_ERROR') console.error('[lobby:sub] ❌ CHANNEL_ERROR — realtime may not be enabled in Supabase dashboard')
        if (status === 'TIMED_OUT') console.warn('[lobby:sub] ⚠️ TIMED_OUT — check Supabase Realtime settings')
      })

    return () => {
      console.log('[lobby:sub] cleaning up channel for room:', roomId)
      supabase.removeChannel(channel)
    }
  }, [roomId, step])

  async function startGame() {
    if (!roomId || !userId) return
    setStartingGame(true)

    // Load confirmed room players — only is_ready rows (bots are always ready; pending invites are not)
    const { data: allPlayers } = await supabase.from('room_players').select('*').eq('room_id', roomId).order('seat_index')
    const roomPlayers = (allPlayers ?? []).filter((rp: any) => rp.is_ready || rp.is_bot)
    if (roomPlayers.length < settings.numPlayers) { setStartingGame(false); return }

    // Build initial game state
    const players = roomPlayers.map(rp => ({
      id: rp.user_id || `bot-${rp.seat_index}`,
      name: rp.nickname,
      isHuman: !rp.is_bot,
      hand: [] as Card[],
      hasMelded: false,
      turnCount: 0,
    }))

    const deck = shuffle(createDeck())
    const flipped = deck.shift()!
    const trumpCard = flipped.isJoker ? null : flipped
    const trumpSuit = trumpCard ? (trumpCard.suit as Suit) : null
    const firstIdx = 0
    const { hands, remaining } = dealToPlayers(deck, players.length, firstIdx)
    const dealtPlayers = players.map((p, i) => ({ ...p, hand: hands[i] }))
    if (flipped.isJoker) {
      const fp = dealtPlayers[firstIdx]
      remaining.push(fp.hand.splice(Math.floor(Math.random() * fp.hand.length), 1)[0])
      fp.hand.push(flipped)
    }

    const gameState: GameState & { turnStartedAt: string; seatUserIds: (string|null)[] } = {
      phase: dealtPlayers[firstIdx].isHuman ? 'player-draw' : 'ai-turn',
      numPlayers: players.length,
      roundNumber: 1,
      dealerIndex: 0,
      currentPlayerIndex: firstIdx,
      deck: remaining,
      discardPile: [],
      trumpCard,
      trumpSuit,
      takenTrumpCard: null,
      players: dealtPlayers,
      melds: [],
      roundScores: [],
      selectedCardIds: [],
      stagedMelds: [],
      drawnThisTurn: false,
      drawnFromDiscardCardId: null,
      message: '',
      burningMeldId: null,
      burningHasJoker: false,
      firstMeldSingleCardLeft: false,
      turnStartedAt: new Date().toISOString(),
      seatUserIds: roomPlayers.map(rp => rp.user_id),
    }

    await supabase.from('game_rooms').update({
      status: 'in_progress',
      game_state: gameState,
      updated_at: new Date().toISOString(),
    }).eq('id', roomId)

    router.push(`/game/online/${roomId}`)
  }

  // All slots must be confirmed (accepted by a human or filled by bot) — pending/empty blocks start
  const allSlotsFilled = slots.length === settings.numPlayers
    && slots.every(s => s.status === 'accepted' || s.status === 'bot')
    && slots.filter(s => s.status === 'accepted').length >= 1  // at least host is always accepted

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg)',
    border: '2px solid var(--border)',
    color: 'var(--text)',
    padding: '10px 14px',
    fontFamily: "'VT323', monospace",
    fontSize: 22,
    outline: 'none',
    width: '100%',
  }

  const sectionLabel: React.CSSProperties = {
    fontFamily: "'Press Start 2P', monospace",
    fontSize: 9,
    color: 'var(--muted)',
    marginBottom: 12,
  }

  // ── Step 0: Nickname ─────────────────────────────────────────────────────────
  if (step === 'nickname') return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '40px 16px' }}>
      <button onClick={onBack} className="pixel-btn" style={{ marginBottom: 20, fontSize: 9 }}>{t.friends.back}</button>
      <h1 style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 13, color: 'var(--c-dash)', marginBottom: 8, textAlign: 'center' }}>
        🌐 {to.title}
      </h1>
      <div className="pixel-card" style={{ padding: 20, marginTop: 24 }}>
        <div style={sectionLabel}>{to.nickRequired}</div>
        <input
          value={nicknameInput}
          onChange={e => setNicknameInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && saveNickname()}
          placeholder={to.enterNickname}
          style={inputStyle}
        />
        <button
          className="pixel-btn pixel-btn-success"
          onClick={saveNickname}
          disabled={savingNick || !nicknameInput.trim()}
          style={{ width: '100%', justifyContent: 'center', marginTop: 12, fontSize: 11 }}
        >
          {savingNick ? '...' : to.saveAndContinue}
        </button>
      </div>
    </div>
  )

  // ── Step 1: Settings ─────────────────────────────────────────────────────────
  if (step === 'settings') return (
    <div style={{ maxWidth: 540, margin: '0 auto', padding: '32px 16px' }}>
      <button onClick={onBack} className="pixel-btn" style={{ marginBottom: 20, fontSize: 9 }}>{t.friends.back}</button>
      <h1 style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 13, color: 'var(--c-dash)', marginBottom: 24, textAlign: 'center' }}>
        🌐 {to.title}
      </h1>
      <div className="pixel-card" style={{ padding: 20, marginBottom: 14 }}>
        <div style={sectionLabel}>{tg.choosePlayers}</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {[2,3,4,5].map(n => (
            <button key={n} className="pixel-btn"
              onClick={() => setSettings(s => ({...s, numPlayers: n}))}
              style={{ flex: 1, justifyContent: 'center', fontSize: 14, padding: '12px 0', background: settings.numPlayers === n ? 'var(--c-dash)' : 'var(--bg3)', color: settings.numPlayers === n ? '#000' : 'var(--muted)', border: `2px solid ${settings.numPlayers === n ? 'var(--c-dash)' : 'var(--border)'}` }}>
              {n}P
            </button>
          ))}
        </div>

        <div style={sectionLabel}>{tg.cardBackLabel}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {CARD_BACKS.map(key => (
            <div key={key} onClick={() => setSettings(s => ({...s, cardBack: key}))}
              style={{ cursor: 'pointer', border: `3px solid ${settings.cardBack === key ? 'var(--c-dash)' : 'var(--border)'}`, borderRadius: 6, padding: 4, width: 56, boxShadow: settings.cardBack === key ? '0 0 10px rgba(34,211,238,0.5)' : undefined }}>
              <div style={{ width: 48, height: 68, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: '100%', height: '100%', borderRadius: 3, background: 'var(--bg3)' }} />
              </div>
              <div style={{ fontFamily: "'VT323', monospace", fontSize: 12, color: settings.cardBack === key ? 'var(--c-dash)' : 'var(--muted)', textAlign: 'center', marginTop: 2 }}>{key}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={sectionLabel}>{tg.themeLabel}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['dark','pastel'] as const).map(th => (
                <button key={th} className="pixel-btn" onClick={() => setSettings(s => ({...s, theme: th}))}
                  style={{ flex: 1, justifyContent: 'center', fontSize: 10, background: settings.theme === th ? 'rgba(34,211,238,0.2)' : 'var(--bg3)', border: `2px solid ${settings.theme === th ? 'var(--c-dash)' : 'var(--border)'}`, color: settings.theme === th ? 'var(--c-dash)' : 'var(--muted)' }}>
                  {th === 'dark' ? tg.themeDark : tg.themePastel}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={sectionLabel}>{tg.animSpeedLabel}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['fast','normal','slow'] as const).map(sp => (
                <button key={sp} className="pixel-btn" onClick={() => setSettings(s => ({...s, speed: sp}))}
                  style={{ flex: 1, justifyContent: 'center', fontSize: 9, background: settings.speed === sp ? 'rgba(34,211,238,0.2)' : 'var(--bg3)', border: `2px solid ${settings.speed === sp ? 'var(--c-dash)' : 'var(--border)'}`, color: settings.speed === sp ? 'var(--c-dash)' : 'var(--muted)' }}>
                  {sp === 'fast' ? '🐇' : sp === 'normal' ? '🚶' : '🐢'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          className="pixel-btn pixel-btn-success"
          onClick={createLobby}
          disabled={creatingRoom}
          style={{ width: '100%', justifyContent: 'center', fontSize: 12, padding: '16px 0' }}
        >
          {creatingRoom ? '...' : to.createLobby}
        </button>
      </div>
    </div>
  )

  // ── Step 2: Lobby ────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 540, margin: '0 auto', padding: '32px 16px' }}>
      <button onClick={onBack} className="pixel-btn" style={{ marginBottom: 20, fontSize: 9 }}>{t.friends.back}</button>
      <h1 style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 13, color: 'var(--c-dash)', marginBottom: 8, textAlign: 'center' }}>
        🌐 {to.lobbyTitle}
      </h1>
      <div style={{ fontFamily: "'VT323', monospace", fontSize: 18, color: 'var(--muted)', textAlign: 'center', marginBottom: 20 }}>
        {to.roomCode}: <span style={{ color: 'var(--c-dash)', letterSpacing: 3 }}>{roomCode}</span>
      </div>

      <div className="pixel-card" style={{ padding: 16, marginBottom: 14 }}>
        <div style={sectionLabel}>{to.players}</div>
        {slots.sort((a,b) => a.seatIndex - b.seatIndex).map(slot => (
          <div key={slot.seatIndex} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '10px 12px', background: 'var(--bg3)', border: '2px solid var(--border)', borderRadius: 2, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: 12, color: 'var(--muted)', minWidth: 20 }}>
              {slot.seatIndex + 1}
            </div>

            {slot.status === 'accepted' && slot.seatIndex === 0 && (
              <>
                <span style={{ fontFamily: "'VT323', monospace", fontSize: 20, color: 'var(--text)', flex: 1 }}>{slot.nickname}</span>
                <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: '#22d3ee', border: '1px solid #22d3ee', padding: '3px 6px' }}>{to.host}</span>
              </>
            )}
            {slot.status === 'accepted' && slot.seatIndex > 0 && (
              <>
                <span style={{ fontFamily: "'VT323', monospace", fontSize: 20, color: 'var(--green)', flex: 1 }}>✓ {slot.nickname}</span>
                <button className="pixel-btn pixel-btn-danger" onClick={() => removeSlot(slot.seatIndex)} style={{ fontSize: 8, padding: '5px 8px' }}>{to.remove}</button>
              </>
            )}
            {slot.status === 'bot' && (
              <>
                <span style={{ fontFamily: "'VT323', monospace", fontSize: 20, color: 'var(--accent)', flex: 1 }}>🤖 {slot.nickname}</span>
                <button className="pixel-btn pixel-btn-danger" onClick={() => removeSlot(slot.seatIndex)} style={{ fontSize: 8, padding: '5px 8px' }}>{to.remove}</button>
              </>
            )}
            {slot.status === 'pending' && (
              <>
                <span style={{ fontFamily: "'VT323', monospace", fontSize: 20, color: 'var(--yellow)', flex: 1 }}>⏳ {slot.nickname}</span>
                <span style={{ fontFamily: "'VT323', monospace", fontSize: 16, color: 'var(--muted)' }}>{to.pending}</span>
                <button className="pixel-btn pixel-btn-danger" onClick={() => removeSlot(slot.seatIndex)} style={{ fontSize: 8, padding: '5px 8px' }}>{to.remove}</button>
              </>
            )}
            {slot.status === 'empty' && (
              <>
                <span style={{ flex: 1, color: 'var(--muted)', fontFamily: "'VT323', monospace", fontSize: 18 }}>— {to.inviteFriend} / {to.addBot}</span>
                <button className="pixel-btn" onClick={() => { loadFriends(); setShowFriendPicker(slot.seatIndex) }} style={{ fontSize: 8, padding: '5px 8px', whiteSpace: 'nowrap' }}>
                  👥 {to.inviteFriend}
                </button>
                <button className="pixel-btn" onClick={() => addBot(slot.seatIndex)} style={{ fontSize: 8, padding: '5px 8px' }}>
                  🤖 {to.addBot}
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {!allSlotsFilled && (
        <div style={{ fontFamily: "'VT323', monospace", fontSize: 17, color: 'var(--muted)', textAlign: 'center', marginBottom: 10 }}>
          {to.allSlotsNeeded}
        </div>
      )}

      <button
        className="pixel-btn pixel-btn-success"
        onClick={startGame}
        disabled={!allSlotsFilled || startingGame}
        style={{ width: '100%', justifyContent: 'center', fontSize: 13, padding: '18px 0', opacity: allSlotsFilled ? 1 : 0.4 }}
      >
        {startingGame ? '...' : to.startGame}
      </button>

      {/* ── Friend Picker Modal ──────────────────────────────────────────────── */}
      {showFriendPicker !== null && (
        <div className="modal-overlay" onClick={() => setShowFriendPicker(null)}>
          <div className="pixel-card" style={{ padding: 20, minWidth: 280, maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: 'var(--muted)', marginBottom: 14 }}>
              👥 {to.inviteFriend}
            </div>
            {loadingFriends ? (
              <div style={{ fontFamily: "'VT323', monospace", fontSize: 18, color: 'var(--muted)', textAlign: 'center' }}>...</div>
            ) : friends.length === 0 ? (
              <div style={{ fontFamily: "'VT323', monospace", fontSize: 18, color: 'var(--muted)', textAlign: 'center' }}>{to.noFriends}</div>
            ) : (
              friends
                .filter(f => !slots.some(s => s.userId === f.user_id))
                .map(f => (
                  <div key={f.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontFamily: "'VT323', monospace", fontSize: 20, color: 'var(--text)' }}>{f.nickname || f.email}</div>
                      {f.nickname && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{f.email}</div>}
                    </div>
                    <button className="pixel-btn pixel-btn-success" onClick={() => inviteFriend(showFriendPicker!, f)} style={{ fontSize: 8, padding: '6px 10px', whiteSpace: 'nowrap' }}>
                      + {to.inviteFriend}
                    </button>
                  </div>
                ))
            )}
            <button className="pixel-btn" onClick={() => setShowFriendPicker(null)} style={{ width: '100%', justifyContent: 'center', marginTop: 10, fontSize: 9 }}>
              ✕ {t.planner.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
