'use client'

import { useLanguage } from '@/lib/LanguageContext'
import type { Lang } from '@/lib/i18n'

export default function LanguageToggle() {
  const { lang, setLang } = useLanguage()

  return (
    <div className="lang-toggle-desktop" style={{
      position: 'fixed',
      top: '16px',
      right: '20px',
      zIndex: 100,
      display: 'flex',
      border: '2px solid var(--border)',
      background: 'var(--bg2)',
      boxShadow: '3px 3px 0 rgba(0,0,0,0.5)',
      overflow: 'hidden',
    }}>
      {(['en', 'ua'] as Lang[]).map((l, i) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '10px',
            padding: '8px 14px',
            border: 'none',
            borderLeft: i > 0 ? '2px solid var(--border)' : 'none',
            cursor: 'pointer',
            background: lang === l ? 'var(--c-dash)' : 'transparent',
            color: lang === l ? '#0a0a16' : 'var(--muted)',
            fontWeight: lang === l ? 'bold' : 'normal',
            transition: 'background 0.15s, color 0.15s',
            letterSpacing: '0.05em',
          }}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
