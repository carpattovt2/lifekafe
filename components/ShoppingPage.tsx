'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  createList, deleteList, renameList, sendInvite, acceptInvite, declineInvite, leaveList,
  reorderLists, archiveList, restoreList, moveItem,
} from '@/app/(protected)/shopping/actions'
import OnboardingSheet from '@/components/OnboardingSheet'


interface ShoppingItem {
  id: string; text: string; checked: boolean
  created_at: string; created_by_email: string | null; category?: string
}
interface ListMeta { id: string; name: string; created_by: string | null }
interface Member { id: string; email: string; user_id: string | null; status: string }
interface PendingInvite {
  list_id: string; invited_by_email: string | null
  shopping_lists: { name: string } | null
}

interface Props {
  lists: ListMeta[]
  archivedLists: ListMeta[]
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
  archivedLists: propArchivedLists,
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
  useEffect(() => { setLocalLists(propLists) }, [listsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const [localArchivedLists, setLocalArchivedLists] = useState(propArchivedLists)
  const archivedKey = propArchivedLists.map(l => `${l.id}:${l.name}`).join(',')
  useEffect(() => { setLocalArchivedLists(propArchivedLists) }, [archivedKey]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const [archivingList, setArchivingList] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [renamingListId, setRenamingListId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showArchiveSection, setShowArchiveSection] = useState(false)
  const [dragListIdx, setDragListIdx] = useState<number | null>(null)
  const [dragListOverIdx, setDragListOverIdx] = useState<number | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Undo delete
  const pendingDeleteRef = useRef<{ items: ShoppingItem[]; timer: ReturnType<typeof setTimeout> } | null>(null)
  const [showUndo, setShowUndo] = useState(false)
  const [undoLabel, setUndoLabel] = useState('')

  // Inline edit
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  // Move item context menu (desktop right-click only)
  const [contextItem, setContextItem] = useState<ShoppingItem | null>(null)
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(null)

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

  // Close context menu on outside click
  useEffect(() => {
    if (!contextItem) return
    const handler = () => { setContextItem(null); setContextPos(null) }
    setTimeout(() => {
      document.addEventListener('mousedown', handler)
    }, 0)
    return () => document.removeEventListener('mousedown', handler)
  }, [contextItem])

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
      supabase.from('shopping_items').select('id, text, checked, created_at, created_by_email, category')
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

  // ── Drag-to-reorder lists ─────────────────────────────────────────────────
  function handleListDrop(targetIdx: number) {
    if (dragListIdx === null || dragListIdx === targetIdx) {
      setDragListIdx(null)
      setDragListOverIdx(null)
      return
    }
    const newOrder = [...localLists]
    const [moved] = newOrder.splice(dragListIdx, 1)
    newOrder.splice(targetIdx, 0, moved)
    setLocalLists(newOrder)
    setDragListIdx(null)
    setDragListOverIdx(null)
    reorderLists(newOrder.map(l => l.id))
  }

  // ── Archive / restore ─────────────────────────────────────────────────────
  async function handleArchiveList() {
    if (!confirm(`Архівувати список "${activeList?.name}"?`)) return
    setArchivingList(true)
    const listToArchive = localLists.find(l => l.id === activeListId)
    const remaining = localLists.filter(l => l.id !== activeListId)
    setLocalLists(remaining)
    if (listToArchive) setLocalArchivedLists(prev => [...prev, listToArchive])
    setShowManage(false)
    await archiveList(activeListId)
    if (remaining.length > 0) {
      setArchivingList(false)
      await switchList(remaining[0].id)
    } else {
      setArchivingList(false)
      router.refresh()
    }
  }

  async function handleRestoreList(listId: string) {
    const listToRestore = localArchivedLists.find(l => l.id === listId)
    setLocalArchivedLists(prev => prev.filter(l => l.id !== listId))
    if (listToRestore) setLocalLists(prev => [...prev, listToRestore])
    await restoreList(listId)
    router.refresh()
  }

  async function handleDeleteForever(listId: string) {
    const list = localArchivedLists.find(l => l.id === listId)
    if (!confirm(`Видалити назавжди "${list?.name}"? Всі товари буде втрачено.`)) return
    setLocalArchivedLists(prev => prev.filter(l => l.id !== listId))
    await deleteList(listId)
  }

  // ── Move item context menu (desktop only) ─────────────────────────────────
  function showContextMenu(item: ShoppingItem, x: number, y: number) {
    setContextItem(item)
    setContextPos({ x, y })
  }

  async function handleMoveItem(toListId: string) {
    if (!contextItem) return
    const item = contextItem
    setContextItem(null)
    setContextPos(null)
    setItems(prev => prev.filter(i => i.id !== item.id))
    await moveItem(item.id, toListId)
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
  async function handleAddPress() {
    const text = newText.trim()
    if (!text || adding) return
    setNewText('')
    setAdding(true)
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
  }

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
      <>
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
          {localArchivedLists.length > 0 && (
            <div style={{ marginTop: 8, width: '100%', maxWidth: 340 }}>
              <button onClick={() => setShowArchiveSection(s => !s)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Архів ({localArchivedLists.length})</span>
                <span style={{ fontSize: 11 }}>{showArchiveSection ? '▲' : '▼'}</span>
              </button>
              {showArchiveSection && (
                <div style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  {localArchivedLists.map(list => (
                    <div key={list.id} style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                      <span style={{ flex: 1, fontSize: 14, color: 'var(--muted)' }}>{list.name}</span>
                      <button onClick={() => handleRestoreList(list.id)}
                        style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--accent)', fontSize: 12, cursor: 'pointer' }}>
                        Відновити
                      </button>
                      <button onClick={() => handleDeleteForever(list.id)}
                        style={{ padding: '5px 8px', borderRadius: 6, border: 'none', background: 'transparent', color: '#e55', fontSize: 14, cursor: 'pointer' }}>
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <OnboardingSheet forceOpen={showHelp} onClose={() => setShowHelp(false)} />
    </>
  )
  }

  const unchecked = items.filter(i => !i.checked).sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  const checked = items.filter(i => i.checked).sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  const otherOnline = onlineUsers.filter(e => e !== userEmail)
  const activeCount = liveUncheckedCounts[activeListId] ?? 0
  const activeAvatars = (membersByList[activeListId] ?? []).slice(0, 3)
  const otherLists = localLists.filter(l => l.id !== activeListId)

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
              const isDragOver = dragListOverIdx === idx && dragListIdx !== null && dragListIdx !== idx
              const count = liveUncheckedCounts[list.id] ?? 0
              const avatars = (membersByList[list.id] ?? []).slice(0, 3)
              return (
                <div
                  key={list.id}
                  draggable={!isRenaming}
                  onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragListIdx(idx); setDragListOverIdx(idx) }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragListOverIdx(idx) }}
                  onDrop={e => { e.preventDefault(); handleListDrop(idx) }}
                  onDragEnd={() => { setDragListIdx(null); setDragListOverIdx(null) }}
                  onClick={() => { if (!isRenaming && dragListIdx === null) switchList(list.id) }}
                  style={{
                    padding: '11px 14px', cursor: isRenaming ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                    borderBottom: idx < localLists.length - 1 ? '1px solid var(--border)' : 'none',
                    background: isDragOver ? 'rgba(100,100,255,0.07)' : isActive ? 'rgba(128,128,128,0.06)' : 'transparent',
                    opacity: dragListIdx === idx ? 0.45 : 1,
                    borderTop: isDragOver ? '2px solid var(--accent)' : undefined,
                  }}
                >
                  <span title="Перетягнути" style={{ fontSize: 16, color: 'var(--muted)', cursor: 'grab', flexShrink: 0, userSelect: 'none', opacity: 0.5 }} onMouseDown={e => e.stopPropagation()}>⠿</span>
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
            {localArchivedLists.length > 0 && (
              <>
                <div onClick={e => { e.stopPropagation(); setShowArchiveSection(s => !s) }}
                  style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border)', color: 'var(--muted)', fontSize: 13 }}>
                  <span style={{ flex: 1 }}>📦 Архів ({localArchivedLists.length})</span>
                  <span style={{ fontSize: 11 }}>{showArchiveSection ? '▲' : '▼'}</span>
                </div>
                {showArchiveSection && localArchivedLists.map(list => (
                  <div key={list.id} style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border)', background: 'rgba(128,128,128,0.03)' }}>
                    <span style={{ flex: 1, fontSize: 14, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{list.name}</span>
                    <button onClick={e => { e.stopPropagation(); handleRestoreList(list.id) }}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>
                      Відновити
                    </button>
                    <button onClick={e => { e.stopPropagation(); handleDeleteForever(list.id) }}
                      style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent', color: '#e55', fontSize: 14, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      🗑️
                    </button>
                  </div>
                ))}
              </>
            )}
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
          onKeyDown={e => e.key === 'Enter' && handleAddPress()}
          placeholder="Додати товар..." disabled={adding || loading} autoComplete="off"
          style={{ flex: 1, padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 16, outline: 'none', fontFamily: 'inherit', WebkitAppearance: 'none' }} />
        <button onClick={handleAddPress} disabled={adding || !newText.trim() || loading}
          style={{ width: 54, height: 54, borderRadius: 12, flexShrink: 0, background: newText.trim() ? 'var(--accent)' : 'var(--bg2)', border: '1px solid var(--border)', color: newText.trim() ? '#fff' : 'var(--muted)', fontSize: 26, cursor: newText.trim() ? 'pointer' : 'default', transition: 'background 0.15s, color 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          +
        </button>
      </div>

      {loading && <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0', fontSize: 14 }}>Завантаження...</div>}

      {!loading && unchecked.length === 0 && checked.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14, padding: '40px 0' }}>
          Список порожній — додайте перший товар!
        </div>
      )}

      {!loading && unchecked.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {unchecked.map(item => (
            <ItemRow key={item.id} item={item}
              sliding={slidingIn.has(item.id)} fading={fadingOut.has(item.id)}
              isShared={isShared} canMove={otherLists.length > 0}
              isEditing={editingItemId === item.id} editText={editText}
              onTap={handleTap} onEdit={startEdit}
              onEditChange={setEditText}
              onEditSubmit={() => editingItemId && submitEdit(item)}
              onEditCancel={() => setEditingItemId(null)}
              onShowContextMenu={showContextMenu}
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
                isShared={isShared} canMove={false}
                isEditing={editingItemId === item.id} editText={editText}
                onTap={handleTap} onEdit={startEdit}
                onEditChange={setEditText}
                onEditSubmit={() => editingItemId && submitEdit(item)}
                onEditCancel={() => setEditingItemId(null)}
                onShowContextMenu={showContextMenu}
              />
            ))}
          </div>
          <button onClick={handleBatchClear}
            style={{ marginTop: 12, width: '100%', padding: '10px 0', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>
            Очистити куплені ({checked.length})
          </button>
        </>
      )}

      {!loading && (unchecked.length > 0 || checked.length > 0) && (
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
              <button onClick={handleArchiveList} disabled={archivingList}
                style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', opacity: archivingList ? 0.6 : 1 }}>
                {archivingList ? '...' : 'Архівувати список'}
              </button>
            </div>
            <button onClick={() => setShowHelp(true)}
              style={{ width: '100%', padding: '9px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>
              ? Показати підказки
            </button>
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

      {/* Move item context menu (desktop right-click only) */}
      {contextItem && contextPos && otherLists.length > 0 && (
        <MoveContextMenu
          pos={contextPos}
          lists={otherLists}
          onMove={handleMoveItem}
          onClose={() => { setContextItem(null); setContextPos(null) }}
        />
      )}

      <OnboardingSheet forceOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  )
}

// ── ItemRow ───────────────────────────────────────────────────────────────────

function ItemRow({
  item, sliding, fading, isShared, canMove,
  isEditing, editText, onEditChange, onEditSubmit, onEditCancel,
  onTap, onEdit, onShowContextMenu,
}: {
  item: ShoppingItem
  sliding: boolean
  fading: boolean
  isShared: boolean
  canMove: boolean
  isEditing: boolean
  editText: string
  onEditChange: (t: string) => void
  onEditSubmit: () => void
  onEditCancel: () => void
  onTap: (item: ShoppingItem) => void
  onEdit: (item: ShoppingItem) => void
  onShowContextMenu: (item: ShoppingItem, x: number, y: number) => void
}) {
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mouseDownRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPos = useRef({ x: 0, y: 0 })

  function clearLongPress() {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null }
  }
  function clearMouseDown() {
    if (mouseDownRef.current) { clearTimeout(mouseDownRef.current); mouseDownRef.current = null }
  }

  // Desktop: long hold → edit
  function handleMouseDown() {
    mouseDownRef.current = setTimeout(() => {
      mouseDownRef.current = null
      onEdit(item)
    }, 700)
  }
  function handleMouseUp() { clearMouseDown() }

  // Mobile: long press (still) → edit
  function handleTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0]
    startPos.current = { x: touch.clientX, y: touch.clientY }
    longPressRef.current = setTimeout(() => {
      longPressRef.current = null
      onEdit(item)
    }, 650)
  }
  function handleTouchMove(e: React.TouchEvent) {
    const touch = e.touches[0]
    const dx = touch.clientX - startPos.current.x
    const dy = touch.clientY - startPos.current.y
    if (Math.sqrt(dx * dx + dy * dy) > 8) clearLongPress()
  }
  function handleTouchEnd() { clearLongPress() }

  // Desktop right-click → context menu (move to list)
  function handleContextMenu(e: React.MouseEvent) {
    if (!canMove) return
    e.preventDefault()
    onShowContextMenu(item, e.clientX, e.clientY)
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
      className={sliding ? 'shopping-slide-in' : fading ? 'shopping-fade-out' : ''}
      style={{
        position: 'relative', borderRadius: 12, overflow: 'hidden',
        opacity: fading ? 0 : 1,
        transform: fading ? 'translateY(-10px)' : 'none',
        transition: fading ? 'opacity 0.3s ease, transform 0.3s ease' : undefined,
      }}
    >
      <div
        onClick={() => onTap(item)}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={handleContextMenu}
        style={{
          padding: '14px 16px',
          background: 'var(--bg2)',
          border: '1.5px solid var(--border)',
          borderRadius: 12,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 10,
          userSelect: 'none', WebkitTapHighlightColor: 'transparent',
        }}
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

// ── Context menu (desktop, move between lists) ────────────────────────────────

function MoveContextMenu({ pos, lists, onMove, onClose }: {
  pos: { x: number; y: number }
  lists: ListMeta[]
  onMove: (toListId: string) => void
  onClose: () => void
}) {
  const menuH = lists.length * 44 + 40
  const vw = typeof window !== 'undefined' ? window.innerWidth : 400
  const vh = typeof window !== 'undefined' ? window.innerHeight : 700
  const top = Math.max(8, Math.min(pos.y, vh - menuH - 8))
  const left = Math.max(8, Math.min(pos.x, vw - 196))

  return (
    <div
      style={{ position: 'fixed', top, left, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', zIndex: 500, overflow: 'hidden', minWidth: 180 }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>
        Перемістити до:
      </div>
      {lists.map(list => (
        <ContextMenuItem key={list.id} label={list.name} onClick={() => onMove(list.id)} />
      ))}
    </div>
  )
}

function ContextMenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ padding: '12px 14px', cursor: 'pointer', fontSize: 14, color: 'var(--text)', background: hovered ? 'rgba(128,128,128,0.08)' : 'transparent', transition: 'background 0.1s', borderBottom: '1px solid var(--border)' }}>
      {label}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
