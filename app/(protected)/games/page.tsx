import Link from 'next/link'

const GAMES = [
  {
    href: '/game',
    icon: '♦',
    title: 'Джокер',
    desc: 'Карткова гра для 2–4 гравців. Збирайте сети, використовуйте джокера і виходьте першим.',
    tags: ['Карти', 'Стратегія', 'Одиночна / Онлайн'],
    color: '#c4a040',
    bg: 'rgba(196,160,64,0.08)',
    border: 'rgba(196,160,64,0.25)',
  },
  {
    href: '/sacred',
    icon: '✦',
    title: 'Серафити',
    desc: 'Тактичний бій загонів. Обирайте армію, розставляйте бійців по рядах і перемагайте ворога.',
    tags: ['Тактика', 'Покрокова', 'Одиночна'],
    color: '#7aaa82',
    bg: 'rgba(122,170,130,0.08)',
    border: 'rgba(122,170,130,0.25)',
  },
]

export default function GamesPage() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 4 }}>
          🎮 Ігри
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Оберіть гру щоб почати</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {GAMES.map(g => (
          <Link
            key={g.href}
            href={g.href}
            style={{
              display: 'block',
              padding: '20px 22px',
              borderRadius: 14,
              border: `1px solid ${g.border}`,
              background: g.bg,
              textDecoration: 'none',
              color: 'var(--text)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            className="game-hub-card"
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 12, flexShrink: 0,
                background: `${g.color}22`,
                border: `1px solid ${g.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, color: g.color,
              }}>
                {g.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 5, color: g.color }}>
                  {g.title}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 10 }}>
                  {g.desc}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {g.tags.map(tag => (
                    <span key={tag} style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 20,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--muted)',
                    }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 18, flexShrink: 0, marginTop: 2 }}>›</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
