'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 16px' }}>
        {/* Header */}
        <div className="text-center mb-10">
          <h1 style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '22px',
            color: 'var(--accent2)',
            textShadow: '0 0 20px rgba(6,182,212,0.5)',
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

        {/* Login box */}
        <div className="pixel-card" style={{ padding: '28px' }}>
          <div style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '9px',
            color: 'var(--muted)',
            marginBottom: '20px',
            borderBottom: '1px solid var(--border)',
            paddingBottom: '12px',
          }}>
            LOGIN
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="pixel-label">Email</label>
              <input
                className="pixel-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="user@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="pixel-label">Password</label>
              <input
                className="pixel-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.1)',
                border: '2px solid var(--red)',
                padding: '10px 12px',
                fontFamily: "'VT323', monospace",
                fontSize: '16px',
                color: 'var(--red)',
              }}>
                ⚠ {error}
              </div>
            )}

            <button
              type="submit"
              className="pixel-btn pixel-btn-primary"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center', marginTop: '4px' }}
            >
              {loading ? 'LOGGING IN...' : '> LOGIN'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '14px', marginTop: '20px' }}>
          lifekafe.app © 2025
        </p>
      </div>
    </div>
  )
}
