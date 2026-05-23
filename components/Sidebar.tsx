'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/LanguageContext'

export default function Sidebar({ email }: { email: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { t } = useLanguage()

  const NAV = [
    { href: '/dashboard', label: t.nav.dashboard, icon: '⌂' },
    { href: '/weight',    label: t.nav.weight,    icon: '⚖' },
    { href: '/planner',   label: t.nav.planner,   icon: '◫' },
    { href: '/journal',   label: t.nav.journal,   icon: '📓' },
    { href: '/games',     label: t.nav.games,      icon: '🎮' },
  ]

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside style={{
      width: 220,
      minHeight: '100vh',
      background: 'var(--bg2)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{
        padding: '22px 20px 18px',
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
        <div style={{
          fontSize: '12px',
          color: 'var(--muted)',
          marginTop: '3px',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
        }}>
          <span style={{ color: 'var(--green)', fontSize: '8px' }}>●</span>
          {t.common.online}
        </div>
      </div>

      {/* Nav */}
      <nav style={{
        padding: '10px 10px',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      }}>
        {NAV.map(({ href, label, icon }) => (
          <Link key={href} href={href} className={`nav-link ${pathname === href || (href === '/games' && (pathname.startsWith('/game') || pathname.startsWith('/sacred'))) ? 'active' : ''}`}>
            <span style={{ fontSize: '15px', flexShrink: 0 }}>{icon}</span>
            {label}
          </Link>
        ))}
      </nav>

      {/* User + Logout */}
      <div style={{
        padding: '14px 16px',
        borderTop: '1px solid var(--border)',
      }}>
        <div style={{
          fontSize: '12px',
          color: 'var(--muted)',
          marginBottom: '10px',
          wordBreak: 'break-all',
          lineHeight: 1.4,
        }}>
          {email}
        </div>
        <button
          onClick={logout}
          className="pixel-btn pixel-btn-danger"
          style={{ width: '100%', justifyContent: 'center', fontSize: '13px', padding: '8px 12px' }}
        >
          {t.nav.logout}
        </button>
      </div>
    </aside>
  )
}
