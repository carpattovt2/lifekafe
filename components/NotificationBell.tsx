'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
}

export default function NotificationBell() {
  const supabase = createClient()
  const { t } = useLanguage()
  const tf = t.friends
  if (!tf) return null

  const [userId, setUserId] = useState<string | null>(null)
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

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

      const { data: friendship } = await supabase
        .from('friendships')
        .select('id')
        .eq('requester_id', n.from_user_id)
        .eq('receiver_id', uid)
        .eq('status', 'pending')
        .maybeSingle()

      return {
        ...n,
        from_nickname: profile?.nickname ?? '',
        from_email: profile?.email ?? '',
        friendship_id: friendship?.id ?? null,
      } as Notif
    }))

    setNotifs(enriched)
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

  async function handleAccept(n: Notif) {
    if (!userId || !n.friendship_id) return
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', n.friendship_id)
    await supabase.from('friend_notifications').update({ is_read: true }).eq('id', n.id)
    await loadNotifs(userId)
  }

  async function handleDecline(n: Notif) {
    if (!userId) return
    if (n.friendship_id) {
      await supabase.from('friendships').delete().eq('id', n.friendship_id)
    }
    await supabase.from('friend_notifications').update({ is_read: true }).eq('id', n.id)
    await loadNotifs(userId)
  }

  const displayFrom = (n: Notif) => n.from_nickname || n.from_email || '?'

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
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
            fontFamily: "'Press Start 2P', monospace",
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
          position: 'absolute',
          top: 46,
          left: 0,
          minWidth: 280,
          maxWidth: 320,
          background: 'var(--bg2)',
          border: '2px solid var(--border)',
          boxShadow: '4px 4px 0 rgba(0,0,0,0.5)',
          zIndex: 500,
          padding: 14,
        }}>
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: 'var(--muted)', marginBottom: 12, letterSpacing: '0.06em' }}>
            {tf.notifTitle}
          </div>

          {notifs.length === 0 ? (
            <div style={{ fontFamily: "'VT323', monospace", fontSize: 18, color: 'var(--muted)', textAlign: 'center', padding: '10px 0' }}>
              {tf.noNotifs}
            </div>
          ) : (
            notifs.map(n => (
              <div key={n.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontFamily: "'VT323', monospace", fontSize: 18, color: 'var(--text)', marginBottom: 8, lineHeight: 1.3 }}>
                  <span style={{ color: 'var(--c-dash)' }}>{displayFrom(n)}</span>{' '}
                  {tf.friendRequest}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="pixel-btn pixel-btn-success" onClick={() => handleAccept(n)} style={{ fontSize: 8, padding: '6px 10px' }}>
                    {tf.accept}
                  </button>
                  <button className="pixel-btn pixel-btn-danger" onClick={() => handleDecline(n)} style={{ fontSize: 8, padding: '6px 10px' }}>
                    {tf.decline}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
