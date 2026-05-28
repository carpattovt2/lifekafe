import Link from 'next/link'

export default function GamesPage() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 4 }}>
          Ігри
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Оберіть гру щоб почати</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Joker */}
        <Link href="/game" style={{ display: 'block', textDecoration: 'none' }}>
          <div style={{
            borderRadius: 16, overflow: 'hidden',
            border: '1px solid rgba(196,160,64,0.3)',
            background: 'linear-gradient(135deg, #1c1508 0%, #221a08 100%)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
              {/* Left accent */}
              <div style={{
                width: 72, flexShrink: 0,
                background: 'linear-gradient(180deg, #c4a040 0%, #8c6820 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 36, color: '#1c1508',
              }}>
                ♦
              </div>
              {/* Content */}
              <div style={{ flex: 1, padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#d4a85a', letterSpacing: '-0.01em' }}>
                    Джокер
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(196,160,64,0.4)', fontWeight: 600 }}>v0.3</div>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(212,185,120,0.6)', lineHeight: 1.55, marginBottom: 10 }}>
                  Карткова гра для 2–4 гравців. Збирайте сети, використовуйте джокера і виходьте першим.
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['Карти', 'Стратегія', 'Одиночна / Онлайн'].map(tag => (
                    <span key={tag} style={{
                      fontSize: 10, padding: '3px 9px', borderRadius: 20,
                      background: 'rgba(196,160,64,0.12)',
                      border: '1px solid rgba(196,160,64,0.25)',
                      color: 'rgba(196,160,64,0.7)',
                    }}>{tag}</span>
                  ))}
                </div>
              </div>
              <div style={{ color: 'rgba(196,160,64,0.35)', fontSize: 18, flexShrink: 0, padding: '16px 14px 0 0', marginTop: 2 }}>›</div>
            </div>
          </div>
        </Link>

        {/* Seraphites */}
        <Link href="/sacred" style={{ display: 'block', textDecoration: 'none' }}>
          <div style={{
            borderRadius: 16, overflow: 'hidden',
            border: '1px solid rgba(212,168,90,0.25)',
            background: 'linear-gradient(135deg, #111008 0%, #18160a 100%)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
              {/* Left accent — portrait */}
              <div style={{
                width: 72, flexShrink: 0, overflow: 'hidden', position: 'relative',
                background: '#0a0906',
              }}>
                <img
                  src="/sacred/warriors/level4.jpg"
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }}
                />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, transparent 40%, rgba(17,16,8,0.6) 100%)' }} />
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  filter: 'drop-shadow(0 0 8px rgba(212,168,90,0.8))',
                }}>
                  <svg width="28" height="28" viewBox="0 0 108 108" fill="none">
                    <circle cx="54" cy="54" r="50" fill="none" stroke="#d4a85a" strokeWidth="2" opacity="0.6"/>
                    <path d="M54 8 L54 100 M8 54 L100 54" stroke="#d4a85a" strokeWidth="1.5" opacity="0.4"/>
                    <circle cx="54" cy="54" r="8" fill="#d4a85a" opacity="0.9"/>
                  </svg>
                </div>
              </div>
              {/* Content */}
              <div style={{ flex: 1, padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#d4a85a', letterSpacing: '-0.01em' }}>
                    Серафити
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(212,168,90,0.35)', fontWeight: 600 }}>v0.7</div>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(240,232,216,0.5)', lineHeight: 1.55, marginBottom: 10 }}>
                  Тактичний бій загонів. Обирайте армію, розставляйте бійців по рядах і перемагайте ворога.
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['Тактика', 'Покрокова', 'Одиночна'].map(tag => (
                    <span key={tag} style={{
                      fontSize: 10, padding: '3px 9px', borderRadius: 20,
                      background: 'rgba(212,168,90,0.08)',
                      border: '1px solid rgba(212,168,90,0.2)',
                      color: 'rgba(212,168,90,0.6)',
                    }}>{tag}</span>
                  ))}
                </div>
              </div>
              <div style={{ color: 'rgba(212,168,90,0.3)', fontSize: 18, flexShrink: 0, padding: '16px 14px 0 0', marginTop: 2 }}>›</div>
            </div>
          </div>
        </Link>

      </div>
    </div>
  )
}
