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
      {/* Bell button */}
      <button
        ref={buttonRef}
        onClick={() => {
          if (!open && buttonRef.current) {
            const r = buttonRef.current.getBoundingClientRect()
            setDropdownPos({ top: r.bottom + 8, left: r.left })
          }
          setOpen(v => !v)
        }}
        title={tf.notifTitle}
        style={{
          position: 'relative',
          background: open ? 'var(--bg3)' : 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          color: unread > 0 ? 'var(--text)' : 'var(--muted)',
          width: 36,
          height: 36,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.15s, color 0.15s',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {/* SVG bell icon */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>

        {/* Unread badge — small dot with number */}
        {unread > 0 && (
          <span style={{
            position: 'absolute',
            top: -4,
            right: -4,
            background: 'var(--red)',
            color: '#fff',
            borderRadius: '10px',
            fontSize: '10px',
            fontWeight: 600,
            minWidth: 16,
            height: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px',
            lineHeight: 1,
            border: '2px solid var(--bg)',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'fixed',
          top: dropdownPos.top,
          left: Math.min(dropdownPos.left, window.innerWidth - 320),
          width: 320,
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          boxShadow: 'var(--shadow-md)',
          zIndex: 1000,
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px 12px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
              {tf.notifTitle}
            </span>
            {unread > 0 && (
              <span style={{
                fontSize: '11px',
                color: 'var(--red)',
                fontWeight: 600,
                background: 'color-mix(in srgb, var(--red) 12%, transparent)',
                padding: '2px 8px',
                borderRadius: '20px',
              }}>
                {unread} new
              </span>
            )}
          </div>

          {/* Notifications list */}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {notifs.length === 0 ? (
              <div style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: 'var(--muted)',
                fontSize: '13px',
              }}>
                {tf.noNotifs}
              </div>
            ) : (
              notifs.map((n, idx) => (
                <div key={n.id} style={{
                  padding: '14px 16px',
                  borderBottom: idx < notifs.length - 1 ? '1px solid var(--border)' : 'none',
                  background: 'var(--bg2)',
                }}>
                  {n.type === 'game_invite' ? (
                    <div>
                      {/* Game invite item */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
                        <div style={{
                          width: 34,
                          height: 34,
                          borderRadius: '8px',
                          background: 'color-mix(in srgb, var(--c-dash) 15%, transparent)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '16px',
                          flexShrink: 0,
                        }}>
                          ♦
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', lineHeight: 1.4 }}>
                            <span style={{ color: 'var(--accent)' }}>{displayFrom(n)}</span>
                            {' '}{to.gameInvite}
                          </div>
                          {isExpired(n) && (
                            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                              {to.inviteExpired}
                            </div>
                          )}
                        </div>
                      </div>
                      {!isExpired(n) && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="pixel-btn pixel-btn-success"
                            onClick={() => handleAcceptGameInvite(n)}
                            style={{ flex: 1, justifyContent: 'center', fontSize: '12px', padding: '7px 12px' }}
                          >
                            {tf.accept}
                          </button>
                          <button
                            className="pixel-btn pixel-btn-secondary"
                            onClick={() => handleDeclineGameInvite(n)}
                            style={{ flex: 1, justifyContent: 'center', fontSize: '12px', padding: '7px 12px' }}
                          >
                            {tf.decline}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      {/* Friend request item */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
                        <div style={{
                          width: 34,
                          height: 34,
                          borderRadius: '50%',
                          background: 'color-mix(in srgb, var(--c-planner) 15%, transparent)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '15px',
                          flexShrink: 0,
                        }}>
                          👤
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', lineHeight: 1.4 }}>
                          <span style={{ color: 'var(--accent)' }}>{displayFrom(n)}</span>
                          {' '}{tf.friendRequest}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="pixel-btn pixel-btn-success"
                          onClick={() => handleAcceptFriend(n)}
                          style={{ flex: 1, justifyContent: 'center', fontSize: '12px', padding: '7px 12px' }}
                        >
                          {tf.accept}
                        </button>
                        <button
                          className="pixel-btn pixel-btn-secondary"
                          onClick={() => handleDeclineFriend(n)}
                          style={{ flex: 1, justifyContent: 'center', fontSize: '12px', padding: '7px 12px' }}
                        >
                          {tf.decline}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
