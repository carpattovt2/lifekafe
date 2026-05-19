'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import JokerGame from './JokerGame'
import FriendsPanel from './FriendsPanel'
import OnlineSetup from './OnlineSetup'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/LanguageContext'

type View = 'menu' | 'solo' | 'friends' | 'online'

export default function GameMenu() {
  const [view, setView] = useState<View>('menu')
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const { t } = useLanguage()
  const tg = t.game
  const tf = t.friends
  const to = t.online
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function checkActiveGame() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: rows } = await supabase
        .from('room_players')
        .select('room_id')
        .eq('user_id', user.id)
        .limit(10)
      if (!rows?.length) return
      const roomIds = rows.map(r => r.room_id)
      const { data: rooms } = await supabase
        .from('game_rooms')
        .select('id')
        .in('id', roomIds)
        .eq('status', 'in_progress')
        .limit(1)
      if (rooms?.length) setActiveRoomId(rooms[0].id)
    }
    checkActiveGame()
  }, [])

  if (view === 'solo') return <JokerGame onBack={() => setView('menu')} />
  if (view === 'friends') return <FriendsPanel onBack={() => setView('menu')} />
  if (view === 'online') return <OnlineSetup onBack={() => setView('menu')} />

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '40px 16px', textAlign: 'center' }}>
      <h1 style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 15, color: 'var(--c-journal)', marginBottom: 32 }}>
        {tg.title}
      </h1>

      {activeRoomId && (
        <button
          className="pixel-btn pixel-btn-success"
          onClick={() => router.push(`/game/online/${activeRoomId}`)}
          style={{ width: '100%', justifyContent: 'center', fontSize: 11, padding: '14px 0', letterSpacing: 1, marginBottom: 20, borderColor: '#ffd700', color: '#ffd700', boxShadow: '0 0 12px rgba(255,215,0,0.3)' }}
        >
          ⚡ {to.returnToGame}
        </button>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          className="pixel-btn pixel-btn-success"
          onClick={() => setView('solo')}
          style={{ width: '100%', justifyContent: 'center', fontSize: 13, padding: '18px 0', letterSpacing: 1 }}
        >
          ♦ {tg.soloGame}
        </button>
        <button
          className="pixel-btn"
          onClick={() => setView('online')}
          style={{ width: '100%', justifyContent: 'center', fontSize: 13, padding: '18px 0', letterSpacing: 1, borderColor: 'var(--c-dash)', color: 'var(--c-dash)' }}
        >
          🌐 {tg.onlineGame}
        </button>
        <button
          className="pixel-btn"
          onClick={() => setView('friends')}
          style={{ width: '100%', justifyContent: 'center', fontSize: 13, padding: '18px 0', letterSpacing: 1 }}
        >
          👥 {tf.title}
        </button>
      </div>
    </div>
  )
}
