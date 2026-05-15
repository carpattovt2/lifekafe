'use client'

import { useEffect, useState } from 'react'
import { useLanguage } from '@/lib/LanguageContext'

type Quote = { content: string; author: string }

const LOCAL_QUOTES: Quote[] = [
  { content: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { content: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { content: 'Life is what happens when you\'re busy making other plans.', author: 'John Lennon' },
  { content: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  { content: 'In the middle of every difficulty lies opportunity.', author: 'Albert Einstein' },
  { content: 'Whether you think you can or think you can\'t, you\'re right.', author: 'Henry Ford' },
  { content: 'Your time is limited, so don\'t waste it living someone else\'s life.', author: 'Steve Jobs' },
  { content: 'The best time to plant a tree was 20 years ago. The second best time is now.', author: 'Chinese Proverb' },
  { content: 'Strive not to be a success, but rather to be of value.', author: 'Albert Einstein' },
  { content: 'You miss 100% of the shots you don\'t take.', author: 'Wayne Gretzky' },
  { content: 'Do one thing every day that scares you.', author: 'Eleanor Roosevelt' },
  { content: 'Well done is better than well said.', author: 'Benjamin Franklin' },
]

function randomLocal(): Quote {
  return LOCAL_QUOTES[Math.floor(Math.random() * LOCAL_QUOTES.length)]
}

export default function QuoteWidget() {
  const { t } = useLanguage()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const bust = Date.now()
    fetch(`https://api.quotable.io/random?_=${bust}`, { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error('bad response')
        return r.json()
      })
      .then(d => {
        if (d?.content && d?.author) {
          setQuote({ content: d.content, author: d.author })
        } else {
          setQuote(randomLocal())
        }
      })
      .catch(() => setQuote(randomLocal()))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="pixel-card card-dash" style={{ gridColumn: '1 / -1' }}>
      <div className="widget-label" style={{ color: 'var(--c-dash)' }}>{t.dashboard.quote}</div>
      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: '18px' }}>Loading<span className="blink">_</span></div>
      ) : quote ? (
        <div>
          <div
            className="quote-text"
            style={{
              fontSize: '20px',
              color: 'var(--text)',
              lineHeight: 1.6,
              marginBottom: '10px',
              borderLeft: '3px solid var(--c-dash)',
              paddingLeft: '12px',
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
              whiteSpace: 'normal',
            }}
          >
            "{quote.content}"
          </div>
          <div style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '8px',
            color: 'var(--c-dash)',
            wordBreak: 'break-word',
          }}>
            — {quote.author}
          </div>
        </div>
      ) : null}
    </div>
  )
}
