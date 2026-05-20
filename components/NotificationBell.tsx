'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/LanguageContext'

type Notif = {
  id: string
  from_user_id: string
  type: string
  is_read: boolean
  created_at: string
  from_nickname: string
  from_email: string
  friendship_id: string | null
  room_id: string | null
  invitation_id: string | null
}

export default function NotificationBell() {
  const supabase = createClient()
  const router = useRouter()
  const { t } = useLanguage()
  const tf = t.friends
  const to = t.online
  if (!tf) return null

  const [userId, setUserId] = useState<string | null>(null)
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  const unread = notifs.filter(n => !n.is_read).length

  const loadNotifs = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('friend_notifications')
      .select('*')
      .eq('user_id', uid)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(20)

    if (!data) return

    const enriched = await Promise.all(data.map(async (n) => {
      const { data: profile } = await supabase
        .from('game_profiles')
        .select('nickname, email')
        .eq('user_id', n.from_user_id)
        .single()

      let friendship_id: string | null = null
      let room_id: string | null = null
      let invitation_id: string | null = null

      if (n.type === 'friend_request') {
        const { data: friendship } = await supabase
          .from('friendships')
          .select('id')
          .eq('requester_id', n.from_user_id)
          .eq('receiver_id', uid)
          .eq('status', 'pending')
          .maybeSingle()
        friendship_id = friendship?.id ?? null
      }

      if (n.type === 'game_invite') {
        const { data: inv } = await supabase
          .from('game_invitations')
          .select('id, room_id, status')
          .eq('sender_id', n.from_user_id)
          .eq('receiver_id', uid)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (inv) {
          room_id = inv.room_id
          invitation_id = inv.id
        }
      }

      return {
        ...n,
        from_nickname: profile?.nickname ?? '',
        from_email: profile?.email ?? '',
        friendship_id,
        room_id,
        invitation_id,
      } as Notif
    }))

    // Filter out game invites where room/invitation was not found (already accepted/declined)
    setNotifs(enriched.filter(n => n.type !== 'game_invite' || n.room_id !== null))
  }, [supabase])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)
    }
    init()
  }, [])

  useEffect(() => {
    if (!userId) return
    loadNotifs(userId)

    const channel = supabase
      .channel('notif-bell')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'friend_notifications',
        filter: `user_id=eq.${userId}`,
      }, () => loadNotifs(userId))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, loadNotifs])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function handleAcceptFriend(n: Notif) {
    if (!userId || !n.friendship_id) return
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', n.friendship_id)
    await supabase.from('friend_notifications').update({ is_read: true }).eq('id', n.id)
    await loadNotifs(userId)
  }

  async function handleDeclineFriend(n: Notif) {
    if (!userId) return
    if (n.friendship_id) {
      await supabase.from('friendships').delete().eq('id', n.friendship_id)
    }
    await supabase.from('friend_notifications').update({ is_read: true }).eq('id', n.id)
    await loadNotifs(userId)
  }

  async function handleAcceptGameInvite(n: Notif) {
    if (!userId || !n.room_id || !n.invitation_id) return

    const { data: profile } = await supabase
      .from('game_profiles').select('nickname').eq('user_id', userId).single()
    const nickname = profile?.nickname || 'Player'

    // Read room to find reserved seat from settings.pendingInvites and check for existing row
    const { data: room } = await supabase
      .from('game_rooms').select('max_players, settings').eq('id', n.room_id).single()
    if (!room) return

    const pendingInvites: any[] = room.settings?.pendingInvites ?? []
    const myInvite = pendingInvites.find((p: any) => p.userId === userId)

    // Check if already in room_players
    const { data: existingRow } = await supabase
      .from('room_players').select('id').eq('room_id', n.room_id).eq('user_id', userId).maybeSingle()

    if (!existingRow) {
      // Determine the seat: use the host-reserved seat if available, else first empty
      let seatIndex = myInvite?.seatIndex ?? -1
      if (seatIndex === -1) {
        const { data: taken } = await supabase
          .from('room_players').select('seat_index').eq('room_id', n.room_id)
        const takenSet = new Set((taken ?? []).map((p: any) => p.seat_index))
        for (let i = 1; i < room.max_players; i++) {
          if (!takenSet.has(i)) { seatIndex = i; break }
        }
      }
      if (seatIndex === -1) return

      // User inserts their own row — auth.uid() = user_id, so RLS allows this
      const { error: insertErr } = await supabase.from('room_players').insert({
        room_id: n.room_id, user_id: userId, nickname,
        seat_index: seatIndex, is_bot: false, is_ready: true, is_connected: true,
      })
      if (insertErr) console.error('[acceptGameInvite] room_players insert failed:', insertErr)
    }

    // Clear this user's pending invite from game_rooms.settings
    if (myInvite && room.settings) {
      const newPending = pendingInvites.filter((p: any) => p.userId !== userId)
      await supabase.from('game_rooms')
        .update({ settings: { ...room.settings, pendingInvites: newPending } })
        .eq('id', n.room_id)
    }

    await supabase.from('game_invitations').update({ status: 'accepted' }).eq('id', n.invitation_id)
    await supabase.from('friend_notifications').update({ is_read: true }).eq('id', n.id)
    setOpen(false)
    router.push(`/game/online/${n.room_id}`)
  }

  async function handleDeclineGameInvite(n: Notif) {
    if (!userId) return
    if (n.invitation_id) {
      await supabase.from('game_invitations').update({ status: 'declined' }).eq('id', n.invitation_id)
    }
    await supabase.from('friend_notifications').update({ is_read: true }).eq('id', n.id)
    await loadNotifs(userId)
  }

  const displayFrom = (n: Notif) => n.from_nickname || n.from_email || '?'

  // Check if game invite is expired (5 minutes)
  const isExpired = (n: Notif) => {
    if (n.type !== 'game_invite') return false
    const age = (Date.now() - new Date(n.created_at).getTime()) / 1000
    return age > 300
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        onClick={() => {
          if (!open && buttonRef.current) {
            const r = buttonRef.current.getBoundingClientRect()
            setDropdownPos({ top: r.bottom + 6, left: r.left })
          }
          setOpen(v => !v)
        }}
        title={tf.notifTitle}
        style={{
          position: 'relative',
          background: 'none',
          border: '2px solid var(--border)',
          color: unread > 0 ? 'var(--c-dash)' : 'var(--muted)',
          fontSize: 18,
          width: 40,
          height: 40,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.15s, border-color 0.15s',
          borderColor: unread > 0 ? 'var(--c-dash)' : undefined,
        }}
      >
        🔔
        {unread > 0 && (
          <span style={{
            position: 'absolute',
            top: -6,
            right: -6,
            background: '#ef4444',
            color: '#fff',
            borderRadius: 8,
            fontSize: 9,
            fontFamily: "'Inter', sans-serif",
            minWidth: 18,
            height: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px',
            lineHeight: 1,
            boxShadow: '0 0 6px rgba(239,68,68,0.6)',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          top: dropdownPos.top,
          left: Math.min(dropdownPos.left, window.innerWidth - 320),
          width: 300,
          background: 'var(--bg2)',
          border: '2px solid var(--border)',
          boxShadow: '4px 4px 0 rgba(0,0,0,0.5)',
          zIndex: 1000,
          padding: 14,
        }}>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 8, color: 'var(--muted)', marginBottom: 12, letterSpacing: '0.06em' }}>
            {tf.notifTitle}
          </div>

          {notifs.length === 0 ? (
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, color: 'var(--muted)', textAlign: 'center', padding: '10px 0' }}>
              {tf.noNotifs}
            </div>
          ) : (
            notifs.map(n => (
              <div key={n.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                {n.type === 'game_invite' ? (
                  <>
                    <div style={{
                      fontFamily: "'Inter', sans-serif", fontSize: 18, color: 'var(--text)', marginBottom: 8, lineHeight: 1.3,
                      background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.2)', padding: '6px 8px',
                    }}>
                      🎮 <span style={{ color: 'var(--c-dash)' }}>{displayFrom(n)}</span>{' '}
                      {to.gameInvite}
                    </div>
                    {isExpired(n) ? (
                      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, color: 'var(--muted)' }}>
                        ⏱ {to.inviteExpired}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="pixel-btn pixel-btn-success" onClick={() => handleAcceptGameInvite(n)} style={{ fontSize: 8, padding: '6px 10px' }}>
                          {tf.accept}
                        </button>
                        <button className="pixel-btn pixel-btn-danger" onClick={() => handleDeclineGameInvite(n)} style={{ fontSize: 8, padding: '6px 10px' }}>
                          {tf.decline}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, color: 'var(--text)', marginBottom: 8, lineHeight: 1.3 }}>
                      <span style={{ color: 'var(--c-dash)' }}>{displayFrom(n)}</span>{' '}
                      {tf.friendRequest}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="pixel-btn pixel-btn-success" onClick={() => handleAcceptFriend(n)} style={{ fontSize: 8, padding: '6px 10px' }}>
                        {tf.accept}
                      </button>
                      <button className="pixel-btn pixel-btn-danger" onClick={() => handleDeclineFriend(n)} style={{ fontSize: 8, padding: '6px 10px' }}>
                        {tf.decline}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
