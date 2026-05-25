'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  createList, deleteList, renameList, sendInvite, acceptInvite, declineInvite, leaveList,
} from '@/app/(protected)/shopping/actions'

interface ShoppingItem {
  id: string; text: string; checked: boolean
  created_at: string; created_by_email: string | null
}
interface ListMeta { id: string; name: string; created_by: string | null }
interface Member { id: string; email: string; user_id: string | null; status: string }
interface PendingInvite {
  list_id: string; invited_by_email: string | null
  shopping_lists: { name: string } | null
}

interface Props {
  lists: ListMeta[]
  selectedListId: string
  initialItems: ShoppingItem[]
  members: Member[]
  pendingInvites: PendingInvite[]
  userEmail: string
  userId: string
  uncheckedCounts: Record<string, number>
  membersByList: Record<string, string[]>
}

export default function ShoppingPage({
  lists: propLists,
  selectedListId,
  initialItems,
  members,
  pendingInvites,
  userEmail,
  userId,
  uncheckedCounts,
  membersByList,
}: Props) {
  const supabase = createClient()
  const router = useRouter()

  const [localLists, setLocalLists] = useState(propLists)
  const listsKey = propLists.map(l => `${l.id}:${l.name}`).join(',')
  useEffect(() => { setLocalLists(propLists) }, [listsKey])

  const [activeListId, setActiveListId] = useState(selectedListId || '')
  const [items, setItems] = useState<ShoppingItem[]>(initialItems)
  const [activeMembers, setActiveMembers] = useState<Member[]>(members)

  useEffect(() => {
    if (!selectedListId || selectedListId === activeListId) return
    setActiveListId(selectedListId)
    setItems(initialItems)
    setActiveMembers(members)
  }, [selectedListId]) // eslint-disable-line react-hooks/exhaustive-deps

  const [loading, setLoading] = useState(false)
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)
  const [fadingOut, setFadingOut] = useState<Set<string>>(new Set())
  const [slidingIn, setSlidingIn] = useState<Set<string>>(new Set())
  const [onlineUsers, setOnlineUsers] = useState<string[]>([])

  const [showManage, setShowManage] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteStatus, setInviteStatus] = useState<{ msg: string; ok: boolean } | null>(null)
  const [inviteSending, setInviteSending] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [inviteAction, setInviteAction] = useState<string | null>(null)
  const [deletingList, setDeletingList] = useState(false)

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [renamingListId, setRenamingListId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Wave 2: undo delete
  const pendingDeleteRef = useRef<{ items: ShoppingItem[]; timer: ReturnType<typeof setTimeout> } | null>(null)
  const [showUndo, setShowUndo] = useState(false)
  const [undoLabel, setUndoLabel] = useState('')

  // Wave 2: inline edit
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const dn = (email: string) => email.split('@')[0]
  const activeList = localLists.find(l => l.id === activeListId)
  const isShared = activeMembers.length > 1

  const liveUncheckedCounts = {
    ...uncheckedCounts,
    [activeListId]: items.filter(i => !i.checked).length,
  }

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
        setRenamingListId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  // Cleanup pending delete on unmount
  useEffect(() => {
    return () => {
      if (pendingDeleteRef.current) {
        clearTimeout(pendingDeleteRef.current.timer)
        supabase.from('shopping_items').delete().in('id', pendingDeleteRef.current.items.map(i => i.id))
      }
    }
  }, [])

  // ── Undo delete ──────────────────────────────────────────────────────────
  function scheduleDelete(toDelete: ShoppingItem[]) {
    if (pendingDeleteRef.current) {
      clearTimeout(pendingDeleteRef.current.timer)
      supabase.from('shopping_items').delete().in('id', pendingDeleteRef.current.items.map(i => i.id))
    }

    const ids = new Set(toDelete.map(i => i.id))
    setItems(prev => prev.filter(i => !ids.has(i.id)))

    const label = toDelete.length === 1 ? 'Видалено' : `Видалено: ${toDelete.length}`
    setUndoLabel(label)
    setShowUndo(true)

    const timer = setTimeout(async () => {
      await supabase.from('shopping_items').delete().in('id', toDelete.map(i => i.id))
      pendingDeleteRef.current = null
      setShowUndo(false)
    }, 4000)

    pendingDeleteRef.current = { items: toDelete, timer }
  }

  function undoDelete() {
    if (!pendingDeleteRef.current) return
    clearTimeout(pendingDeleteRef.current.timer)
    const restored = pendingDeleteRef.current.items
    pendingDeleteRef.current = null
    setShowUndo(false)
    setItems(prev => {
      const existingIds = new Set(prev.map(i => i.id))
      const toAdd = restored.filter(i => !existingIds.has(i.id))
      return [...prev, ...toAdd].sort((a, b) => {
        if (a.checked !== b.checked) return a.checked ? 1 : -1
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
    })
  }

  // ── Inline edit ──────────────────────────────────────────────────────────
  function startEdit(item: ShoppingItem) {
    setEditingItemId(item.id)
    setEditText(item.text)
  }

  async function submitEdit(item: ShoppingItem) {
    const text = editText.trim()
    setEditingItemId(null)
    if (!text || text === item.text) return
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, text } : i))
    await supabase.from('shopping_items').update({ text }).eq('id', item.id)
  }

  // ── Batch clear ──────────────────────────────────────────────────────────
  function handleBatchClear() {
    const checkedItems = items.filter(i => i.checked)
    if (checkedItems.length === 0) return
    scheduleDelete(checkedItems)
  }

  // ── Switch list ──────────────────────────────────────────────────────────
  async function switchList(listId: string) {
    if (listId === activeListId || loading) return

    if (pendingDeleteRef.current) {
      clearTimeout(pendingDeleteRef.current.timer)
      supabase.from('shopping_items').delete().in('id', pendingDeleteRef.current.items.map(i => i.id))
      pendingDeleteRef.current = null
      setShowUndo(false)
    }

    setDropdownOpen(false)
    setEditingItemId(null)
    setLoading(true)
    setActiveListId(listId)
    setItems([])
    setActiveMembers([])
    setInviteStatus(null)

    const [{ data: newItems }, { data: newMembers }] = await Promise.all([
      supabase.from('shopping_items').select('id, text, checked, created_at, created_by_email')
        .eq('list_id', listId).order('created_at', { ascending: false }),
      supabase.from('shopping_list_members').select('id, email, user_id, status')
        .eq('list_id', listId).eq('status', 'active'),
    ])
    setItems(newItems ?? [])
    setActiveMembers(newMembers ?? [])
    setLoading(false)
    router.push(`/shopping?list=${listId}`, { scroll: false })
  }

  // ── Rename ───────────────────────────────────────────────────────────────
  async function submitRename(listId: string) {
    const name = renameValue.trim()
    setRenamingListId(null)
    if (!name || name === localLists.find(l => l.id === listId)?.name) return
    setLocalLists(prev => prev.map(l => l.id === listId ? { ...l, name } : l))
    await renameList(listId, name)
    router.refresh()
  }

  // ── Realtime ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeListId) return
    const channel = supabase
      .channel(`shopping-${activeListId}`, { config: { presence: { key: userEmail } } })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_items', filter: `list_id=eq.${activeListId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const item = payload.new as ShoppingItem
            setItems(prev => {
              if (prev.some(i => i.id === item.id)) return prev
              setSlidingIn(s => new Set(Array.from(s).concat(item.id)))
              setTimeout(() => setSlidingIn(s => { const n = new Set(s); n.delete(item.id); return n }), 400)
              return [item, ...prev]
            })
          }
          if (payload.eventType === 'UPDATE') {
            setItems(prev => prev.map(i => i.id === payload.new.id ? payload.new as ShoppingItem : i))
          }
          if (payload.eventType === 'DELETE') {
            setItems(prev => prev.filter(i => i.id !== payload.old.id))
          }
        })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ email: string }>()
        const emails = Object.values(state).flat().map((p: any) => p.email as string)
        setOnlineUsers(Array.from(new Set(emails)))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await channel.track({ email: userEmail })
      })
    return () => { supabase.removeChannel(channel) }
  }, [activeListId, userEmail])

  // ── Add item ─────────────────────────────────────────────────────────────
  const addItem = useCallback(async () => {
    const text = newText.trim()
    if (!text || adding) return
    setAdding(true)
    setNewText('')
    const { data, error } = await supabase
      .from('shopping_items')
      .insert({ text, list_id: activeListId, created_by_email: userEmail })
      .select().single()
    if (!error && data) {
      setItems(prev => {
        if (prev.some(i => i.id === data.id)) return prev
        setSlidingIn(s => new Set(Array.from(s).concat(data.id)))
        setTimeout(() => setSlidingIn(s => { const n = new Set(s); n.delete(data.id); return n }), 400)
        return [data as ShoppingItem, ...prev]
      })
    }
    setAdding(false)
    inputRef.current?.focus()
  }, [newText, adding, supabase, userEmail, activeListId])

  // ── Tap to check ─────────────────────────────────────────────────────────
  async function handleTap(item: ShoppingItem) {
    if (editingItemId === item.id) return
    if (!item.checked) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: true } : i))
      await supabase.from('shopping_items').update({ checked: true }).eq('id', item.id)
    } else {
      setFadingOut(s => new Set(Array.from(s).concat(item.id)))
      setTimeout(() => {
        setFadingOut(s => { const n = new Set(s); n.delete(item.id); return n })
        scheduleDelete([item])
      }, 300)
    }
  }

  // ── Invite / list actions ─────────────────────────────────────────────────
  async function handleSendInvite() {
    if (!inviteEmail.trim() || inviteSending) return
    setInviteSending(true)
    setInviteStatus(null)
    const result = await sendInvite(activeListId, inviteEmail.trim())
    if (result.error) setInviteStatus({ msg: result.error, ok: false })
    else { setInviteStatus({ msg: 'Запрошення надіслано!', ok: true }); setInviteEmail('') }
    setInviteSending(false)
  }

  async function handleAccept(invite: PendingInvite) {
    setInviteAction(invite.list_id)
    const result = await acceptInvite(invite.list_id)
    setInviteAction(null)
    if (!result.error) router.push(`/shopping?list=${invite.list_id}`)
  }

  async function handleDecline(invite: PendingInvite) {
    setInviteAction(invite.list_id)
    await declineInvite(invite.list_id)
    router.refresh()
    setInviteAction(null)
  }

  async function handleLeave() {
    if (!confirm(`Вийти зі списку "${activeList?.name}"?`)) return
    await leaveList(activeListId)
    router.refresh()
  }

  async function handleCreateList() {
    if (isCreating) return
    setIsCreating(true)
    const name = newListName.trim() || 'Новий список'
    const result = await createList(name)
    setNewListName('')
    setIsCreating(false)
    setShowCreateForm(false)
    if (result.id) router.push(`/shopping?list=${result.id}`)
    else router.refresh()
  }

  async function handleDeleteList() {
    if (!confirm(`Видалити список "${activeList?.name}"? Всі товари буде втрачено.`)) return
    setDeletingList(true)
    await deleteList(activeListId)
    setDeletingList(false)
    router.refresh()
  }

  // ── Pending invite banners ────────────────────────────────────────────────
  const pendingBanners = (
    <>
      {pendingInvites.map(invite => (
        <div key={invite.list_id} style={{
          background: 'var(--bg2)', border: '1.5px solid var(--accent)',
          borderRadius: 12, padding: '14px 16px', marginBottom: 12,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>
            Запрошення до списку «{invite.shopping_lists?.name ?? 'Список покупок'}»
          </div>
          {invite.invited_by_email && (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>від {dn(invite.invited_by_email)}</div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => handleAccept(invite)} disabled={inviteAction === invite.list_id}
              style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: inviteAction === invite.list_id ? 0.6 : 1 }}>
              Прийняти
            </button>
            <button onClick={() => handleDecline(invite)} disabled={inviteAction === invite.list_id}
              style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', opacity: inviteAction === invite.list_id ? 0.6 : 1 }}>
              Відхилити
            </button>
          </div>
        </div>
      ))}
    </>
  )

  // ── Empty state ───────────────────────────────────────────────────────────
  if (localLists.length === 0) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 16px 60px' }}>
        {pendingBanners}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '55vh', gap: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 52 }}>🛒</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Немає жодного списку</div>
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>Створіть свій перший список покупок</div>
          {showCreateForm ? (
            <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 340 }}>
              <input value={newListName} onChange={e => setNewListName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateList()}
                placeholder="Назва списку..." autoFocus
                style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--accent)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 15, outline: 'none', fontFamily: 'inherit' }} />
              <button onClick={handleCreateList} disabled={isCreating}
                style={{ padding: '12px 16px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: isCreating ? 0.6 : 1 }}>
                {isCreating ? '...' : 'OK'}
              </button>
            </div>
          ) : (
            <button onClick={() => setShowCreateForm(true)}
              style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
              + Створити перший список
            </button>
          )}
        </div>
      </div>
    )
  }

  const sorted = [...items].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
  const unchecked = sorted.filter(i => !i.checked)
  const checked = sorted.filter(i => i.checked)
  const otherOnline = onlineUsers.filter(e => e !== userEmail)
  const activeCount = liveUncheckedCounts[activeListId] ?? 0
  const activeAvatars = (membersByList[activeListId] ?? []).slice(0, 3)

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 16px 60px' }}>
      {pendingBanners}

      {/* Dropdown list selector */}
      <div ref={dropdownRef} style={{ position: 'relative', marginBottom: 16 }}>
        <button
          onClick={() => { setDropdownOpen(o => !o); setRenamingListId(null) }}
          style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
            {activeList?.name ?? 'Список'}
          </span>
          {activeCount > 0 && (
            <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400, flexShrink: 0 }}>· {activeCount}</span>
          )}
          {activeAvatars.map(email => <Avatar key={email} email={email} size={22} />)}
          <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{dropdownOpen ? '▲' : '▼'}</span>
        </button>

        {dropdownOpen && (
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, zIndex: 100, overflow: 'hidden', boxShadow: '0 8px 28px rgba(0,0,0,0.13)' }}>
            {localLists.map((list, idx) => {
              const isActive = list.id === activeListId
              const isRenaming = renamingListId === list.id
              const count = liveUncheckedCounts[list.id] ?? 0
              const avatars = (membersByList[list.id] ?? []).slice(0, 3)
              return (
                <div key={list.id} onClick={() => { if (!isRenaming) switchList(list.id) }}
                  style={{ padding: '11px 14px', cursor: isRenaming ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderBottom: idx < localLists.length - 1 ? '1px solid var(--border)' : 'none', background: isActive ? 'rgba(128,128,128,0.06)' : 'transparent' }}>
                  <span style={{ fontSize: 13, color: 'var(--accent)', opacity: isActive ? 1 : 0, flexShrink: 0, width: 14 }}>✓</span>
                  {isRenaming ? (
                    <input value={renameValue} onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') submitRename(list.id); if (e.key === 'Escape') setRenamingListId(null) }}
                      onBlur={() => submitRename(list.id)} onClick={e => e.stopPropagation()} autoFocus
                      style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--accent)', borderRadius: 6, padding: '4px 8px', color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
                  ) : (
                    <span style={{ flex: 1, fontSize: 14, fontWeight: isActive ? 600 : 400, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {list.name}
                    </span>
                  )}
                  {count > 0 && !isRenaming && <span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>· {count}</span>}
                  {avatars.map(email => <Avatar key={email} email={email} size={20} />)}
                  {isActive && !isRenaming && (
                    <button onClick={e => { e.stopPropagation(); setRenamingListId(list.id); setRenameValue(list.name) }}
                      style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      ✏️
                    </button>
                  )}
                </div>
              )
            })}
            <div onClick={() => { setDropdownOpen(false); setShowCreateForm(true) }}
              style={{ padding: '11px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent)', fontSize: 14, fontWeight: 600, borderTop: '1px solid var(--border)' }}>
              + Новий список
            </div>
          </div>
        )}
      </div>

      {/* Create list form */}
      {showCreateForm && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input value={newListName} onChange={e => setNewListName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateList()}
            placeholder="Назва списку..." autoFocus
            style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--accent)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
          <button onClick={handleCreateList} disabled={isCreating}
            style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: isCreating ? 0.6 : 1 }}>
            {isCreating ? '...' : 'Створити'}
          </button>
          <button onClick={() => setShowCreateForm(false)}
            style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>
            ✕
          </button>
        </div>
      )}

      {/* Online */}
      {otherOnline.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <OnlineDot label="Ти" />
          {otherOnline.map(e => <OnlineDot key={e} label={dn(e)} />)}
        </div>
      )}

      {/* Add item */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input ref={inputRef} value={newText} onChange={e => setNewText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem()}
          placeholder="Додати товар..." disabled={adding || loading} autoComplete="off"
          style={{ flex: 1, padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 16, outline: 'none', fontFamily: 'inherit', WebkitAppearance: 'none' }} />
        <button onClick={addItem} disabled={adding || !newText.trim() || loading}
          style={{ width: 54, height: 54, borderRadius: 12, flexShrink: 0, background: newText.trim() ? 'var(--accent)' : 'var(--bg2)', border: '1px solid var(--border)', color: newText.trim() ? '#fff' : 'var(--muted)', fontSize: 26, cursor: newText.trim() ? 'pointer' : 'default', transition: 'background 0.15s, color 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          +
        </button>
      </div>

      {/* Items */}
      {loading && <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0', fontSize: 14 }}>Завантаження...</div>}

      {!loading && sorted.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14, padding: '40px 0' }}>
          Список порожній — додайте перший товар!
        </div>
      )}

      {!loading && unchecked.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: checked.length ? 16 : 0 }}>
          {unchecked.map(item => (
            <ItemRow key={item.id} item={item}
              sliding={slidingIn.has(item.id)} fading={fadingOut.has(item.id)}
              isShared={isShared}
              isEditing={editingItemId === item.id} editText={editText}
              onTap={handleTap}
              onDelete={item => scheduleDelete([item])}
              onEdit={startEdit}
              onEditChange={setEditText}
              onEditSubmit={() => editingItemId && submitEdit(item)}
              onEditCancel={() => setEditingItemId(null)}
            />
          ))}
        </div>
      )}

      {!loading && unchecked.length > 0 && checked.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0', position: 'relative' }}>
          <span style={{ position: 'absolute', left: '50%', top: -9, transform: 'translateX(-50%)', background: 'var(--bg)', padding: '0 10px', fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Куплено
          </span>
        </div>
      )}

      {!loading && checked.length > 0 && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {checked.map(item => (
              <ItemRow key={item.id} item={item}
                sliding={slidingIn.has(item.id)} fading={fadingOut.has(item.id)}
                isShared={isShared}
                isEditing={editingItemId === item.id} editText={editText}
                onTap={handleTap}
                onDelete={item => scheduleDelete([item])}
                onEdit={startEdit}
                onEditChange={setEditText}
                onEditSubmit={() => editingItemId && submitEdit(item)}
                onEditCancel={() => setEditingItemId(null)}
              />
            ))}
          </div>
          <button onClick={handleBatchClear}
            style={{ marginTop: 12, width: '100%', padding: '10px 0', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>
            Очистити куплені ({checked.length})
          </button>
        </>
      )}

      {!loading && sorted.length > 0 && (
        <div style={{ marginTop: 12, textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
          {unchecked.length > 0 ? `Залишилось: ${unchecked.length}` : '✓ Все куплено!'}
          {checked.length > 0 && ` · Куплено: ${checked.length}`}
        </div>
      )}

      {/* Manage */}
      <div style={{ marginTop: 28 }}>
        <button onClick={() => setShowManage(s => !s)}
          style={{ width: '100%', padding: '11px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--muted)', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>👥 Учасники та налаштування</span>
          <span style={{ fontSize: 11 }}>{showManage ? '▲' : '▼'}</span>
        </button>

        {showManage && (
          <div style={{ marginTop: 8, padding: 16, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {activeMembers.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Учасники ({activeMembers.length})</div>
                {activeMembers.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{dn(m.email)}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{m.email}</div>
                    </div>
                    {m.email === userEmail.toLowerCase() && <span style={{ fontSize: 11, color: 'var(--muted)' }}>ти</span>}
                  </div>
                ))}
              </div>
            )}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Запросити до цього списку</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={inviteEmail} onChange={e => { setInviteEmail(e.target.value); setInviteStatus(null) }}
                  onKeyDown={e => e.key === 'Enter' && handleSendInvite()}
                  placeholder="email@..." type="email"
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
                <button onClick={handleSendInvite} disabled={inviteSending || !inviteEmail.trim()}
                  style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: inviteEmail.trim() ? 'var(--accent)' : 'var(--border)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: inviteEmail.trim() ? 'pointer' : 'default', opacity: inviteSending ? 0.6 : 1, flexShrink: 0 }}>
                  {inviteSending ? '...' : 'Запросити'}
                </button>
              </div>
              {inviteStatus && <div style={{ marginTop: 8, fontSize: 13, color: inviteStatus.ok ? 'var(--green)' : '#e55' }}>{inviteStatus.msg}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleLeave}
                style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>
                Вийти зі списку
              </button>
              <button onClick={handleDeleteList} disabled={deletingList}
                style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid #e55', background: 'transparent', color: '#e55', fontSize: 13, cursor: 'pointer', opacity: deletingList ? 0.6 : 1 }}>
                {deletingList ? '...' : 'Видалити список'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Undo toast */}
      {showUndo && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.18)', zIndex: 300, whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 14, color: 'var(--text)' }}>{undoLabel}</span>
          <button onClick={undoDelete}
            style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Скасувати
          </button>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

const ACTIONS_W = 108

function ItemRow({
  item, sliding, fading, isShared,
  isEditing, editText, onEditChange, onEditSubmit, onEditCancel,
  onTap, onDelete, onEdit,
}: {
  item: ShoppingItem
  sliding: boolean
  fading: boolean
  isShared: boolean
  isEditing: boolean
  editText: string
  onEditChange: (t: string) => void
  onEditSubmit: () => void
  onEditCancel: () => void
  onTap: (item: ShoppingItem) => void
  onDelete: (item: ShoppingItem) => void
  onEdit: (item: ShoppingItem) => void
}) {
  const [swipeX, setSwipeX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [hovered, setHovered] = useState(false)
  const startXRef = useRef(0)
  const openRef = useRef(false)

  const showButtons = hovered || swipeX < -10

  function onTouchStart(e: React.TouchEvent) {
    startXRef.current = e.touches[0].clientX
    setIsDragging(true)
  }

  function onTouchMove(e: React.TouchEvent) {
    const dx = e.touches[0].clientX - startXRef.current
    if (openRef.current) {
      setSwipeX(Math.min(0, Math.max(-ACTIONS_W, -ACTIONS_W + dx)))
    } else if (dx < 0) {
      setSwipeX(Math.max(-ACTIONS_W, dx))
    }
  }

  function onTouchEnd() {
    setIsDragging(false)
    if (swipeX < -(ACTIONS_W * 0.4)) {
      setSwipeX(-ACTIONS_W)
      openRef.current = true
    } else {
      setSwipeX(0)
      openRef.current = false
    }
  }

  function handleRowClick() {
    if (openRef.current || swipeX < -10) {
      setSwipeX(0)
      openRef.current = false
      return
    }
    onTap(item)
  }

  if (isEditing) {
    return (
      <div style={{ padding: 8, borderRadius: 12, background: 'var(--bg2)', border: '1.5px solid var(--accent)' }}>
        <input value={editText} onChange={e => onEditChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onEditSubmit(); if (e.key === 'Escape') onEditCancel() }}
          onBlur={onEditSubmit} autoFocus
          style={{ width: '100%', padding: '8px 12px', border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 16, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
      </div>
    )
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={sliding ? 'shopping-slide-in' : fading ? 'shopping-fade-out' : ''}
      style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', opacity: fading ? 0 : 1, transform: fading ? 'translateY(-10px)' : 'none', transition: fading ? 'opacity 0.3s ease, transform 0.3s ease' : 'none' }}
    >
      {/* Action buttons (revealed on swipe or hover) */}
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: ACTIONS_W, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingRight: 10, paddingLeft: 20, background: `linear-gradient(to right, transparent, var(--bg2) 35%)`, opacity: showButtons ? 1 : 0, transition: 'opacity 0.15s', pointerEvents: showButtons ? 'all' : 'none', zIndex: 2 }}>
        <button
          onClick={e => { e.stopPropagation(); setSwipeX(0); openRef.current = false; onEdit(item) }}
          style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          ✏️
        </button>
        <button
          onClick={e => { e.stopPropagation(); setSwipeX(0); openRef.current = false; onDelete(item) }}
          style={{ width: 40, height: 40, borderRadius: 8, border: 'none', background: '#e55', color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          🗑️
        </button>
      </div>

      {/* Main row */}
      <div
        onClick={handleRowClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ padding: '14px 16px', background: 'var(--bg2)', border: '1.5px solid var(--border)', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transform: `translateX(${swipeX}px)`, transition: isDragging ? 'none' : 'transform 0.2s ease', userSelect: 'none', WebkitTapHighlightColor: 'transparent', position: 'relative', zIndex: 1 }}
      >
        <div style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, border: `2px solid ${item.checked ? 'var(--green)' : 'var(--border)'}`, background: item.checked ? 'var(--green)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', color: '#fff', fontSize: 13, fontWeight: 700 }}>
          {item.checked && '✓'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, color: item.checked ? 'var(--muted)' : 'var(--text)', textDecoration: item.checked ? 'line-through' : 'none', transition: 'color 0.25s', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.text}
          </div>
          {isShared && item.created_by_email && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              {item.created_by_email.split('@')[0]}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Avatar({ email, size }: { email: string; size: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: Math.round(size * 0.38), fontWeight: 700, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {email.split('@')[0].slice(0, 2).toUpperCase()}
    </div>
  )
}

function OnlineDot({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', flexShrink: 0 }} />
      {label}
    </div>
  )
}
