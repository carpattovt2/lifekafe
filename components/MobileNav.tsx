'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/LanguageContext'
import type { Lang } from '@/lib/i18n'

export default function MobileNav({ email }: { email: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { t, lang, setLang } = useLanguage()

  const NAV = [
    { href: '/dashboard', label: t.nav.dashboard, icon: '⌂' },
    { href: '/weight',    label: t.nav.weight,    icon: '⚖' },
    { href: '/planner',   label: t.nav.planner,   icon: '◫' },
    { href: '/journal',   label: t.nav.journal,   icon: '📓' },
    { href: '/game',      label: t.nav.game,       icon: '♦' },
  ]

  function close() { setIsOpen(false) }

  async function logout() {
    await supabase.auth.signOut()
    close()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* Hamburger button — CSS hides it on desktop */}
      <button className="hamburger-btn" onClick={() => setIsOpen(true)} aria-label="Open menu">
        ☰
      </button>

      {/* Dark overlay */}
      {isOpen && <div className="mobile-overlay" onClick={close} />}

      {/* Slide-in menu — always in DOM so CSS transition works */}
      <div className={`mobile-menu${isOpen ? ' open' : ''}`} role="dialog" aria-modal="true">

        {/* Header row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 16px 14px',
          borderBottom: '2px solid var(--border)',
        }}>
          <div style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '13px',
            color: 'var(--c-dash)',
            textShadow: '0 0 10px rgba(34,211,238,0.4)',
          }}>
            lifekafe
          </div>
          <button
            onClick={close}
            aria-label="Close menu"
            style={{
              background: 'none',
              border: '2px solid var(--border)',
              color: 'var(--muted)',
              fontSize: '18px',
              width: 36,
              height: 36,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Nav links */}
        <nav style={{ padding: '12px 8px', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {NAV.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              onClick={close}
              className={`nav-link ${pathname === href ? 'active' : ''}`}
            >
              <span style={{ fontSize: '18px' }}>{icon}</span>
              {label}
            </Link>
          ))}
        </nav>

        {/* Language toggle */}
        <div style={{ padding: '12px 16px', borderTop: '2px solid var(--border)' }}>
          <div style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '8px',
            color: 'var(--muted)',
            marginBottom: '8px',
            letterSpacing: '0.1em',
          }}>
            LANGUAGE
          </div>
          <div style={{ display: 'flex' }}>
            {(['en', 'ua'] as Lang[]).map((l, i) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                style={{
                  flex: 1,
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '10px',
                  padding: '9px 0',
                  border: '2px solid',
                  borderColor: lang === l ? 'var(--c-dash)' : 'var(--border)',
                  borderLeft: i > 0 ? 'none' : undefined,
                  background: lang === l ? 'rgba(34,211,238,0.15)' : 'var(--bg3)',
                  color: lang === l ? 'var(--c-dash)' : 'var(--muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* User + logout */}
        <div style={{ padding: '12px 16px', borderTop: '2px solid var(--border)' }}>
          <div style={{
            fontSize: '15px',
            color: 'var(--muted)',
            marginBottom: '10px',
            wordBreak: 'break-all',
            fontFamily: "'VT323', monospace",
          }}>
            {email}
          </div>
          <button
            onClick={logout}
            className="pixel-btn pixel-btn-danger"
            style={{ width: '100%', justifyContent: 'center', fontSize: '10px' }}
          >
            {t.nav.logout}
          </button>
        </div>
      </div>
    </>
  )
}
