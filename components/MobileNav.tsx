'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/LanguageContext'
import ThemeToggle from './ThemeToggle'
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
    { href: '/events',    label: t.nav.events,    icon: '★' },
    { href: '/journal',   label: t.nav.journal,   icon: '📓' },
    { href: '/shopping',  label: t.nav.shopping,   icon: '🛒' },
    { href: '/games',     label: t.nav.games,      icon: '🎮' },
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
      <button className="hamburger-btn" onClick={() => setIsOpen(true)} aria-label="Open menu">
        ☰
      </button>

      {isOpen && <div className="mobile-overlay" onClick={close} />}

      <div className={`mobile-menu${isOpen ? ' open' : ''}`} role="dialog" aria-modal="true">

        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 16px 14px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{
            fontSize: '17px',
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '-0.02em',
          }}>
            lifekafe
          </div>
          <button
            onClick={close}
            aria-label="Close menu"
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--muted)',
              fontSize: '16px',
              width: 34,
              height: 34,
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
        <nav style={{ padding: '10px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {NAV.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              onClick={close}
              className={`nav-link ${pathname === href || (href === '/games' && (pathname.startsWith('/game') || pathname.startsWith('/sacred'))) ? 'active' : ''}`}
            >
              <span style={{ fontSize: '16px', flexShrink: 0 }}>{icon}</span>
              {label}
            </Link>
          ))}
        </nav>

        {/* Language + Theme */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--muted)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            Language & Theme
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{
              display: 'flex',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              overflow: 'hidden',
              flex: 1,
            }}>
              {(['en', 'ua'] as Lang[]).map((l, i) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  style={{
                    flex: 1,
                    fontSize: '12px',
                    fontWeight: 500,
                    padding: '8px 0',
                    border: 'none',
                    borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
                    background: lang === l ? 'var(--accent)' : 'transparent',
                    color: lang === l ? '#fff' : 'var(--muted)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* User + logout */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{
            fontSize: '12px',
            color: 'var(--muted)',
            marginBottom: '10px',
            wordBreak: 'break-all',
          }}>
            {email}
          </div>
          <button
            onClick={logout}
            className="pixel-btn pixel-btn-danger"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {t.nav.logout}
          </button>
        </div>
      </div>
    </>
  )
}
