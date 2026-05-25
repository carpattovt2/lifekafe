'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'

async function getAuthUser() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function createList(name: string): Promise<{ id?: string; error?: string }> {
  const user = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  const id = randomUUID()

  const { error: listErr } = await admin
    .from('shopping_lists')
    .insert({ id, name: name.trim() || 'Список покупок', created_by: user.id })
  if (listErr) return { error: listErr.message }

  const { error: memberErr } = await admin
    .from('shopping_list_members')
    .insert({ list_id: id, user_id: user.id, email: user.email!.toLowerCase(), status: 'active' })
  if (memberErr) return { error: memberErr.message }

  revalidatePath('/shopping')
  return { id }
}

export async function renameList(listId: string, name: string): Promise<{ error?: string }> {
  const user = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('shopping_list_members')
    .select('id')
    .eq('list_id', listId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
  if (!membership) return { error: 'Немає доступу' }

  const { error } = await admin
    .from('shopping_lists')
    .update({ name: name.trim() || 'Список покупок' })
    .eq('id', listId)
  if (error) return { error: error.message }

  revalidatePath('/shopping')
  return {}
}

export async function sendInvite(listId: string, inviteeEmail: string): Promise<{ error?: string }> {
  const user = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const email = inviteeEmail.trim().toLowerCase()
  if (email === user.email?.toLowerCase()) return { error: 'Не можна запросити себе' }

  const admin = createAdminClient()

  // Verify user is active member of this list
  const { data: membership } = await admin
    .from('shopping_list_members')
    .select('id')
    .eq('list_id', listId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
  if (!membership) return { error: 'Немає доступу до цього списку' }

  const { error } = await admin
    .from('shopping_list_members')
    .insert({ list_id: listId, email, invited_by_email: user.email, status: 'pending' })

  if (error) {
    if (error.code === '23505') return { error: 'Запрошення вже надіслано або людина вже в списку' }
    return { error: error.message }
  }
  return {}
}

export async function acceptInvite(listId: string): Promise<{ error?: string }> {
  const user = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('shopping_list_members')
    .update({ user_id: user.id, status: 'active' })
    .eq('list_id', listId)
    .eq('email', user.email!.toLowerCase())
    .eq('status', 'pending')

  if (error) return { error: error.message }
  revalidatePath('/shopping')
  return {}
}

export async function declineInvite(listId: string): Promise<{ error?: string }> {
  const user = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  await admin
    .from('shopping_list_members')
    .delete()
    .eq('list_id', listId)
    .eq('email', user.email!.toLowerCase())
    .eq('status', 'pending')

  revalidatePath('/shopping')
  return {}
}

export async function deleteList(listId: string): Promise<{ error?: string }> {
  const user = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()

  const { data: membership } = await admin
    .from('shopping_list_members')
    .select('id')
    .eq('list_id', listId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
  if (!membership) return { error: 'Немає доступу до цього списку' }

  await admin.from('shopping_lists').delete().eq('id', listId)

  revalidatePath('/shopping')
  return {}
}

export async function leaveList(listId: string): Promise<{ error?: string }> {
  const user = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()

  // Remove user's membership
  await admin
    .from('shopping_list_members')
    .delete()
    .eq('list_id', listId)
    .eq('user_id', user.id)

  // If list is now empty, delete it
  const { count } = await admin
    .from('shopping_list_members')
    .select('id', { count: 'exact', head: true })
    .eq('list_id', listId)
  if (count === 0) {
    await admin.from('shopping_lists').delete().eq('id', listId)
  }

  revalidatePath('/shopping')
  return {}
}

export async function reorderLists(orderedIds: string[]): Promise<{ error?: string }> {
  const user = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  await Promise.all(
    orderedIds.map((listId, idx) =>
      admin.from('shopping_list_members')
        .update({ sort_order: idx })
        .eq('list_id', listId)
        .eq('user_id', user.id)
    )
  )
  return {}
}

export async function archiveList(listId: string): Promise<{ error?: string }> {
  const user = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('shopping_list_members')
    .select('id')
    .eq('list_id', listId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
  if (!membership) return { error: 'Немає доступу' }

  const { error } = await admin.from('shopping_lists').update({ archived: true }).eq('id', listId)
  if (error) return { error: error.message }

  revalidatePath('/shopping')
  return {}
}

export async function restoreList(listId: string): Promise<{ error?: string }> {
  const user = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('shopping_list_members')
    .select('id')
    .eq('list_id', listId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
  if (!membership) return { error: 'Немає доступу' }

  const { error } = await admin.from('shopping_lists').update({ archived: false }).eq('id', listId)
  if (error) return { error: error.message }

  revalidatePath('/shopping')
  return {}
}

export async function moveItem(itemId: string, toListId: string): Promise<{ error?: string }> {
  const user = await getAuthUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()

  const { data: item } = await admin.from('shopping_items').select('*').eq('id', itemId).single()
  if (!item) return { error: 'Товар не знайдено' }

  const { data: membership } = await admin
    .from('shopping_list_members')
    .select('id')
    .eq('list_id', toListId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
  if (!membership) return { error: 'Немає доступу до цього списку' }

  // Delete + re-insert so Realtime fires DELETE on old list and INSERT on new list
  await admin.from('shopping_items').delete().eq('id', itemId)
  await admin.from('shopping_items').insert({
    text: item.text,
    list_id: toListId,
    checked: false,
    created_by_email: item.created_by_email,
  })

  return {}
}
