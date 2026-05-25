'use client'

import { useState, useEffect, useRef } from 'react'

const SLIDES = [
  {
    emoji: '🛒',
    title: 'Кілька списків',
    body: 'Сільпо, АТБ, Дім — кожен окремо. Перемикайся у верхньому меню. Тягни щоб змінити порядок.',
  },
  {
    emoji: '✓',
    title: 'Тап — куплено',
    body: 'Натисни товар щоб відмітити. Натисни ще раз — видаляється. Є 4 секунди щоб скасувати.',
  },
  {
    emoji: '✋',
    title: 'Довгий натиск — редагувати',
    body: 'Утримай товар 0.6 секунди щоб змінити текст. На десктопі — утримати мишу.',
  },
  {
    emoji: '≡',
    title: 'Перетягни щоб впорядкувати',
    body: 'Тримай за ≡ і тягни товар вгору або вниз. Порядок зберігається для всіх учасників.',
  },
  {
    emoji: '👥',
    title: 'Спільні покупки',
    body: 'Запроси партнера в «Учасники та налаштування». Зміни видно одразу в обох без перезавантаження.',
  },
]

const LS_KEY = 'shopping_onboarding_v1'

interface Props {
  forceOpen?: boolean
  onClose?: () => void
}

export default function OnboardingSheet({ forceOpen = false, onClose }: Props) {
  const [open, setOpen] = useState(false)
  const [slide, setSlide] = useState(0)
  const startXRef = useRef(0)
  const deltaXRef = useRef(0)

  useEffect(() => {
    if (forceOpen) {
      setSlide(0)
      setOpen(true)
      return
    }
    if (!localStorage.getItem(LS_KEY)) {
      const t = setTimeout(() => setOpen(true), 500)
      return () => clearTimeout(t)
    }
  }, [forceOpen])

  function close() {
    setOpen(false)
    setSlide(0)
    if (!forceOpen) localStorage.setItem(LS_KEY, '1')
    onClose?.()
  }

  function next() {
    if (slide < SLIDES.length - 1) setSlide(s => s + 1)
    else close()
  }

  function prev() {
    if (slide > 0) setSlide(s => s - 1)
  }

  function onTouchStart(e: React.TouchEvent) {
    startXRef.current = e.touches[0].clientX
  }

  function onTouchMove(e: React.TouchEvent) {
    deltaXRef.current = e.touches[0].clientX - startXRef.current
  }

  function onTouchEnd() {
    const dx = deltaXRef.current
    deltaXRef.current = 0
    if (dx < -50) next()
    else if (dx > 50) prev()
  }

  if (!open) return null

  const s = SLIDES[slide]
  const isLast = slide === SLIDES.length - 1

  return (
    <>
      {/* Backdrop */}
      <div
        className="onboarding-backdrop"
        onClick={close}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.48)',
          zIndex: 400,
        }}
      />

      {/* Sheet */}
      <div
        className="onboarding-sheet"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          maxWidth: 560, margin: '0 auto',
          background: 'var(--bg2)',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -4px 40px rgba(0,0,0,0.2)',
          zIndex: 401,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Drag handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '12px auto 0' }} />

        {/* Close × */}
        <button
          onClick={close}
          style={{
            position: 'absolute', top: 16, right: 16,
            width: 28, height: 28, borderRadius: '50%',
            border: 'none', background: 'var(--border)', color: 'var(--muted)',
            fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'inherit', lineHeight: 1,
          }}
        >×</button>

        {/* Slide content */}
        <div style={{ padding: '24px 32px 0', textAlign: 'center', minHeight: 172 }}>
          <div style={{ fontSize: 48, marginBottom: 14, lineHeight: 1 }}>{s.emoji}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>{s.title}</div>
          <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 320, margin: '0 auto' }}>{s.body}</div>
        </div>

        {/* Dot indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, margin: '20px 0 16px' }}>
          {SLIDES.map((_, i) => (
            <div
              key={i}
              onClick={() => setSlide(i)}
              style={{
                height: 6,
                width: i === slide ? 20 : 6,
                borderRadius: 3,
                background: i === slide ? 'var(--accent)' : 'var(--border)',
                transition: 'width 0.2s, background 0.2s',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>

        {/* Navigation buttons */}
        <div style={{ display: 'flex', gap: 8, padding: '0 20px 24px' }}>
          {slide > 0 ? (
            <button onClick={prev} style={{
              flex: 1, padding: '13px 0', borderRadius: 12,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--muted)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
            }}>← Назад</button>
          ) : (
            <button onClick={close} style={{
              flex: 1, padding: '13px 0', borderRadius: 12,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--muted)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
            }}>Пропустити</button>
          )}
          <button onClick={next} style={{
            flex: 2, padding: '13px 0', borderRadius: 12,
            border: 'none', background: 'var(--accent)', color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {isLast ? 'Зрозуміло 👍' : 'Далі →'}
          </button>
        </div>
      </div>
    </>
  )
}
