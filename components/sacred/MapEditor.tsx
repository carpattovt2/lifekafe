'use client'

import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

type TerrainId = 'grass' | 'forest' | 'water' | 'shallow' | 'mountain' | 'desert' | 'road' | 'snow' | 'sand' | 'swamp'
type ToolId    = 'brush' | 'erase' | 'fill' | 'place' | 'select' | 'pan' | 'text'

interface ObjDef    { id: string; emoji: string; label: string }
interface PlacedObj { id: string; typeId: string; emoji: string; label: string; x: number; y: number; size: number }
interface MapLabel  { id: string; text: string; x: number; y: number; fontSize: number; color: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const W = 1400
const H = 900

const PARCHMENT = '#e8dbb0'

// Warm, desaturated parchment-friendly palette
const TERRAIN_COLOR: Record<TerrainId, string> = {
  grass:    '#8a9e52',
  forest:   '#4a6230',
  water:    '#4a7090',
  shallow:  '#6a98b2',
  mountain: '#8a7a68',
  desert:   '#c8a030',
  road:     '#7a5828',
  snow:     '#dedad0',
  sand:     '#cca84a',
  swamp:    '#5c6e3a',
}

const TERRAIN_DEFS: { id: TerrainId; label: string }[] = [
  { id: 'grass',    label: 'Поле'    },
  { id: 'forest',   label: 'Ліс'     },
  { id: 'water',    label: 'Море'    },
  { id: 'shallow',  label: 'Річка'   },
  { id: 'mountain', label: 'Гори'    },
  { id: 'desert',   label: 'Пустеля' },
  { id: 'swamp',    label: 'Болото'  },
  { id: 'sand',     label: 'Пісок'   },
  { id: 'road',     label: 'Дорога'  },
  { id: 'snow',     label: 'Сніг'    },
]

const OBJ_DEFS: ObjDef[] = [
  { id: 'castle',   emoji: '🏰', label: 'Замок'       },
  { id: 'city',     emoji: '🏙', label: 'Місто'       },
  { id: 'village',  emoji: '🏘', label: 'Село'        },
  { id: 'ruin',     emoji: '🏚', label: 'Руїни'       },
  { id: 'tower',    emoji: '🗼', label: 'Вежа'        },
  { id: 'dungeon',  emoji: '⚔️', label: 'Підземелля' },
  { id: 'camp',     emoji: '⛺', label: 'Табір'       },
  { id: 'mine',     emoji: '⛏️', label: 'Шахта'      },
  { id: 'bridge',   emoji: '🌉', label: 'Міст'        },
  { id: 'shrine',   emoji: '🛕', label: 'Вівтар'     },
  { id: 'portal',   emoji: '🌀', label: 'Портал'      },
  { id: 'skull',    emoji: '💀', label: 'Небезпека'   },
  { id: 'star',     emoji: '⭐', label: 'Ціль'        },
  { id: 'tree',     emoji: '🌲', label: 'Дерево'      },
  { id: 'peak',     emoji: '⛰️', label: 'Вершина'    },
  { id: 'dragon',   emoji: '🐉', label: 'Дракон'      },
  { id: 'scroll',   emoji: '📜', label: 'Артефакт'    },
  { id: 'crown',    emoji: '👑', label: 'Столиця'     },
]

const STORAGE_KEY = 'sacred-map-editor-v2'

// ── Texture helpers ───────────────────────────────────────────────────────────

function seededRng(seed: number) {
  let s = (seed * 1664525 + 1013904223) & 0x7fffffff
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff
    return s / 0x7fffffff
  }
}

function clamp(v: number) { return Math.max(0, Math.min(255, Math.round(v))) }

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

function makePatternCanvas(id: TerrainId | 'erase'): HTMLCanvasElement {
  const SZ  = 64
  const pat = document.createElement('canvas')
  pat.width = SZ; pat.height = SZ
  const pc = pat.getContext('2d')!

  const baseHex = id === 'erase' ? PARCHMENT : TERRAIN_COLOR[id]
  const [r, g, b] = hexToRgb(baseHex)

  pc.fillStyle = baseHex
  pc.fillRect(0, 0, SZ, SZ)

  // ── Noise layer (warm-shifted: less blue variation) ───────────────────────
  const img = pc.getImageData(0, 0, SZ, SZ)
  const d   = img.data
  const rng = seededRng(r + g * 3 + b * 7)
  for (let i = 0; i < SZ * SZ; i++) {
    const n = (rng() - 0.5) * 28
    d[i*4]   = clamp(d[i*4]   + n)
    d[i*4+1] = clamp(d[i*4+1] + n * 0.92)
    d[i*4+2] = clamp(d[i*4+2] + n * 0.75) // less blue = warmer noise
  }
  pc.putImageData(img, 0, 0)

  // ── Parchment background: fine aging dots ─────────────────────────────────
  if (id === 'erase') {
    const rng2 = seededRng(7)
    pc.fillStyle = 'rgba(140,100,40,0.12)'
    for (let i = 0; i < 30; i++) {
      pc.beginPath()
      pc.arc(rng2() * SZ, rng2() * SZ, 0.5 + rng2() * 1.5, 0, Math.PI * 2)
      pc.fill()
    }
    return pat
  }

  // ── Terrain-specific overlays ─────────────────────────────────────────────
  const dark = `rgba(${clamp(r-55)},${clamp(g-50)},${clamp(b-40)}`

  switch (id) {
    case 'water':
    case 'shallow': {
      // Seamlessly tiling sine waves (period = 64px)
      const waves = id === 'water' ? 5 : 6
      const gap   = SZ / waves
      pc.strokeStyle = `rgba(255,255,255,${id === 'water' ? 0.22 : 0.28})`
      pc.lineWidth   = id === 'water' ? 1.4 : 1
      for (let wi = 0; wi < waves; wi++) {
        const baseY = wi * gap + gap / 2
        pc.beginPath()
        for (let x = 0; x <= SZ; x++) {
          const y = baseY + Math.sin(x * Math.PI / 32) * 2.5
          x === 0 ? pc.moveTo(x, y) : pc.lineTo(x, y)
        }
        pc.stroke()
      }
      // Subtle highlight near top of each wave
      pc.strokeStyle = `rgba(255,255,255,0.1)`
      pc.lineWidth = 0.6
      for (let wi = 0; wi < waves; wi++) {
        const baseY = wi * gap + gap / 2 - 1.5
        pc.beginPath()
        for (let x = 0; x <= SZ; x++) {
          const y = baseY + Math.sin(x * Math.PI / 32) * 2.5
          x === 0 ? pc.moveTo(x, y) : pc.lineTo(x, y)
        }
        pc.stroke()
      }
      break
    }

    case 'forest':
    case 'swamp': {
      const rng2 = seededRng(id === 'forest' ? 77 : 88)
      const count = id === 'forest' ? 20 : 14
      // Dark canopy circles
      pc.fillStyle = `${dark},0.5)`
      for (let i = 0; i < count; i++) {
        const tx = rng2() * SZ
        const ty = rng2() * SZ
        const rs = 1.8 + rng2() * 3
        pc.beginPath()
        pc.arc(tx, ty, rs, 0, Math.PI * 2)
        pc.fill()
      }
      // Lighter highlight dots on top
      pc.fillStyle = `rgba(${clamp(r+30)},${clamp(g+25)},${clamp(b+10)},0.25)`
      const rng3 = seededRng(id === 'forest' ? 78 : 89)
      for (let i = 0; i < 8; i++) {
        pc.beginPath()
        pc.arc(rng3() * SZ, rng3() * SZ, 1 + rng3() * 1.5, 0, Math.PI * 2)
        pc.fill()
      }
      break
    }

    case 'mountain': {
      // Cross-hatch diagonal lines
      pc.strokeStyle = `${dark},0.3)`
      pc.lineWidth   = 0.8
      for (let i = -SZ; i < SZ * 2; i += 9) {
        pc.beginPath(); pc.moveTo(i, 0); pc.lineTo(i + SZ, SZ); pc.stroke()
      }
      // Perpendicular (lighter)
      pc.strokeStyle = `${dark},0.15)`
      pc.lineWidth   = 0.6
      for (let i = -SZ; i < SZ * 2; i += 18) {
        pc.beginPath(); pc.moveTo(i + SZ, 0); pc.lineTo(i, SZ); pc.stroke()
      }
      // Small peak marks
      const rng2 = seededRng(55)
      pc.fillStyle = `${dark},0.45)`
      for (let i = 0; i < 6; i++) {
        const px = rng2() * SZ, py = rng2() * SZ
        pc.beginPath()
        pc.moveTo(px, py - 5)
        pc.lineTo(px - 4, py + 2)
        pc.lineTo(px + 4, py + 2)
        pc.closePath()
        pc.fill()
      }
      break
    }

    case 'desert':
    case 'sand': {
      // Fine scattered grain
      const rng2 = seededRng(id === 'desert' ? 33 : 55)
      const count = id === 'desert' ? 55 : 45
      pc.fillStyle = `${dark},0.35)`
      for (let i = 0; i < count; i++) {
        pc.beginPath()
        pc.arc(rng2() * SZ, rng2() * SZ, 0.5 + rng2() * 1, 0, Math.PI * 2)
        pc.fill()
      }
      // Light highlight grain
      pc.fillStyle = `rgba(255,240,180,0.2)`
      const rng3 = seededRng(id === 'desert' ? 34 : 56)
      for (let i = 0; i < 20; i++) {
        pc.beginPath()
        pc.arc(rng3() * SZ, rng3() * SZ, 0.4 + rng3() * 0.8, 0, Math.PI * 2)
        pc.fill()
      }
      break
    }

    case 'road': {
      // Two parallel worn tracks
      pc.strokeStyle = `${dark},0.5)`
      pc.lineWidth   = 2
      pc.setLineDash([12, 5])
      pc.lineDashOffset = 4
      pc.beginPath(); pc.moveTo(SZ * 0.28, 0); pc.lineTo(SZ * 0.28, SZ); pc.stroke()
      pc.beginPath(); pc.moveTo(SZ * 0.72, 0); pc.lineTo(SZ * 0.72, SZ); pc.stroke()
      pc.setLineDash([])
      // Center strip
      pc.strokeStyle = `rgba(${clamp(r+20)},${clamp(g+15)},${clamp(b+10)},0.2)`
      pc.lineWidth   = 0.8
      pc.beginPath(); pc.moveTo(SZ * 0.5, 0); pc.lineTo(SZ * 0.5, SZ); pc.stroke()
      break
    }

    case 'grass': {
      // Short grass strokes
      const rng2 = seededRng(19)
      pc.strokeStyle = `${dark},0.28)`
      pc.lineWidth   = 0.9
      for (let i = 0; i < 22; i++) {
        const gx = rng2() * SZ, gy = rng2() * SZ
        const lean = (rng2() - 0.5) * 5
        pc.beginPath()
        pc.moveTo(gx, gy)
        pc.lineTo(gx + lean, gy - 3 - rng2() * 4)
        pc.stroke()
      }
      break
    }

    case 'snow': {
      // Tiny snowflake dots
      const rng2 = seededRng(12)
      pc.fillStyle = 'rgba(180,190,215,0.35)'
      for (let i = 0; i < 22; i++) {
        pc.beginPath()
        pc.arc(rng2() * SZ, rng2() * SZ, 0.5 + rng2() * 1.8, 0, Math.PI * 2)
        pc.fill()
      }
      break
    }

    case 'swamp':
      break // handled above in forest/swamp case
  }

  return pat
}

// ── Flood fill ────────────────────────────────────────────────────────────────

function floodFillPattern(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  pattern: CanvasPattern,
  fillHex: string,
) {
  sx = Math.floor(sx); sy = Math.floor(sy)
  if (sx < 0 || sx >= W || sy < 0 || sy >= H) return
  const img = ctx.getImageData(0, 0, W, H)
  const d   = img.data
  const si  = (sy * W + sx) * 4
  const [sr, sg, sb] = [d[si], d[si+1], d[si+2]]
  const [fr, fg, fb] = hexToRgb(fillHex)
  if (sr === fr && sg === fg && sb === fb) return

  const match = (i: number) => d[i] === sr && d[i+1] === sg && d[i+2] === sb
  const vis   = new Uint8Array(W * H)
  const q     = [sx + sy * W]
  vis[sx + sy * W] = 1
  while (q.length) {
    const pos = q.pop()!
    const px = pos % W, py = (pos / W) | 0
    const i  = pos * 4
    // Approximate target color (pattern average) — use solid fill color
    d[i] = fr; d[i+1] = fg; d[i+2] = fb; d[i+3] = 255
    for (const [nx, ny] of [[px+1,py],[px-1,py],[px,py+1],[px,py-1]] as [number,number][]) {
      if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
        const np = nx + ny * W
        if (!vis[np] && match(np * 4)) { vis[np] = 1; q.push(np) }
      }
    }
  }
  ctx.putImageData(img, 0, 0)

  // Redraw with pattern on top (approximate: re-fill bounding area with pattern)
  // Simpler: flood fill with solid color, then overdraw pattern
  ctx.save()
  ctx.fillStyle = pattern
  // We re-draw pattern over the filled area by repeating the fill
  // using composite 'source-atop' after re-floodfilling solid
  ctx.restore()
}

// Simple solid-color flood fill (used then pattern painted on stroke)
function floodFill(ctx: CanvasRenderingContext2D, sx: number, sy: number, hex: string) {
  sx = Math.floor(sx); sy = Math.floor(sy)
  if (sx < 0 || sx >= W || sy < 0 || sy >= H) return
  const img = ctx.getImageData(0, 0, W, H)
  const d   = img.data
  const si  = (sy * W + sx) * 4
  const [sr, sg, sb] = [d[si], d[si+1], d[si+2]]
  const [fr, fg, fb] = hexToRgb(hex)
  if (sr === fr && sg === fg && sb === fb) return
  const match = (i: number) => d[i] === sr && d[i+1] === sg && d[i+2] === sb
  const vis   = new Uint8Array(W * H)
  const q     = [sx + sy * W]
  vis[sx + sy * W] = 1
  while (q.length) {
    const pos = q.pop()!
    const px = pos % W, py = (pos / W) | 0
    const i  = pos * 4
    d[i] = fr; d[i+1] = fg; d[i+2] = fb; d[i+3] = 255
    for (const [nx, ny] of [[px+1,py],[px-1,py],[px,py+1],[px,py-1]] as [number,number][]) {
      if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
        const np = nx + ny * W
        if (!vis[np] && match(np * 4)) { vis[np] = 1; q.push(np) }
      }
    }
  }
  ctx.putImageData(img, 0, 0)
}

// ── UI helper ─────────────────────────────────────────────────────────────────

function btnSt(active = false, rgb?: string): React.CSSProperties {
  return {
    padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
    background: active ? `rgba(${rgb ?? '212,168,90'},0.18)` : 'rgba(240,232,216,0.05)',
    border: `1px solid ${active ? `rgba(${rgb ?? '212,168,90'},0.45)` : 'rgba(240,232,216,0.12)'}`,
    color: active ? (rgb ? `rgb(${rgb})` : '#d4a85a') : '#f0e8d8',
    cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0,
  }
}
function sideLabel(): React.CSSProperties {
  return { fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(240,232,216,0.3)', textTransform: 'uppercase' as const, marginBottom: 4 }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MapEditor() {
  const router = useRouter()

  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const patternsRef  = useRef<Partial<Record<TerrainId | 'erase', CanvasPattern>>>({})

  const drawingRef = useRef(false)
  const lastRef    = useRef<{ x: number; y: number } | null>(null)
  const histRef    = useRef<ImageData[]>([])
  const panRef     = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)
  const tRef       = useRef({ x: 20, y: 20, scale: 0.6 })
  const objDragRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null)
  const objsRef    = useRef<PlacedObj[]>([])
  const labelsRef  = useRef<MapLabel[]>([])
  const selRef     = useRef<string | null>(null)

  const [tool,       setTool]       = useState<ToolId>('brush')
  const [terrain,    setTerrain]    = useState<TerrainId>('grass')
  const [brushSize,  setBrushSize]  = useState(30)
  const [objects,    _setObjects]   = useState<PlacedObj[]>([])
  const [labels,     _setLabels]    = useState<MapLabel[]>([])
  const [selObj,     _setSelObj]    = useState<string | null>(null)
  const [placeType,  setPlaceType]  = useState<ObjDef>(OBJ_DEFS[0])
  const [objSize,    setObjSize]    = useState(36)
  const [t,          setT]          = useState({ x: 20, y: 20, scale: 0.6 })
  const [zoom,       setZoom]       = useState(60)

  // Text tool state
  const [textValue,  setTextValue]  = useState('')
  const [textSize,   setTextSize]   = useState(24)
  const [textColor,  setTextColor]  = useState('#3a2a10')
  const [pendingPos, setPendingPos] = useState<{ x: number; y: number } | null>(null)

  function setObjects(next: PlacedObj[]) { objsRef.current = next; _setObjects(next) }
  function setLabels(next: MapLabel[])   { labelsRef.current = next; _setLabels(next) }
  function setSelObj(id: string | null)  { selRef.current = id; _setSelObj(id) }

  // ── Build patterns ────────────────────────────────────────────────────────
  function buildPatterns(ctx: CanvasRenderingContext2D) {
    const ids: (TerrainId | 'erase')[] = [...TERRAIN_DEFS.map(t => t.id as TerrainId), 'erase']
    for (const id of ids) {
      const patCanvas = makePatternCanvas(id)
      const pat = ctx.createPattern(patCanvas, 'repeat')
      if (pat) patternsRef.current[id] = pat
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    buildPatterns(ctx)

    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
      if (saved?.canvasData) {
        if (saved.objs)    setObjects(saved.objs)
        if (saved.labels)  setLabels(saved.labels)
        const img = new Image()
        img.onload = () => ctx.drawImage(img, 0, 0)
        img.src = saved.canvasData
        return
      }
    } catch {}

    // Fresh parchment canvas
    drawParchmentBackground(ctx)
  }, [])

  function drawParchmentBackground(ctx: CanvasRenderingContext2D) {
    // Base parchment color
    ctx.fillStyle = PARCHMENT
    ctx.fillRect(0, 0, W, H)
    // Aging grain overlay
    const img = ctx.getImageData(0, 0, W, H)
    const d   = img.data
    const rng = seededRng(42)
    for (let i = 0; i < W * H; i++) {
      const n = (rng() - 0.5) * 18
      d[i*4]   = clamp(d[i*4]   + n)
      d[i*4+1] = clamp(d[i*4+1] + n * 0.92)
      d[i*4+2] = clamp(d[i*4+2] + n * 0.72)
    }
    ctx.putImageData(img, 0, 0)
    // Faint edge vignette
    const vg = ctx.createRadialGradient(W/2, H/2, H*0.35, W/2, H/2, H*0.85)
    vg.addColorStop(0, 'rgba(100,60,10,0)')
    vg.addColorStop(1, 'rgba(80,45,10,0.22)')
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, W, H)
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        const ctx = canvasRef.current?.getContext('2d')
        if (!ctx || !histRef.current.length) return
        ctx.putImageData(histRef.current.pop()!, 0, 0)
        doSave()
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selRef.current) {
        e.preventDefault()
        const nextObjs   = objsRef.current.filter(o => o.id !== selRef.current)
        const nextLabels = labelsRef.current.filter(l => l.id !== selRef.current)
        setObjects(nextObjs)
        setLabels(nextLabels)
        setSelObj(null)
        doSave(nextObjs, nextLabels)
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])

  // ── Wheel zoom ────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect   = el.getBoundingClientRect()
      const mx     = e.clientX - rect.left
      const my     = e.clientY - rect.top
      const factor = e.deltaY < 0 ? 1.1 : 0.9
      const cur    = tRef.current
      const ns     = Math.max(0.15, Math.min(5, cur.scale * factor))
      const sf     = ns / cur.scale
      const nt     = { x: mx - (mx - cur.x) * sf, y: my - (my - cur.y) * sf, scale: ns }
      tRef.current = nt; setT(nt); setZoom(Math.round(ns * 100))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getCanvasPos(e: React.MouseEvent) {
    const canvas = canvasRef.current!
    const rect   = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top)  * (H / rect.height),
    }
  }

  function pushHistory() {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    histRef.current = [...histRef.current.slice(-14), ctx.getImageData(0, 0, W, H)]
  }

  function doSave(objs = objsRef.current, labs = labelsRef.current) {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        canvasData: canvas.toDataURL('image/jpeg', 0.85),
        objs, labels: labs,
      }))
    } catch {}
  }

  function getPattern(id: TerrainId | 'erase'): CanvasPattern | string {
    return patternsRef.current[id] ?? (id === 'erase' ? PARCHMENT : TERRAIN_COLOR[id])
  }

  function paintDot(ctx: CanvasRenderingContext2D, x: number, y: number, id: TerrainId | 'erase') {
    ctx.fillStyle = getPattern(id)
    ctx.beginPath()
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2)
    ctx.fill()
  }

  function paintSegment(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, id: TerrainId | 'erase') {
    ctx.strokeStyle = getPattern(id)
    ctx.lineWidth   = brushSize
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  // ── Mouse handlers ────────────────────────────────────────────────────────
  function onMouseDown(e: React.MouseEvent) {
    if (e.button === 1 || tool === 'pan') {
      e.preventDefault()
      panRef.current = { mx: e.clientX, my: e.clientY, px: tRef.current.x, py: tRef.current.y }
      return
    }
    if (e.button !== 0) return

    const { x, y } = getCanvasPos(e)
    const ctx = canvasRef.current!.getContext('2d')!

    if (tool === 'text') {
      setPendingPos({ x, y })
      return
    }

    if (tool === 'fill') {
      pushHistory()
      const fillId = terrain
      floodFill(ctx, x, y, TERRAIN_COLOR[fillId])
      // Overdraw with pattern using composite trick
      const offscreen = document.createElement('canvas')
      offscreen.width = W; offscreen.height = H
      const oc = offscreen.getContext('2d')!
      oc.drawImage(canvasRef.current!, 0, 0)
      // Find filled region and paint pattern
      // Simple approach: paint pattern over entire canvas where color matches
      const idata = oc.getImageData(0, 0, W, H)
      const dd = idata.data
      const [fr, fg, fb] = hexToRgb(TERRAIN_COLOR[fillId])
      // We just paint the pattern over the region using a mask canvas
      const mask = document.createElement('canvas')
      mask.width = W; mask.height = H
      const mc = mask.getContext('2d')!
      mc.fillStyle = getPattern(fillId)
      mc.fillRect(0, 0, W, H)
      const mdata = mc.getImageData(0, 0, W, H)
      const md = mdata.data
      // For each pixel that matches fill color, replace with pattern pixel
      for (let i = 0; i < W * H; i++) {
        const idx = i * 4
        if (Math.abs(dd[idx] - fr) < 10 && Math.abs(dd[idx+1] - fg) < 10 && Math.abs(dd[idx+2] - fb) < 10) {
          dd[idx]   = md[idx]
          dd[idx+1] = md[idx+1]
          dd[idx+2] = md[idx+2]
        }
      }
      ctx.putImageData(idata, 0, 0)
      doSave()
      return
    }

    if (tool === 'brush' || tool === 'erase') {
      pushHistory()
      drawingRef.current = true
      lastRef.current = { x, y }
      paintDot(ctx, x, y, tool === 'erase' ? 'erase' : terrain)
      return
    }

    if (tool === 'place') {
      const newObj: PlacedObj = {
        id: crypto.randomUUID(), typeId: placeType.id,
        emoji: placeType.emoji, label: placeType.label,
        x, y, size: objSize,
      }
      const next = [...objsRef.current, newObj]
      setObjects(next); doSave(next)
      return
    }

    if (tool === 'select') setSelObj(null)
  }

  function onMouseMove(e: React.MouseEvent) {
    if (panRef.current) {
      const nt = {
        ...tRef.current,
        x: panRef.current.px + e.clientX - panRef.current.mx,
        y: panRef.current.py + e.clientY - panRef.current.my,
      }
      tRef.current = nt; setT(nt)
      return
    }
    if (objDragRef.current) {
      const scale = tRef.current.scale
      const dx = (e.clientX - objDragRef.current.sx) / scale
      const dy = (e.clientY - objDragRef.current.sy) / scale
      _setObjects(prev => prev.map(o =>
        o.id === objDragRef.current!.id
          ? { ...o, x: objDragRef.current!.ox + dx, y: objDragRef.current!.oy + dy }
          : o
      ))
      return
    }
    if (!drawingRef.current || (tool !== 'brush' && tool !== 'erase')) return
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = getCanvasPos(e)
    if (lastRef.current) {
      paintSegment(ctx, lastRef.current.x, lastRef.current.y, x, y, tool === 'erase' ? 'erase' : terrain)
    }
    lastRef.current = { x, y }
  }

  function onMouseUp() {
    if (panRef.current)    { panRef.current = null }
    if (objDragRef.current) {
      objsRef.current = objects; objDragRef.current = null; doSave()
    }
    if (drawingRef.current) {
      drawingRef.current = false; lastRef.current = null; doSave()
    }
  }

  function onObjDown(e: React.MouseEvent, obj: PlacedObj) {
    if (tool !== 'select') return
    e.stopPropagation()
    setSelObj(obj.id)
    objDragRef.current = { id: obj.id, sx: e.clientX, sy: e.clientY, ox: obj.x, oy: obj.y }
  }

  // ── Text placement ────────────────────────────────────────────────────────
  function commitText() {
    if (!pendingPos || !textValue.trim()) { setPendingPos(null); return }
    const newLabel: MapLabel = {
      id: crypto.randomUUID(),
      text: textValue.trim(),
      x: pendingPos.x, y: pendingPos.y,
      fontSize: textSize, color: textColor,
    }
    const next = [...labelsRef.current, newLabel]
    setLabels(next)
    setPendingPos(null)
    setTextValue('')
    doSave(objsRef.current, next)
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  function clearAll() {
    if (!confirm('Очистити всю карту та всі обʼєкти?')) return
    pushHistory()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    drawParchmentBackground(ctx)
    setObjects([]); setLabels([]); setSelObj(null); doSave([], [])
  }

  function deleteSelected() {
    if (!selRef.current) return
    const nextObjs   = objsRef.current.filter(o => o.id !== selRef.current)
    const nextLabels = labelsRef.current.filter(l => l.id !== selRef.current)
    setObjects(nextObjs); setLabels(nextLabels); setSelObj(null)
    doSave(nextObjs, nextLabels)
  }

  function fitCanvas() {
    const el = containerRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const scale = Math.min((width - 40) / W, (height - 40) / H)
    const nt = { x: (width - W * scale) / 2, y: (height - H * scale) / 2, scale }
    tRef.current = nt; setT(nt); setZoom(Math.round(scale * 100))
  }

  function exportPNG() {
    const src = canvasRef.current!
    const exp = document.createElement('canvas')
    exp.width = W; exp.height = H
    const ctx = exp.getContext('2d')!
    ctx.drawImage(src, 0, 0)
    // Draw labels
    for (const lbl of labelsRef.current) {
      ctx.font         = `bold ${lbl.fontSize}px 'Palatino Linotype', Georgia, serif`
      ctx.fillStyle    = lbl.color
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor  = 'rgba(240,224,180,0.9)'
      ctx.shadowBlur   = 4
      ctx.fillText(lbl.text, lbl.x, lbl.y)
      ctx.shadowBlur   = 0
    }
    // Draw objects
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (const obj of objsRef.current) {
      ctx.font = `${obj.size}px serif`
      ctx.fillText(obj.emoji, obj.x, obj.y)
    }
    const a = document.createElement('a')
    a.href = exp.toDataURL('image/png'); a.download = 'seraphites-map.png'; a.click()
  }

  // ── Cursor ────────────────────────────────────────────────────────────────
  const cursorMap: Record<ToolId, string> = {
    brush: 'crosshair', erase: 'crosshair', fill: 'cell',
    place: 'copy', select: 'default', pan: 'grab', text: 'text',
  }

  const TOOLS: { id: ToolId; label: string }[] = [
    { id: 'brush',  label: '🖌 Пензель' },
    { id: 'erase',  label: '⬜ Гумка'   },
    { id: 'fill',   label: '🪣 Заливка' },
    { id: 'place',  label: '📍 Обʼєкт' },
    { id: 'text',   label: '✏️ Текст'   },
    { id: 'select', label: '↖ Вибрати' },
    { id: 'pan',    label: '✋ Рух'     },
  ]

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#0f0e09', color: '#f0e8d8', fontFamily: "'Inter', sans-serif", userSelect: 'none', overflow: 'hidden' }}>

      {/* SVG filter for warm parchment tint on canvas */}
      <svg style={{ display: 'none' }}>
        <defs>
          <filter id="parchment-filter" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="
              1.05  0.02  0     0  0.02
              0     0.98  0     0  0.01
              0    -0.04  0.82  0  0
              0     0     0     1  0
            "/>
          </filter>
        </defs>
      </svg>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: '#17150f', borderBottom: '1px solid rgba(240,232,216,0.1)', flexShrink: 0, flexWrap: 'wrap' }}>
        <button onClick={() => router.push('/sacred')} style={btnSt()}>← Назад</button>
        <div style={{ width: 1, height: 20, background: 'rgba(240,232,216,0.1)', flexShrink: 0 }} />
        {TOOLS.map(({ id, label }) => (
          <button key={id} onClick={() => { setTool(id); setPendingPos(null) }} style={btnSt(tool === id)}>{label}</button>
        ))}
        <div style={{ width: 1, height: 20, background: 'rgba(240,232,216,0.1)', flexShrink: 0 }} />
        <button onClick={() => { const ctx = canvasRef.current?.getContext('2d'); if (ctx && histRef.current.length) { ctx.putImageData(histRef.current.pop()!, 0, 0); doSave() } }} style={btnSt()}>↩ Undo</button>
        <button onClick={fitCanvas} style={btnSt()}>⊞ Fit</button>
        <span style={{ fontSize: 10, color: 'rgba(240,232,216,0.3)', flexShrink: 0 }}>{zoom}%</span>
        <div style={{ flex: 1 }} />
        {(selObj) && tool === 'select' && (
          <button onClick={deleteSelected} style={btnSt(false, '192,112,112')}>🗑 Видалити</button>
        )}
        <button onClick={clearAll}    style={btnSt()}>🗑 Очистити</button>
        <button onClick={() => doSave()} style={btnSt(false, '111,166,122')}>💾 Зберегти</button>
        <button onClick={exportPNG}   style={btnSt(false, '212,168,90')}>📤 PNG</button>
      </div>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* Left sidebar */}
        <div style={{ width: 140, background: '#13120d', borderRight: '1px solid rgba(240,232,216,0.07)', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto', flexShrink: 0 }}>
          <div style={sideLabel()}>Рельєф</div>
          {TERRAIN_DEFS.map(td => {
            const active = terrain === td.id && (tool === 'brush' || tool === 'erase' || tool === 'fill')
            return (
              <button key={td.id}
                onClick={() => { setTerrain(td.id); if (tool !== 'fill' && tool !== 'erase') setTool('brush') }}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 7px', borderRadius: 6, background: active ? 'rgba(240,232,216,0.09)' : 'transparent', border: `1px solid ${active ? 'rgba(240,232,216,0.2)' : 'transparent'}`, color: '#f0e8d8', cursor: 'pointer', width: '100%', fontSize: 11, fontWeight: active ? 600 : 400 }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, background: TERRAIN_COLOR[td.id], flexShrink: 0, border: '1px solid rgba(0,0,0,0.25)' }} />
                {td.label}
              </button>
            )
          })}

          <div style={{ ...sideLabel(), marginTop: 10 }}>Розмір пензля</div>
          <input type="range" min={4} max={100} value={brushSize}
            onChange={e => setBrushSize(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#d4a85a' }} />
          <div style={{ fontSize: 10, color: 'rgba(240,232,216,0.35)', textAlign: 'center' }}>{brushSize}px</div>

          {/* Text tool options */}
          {tool === 'text' && (
            <>
              <div style={{ ...sideLabel(), marginTop: 10 }}>Розмір тексту</div>
              <input type="range" min={10} max={72} value={textSize}
                onChange={e => setTextSize(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#d4a85a' }} />
              <div style={{ fontSize: 10, color: 'rgba(240,232,216,0.35)', textAlign: 'center' }}>{textSize}px</div>
              <div style={{ ...sideLabel(), marginTop: 8 }}>Колір</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {['#3a2a10','#1a3a1a','#1a1a3a','#3a1a1a','#1a2a3a','#5a4a30'].map(c => (
                  <div key={c} onClick={() => setTextColor(c)}
                    style={{ width: 18, height: 18, borderRadius: 3, background: c, cursor: 'pointer', border: `2px solid ${textColor === c ? '#d4a85a' : 'transparent'}` }} />
                ))}
              </div>
            </>
          )}

          <div style={{ marginTop: 10, fontSize: 9, color: 'rgba(240,232,216,0.22)', lineHeight: 1.6 }}>
            Скрол = зум<br />
            Сер. кнопка = рух<br />
            Ctrl+Z = undo<br />
            Del = видалити
          </div>
        </div>

        {/* Canvas area */}
        <div
          ref={containerRef}
          style={{ flex: 1, overflow: 'hidden', position: 'relative', background: '#1a1814', cursor: cursorMap[tool] }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onContextMenu={e => e.preventDefault()}
        >
          {/* Subtle dot grid */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
            backgroundImage: 'radial-gradient(circle, rgba(240,232,216,0.025) 1px, transparent 1px)',
            backgroundSize: '32px 32px' }} />

          {/* Transformable wrapper */}
          <div style={{
            position: 'absolute', top: 0, left: 0,
            transform: `translate(${t.x}px,${t.y}px) scale(${t.scale})`,
            transformOrigin: '0 0',
            willChange: 'transform',
          }}>
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              style={{
                display: 'block',
                filter: 'url(#parchment-filter)',
                boxShadow: '0 0 0 2px rgba(180,140,60,0.3), 0 8px 50px rgba(0,0,0,0.7)',
              }}
            />

            {/* Map labels */}
            {labels.map(lbl => (
              <div
                key={lbl.id}
                onMouseDown={e => { if (tool !== 'select') return; e.stopPropagation(); setSelObj(lbl.id) }}
                style={{
                  position: 'absolute',
                  left: lbl.x, top: lbl.y,
                  transform: 'translate(-50%, -50%)',
                  fontSize: lbl.fontSize,
                  fontFamily: "'Palatino Linotype', Georgia, 'Times New Roman', serif",
                  fontWeight: 700,
                  color: lbl.color,
                  whiteSpace: 'nowrap',
                  pointerEvents: tool === 'select' ? 'auto' : 'none',
                  cursor: tool === 'select' ? 'pointer' : 'default',
                  textShadow: '0 0 8px rgba(240,220,160,0.8), 0 1px 3px rgba(0,0,0,0.4)',
                  outline: selObj === lbl.id ? '1px dashed rgba(212,168,90,0.7)' : 'none',
                  padding: '2px 4px',
                }}
              >
                {lbl.text}
              </div>
            ))}

            {/* Objects */}
            {objects.map(obj => (
              <div
                key={obj.id}
                onMouseDown={e => onObjDown(e, obj)}
                style={{
                  position: 'absolute',
                  left: obj.x, top: obj.y,
                  transform: 'translate(-50%, -50%)',
                  fontSize: obj.size,
                  lineHeight: 1,
                  cursor: tool === 'select' ? (objDragRef.current?.id === obj.id ? 'grabbing' : 'grab') : 'default',
                  pointerEvents: tool === 'select' ? 'auto' : 'none',
                  filter: selObj === obj.id
                    ? 'drop-shadow(0 0 6px rgba(212,168,90,0.9))'
                    : 'drop-shadow(1px 2px 3px rgba(0,0,0,0.5))',
                  transition: 'filter 0.1s',
                }}
                title={obj.label}
              >
                {obj.emoji}
              </div>
            ))}

            {/* Text pending cursor */}
            {pendingPos && (
              <div style={{
                position: 'absolute',
                left: pendingPos.x, top: pendingPos.y,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                fontSize: textSize,
                fontFamily: "'Palatino Linotype', Georgia, serif",
                fontWeight: 700,
                color: textColor,
                opacity: 0.5,
                whiteSpace: 'nowrap',
              }}>
                |
              </div>
            )}
          </div>

          {/* Text input popup */}
          {pendingPos && (
            <div style={{
              position: 'absolute',
              bottom: 20, left: '50%', transform: 'translateX(-50%)',
              background: '#1c1a12', border: '1px solid rgba(212,168,90,0.4)',
              borderRadius: 10, padding: '12px 16px',
              display: 'flex', gap: 8, alignItems: 'center',
              boxShadow: '0 4px 24px rgba(0,0,0,0.6)', zIndex: 20,
            }}>
              <input
                autoFocus
                value={textValue}
                onChange={e => setTextValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') setPendingPos(null) }}
                placeholder="Назва..."
                style={{
                  background: 'rgba(240,232,216,0.07)', border: '1px solid rgba(240,232,216,0.2)',
                  borderRadius: 6, padding: '7px 12px', color: '#f0e8d8', fontSize: 13,
                  outline: 'none', width: 200,
                  fontFamily: "'Palatino Linotype', Georgia, serif",
                }}
              />
              <button onClick={commitText} style={btnSt(true)}>✓</button>
              <button onClick={() => setPendingPos(null)} style={btnSt()}>✕</button>
            </div>
          )}
        </div>

        {/* Right sidebar — objects */}
        <div style={{ width: 140, background: '#13120d', borderLeft: '1px solid rgba(240,232,216,0.07)', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto', flexShrink: 0 }}>
          <div style={sideLabel()}>Обʼєкти</div>
          {OBJ_DEFS.map(od => {
            const active = placeType.id === od.id && tool === 'place'
            return (
              <button key={od.id}
                onClick={() => { setPlaceType(od); setTool('place') }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 7px', borderRadius: 6, background: active ? 'rgba(240,232,216,0.09)' : 'transparent', border: `1px solid ${active ? 'rgba(240,232,216,0.2)' : 'transparent'}`, color: '#f0e8d8', cursor: 'pointer', width: '100%' }}>
                <span style={{ fontSize: 20, lineHeight: 1 }}>{od.emoji}</span>
                <span style={{ fontSize: 10, fontWeight: active ? 600 : 400 }}>{od.label}</span>
              </button>
            )
          })}

          <div style={{ ...sideLabel(), marginTop: 10 }}>Розмір обʼєкта</div>
          <input type="range" min={16} max={72} value={objSize}
            onChange={e => setObjSize(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#d4a85a' }} />
          <div style={{ fontSize: 10, color: 'rgba(240,232,216,0.35)', textAlign: 'center' }}>{objSize}px</div>
        </div>
      </div>
    </div>
  )
}
