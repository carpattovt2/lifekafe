'use client'

import { useLanguage } from '@/lib/LanguageContext'
import type { Lang } from '@/lib/i18n'
import ThemeToggle from './ThemeToggle'

export default function LanguageToggle() {
  const { lang, setLang } = useLanguage()

  return (
    <div className="lang-toggle-desktop" style={{
      position: 'fixed',
      top: '16px',
      right: '20px',
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    }}>
      <ThemeToggle />
      <div style={{
        display: 'flex',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        background: 'var(--bg2)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
      }}>
        {(['en', 'ua'] as Lang[]).map((l, i) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '12px',
              fontWeight: 500,
              padding: '7px 14px',
              border: 'none',
              borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
              cursor: 'pointer',
              background: lang === l ? 'var(--accent)' : 'transparent',
              color: lang === l ? '#fff' : 'var(--muted)',
              transition: 'background 0.15s, color 0.15s',
              letterSpacing: '0.03em',
            }}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  )
}
