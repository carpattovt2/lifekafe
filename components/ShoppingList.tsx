'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { sendInvite, acceptInvite, declineInvite, unlinkFromGroup } from '@/app/(protected)/shopping/actions'

interface ShoppingItem {
  id: string
  text: string
  checked: boolean
  created_at: string
  created_by_email: string | null
}

interface GroupMember {
  id: string
  email: string
  status: string
  invited_by_email: string | null
}

interface PendingInvite {
  group_id: string
  invited_by_email: string | null
}

interface Props {
  initialItems: ShoppingItem[]
  userEmail: string
  groupId: string
  groupMembers: GroupMember[]
  pendingInvites: PendingInvite[]
}

export default function ShoppingList({ initialItems, userEmail, groupId, groupMembers, pendingInvites }: Props) {
  const supabase = createClient()
  const [items, setItems] = useState<ShoppingItem[]>(initialItems)
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)
  const [fadingOut, setFadingOut] = useState<Set<string>>(new Set())
  const [slidingIn, setSlidingIn] = useState<Set<string>>(new Set())
  const [onlineUsers, setOnlineUsers] = useState<string[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteStatus, setInviteStatus] = useState<{ msg: string; ok: boolean } | null>(null)
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteAction, setInviteAction] = useState<string | null>(null)
  const [showLinkSection, setShowLinkSection] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const displayName = (email: string) => email.split('@')[0]
  const partners = groupMembers.filter(m => m.email !== userEmail.toLowerCase())

  useEffect(() => {
    const channel = supabase
      .channel('shopping-realtime', { config: { presence: { key: userEmail } } })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_list', filter: `group_id=eq.${groupId}` },
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
            setFadingOut(s => { const n = new Set(s); n.delete(payload.old.id); return n })
          }
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ email: string }>()
        const emails = Object.values(state).flat().map((p: any) => p.email as string)
        setOnlineUsers(Array.from(new Set(emails)))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ email: userEmail })
        }
      })

    return () => { supabase.removeChannel(channel) }
  }, [supabase, userEmail, groupId])

  const addItem = useCallback(async () => {
    const text = newText.trim()
    if (!text || adding) return
    setAdding(true)
    setNewText('')

    const { data, error } = await supabase
      .from('shopping_list')
      .insert({ text, group_id: groupId, created_by_email: userEmail })
      .select()
      .single()

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
  }, [newText, adding, supabase, userEmail, groupId])

  async function handleTap(item: ShoppingItem) {
    if (!item.checked) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: true } : i))
      await supabase.from('shopping_list').update({ checked: true }).eq('id', item.id)
    } else {
      setFadingOut(s => new Set(Array.from(s).concat(item.id)))
      setTimeout(async () => {
        await supabase.from('shopping_list').delete().eq('id', item.id)
        setItems(prev => prev.filter(i => i.id !== item.id))
        setFadingOut(s => { const n = new Set(s); n.delete(item.id); return n })
      }, 320)
    }
  }

  async function handleSendInvite() {
    if (!inviteEmail.trim() || inviteSending) return
    setInviteSending(true)
    setInviteStatus(null)
    const result = await sendInvite(inviteEmail.trim())
    if (result.error) {
      setInviteStatus({ msg: result.error, ok: false })
    } else {
      setInviteStatus({ msg: 'Запрошення надіслано!', ok: true })
      setInviteEmail('')
    }
    setInviteSending(false)
  }

  async function handleAccept(invite: PendingInvite) {
    setInviteAction(invite.group_id)
    await acceptInvite(invite.group_id)
    setInviteAction(null)
  }

  async function handleDecline(invite: PendingInvite) {
    setInviteAction(invite.group_id)
    await declineInvite(invite.group_id)
    setInviteAction(null)
  }

  async function handleUnlink() {
    if (!confirm('Від\'єднатись від спільного списку? У тебе буде особистий порожній список.')) return
    await unlinkFromGroup()
  }

  const sorted = [...items].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const unchecked = sorted.filter(i => !i.checked)
  const checked   = sorted.filter(i => i.checked)
  const otherOnline = onlineUsers.filter(e => e !== userEmail)

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px 40px' }}>

      {/* Pending invite banners */}
      {pendingInvites.map(invite => (
        <div key={invite.group_id} style={{
          background: 'var(--bg2)',
          border: '1.5px solid var(--accent)',
          borderRadius: 12,
          padding: '14px 16px',
          marginBottom: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>
            Запрошення до спільного списку
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {invite.invited_by_email
              ? `від ${displayName(invite.invited_by_email)} (${invite.invited_by_email})`
              : 'від невідомого'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => handleAccept(invite)}
              disabled={inviteAction === invite.group_id}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 8, border: 'none',
                background: 'var(--accent)', color: '#fff',
                fontWeight: 600, fontSize: 13, cursor: 'pointer',
                opacity: inviteAction === invite.group_id ? 0.6 : 1,
              }}
            >
              Прийняти
            </button>
            <button
              onClick={() => handleDecline(invite)}
              disabled={inviteAction === invite.group_id}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 8,
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--muted)', fontWeight: 500, fontSize: 13, cursor: 'pointer',
                opacity: inviteAction === invite.group_id ? 0.6 : 1,
              }}
            >
              Відхилити
            </button>
          </div>
        </div>
      ))}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', margin: 0 }}>
            🛒 Список покупок
          </h1>
          {partners.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
              спільний з {partners.map(p => displayName(p.email)).join(', ')}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <OnlineDot label="Ти" active />
          {otherOnline.map(e => (
            <OnlineDot key={e} label={displayName(e)} active />
          ))}
        </div>
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          ref={inputRef}
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem()}
          placeholder="Додати товар..."
          disabled={adding}
          autoComplete="off"
          style={{
            flex: 1, padding: '14px 16px', borderRadius: 12,
            border: '1px solid var(--border)', background: 'var(--bg2)',
            color: 'var(--text)', fontSize: 16, outline: 'none',
            fontFamily: 'inherit', WebkitAppearance: 'none',
          }}
        />
        <button
          onClick={addItem}
          disabled={adding || !newText.trim()}
          style={{
            width: 54, height: 54, borderRadius: 12, flexShrink: 0,
            background: newText.trim() ? 'var(--accent)' : 'var(--bg2)',
            border: '1px solid var(--border)',
            color: newText.trim() ? '#fff' : 'var(--muted)',
            fontSize: 26, cursor: newText.trim() ? 'pointer' : 'default',
            transition: 'background 0.15s, color 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          +
        </button>
      </div>

      {/* Empty state */}
      {sorted.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14, padding: '48px 0' }}>
          Список порожній — додайте перший товар!
        </div>
      )}

      {/* Unchecked items */}
      {unchecked.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: checked.length ? 16 : 0 }}>
          {unchecked.map(item => (
            <ItemRow
              key={item.id}
              item={item}
              sliding={slidingIn.has(item.id)}
              fading={fadingOut.has(item.id)}
              onTap={handleTap}
            />
          ))}
        </div>
      )}

      {/* Divider */}
      {unchecked.length > 0 && checked.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0', position: 'relative' }}>
          <span style={{
            position: 'absolute', left: '50%', top: -9, transform: 'translateX(-50%)',
            background: 'var(--bg)', padding: '0 10px',
            fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            Куплено
          </span>
        </div>
      )}

      {/* Checked items */}
      {checked.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {checked.map(item => (
            <ItemRow
              key={item.id}
              item={item}
              sliding={slidingIn.has(item.id)}
              fading={fadingOut.has(item.id)}
              onTap={handleTap}
            />
          ))}
        </div>
      )}

      {/* Counter */}
      {sorted.length > 0 && (
        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
          {unchecked.length > 0 ? `Залишилось: ${unchecked.length}` : '✓ Все куплено!'}
          {checked.length > 0 && ` · Куплено: ${checked.length}`}
        </div>
      )}

      {/* Group / Link section */}
      <div style={{ marginTop: 36 }}>
        <button
          onClick={() => setShowLinkSection(s => !s)}
          style={{
            width: '100%', padding: '11px 16px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--bg2)',
            color: 'var(--muted)', fontSize: 13, fontWeight: 500,
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 8,
          }}
        >
          <span>👥 Спільний список</span>
          <span style={{ fontSize: 11 }}>{showLinkSection ? '▲' : '▼'}</span>
        </button>

        {showLinkSection && (
          <div style={{
            marginTop: 8, padding: '16px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--bg2)',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            {/* Current partners */}
            {partners.length > 0 ? (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  Спільний список з:
                </div>
                {partners.map(m => (
                  <div key={m.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 0', borderBottom: '1px solid var(--border)',
                  }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{displayName(m.email)}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{m.email}</div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>● онлайн</span>
                  </div>
                ))}
                <button
                  onClick={handleUnlink}
                  style={{
                    marginTop: 12, width: '100%', padding: '9px 0', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--muted)', fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Від'єднатись
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                У тебе особистий список. Запроси когось, щоб ділитись.
              </div>
            )}

            {/* Invite form */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Запросити за email
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={inviteEmail}
                  onChange={e => { setInviteEmail(e.target.value); setInviteStatus(null) }}
                  onKeyDown={e => e.key === 'Enter' && handleSendInvite()}
                  placeholder="email@..."
                  type="email"
                  autoComplete="off"
                  style={{
                    flex: 1, padding: '10px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--bg)',
                    color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'inherit',
                  }}
                />
                <button
                  onClick={handleSendInvite}
                  disabled={inviteSending || !inviteEmail.trim()}
                  style={{
                    padding: '10px 16px', borderRadius: 8, border: 'none',
                    background: inviteEmail.trim() ? 'var(--accent)' : 'var(--border)',
                    color: '#fff', fontSize: 13, fontWeight: 600,
                    cursor: inviteEmail.trim() ? 'pointer' : 'default',
                    opacity: inviteSending ? 0.6 : 1,
                    flexShrink: 0,
                  }}
                >
                  {inviteSending ? '...' : 'Запросити'}
                </button>
              </div>
              {inviteStatus && (
                <div style={{
                  marginTop: 8, fontSize: 13,
                  color: inviteStatus.ok ? 'var(--green)' : 'var(--red, #e55)',
                }}>
                  {inviteStatus.msg}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function OnlineDot({ label, active }: { label: string; active: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted)' }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: active ? 'var(--green)' : 'var(--border)',
        display: 'inline-block', flexShrink: 0,
        boxShadow: active ? '0 0 5px rgba(var(--green-rgb, 90,154,106),0.5)' : 'none',
      }} />
      {label}
    </div>
  )
}

function ItemRow({ item, sliding, fading, onTap }: {
  item: ShoppingItem; sliding: boolean; fading: boolean; onTap: (item: ShoppingItem) => void
}) {
  return (
    <div
      onClick={() => onTap(item)}
      className={sliding ? 'shopping-slide-in' : fading ? 'shopping-fade-out' : ''}
      style={{
        padding: '14px 16px', borderRadius: 12,
        background: 'var(--bg2)',
        border: '1.5px solid var(--border)',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 12,
        opacity: fading ? 0 : 1,
        transform: fading ? 'translateY(-10px)' : 'none',
        transition: fading ? 'opacity 0.32s ease, transform 0.32s ease' : 'none',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{
        width: 24, height: 24, borderRadius: 7, flexShrink: 0,
        border: `2px solid ${item.checked ? 'var(--green)' : 'var(--border)'}`,
        background: item.checked ? 'var(--green)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.2s',
        color: '#fff', fontSize: 13, fontWeight: 700,
      }}>
        {item.checked && '✓'}
      </div>
      <span style={{
        flex: 1, fontSize: 16,
        color: item.checked ? 'var(--muted)' : 'var(--text)',
        textDecoration: item.checked ? 'line-through' : 'none',
        textDecorationColor: 'var(--muted)',
        transition: 'color 0.25s',
      }}>
        {item.text}
      </span>
      {item.checked && (
        <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0, opacity: 0.6 }}>
          ✕
        </span>
      )}
    </div>
  )
}
