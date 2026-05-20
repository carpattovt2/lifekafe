import type { CardBack } from '@/lib/game/types'

const STYLES: Record<CardBack, React.CSSProperties> = {
  night:   { background: '#0a0a2e', backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(255,215,0,0.22) 1.5px, transparent 1.5px), radial-gradient(circle at 70% 20%, rgba(255,215,0,0.18) 1px, transparent 1px), radial-gradient(circle at 50% 70%, rgba(255,215,0,0.2) 2px, transparent 2px), radial-gradient(circle at 85% 80%, rgba(255,215,0,0.15) 1px, transparent 1px)', backgroundSize: '40px 40px, 30px 30px, 50px 50px, 35px 35px' },
  elegant: { background: '#0d0d0d', backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(180,0,0,0.35) 10px, rgba(180,0,0,0.35) 11px), repeating-linear-gradient(-45deg, transparent, transparent 10px, rgba(180,0,0,0.35) 10px, rgba(180,0,0,0.35) 11px)' },
  dragon:  { background: '#0d2b1a', backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,215,0,0.18) 0, rgba(255,215,0,0.18) 1px, transparent 1px, transparent 14px), repeating-linear-gradient(90deg, rgba(255,215,0,0.18) 0, rgba(255,215,0,0.18) 1px, transparent 1px, transparent 14px)' },
  runes:   { background: '#1a0a2e', backgroundImage: 'repeating-linear-gradient(60deg, rgba(192,192,192,0.12) 0, rgba(192,192,192,0.12) 1px, transparent 1px, transparent 12px), repeating-linear-gradient(-60deg, rgba(192,192,192,0.12) 0, rgba(192,192,192,0.12) 1px, transparent 1px, transparent 12px), repeating-linear-gradient(0deg, rgba(192,192,192,0.08) 0, rgba(192,192,192,0.08) 1px, transparent 1px, transparent 12px)' },
  poker:   { background: '#6b0000', backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.45) 0, rgba(0,0,0,0.45) 2px, transparent 2px, transparent 14px), repeating-linear-gradient(-45deg, rgba(0,0,0,0.45) 0, rgba(0,0,0,0.45) 2px, transparent 2px, transparent 14px)' },
  sea:     { background: 'linear-gradient(180deg, #0a1a3e 0%, #0e2a55 100%)', backgroundImage: 'repeating-linear-gradient(170deg, rgba(100,200,255,0.12) 0, rgba(100,200,255,0.12) 2px, transparent 2px, transparent 20px)' },
  vip:     { background: '#050505', backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,180,80,0.1) 0, rgba(0,180,80,0.1) 2px, transparent 2px, transparent 10px), repeating-linear-gradient(-45deg, rgba(0,180,80,0.1) 0, rgba(0,180,80,0.1) 2px, transparent 2px, transparent 10px)', boxShadow: 'inset 0 0 8px rgba(0,180,80,0.2)' },
  vegas:   { background: '#3d2a00', backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(0,0,0,0.7) 20%, transparent 21%), radial-gradient(circle at 0% 50%, rgba(0,0,0,0.5) 20%, transparent 21%)', backgroundSize: '20px 20px, 20px 20px', backgroundPosition: '0 0, 10px 10px' },
}

export function renderCardBack(back: CardBack) {
  return <div style={{ width: '100%', height: '100%', borderRadius: 3, ...STYLES[back] }} />
}
