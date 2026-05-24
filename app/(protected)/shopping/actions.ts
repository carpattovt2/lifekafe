'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function sendInvite(inviteeEmail: string): Promise<{ error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const email = inviteeEmail.trim().toLowerCase()
  if (email === user.email?.toLowerCase()) return { error: 'Не можна запросити себе' }

  const { data: membership } = await supabase
    .from('shopping_group_members')
    .select('group_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
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

  // Get user's current group
  const { data: current } = await supabase
    .from('shopping_group_members')
    .select('group_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (current) {
    // Move unchecked items to the new group
    await supabase
      .from('shopping_list')
      .update({ group_id: inviteGroupId })
      .eq('group_id', current.group_id)
      .eq('checked', false)

    // Leave old group
    await supabase
      .from('shopping_group_members')
      .delete()
      .eq('group_id', current.group_id)
      .eq('user_id', user.id)

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

  const { data: current } = await supabase
    .from('shopping_group_members')
    .select('group_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
  if (!current) return { error: 'Групу не знайдено' }

  // Create a new personal group
  const { data: newGroup } = await supabase
    .from('shopping_groups')
    .insert({ created_by: user.id })
    .select('id')
    .single()
  if (!newGroup) return { error: 'Помилка створення групи' }

  await supabase.from('shopping_group_members').insert({
    group_id: newGroup.id, user_id: user.id,
    email: user.email!.toLowerCase(), status: 'active',
  })

  // Remove from old group
  await supabase
    .from('shopping_group_members')
    .delete()
    .eq('group_id', current.group_id)
    .eq('user_id', user.id)

  revalidatePath('/shopping')
  return {}
}
