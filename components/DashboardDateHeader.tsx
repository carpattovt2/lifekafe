'use client'

import { useEffect, useState } from 'react'

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function DashboardDateHeader() {
  const [dateStr, setDateStr] = useState('')

  useEffect(() => {
    const now = new Date()
    setDateStr(`${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`)
  }, [])

  if (!dateStr) return null

  return (
    <div style={{ marginBottom: '28px' }}>
      <h1 style={{
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '13px',
        color: 'var(--c-dash)',
        marginBottom: '6px',
        textShadow: '0 0 14px rgba(34,211,238,0.45)',
      }}>
        {dateStr}
      </h1>
      <div style={{ color: 'var(--muted)', fontSize: '16px' }}>
        &gt; SYSTEM READY<span className="blink">_</span>
      </div>
    </div>
  )
}
