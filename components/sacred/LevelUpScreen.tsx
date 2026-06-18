'use client'

import { useEffect, useState } from 'react'
import type { GameUnit } from '@/lib/sacred/types'

function getPortrait(unit: GameUnit): string {
  const lvl = unit.level ?? 1
  if (unit.class === 'warrior') {
    if (unit.warriorPath === 'champion' && lvl >= 3) return `/sacred/warriors/champion/level${lvl}.jpg`
    return `/sacred/warriors/level${Math.min(lvl, 4)}.jpg`
  }
  if (unit.class === 'archer')  return `/sacred/archers/level${Math.min(lvl, 3)}.jpg`
  if (unit.class === 'mage')
    return lvl > 1 && unit.magePath ? `/sacred/mages/${unit.magePath}/level${lvl}.jpg` : '/sacred/mages/level1.jpg'
  if (unit.class === 'catapult')
    return lvl > 1 && unit.catapultPath ? `/sacred/catapults/${unit.catapultPath}/level${lvl}.jpg` : '/sacred/catapults/level1.jpg'
  return ''
}

const CLASS_UA: Record<string, string> = {
  warrior: 'Воїн', archer: 'Лучник', mage: 'Маг', catapult: 'Катапульта',
}

interface Props {
  units: GameUnit[]
  onDone: () => void
}

interface Particle { id: number; x: number; y: number; vx: number; vy: number; life: number; size: number; color: string }

const COLORS = ['#d4a85a', '#f5d37a', '#fff8e7', '#e8c46a', '#ffeaa0']

export default function LevelUpScreen({ units, onDone }: Props) {
  const [visible,   setVisible]   = useState(false)
  const [particles, setParticles] = useState<Particle[]>([])
  const [cardIdx,   setCardIdx]   = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60)
    return () => clearTimeout(t)
  }, [])

  // Spawn particles on mount
  useEffect(() => {
    const ps: Particle[] = Array.from({ length: 48 }, (_, i) => ({
      id: i,
      x:    40 + Math.random() * 20,
      y:    40 + Math.random() * 20,
      vx:   (Math.random() - 0.5) * 3.2,
      vy:   -(Math.random() * 2.8 + 0.8),
      life: 0.8 + Math.random() * 0.8,
      size: 4 + Math.random() * 7,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }))
    setParticles(ps)
  }, [cardIdx])

  // Animate particles
  useEffect(() => {
    if (particles.length === 0) return
    const id = requestAnimationFrame(() => {
      setParticles(prev =>
        prev
          .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.12, life: p.life - 0.022 }))
          .filter(p => p.life > 0)
      )
    })
    return () => cancelAnimationFrame(id)
  }, [particles])

  const unit = units[cardIdx]
  if (!unit) return null

  function handleNext() {
    if (cardIdx < units.length - 1) {
      setCardIdx(i => i + 1)
    } else {
      onDone()
    }
  }

  return (
    <div
      onClick={handleNext}
      style={{
        position:        'fixed', inset: 0, zIndex: 200,
        background:      'rgba(10,9,6,0.94)',
        display:         'flex', flexDirection: 'column',
        alignItems:      'center', justifyContent: 'center',
        fontFamily:      "'Inter', sans-serif",
        cursor:          'pointer',
        opacity:         visible ? 1 : 0,
        transition:      'opacity 0.35s ease',
        userSelect:      'none',
      }}
    >
      {/* Particles */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {particles.map(p => (
          <div key={p.id} style={{
            position:     'absolute',
            left:         `${p.x}%`,
            top:          `${p.y}%`,
            width:        p.size,
            height:       p.size,
            borderRadius: '50%',
            background:   p.color,
            opacity:      Math.max(0, p.life),
            transform:    'translate(-50%,-50%)',
          }} />
        ))}
      </div>

      {/* Header */}
      <div style={{
        fontSize: 13, letterSpacing: 3, color: '#d4a85a', fontWeight: 700,
        textTransform: 'uppercase', marginBottom: 24, opacity: 0.8,
      }}>
        Підвищення рівня!
      </div>

      {/* Card */}
      <div style={{
        width:        200,
        borderRadius: 18,
        overflow:     'hidden',
        border:       '2px solid #d4a85a',
        boxShadow:    '0 0 40px rgba(212,168,90,0.45), 0 0 80px rgba(212,168,90,0.18)',
        marginBottom: 24,
        position:     'relative',
      }}>
        <img
          src={getPortrait(unit)}
          alt=""
          style={{ width: '100%', height: 240, objectFit: 'cover', objectPosition: 'center top', display: 'block' }}
        />
        {/* Level badge */}
        <div style={{
          position:   'absolute', top: 10, right: 10,
          background: '#d4a85a', color: '#0f0e09',
          borderRadius: 20, padding: '3px 10px',
          fontSize: 13, fontWeight: 800,
        }}>
          Рівень {unit.level}
        </div>
      </div>

      {/* Unit name */}
      <div style={{ fontSize: 20, fontWeight: 700, color: '#f0e8d8', marginBottom: 6 }}>
        {unit.name}
      </div>
      <div style={{ fontSize: 12, color: 'rgba(240,232,216,0.45)', marginBottom: 40 }}>
        {CLASS_UA[unit.class] ?? unit.class}
      </div>

      {/* Counter + hint */}
      {units.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {units.map((_, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: '50%',
              background: i === cardIdx ? '#d4a85a' : 'rgba(212,168,90,0.25)',
            }} />
          ))}
        </div>
      )}
      <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.3)' }}>
        {cardIdx < units.length - 1 ? 'Натисни для продовження' : 'Натисни щоб закрити'}
      </div>
    </div>
  )
}
