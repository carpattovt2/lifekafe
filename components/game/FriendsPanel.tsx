'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/LanguageContext'

type Profile = {
  id: string
  user_id: string
  email: string | null
  nickname: string
}

type FriendEntry = {
  friendship_id: string
  profile: Profile
}

type PendingRequest = {
  friendship_id: string
  profile: Profile
}

type SearchStatus = 'idle' | 'not-found' | 'self' | 'found' | 'friends' | 'pending-sent' | 'pending-received'

export default function FriendsPanel({ onBack }: { onBack?: () => void }) {
  const supabase = createClient()
  const { t } = useLanguage()
  const tf = t.friends

  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState('')
  const [myProfile, setMyProfile] = useState<Profile | null>(null)
  const [nicknameInput, setNicknameInput] = useState('')
  const [editingNickname, setEditingNickname] = useState(false)
  const [savingNickname, setSavingNickname] = useState(false)

  const [searchEmail, setSearchEmail] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResultProfile, setSearchResultProfile] = useState<Profile | null>(null)
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle')
  const [addingFriend, setAddingFriend] = useState(false)

  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([])
  const [friends, setFriends] = useState<FriendEntry[]>([])
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      setUserEmail(user.email ?? '')

      const { data: existing } = await supabase
        .from('game_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (existing) {
        if (!existing.email && user.email) {
          await supabase.from('game_profiles').update({ email: user.email }).eq('user_id', user.id)
          existing.email = user.email
        }
        setMyProfile(existing)
        setNicknameInput(existing.nickname || '')
      } else {
        const { data: created } = await supabase
          .from('game_profiles')
          .insert({ user_id: user.id, email: user.email ?? '', nickname: '' })
          .select('*')
          .single()
        if (created) {
          setMyProfile(created)
          setNicknameInput('')
        }
      }
    }
    init()
  }, [])

  const loadData = useCallback(async (uid: string) => {
    const { data: pendingRows } = await supabase
      .from('friendships')
      .select('id, requester_id, receiver_id, status')
      .eq('receiver_id', uid)
      .eq('status', 'pending')

    if (pendingRows) {
      const pending = (await Promise.all(
        pendingRows.map(async (row) => {
          const { data: profile } = await supabase
            .from('game_profiles')
            .select('*')
            .eq('user_id', row.requester_id)
            .single()
          if (!profile) return null
          return { friendship_id: row.id, profile: profile as Profile }
        })
      )).filter(Boolean) as PendingRequest[]
      setPendingRequests(pending)
    }

    const { data: friendRows } = await supabase
      .from('friendships')
      .select('id, requester_id, receiver_id')
      .or(`requester_id.eq.${uid},receiver_id.eq.${uid}`)
      .eq('status', 'accepted')

    if (friendRows) {
      const friendList = (await Promise.all(
        friendRows.map(async (row) => {
          const otherId = row.requester_id === uid ? row.receiver_id : row.requester_id
          const { data: profile } = await supabase
            .from('game_profiles')
            .select('*')
            .eq('user_id', otherId)
            .single()
          if (!profile) return null
          return { friendship_id: row.id, profile: profile as Profile }
        })
      )).filter(Boolean) as FriendEntry[]
      setFriends(friendList)
    }
  }, [supabase])

  useEffect(() => {
    if (!userId) return
    loadData(userId)

    const channel = supabase
      .channel('friends-panel-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => loadData(userId))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, loadData])

  async function saveNickname() {
    if (!userId || !nicknameInput.trim()) return
    setSavingNickname(true)
    const { data } = await supabase
      .from('game_profiles')
      .update({ nickname: nicknameInput.trim() })
      .eq('user_id', userId)
      .select('*')
      .single()
    if (data) setMyProfile(data)
    setSavingNickname(false)
    setEditingNickname(false)
  }

  async function searchFriend() {
    if (!searchEmail.trim() || !userId) return
    setSearching(true)
    setSearchResultProfile(null)
    setSearchStatus('idle')

    if (searchEmail.trim().toLowerCase() === userEmail.toLowerCase()) {
      setSearchStatus('self')
      setSearching(false)
      return
    }

    const { data: profile } = await supabase
      .from('game_profiles')
      .select('*')
      .ilike('email', searchEmail.trim())
      .single()

    if (!profile) {
      setSearchStatus('not-found')
      setSearching(false)
      return
    }

    const { data: friendship } = await supabase
      .from('friendships')
      .select('*')
      .or(
        `and(requester_id.eq.${userId},receiver_id.eq.${profile.user_id}),` +
        `and(requester_id.eq.${profile.user_id},receiver_id.eq.${userId})`
      )
      .maybeSingle()

    let status: SearchStatus = 'found'
    if (friendship) {
      if (friendship.status === 'accepted') status = 'friends'
      else if (friendship.requester_id === userId) status = 'pending-sent'
      else status = 'pending-received'
    }

    setSearchResultProfile(profile as Profile)
    setSearchStatus(status)
    setSearching(false)
  }

  async function sendFriendRequest(receiverUserId: string) {
    if (!userId) return
    setAddingFriend(true)
    await supabase.from('friendships').insert({
      requester_id: userId,
      receiver_id: receiverUserId,
      status: 'pending',
    })
    await supabase.from('friend_notifications').insert({
      user_id: receiverUserId,
      from_user_id: userId,
      type: 'friend_request',
    })
    setSearchStatus('pending-sent')
    setAddingFriend(false)
  }

  async function acceptRequest(friendshipId: string, fromUserId: string) {
    if (!userId) return
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId)
    await supabase.from('friend_notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('from_user_id', fromUserId)
    await loadData(userId)
  }

  async function declineRequest(friendshipId: string, fromUserId: string) {
    if (!userId) return
    await supabase.from('friendships').delete().eq('id', friendshipId)
    await supabase.from('friend_notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('from_user_id', fromUserId)
    await loadData(userId)
  }

  async function removeFriend(friendshipId: string) {
    if (!userId) return
    await supabase.from('friendships').delete().eq('id', friendshipId)
    setConfirmRemoveId(null)
    await loadData(userId)
  }

  const displayName = (p: Profile) => p.nickname || p.email || '?'

  const inputStyle: React.CSSProperties = {
    flex: 1,
    background: 'var(--bg)',
    border: '2px solid var(--border)',
    color: 'var(--text)',
    padding: '8px 12px',
    fontFamily: "'Inter', sans-serif",
    fontSize: 20,
    outline: 'none',
    minWidth: 0,
  }

  const sectionLabel: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif",
    fontSize: 9,
    color: 'var(--muted)',
    marginBottom: 12,
    letterSpacing: '0.06em',
  }

  return (
    <div style={{ maxWidth: 580, margin: '0 auto', padding: '32px 16px' }}>
      {onBack && (
        <button onClick={onBack} className="pixel-btn" style={{ marginBottom: 20, fontSize: 9, padding: '8px 14px' }}>
          {tf.back}
        </button>
      )}

      <h1 style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: 'var(--c-journal)', marginBottom: 16, textAlign: 'center' }}>
        👥 {tf.title}
      </h1>

      {/* ── No-nickname banner (1b) ──────────────────────────────────────────── */}
      {myProfile !== null && !myProfile?.nickname && (
        <div style={{
          background: 'linear-gradient(135deg, #dc2626, #b45309)',
          border: '2px solid #ef4444',
          padding: '12px 16px',
          marginBottom: 14,
          fontFamily: "'Inter', sans-serif",
          fontSize: 9,
          color: '#fff',
          letterSpacing: '0.04em',
          lineHeight: 1.6,
          boxShadow: '0 0 16px rgba(239,68,68,0.4)',
        }}>
          {tf.noNicknameBanner}
        </div>
      )}

      {/* ── My Nickname ─────────────────────────────────────────────────────── */}
      <div className="pixel-card" style={{ padding: 16, marginBottom: 14 }}>
        <div style={sectionLabel}>{tf.myNickname}</div>
        {!editingNickname && myProfile?.nickname ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 24, color: 'var(--text)', flex: 1 }}>
              {myProfile.nickname}
            </span>
            <button className="pixel-btn" onClick={() => setEditingNickname(true)} style={{ fontSize: 9, padding: '7px 12px' }}>
              {tf.editNickname}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={nicknameInput}
              onChange={e => setNicknameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveNickname()}
              placeholder={tf.setNickname}
              style={inputStyle}
            />
            <button
              className="pixel-btn pixel-btn-success"
              onClick={saveNickname}
              disabled={savingNickname || !nicknameInput.trim()}
              style={{ fontSize: 9, padding: '8px 14px', whiteSpace: 'nowrap' }}
            >
              {savingNickname ? '...' : tf.saveNickname}
            </button>
            {editingNickname && (
              <button
                className="pixel-btn"
                onClick={() => { setEditingNickname(false); setNicknameInput(myProfile?.nickname || '') }}
                style={{ fontSize: 9, padding: '8px 10px' }}
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Search ──────────────────────────────────────────────────────────── */}
      <div className="pixel-card" style={{ padding: 16, marginBottom: 14 }}>
        <div style={sectionLabel}>{tf.searchTitle}</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: searchStatus !== 'idle' ? 12 : 0 }}>
          <input
            value={searchEmail}
            onChange={e => setSearchEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchFriend()}
            placeholder={tf.searchPlaceholder}
            style={inputStyle}
          />
          <button
            className="pixel-btn"
            onClick={searchFriend}
            disabled={searching || !searchEmail.trim()}
            style={{ fontSize: 9, padding: '8px 14px', whiteSpace: 'nowrap' }}
          >
            {searching ? '...' : tf.searchBtn}
          </button>
        </div>

        {searchStatus === 'not-found' && (
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 19, color: 'var(--red)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            ✗ {tf.notFound}
          </div>
        )}
        {searchStatus === 'self' && (
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 19, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            {tf.thatsYou}
          </div>
        )}
        {searchResultProfile && ['found','friends','pending-sent','pending-received'].includes(searchStatus) && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            {/* 1a: orange warning if no nickname */}
            {!searchResultProfile.nickname && (
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 17, color: 'var(--orange)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                ⚠ {tf.noNicknameWarning}
              </div>
            )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, color: 'var(--text)' }}>
                {searchResultProfile.nickname || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>—</span>}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{searchResultProfile.email}</div>
            </div>
            {searchStatus === 'found' && (
              <button
                className="pixel-btn pixel-btn-success"
                onClick={() => sendFriendRequest(searchResultProfile.user_id)}
                disabled={addingFriend}
                style={{ fontSize: 9, padding: '8px 12px', whiteSpace: 'nowrap' }}
              >
                {addingFriend ? '...' : tf.addFriend}
              </button>
            )}
            {searchStatus === 'friends' && (
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 19, color: 'var(--green)' }}>✓ {tf.alreadyFriends}</span>
            )}
            {searchStatus === 'pending-sent' && (
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 19, color: 'var(--muted)' }}>⏳ {tf.requestSent}</span>
            )}
            {searchStatus === 'pending-received' && (
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 19, color: 'var(--c-dash)' }}>⏳ {tf.requestSent}</span>
            )}
          </div>
          </div>
        )}
      </div>

      {/* ── Pending Requests ────────────────────────────────────────────────── */}
      {pendingRequests.length > 0 && (
        <div className="pixel-card card-dash" style={{ padding: 16, marginBottom: 14 }}>
          <div style={{ ...sectionLabel, color: 'var(--c-dash)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {tf.pendingTitle}
            <span style={{ background: 'var(--c-dash)', color: '#000', fontSize: 9, padding: '2px 7px', fontFamily: "'Inter', sans-serif" }}>
              {pendingRequests.length}
            </span>
          </div>
          {pendingRequests.map(({ friendship_id, profile }) => (
            <div key={friendship_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 21, color: 'var(--text)' }}>{displayName(profile)}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{profile.email}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="pixel-btn pixel-btn-success" onClick={() => acceptRequest(friendship_id, profile.user_id)} style={{ fontSize: 9, padding: '7px 10px', whiteSpace: 'nowrap' }}>
                  {tf.accept}
                </button>
                <button className="pixel-btn pixel-btn-danger" onClick={() => declineRequest(friendship_id, profile.user_id)} style={{ fontSize: 9, padding: '7px 10px', whiteSpace: 'nowrap' }}>
                  {tf.decline}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Friends List ─────────────────────────────────────────────────────── */}
      <div className="pixel-card" style={{ padding: 16 }}>
        <div style={sectionLabel}>{tf.friendsTitle}</div>
        {friends.length === 0 ? (
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 19, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>
            {tf.noFriends}
          </div>
        ) : (
          friends.map(({ friendship_id, profile }) => (
            <div key={friendship_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 21, color: 'var(--text)' }}>{displayName(profile)}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{profile.email}</div>
              </div>
              {confirmRemoveId === friendship_id ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="pixel-btn pixel-btn-danger" onClick={() => removeFriend(friendship_id)} style={{ fontSize: 9, padding: '7px 10px', whiteSpace: 'nowrap' }}>
                    {tf.confirmRemove}
                  </button>
                  <button className="pixel-btn" onClick={() => setConfirmRemoveId(null)} style={{ fontSize: 9, padding: '7px 8px' }}>✕</button>
                </div>
              ) : (
                <button
                  className="pixel-btn"
                  onClick={() => setConfirmRemoveId(friendship_id)}
                  style={{ fontSize: 9, padding: '7px 10px', color: 'var(--red)', borderColor: 'var(--red)', whiteSpace: 'nowrap' }}
                >
                  {tf.removeFriend}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
