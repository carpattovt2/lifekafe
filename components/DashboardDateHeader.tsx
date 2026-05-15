'use client'

import { useEffect, useState } from 'react'
import { useLanguage } from '@/lib/LanguageContext'

export default function DashboardDateHeader() {
  const { lang, t } = useLanguage()
  const [dateStr, setDateStr] = useState('')

  useEffect(() => {
    const now = new Date()
    const locale = lang === 'ua' ? 'uk-UA' : 'en-US'
    setDateStr(now.toLocaleDateString(locale, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }))
  }, [lang])

  if (!dateStr) return null

  return (
    <div style={{ marginBottom: '28px' }}>
      <h1 style={{
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '12px',
        color: 'var(--c-dash)',
        marginBottom: '6px',
        textShadow: '0 0 14px rgba(34,211,238,0.45)',
        textTransform: 'uppercase',
      }}>
        {dateStr}
      </h1>
      <div style={{ color: 'var(--muted)', fontSize: '16px' }}>
        {t.common.systemReady}<span className="blink">_</span>
      </div>
    </div>
  )
}
