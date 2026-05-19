import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LanguageProvider } from '@/lib/LanguageContext'
import Sidebar from '@/components/Sidebar'
import LanguageToggle from '@/components/LanguageToggle'
import MobileNav from '@/components/MobileNav'
import NotificationBell from '@/components/NotificationBell'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <LanguageProvider>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        {/* Desktop sidebar — hidden on mobile via CSS class */}
        <div className="sidebar-desktop">
          <Sidebar email={user.email ?? ''} />
        </div>

        {/* Mobile hamburger + slide-in menu — hidden on desktop via CSS */}
        <MobileNav email={user.email ?? ''} />

        {/* Desktop language toggle — hidden on mobile via CSS class */}
        <LanguageToggle />

        {/* Single NotificationBell instance — positioned via CSS for desktop/mobile */}
        <div className="notif-bell-layout">
          <NotificationBell />
        </div>

        <main className="main-content" style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
          {children}
        </main>
      </div>
    </LanguageProvider>
  )
}
