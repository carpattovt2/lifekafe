import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LanguageProvider } from '@/lib/LanguageContext'
import Sidebar from '@/components/Sidebar'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <LanguageProvider>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar email={user.email ?? ''} />
        <main style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
          {children}
        </main>
      </div>
    </LanguageProvider>
  )
}
