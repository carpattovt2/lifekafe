'use client'

import { useState } from 'react'
import type { GameUnit, Row, Side, MagePath, CatapultPath, UnitClass, WarriorPath } from '@/lib/sacred/types'
import { buildFreeUnit } from '@/lib/sacred/game'

const CLASS_LABEL: Record<UnitClass, string> = {
  warrior: 'Воїн', archer: 'Лучник', mage: 'Маг', catapult: 'Катапульта',
}
const CLASS_MAX_LEVEL: Record<UnitClass, number> = {
  warrior: 5, archer: 3, mage: 5, catapult: 3,
}
const CLASS_DEFAULT_ROW: Record<UnitClass, Row> = {
  warrior: 0, archer: 1, mage: 1, catapult: 0,
}
const PALETTE_PORTRAITS: Record<UnitClass, string> = {
  warrior:  '/sacred/warriors/level1.jpg',
  archer:   '/sacred/archers/level1.jpg',
  mage:     '/sacred/mages/level1.jpg',
  catapult: '/sacred/catapults/level1.jpg',
}
const WARRIOR_PATH_ICON: Record<WarriorPath, string> = { paladin: '🛡', champion: '⚔' }
const WARRIOR_PATH_NAME: Record<WarriorPath, string> = { paladin: 'Паладін', champion: 'Чемпіон' }
const MAGE_PATH_LIST: MagePath[] = ['fire', 'water', 'earth', 'air']
const MAGE_PATH_ICON: Record<MagePath, string>  = { fire: '🔥', water: '💧', earth: '🌿', air: '💨' }
const MAGE_PATH_NAME: Record<MagePath, string>  = { fire: 'Вогонь', water: 'Вода', earth: 'Земля', air: 'Повітря' }
const CAT_PATH_ICON: Record<CatapultPath, string> = { ballista: '🏹', trebuchet: '⚙' }
const CAT_PATH_NAME: Record<CatapultPath, string> = { ballista: 'Балліста', trebuchet: 'Требюше' }
const ROW_LABEL: Record<number, string> = { 0: 'Передній ряд', 1: 'Дальній ряд' }
const ROW_SLOTS = 4
const MAX_UNITS = 8

type Phase = 'player' | 'ai'
type ConfigMode =
  | { mode: 'add';  cls: UnitClass }
  | { mode: 'edit'; unitId: string; cls: UnitClass }

function getPortraitSrc(cls: UnitClass, level: number, magePath?: MagePath, catapultPath?: CatapultPath, warriorPath?: WarriorPath): string {
  if (cls === 'warrior') {
    if (warriorPath === 'champion' && level >= 3) return `/sacred/warriors/champion/level${level}.jpg`
    return `/sacred/warriors/level${Math.min(level, 4)}.jpg`
  }
  if (cls === 'archer')   return `/sacred/archers/level${Math.min(level, 3)}.jpg`
  if (cls === 'mage')     return level === 1 || !magePath ? '/sacred/mages/level1.jpg' : `/sacred/mages/${magePath}/level${level}.jpg`
  if (cls === 'catapult') return level === 1 || !catapultPath ? '/sacred/catapults/level1.jpg' : `/sacred/catapults/${catapultPath}/level${level}.jpg`
  return '/sacred/warriors/level1.jpg'
}

function findFreeSlot(units: GameUnit[], preferRow: Row, hasCat: boolean, isCat: boolean): { row: Row; slot: number } | null {
  if (isCat) {
    if (!units.some(u => u.row === 0 && u.slot === 3)) return { row: 0, slot: 3 }
    return null
  }
  for (const row of [preferRow, 0, 1] as Row[]) {
    for (let slot = 0; slot < ROW_SLOTS; slot++) {
      if (hasCat && slot === 3) continue // slot 3 blocked in both rows when catapult present
      if (!units.some(u => u.row === row && u.slot === slot)) return { row, slot }
    }
  }
  return null
}

interface Props {
  onStart: (playerUnits: GameUnit[], aiUnits: GameUnit[]) => void
  onBack: () => void
}

export default function FreeBattleSetup({ onStart, onBack }: Props) {
  const [playerUnits, setPlayerUnits] = useState<GameUnit[]>([])
  const [aiUnits, setAiUnits]         = useState<GameUnit[]>([])
  const [phase, setPhase]             = useState<Phase>('player')
  const [configMode, setConfigMode]   = useState<ConfigMode | null>(null)
  const [cfgLevel, setCfgLevel]       = useState(1)
  const [cfgMagePath, setCfgMagePath]         = useState<MagePath>('fire')
  const [cfgCatapultPath, setCfgCatapultPath] = useState<CatapultPath>('ballista')
  const [cfgWarriorPath, setCfgWarriorPath]   = useState<WarriorPath>('paladin')

  const sideUnits    = phase === 'player' ? playerUnits : aiUnits
  const setSideUnits = phase === 'player' ? setPlayerUnits : setAiUnits
  const sideColor    = phase === 'player' ? '#6fa67a' : '#c07070'
  const sideLabel    = phase === 'player' ? 'Твоя армія' : 'Армія бота'

  function openAddConfig(cls: UnitClass) {
    setCfgLevel(1)
    setCfgMagePath('fire')
    setCfgCatapultPath('ballista')
    setCfgWarriorPath('paladin')
    setConfigMode({ mode: 'add', cls })
  }

  function openEditConfig(unitId: string) {
    const unit = sideUnits.find(u => u.id === unitId)
    if (!unit) return
    setCfgLevel(unit.level ?? 1)
    if (unit.magePath) setCfgMagePath(unit.magePath)
    if (unit.catapultPath) setCfgCatapultPath(unit.catapultPath)
    if (unit.warriorPath) setCfgWarriorPath(unit.warriorPath)
    setConfigMode({ mode: 'edit', unitId, cls: unit.class })
  }

  function handleGridUnitClick(unitId: string) {
    if (configMode) return
    openEditConfig(unitId)
  }

  function handleConfigConfirm() {
    if (!configMode) return
    const { cls } = configMode
    const level  = cfgLevel
    const mPath: MagePath | undefined      = (cls === 'mage'     && level >= 2) ? cfgMagePath     : undefined
    const cPath: CatapultPath | undefined  = (cls === 'catapult' && level >= 2) ? cfgCatapultPath : undefined
    const wPath: WarriorPath | undefined   = (cls === 'warrior'  && level >= 3) ? cfgWarriorPath  : undefined
    const side: Side = phase === 'player' ? 'player' : 'ai'
    const hasCat = sideUnits.some(u => u.class === 'catapult')
    const isCat  = cls === 'catapult'

    if (configMode.mode === 'add') {
      const pos = findFreeSlot(sideUnits, CLASS_DEFAULT_ROW[cls], hasCat, isCat)
      if (!pos) { setConfigMode(null); return }
      const newUnit = buildFreeUnit(cls, level, side, pos.row, pos.slot, mPath, cPath, wPath)
      setSideUnits(prev => [...prev, newUnit])
    } else {
      const unit    = sideUnits.find(u => u.id === configMode.unitId)!
      const updated = buildFreeUnit(cls, level, side, unit.row, unit.slot, mPath, cPath, wPath)
      setSideUnits(prev => prev.map(u => u.id === unit.id ? { ...updated, id: unit.id } : u))
    }
    setConfigMode(null)
  }

  function handleConfigRemove() {
    if (!configMode || configMode.mode !== 'edit') return
    setSideUnits(prev => prev.filter(u => u.id !== configMode.unitId))
    setConfigMode(null)
  }

  function handleNext() {
    if (phase === 'player') {
      if (playerUnits.length === 0) return
      setPhase('ai')
      setConfigMode(null)
    } else {
      if (aiUnits.length === 0) return
      onStart(playerUnits, aiUnits)
    }
  }

  function handleBack() {
    if (phase === 'ai') {
      setPhase('player')
      setConfigMode(null)
    } else {
      onBack()
    }
  }

  const cfgCls      = configMode?.cls
  const maxLevel    = cfgCls === 'warrior'
    ? (cfgWarriorPath === 'champion' ? 5 : 4)
    : (cfgCls ? CLASS_MAX_LEVEL[cfgCls] : 1)
  const cfgPortrait = cfgCls ? getPortraitSrc(
    cfgCls, cfgLevel,
    cfgCls === 'mage'     && cfgLevel >= 2 ? cfgMagePath     : undefined,
    cfgCls === 'catapult' && cfgLevel >= 2 ? cfgCatapultPath : undefined,
    cfgCls === 'warrior'  && cfgLevel >= 3 ? cfgWarriorPath  : undefined,
  ) : ''

  const CARD = 64
  const GAP  = 4

  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', minHeight: '100vh',
      background: '#0f0e09', color: '#f0e8d8',
      fontFamily: "'Inter', sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(240,232,216,0.1)', background: '#17150f' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#d4a85a', marginBottom: 2 }}>✦ Вільний бій</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: sideColor }}>{sideLabel}</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 16px' }}>

        {/* Palette */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(240,232,216,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            Натисни щоб додати
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['warrior', 'archer', 'mage', 'catapult'] as UnitClass[]).map(cls => {
              const full = sideUnits.length >= MAX_UNITS
              return (
                <button
                  key={cls}
                  onClick={() => !full && openAddConfig(cls)}
                  disabled={full}
                  style={{
                    flex: 1, padding: 0, border: '1.5px solid rgba(240,232,216,0.1)',
                    borderRadius: 10, overflow: 'hidden', background: 'rgba(240,232,216,0.03)',
                    cursor: full ? 'not-allowed' : 'pointer', opacity: full ? 0.35 : 1,
                    display: 'flex', flexDirection: 'column', alignItems: 'stretch',
                  }}
                >
                  <img src={PALETTE_PORTRAITS[cls]} alt={cls} style={{ width: '100%', height: 68, objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
                  <div style={{ fontSize: 9, color: 'rgba(240,232,216,0.55)', padding: '4px 0', fontWeight: 600, textAlign: 'center' }}>
                    + {CLASS_LABEL[cls]}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Grid */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(240,232,216,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            Натисни юніта щоб налаштувати або видалити
          </div>
          {([0, 1] as Row[]).map(row => (
            <div key={row} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: 'rgba(240,232,216,0.25)', marginBottom: 4 }}>{ROW_LABEL[row]}</div>
              <div style={{ display: 'flex', gap: GAP }}>
                {Array.from({ length: ROW_SLOTS }, (_, slot) => {
                  const unit = sideUnits.find(u => u.row === row && u.slot === slot)

                  if (unit) {
                    return (
                      <div
                        key={slot}
                        onClick={() => handleGridUnitClick(unit.id)}
                        style={{
                          width: CARD, height: CARD + 8, borderRadius: 8, flexShrink: 0,
                          cursor: 'pointer', overflow: 'hidden', position: 'relative',
                          border: '2px solid rgba(240,232,216,0.18)',
                          transition: 'all 0.12s',
                        }}
                      >
                        <img src={getPortraitSrc(unit.class, unit.level ?? 1, unit.magePath, unit.catapultPath, unit.warriorPath)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 38%, rgba(0,0,0,0.8) 100%)' }} />
                        <div style={{ position: 'absolute', bottom: 2, left: 0, right: 0, textAlign: 'center' }}>
                          <span style={{ fontSize: 7, fontWeight: 700, color: '#f0e8d8', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>lv{unit.level ?? 1}</span>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={slot}
                      style={{
                        width: CARD, height: CARD + 8, borderRadius: 8, flexShrink: 0,
                        background: 'rgba(240,232,216,0.02)',
                        border: '1.5px solid rgba(240,232,216,0.06)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <span style={{ fontSize: 12, color: 'rgba(240,232,216,0.08)' }}>·</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 10, color: 'rgba(240,232,216,0.2)', textAlign: 'center' }}>
          {sideUnits.length} / {MAX_UNITS} юнітів
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(240,232,216,0.1)', background: '#17150f', display: 'flex', gap: 10 }}>
        <button
          onClick={handleBack}
          style={{
            padding: '12px 18px', borderRadius: 10,
            border: '1px solid rgba(240,232,216,0.1)',
            background: 'transparent', color: 'rgba(240,232,216,0.45)', fontSize: 14, cursor: 'pointer',
          }}
        >
          ← {phase === 'ai' ? 'Свої' : 'Назад'}
        </button>
        <button
          onClick={handleNext}
          disabled={sideUnits.length === 0}
          style={{
            flex: 1, padding: '12px', borderRadius: 10, border: 'none',
            background: sideUnits.length === 0
              ? 'rgba(176,120,80,0.15)'
              : 'linear-gradient(135deg, #b07850, #8c5a38)',
            color: sideUnits.length === 0 ? 'rgba(255,255,255,0.25)' : '#fff',
            fontSize: 15, fontWeight: 700,
            cursor: sideUnits.length === 0 ? 'not-allowed' : 'pointer',
            boxShadow: sideUnits.length === 0 ? 'none' : '0 4px 16px rgba(176,120,80,0.35)',
          }}
        >
          {phase === 'player' ? 'Налаштувати бота →' : '⚔ До бою!'}
        </button>
      </div>

      {/* Config bottom sheet */}
      {configMode && cfgCls && (
        <>
          <div onClick={() => setConfigMode(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.62)', zIndex: 60 }} />
          <div style={{
            position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
            width: '100%', maxWidth: 560, background: '#17150f',
            borderRadius: '18px 18px 0 0', zIndex: 61, padding: '16px 20px 32px',
            fontFamily: "'Inter', sans-serif",
          }}>
            <div style={{ width: 36, height: 3, background: 'rgba(240,232,216,0.15)', borderRadius: 2, margin: '0 auto 16px' }} />

            {/* Preview + title */}
            <div style={{ display: 'flex', gap: 14, marginBottom: 16, alignItems: 'center' }}>
              <div style={{ width: 72, height: 88, borderRadius: 10, overflow: 'hidden', flexShrink: 0, border: '1px solid rgba(240,232,216,0.15)' }}>
                <img src={cfgPortrait} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#d4a85a', marginBottom: 4 }}>{CLASS_LABEL[cfgCls]}</div>
                <div style={{ fontSize: 12, color: 'rgba(240,232,216,0.4)' }}>
                  {configMode.mode === 'add' ? 'Додати юніта' : 'Налаштувати юніта'}
                </div>
              </div>
            </div>

            {/* Level selector */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.4)', marginBottom: 8 }}>Рівень</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {Array.from({ length: maxLevel }, (_, i) => i + 1).map(lv => (
                  <button
                    key={lv}
                    onClick={() => setCfgLevel(lv)}
                    style={{
                      width: 40, height: 40, borderRadius: 8, border: 'none',
                      background: cfgLevel === lv ? sideColor : 'rgba(240,232,216,0.08)',
                      color: cfgLevel === lv ? '#fff' : 'rgba(240,232,216,0.5)',
                      fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'all 0.12s',
                    }}
                  >
                    {lv}
                  </button>
                ))}
              </div>
            </div>

            {/* Mage path */}
            {cfgCls === 'mage' && cfgLevel >= 2 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.4)', marginBottom: 8 }}>Шлях</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {MAGE_PATH_LIST.map(p => (
                    <button
                      key={p}
                      onClick={() => setCfgMagePath(p)}
                      style={{
                        flex: 1, padding: '8px 4px', borderRadius: 8,
                        border: `1.5px solid ${cfgMagePath === p ? 'rgba(212,168,90,0.55)' : 'rgba(240,232,216,0.1)'}`,
                        background: cfgMagePath === p ? 'rgba(212,168,90,0.1)' : 'rgba(240,232,216,0.03)',
                        color: cfgMagePath === p ? '#d4a85a' : 'rgba(240,232,216,0.4)',
                        fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                        transition: 'all 0.12s',
                      }}
                    >
                      <span style={{ fontSize: 16 }}>{MAGE_PATH_ICON[p]}</span>
                      <span>{MAGE_PATH_NAME[p]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Warrior path */}
            {cfgCls === 'warrior' && cfgLevel >= 3 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.4)', marginBottom: 8 }}>Вітка</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['paladin', 'champion'] as WarriorPath[]).map(p => (
                    <button
                      key={p}
                      onClick={() => { setCfgWarriorPath(p); if (p === 'paladin' && cfgLevel > 4) setCfgLevel(4) }}
                      style={{
                        flex: 1, padding: '10px 8px', borderRadius: 8,
                        border: `1.5px solid ${cfgWarriorPath === p ? 'rgba(212,168,90,0.55)' : 'rgba(240,232,216,0.1)'}`,
                        background: cfgWarriorPath === p ? 'rgba(212,168,90,0.1)' : 'rgba(240,232,216,0.03)',
                        color: cfgWarriorPath === p ? '#d4a85a' : 'rgba(240,232,216,0.4)',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        transition: 'all 0.12s',
                      }}
                    >
                      <span style={{ fontSize: 18 }}>{WARRIOR_PATH_ICON[p]}</span>
                      <span>{WARRIOR_PATH_NAME[p]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Catapult path */}
            {cfgCls === 'catapult' && cfgLevel >= 2 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'rgba(240,232,216,0.4)', marginBottom: 8 }}>Тип</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['ballista', 'trebuchet'] as CatapultPath[]).map(p => (
                    <button
                      key={p}
                      onClick={() => setCfgCatapultPath(p)}
                      style={{
                        flex: 1, padding: '10px 8px', borderRadius: 8,
                        border: `1.5px solid ${cfgCatapultPath === p ? 'rgba(212,168,90,0.55)' : 'rgba(240,232,216,0.1)'}`,
                        background: cfgCatapultPath === p ? 'rgba(212,168,90,0.1)' : 'rgba(240,232,216,0.03)',
                        color: cfgCatapultPath === p ? '#d4a85a' : 'rgba(240,232,216,0.4)',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        transition: 'all 0.12s',
                      }}
                    >
                      <span style={{ fontSize: 18 }}>{CAT_PATH_ICON[p]}</span>
                      <span>{CAT_PATH_NAME[p]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              {configMode.mode === 'edit' && (
                <button
                  onClick={handleConfigRemove}
                  style={{
                    padding: '12px 18px', borderRadius: 10,
                    border: '1px solid rgba(192,112,112,0.3)',
                    background: 'rgba(192,112,112,0.08)',
                    color: '#c07070', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Видалити
                </button>
              )}
              <button
                onClick={handleConfigConfirm}
                style={{
                  flex: 1, padding: '13px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #b07850, #8c5a38)',
                  color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 4px 16px rgba(176,120,80,0.3)',
                }}
              >
                {configMode.mode === 'add' ? '+ Додати' : 'Зберегти'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
