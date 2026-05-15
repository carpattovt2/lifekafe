'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Mode = 'login' | 'register'

const EMAIL_NOT_CONFIRMED = 'Email not confirmed'

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [registered, setRegistered] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  function switchMode(m: Mode) {
    setMode(m)
    setError('')
    setPassword('')
    setConfirmPassword('')
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      const msg = error.message.toLowerCase().includes('email not confirmed') || error.message.toLowerCase().includes('not confirmed')
        ? 'Please confirm your email before logging in. Check your inbox for the confirmation link.'
        : error.message
      setError(msg)
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setError(error.message)
    } else {
      setRegistered(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 16px' }}>
        {/* Header */}
        <div className="text-center mb-10">
          <h1 style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '22px',
            color: 'var(--c-dash)',
            textShadow: '0 0 20px rgba(34,211,238,0.5)',
            marginBottom: '12px',
            letterSpacing: '2px',
          }}>
            lifekafe
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '16px', fontFamily: "'VT323', monospace" }}>
            &gt; PERSONAL LIFE OS — v1.0
          </p>
          <div style={{ color: 'var(--accent)', fontSize: '12px', fontFamily: "'VT323', monospace", marginTop: '4px' }}>
            <span className="blink">█</span> AWAITING AUTHENTICATION
          </div>
        </div>

        <div className="pixel-card" style={{ padding: '28px' }}>
          {/* Tab switcher */}
          <div style={{ display: 'flex', marginBottom: '20px', borderBottom: '2px solid var(--border)', paddingBottom: '0' }}>
            {(['login', 'register'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: '9px',
                  padding: '8px 14px',
                  background: 'none',
                  border: 'none',
                  borderBottom: mode === m ? '2px solid var(--c-dash)' : '2px solid transparent',
                  color: mode === m ? 'var(--c-dash)' : 'var(--muted)',
                  cursor: 'pointer',
                  marginBottom: '-2px',
                  transition: 'color 0.15s',
                }}
              >
                {m === 'login' ? 'LOGIN' : 'REGISTER'}
              </button>
            ))}
          </div>

          {/* Confirmation message after registration */}
          {registered ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px' }}>✉</div>
              <div style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '9px',
                color: 'var(--c-weight)',
                lineHeight: 2,
              }}>
                CHECK YOUR EMAIL
              </div>
              <div style={{ fontSize: '18px', color: 'var(--text)', lineHeight: 1.6 }}>
                We sent a confirmation link to <span style={{ color: 'var(--c-dash)' }}>{email}</span>.
                Click the link to activate your account.
              </div>
              <div style={{ fontSize: '15px', color: 'var(--muted)' }}>
                After confirming, return here and log in.
              </div>
              <button
                type="button"
                className="pixel-btn pixel-btn-secondary"
                style={{ justifyContent: 'center', marginTop: '8px' }}
                onClick={() => { setRegistered(false); switchMode('login') }}
              >
                BACK TO LOGIN
              </button>
            </div>
          ) : mode === 'login' ? (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="pixel-label">Email</label>
                <input className="pixel-input" type="email" value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="user@example.com"
                  required autoComplete="email" />
              </div>
              <div>
                <label className="pixel-label">Password</label>
                <input className="pixel-input" type="password" value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                  required autoComplete="current-password" />
              </div>
              {error && <ErrorBox msg={error} />}
              <button type="submit" className="pixel-btn pixel-btn-primary" disabled={loading}
                style={{ width: '100%', justifyContent: 'center', marginTop: '4px' }}>
                {loading ? 'LOGGING IN...' : '> LOGIN'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="pixel-label">Email</label>
                <input className="pixel-input" type="email" value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="user@example.com"
                  required autoComplete="email" />
              </div>
              <div>
                <label className="pixel-label">Password</label>
                <input className="pixel-input" type="password" value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="min. 6 characters"
                  required autoComplete="new-password" />
              </div>
              <div>
                <label className="pixel-label">Confirm Password</label>
                <input className="pixel-input" type="password" value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••"
                  required autoComplete="new-password" />
              </div>
              {error && <ErrorBox msg={error} />}
              <button type="submit" className="pixel-btn pixel-btn-primary" disabled={loading}
                style={{ width: '100%', justifyContent: 'center', marginTop: '4px' }}>
                {loading ? 'CREATING ACCOUNT...' : '> CREATE ACCOUNT'}
              </button>
            </form>
          )}
        </div>

        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '14px', marginTop: '20px' }}>
          lifekafe.app © 2025
        </p>
      </div>
    </div>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div style={{
      background: 'rgba(248,113,113,0.1)',
      border: '2px solid var(--red)',
      padding: '10px 12px',
      fontFamily: "'VT323', monospace",
      fontSize: '16px',
      color: 'var(--red)',
      lineHeight: 1.5,
    }}>
      ⚠ {msg}
    </div>
  )
}
