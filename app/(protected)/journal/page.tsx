import { createClient } from '@/lib/supabase/server'
import JournalClient from '@/components/JournalClient'

export default async function JournalPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: entries } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('user_id', user!.id)
    .order('date', { ascending: false })

  return (
    <div style={{ padding: '28px', maxWidth: 800 }}>
      <JournalClient initialEntries={entries ?? []} userId={user!.id} />
    </div>
  )
}
