'use client'

import { useEffect, useState } from 'react'

const FALLBACK = {
  content: 'The secret of getting ahead is getting started.',
  author: 'Mark Twain',
}

type Quote = { content: string; author: string }

export default function QuoteWidget() {
  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('https://api.quotable.io/random')
      .then(r => r.json())
      .then(d => setQuote({ content: d.content, author: d.author }))
      .catch(() => setQuote(FALLBACK))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="pixel-card card-dash" style={{ gridColumn: '1 / -1' }}>
      <div className="widget-label" style={{ color: 'var(--c-dash)' }}>✦ QUOTE OF THE SESSION</div>
      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: '18px' }}>Loading<span className="blink">_</span></div>
      ) : quote ? (
        <div>
          <div style={{
            fontSize: '20px',
            color: 'var(--text)',
            lineHeight: 1.5,
            marginBottom: '8px',
            borderLeft: '3px solid var(--c-dash)',
            paddingLeft: '12px',
          }}>
            "{quote.content}"
          </div>
          <div style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '8px',
            color: 'var(--c-dash)',
          }}>
            — {quote.author}
          </div>
        </div>
      ) : null}
    </div>
  )
}
