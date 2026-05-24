'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'

async function getActiveGroup(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase
    .from('shopping_group_members')
    .select('group_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
  return data?.[0] ?? null
}

export async function sendInvite(inviteeEmail: string): Promise<{ error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const email = inviteeEmail.trim().toLowerCase()
  if (email === user.email?.toLowerCase()) return { error: 'Не можна запросити себе' }

  const membership = await getActiveGroup(supabase, user.id)
  if (!membership) return { error: 'Групу не знайдено' }

  const { error } = await supabase
    .from('shopping_group_members')
    .insert({ group_id: membership.group_id, email, invited_by_email: user.email, status: 'pending' })

  if (error) {
    if (error.code === '23505') return { error: 'Запит вже надіслано або людина вже в групі' }
    return { error: error.message }
  }
  return {}
}

export async function acceptInvite(inviteGroupId: string): Promise<{ error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const current = await getActiveGroup(supabase, user.id)

  if (current) {
    // Move unchecked items to the new group
    await supabase
      .from('shopping_list')
      .update({ group_id: inviteGroupId })
      .eq('group_id', current.group_id)
      .eq('checked', false)

    // Leave all current active memberships
    await supabase
      .from('shopping_group_members')
      .delete()
      .eq('user_id', user.id)
      .eq('status', 'active')

    // Delete old group if now empty
    const { count } = await supabase
      .from('shopping_group_members')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', current.group_id)
    if (count === 0) {
      await supabase.from('shopping_groups').delete().eq('id', current.group_id)
    }
  }

  // Accept invite
  const { error } = await supabase
    .from('shopping_group_members')
    .update({ user_id: user.id, status: 'active' })
    .eq('group_id', inviteGroupId)
    .eq('email', user.email!.toLowerCase())
    .eq('status', 'pending')

  if (error) return { error: error.message }
  revalidatePath('/shopping')
  return {}
}

export async function declineInvite(inviteGroupId: string): Promise<{ error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  await supabase
    .from('shopping_group_members')
    .delete()
    .eq('group_id', inviteGroupId)
    .eq('email', user.email!.toLowerCase())
    .eq('status', 'pending')

  revalidatePath('/shopping')
  return {}
}

export async function unlinkFromGroup(): Promise<{ error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const current = await getActiveGroup(supabase, user.id)
  if (!current) return { error: 'Групу не знайдено' }

  const newGroupId = randomUUID()

  await supabase.from('shopping_groups').insert({ id: newGroupId, created_by: user.id })
  await supabase.from('shopping_group_members').insert({
    group_id: newGroupId, user_id: user.id,
    email: user.email!.toLowerCase(), status: 'active',
  })

  // Remove all old active memberships
  await supabase
    .from('shopping_group_members')
    .delete()
    .eq('user_id', user.id)
    .eq('status', 'active')
    .neq('group_id', newGroupId)

  revalidatePath('/shopping')
  return {}
}
