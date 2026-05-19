'use client'

import { useState } from 'react'
import JokerGame from './JokerGame'
import FriendsPanel from './FriendsPanel'
import { useLanguage } from '@/lib/LanguageContext'

type View = 'menu' | 'solo' | 'friends'

export default function GameMenu() {
  const [view, setView] = useState<View>('menu')
  const { t } = useLanguage()
  const tg = t.game
  const tf = t.friends

  if (view === 'solo') return <JokerGame onBack={() => setView('menu')} />
  if (view === 'friends') return <FriendsPanel onBack={() => setView('menu')} />

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '40px 16px', textAlign: 'center' }}>
      <h1 style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 15, color: 'var(--c-journal)', marginBottom: 32 }}>
        {tg.title}
      </h1>
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
          disabled
          style={{ width: '100%', justifyContent: 'center', fontSize: 13, padding: '18px 0', letterSpacing: 1, opacity: 0.4, cursor: 'not-allowed' }}
        >
          🌐 {tg.onlineGame}
        </button>
        <button
          className="pixel-btn"
          onClick={() => setView('friends')}
          style={{ width: '100%', justifyContent: 'center', fontSize: 13, padding: '18px 0', letterSpacing: 1, borderColor: 'var(--c-dash)', color: 'var(--c-dash)' }}
        >
          👥 {tf.title}
        </button>
      </div>
    </div>
  )
}
