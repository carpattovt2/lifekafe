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
      borderRight: '2px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 16px 16px', borderBottom: '2px solid var(--border)' }}>
        <div style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: '13px',
          color: 'var(--c-dash)',
          textShadow: '0 0 12px rgba(34,211,238,0.4)',
          letterSpacing: '1px',
        }}>
          lifekafe
        </div>
        <div style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>
          <span className="blink" style={{ color: 'var(--green)' }}>●</span> {t.common.online}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '12px 8px', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {NAV.map(({ href, label, icon }) => (
          <Link key={href} href={href} className={`nav-link ${pathname === href ? 'active' : ''}`}>
            <span style={{ fontSize: '16px' }}>{icon}</span>
            {label}
          </Link>
        ))}
      </nav>

      {/* User + Logout */}
      <div style={{ padding: '12px 16px', borderTop: '2px solid var(--border)' }}>
        <div style={{
          fontSize: '13px',
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
          style={{ width: '100%', justifyContent: 'center', fontSize: '9px', padding: '8px 12px' }}
        >
          {t.nav.logout}
        </button>
      </div>
    </aside>
  )
}
