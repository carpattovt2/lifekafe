'use client'

import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

type TerrainId = 'grass' | 'forest' | 'water' | 'shallow' | 'mountain' | 'desert' | 'road' | 'snow' | 'sand' | 'swamp'
type ToolId    = 'brush' | 'erase' | 'fill' | 'place' | 'select' | 'pan'

interface ObjDef    { id: string; emoji: string; label: string }
interface PlacedObj { id: string; typeId: string; emoji: string; label: string; x: number; y: number; size: number }

// ── Constants ─────────────────────────────────────────────────────────────────

const W = 1400
const H = 900

const TERRAIN_COLOR: Record<TerrainId, string> = {
  grass:    '#3a7d44',
  forest:   '#1b4d2a',
  water:    '#1a4f72',
  shallow:  '#2471a3',
  mountain: '#7d7d7d',
  desert:   '#c8a84b',
  road:     '#7a5c2e',
  snow:     '#d8dde8',
  sand:     '#d4b483',
  swamp:    '#4a6741',
}

const TERRAIN_DEFS: { id: TerrainId; label: string }[] = [
  { id: 'grass',    label: 'Поле'     },
  { id: 'forest',   label: 'Ліс'      },
  { id: 'water',    label: 'Море'     },
  { id: 'shallow',  label: 'Річка'    },
  { id: 'mountain', label: 'Гори'     },
  { id: 'desert',   label: 'Пустеля'  },
  { id: 'swamp',    label: 'Болото'   },
  { id: 'sand',     label: 'Пісок'    },
  { id: 'road',     label: 'Дорога'   },
  { id: 'snow',     label: 'Сніг'     },
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

const STORAGE_KEY = 'sacred-map-editor-v1'

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

function floodFill(ctx: CanvasRenderingContext2D, sx: number, sy: number, hex: string) {
  sx = Math.floor(sx); sy = Math.floor(sy)
  if (sx < 0 || sx >= W || sy < 0 || sy >= H) return
  const img = ctx.getImageData(0, 0, W, H)
  const d   = img.data
  const si  = (sy * W + sx) * 4
  const [sr, sg, sb] = [d[si], d[si + 1], d[si + 2]]
  const [fr, fg, fb] = hexToRgb(hex)
  if (sr === fr && sg === fg && sb === fb) return
  const match = (i: number) => d[i] === sr && d[i+1] === sg && d[i+2] === sb
  const vis   = new Uint8Array(W * H)
  const q     = [sx + sy * W]
  vis[sx + sy * W] = 1
  while (q.length) {
    const pos = q.pop()!
    const px  = pos % W
    const py  = (pos / W) | 0
    const i   = pos * 4
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

function btnSt(active = false, color?: string): React.CSSProperties {
  return {
    padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
    background: active ? `rgba(${color ?? '212,168,90'},0.15)` : 'rgba(240,232,216,0.05)',
    border: `1px solid ${active ? `rgba(${color ?? '212,168,90'},0.4)` : 'rgba(240,232,216,0.12)'}`,
    color: active ? (color ? `rgb(${color})` : '#d4a85a') : '#f0e8d8',
    cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MapEditor() {
  const router = useRouter()

  // canvas & container refs
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // drawing
  const drawingRef = useRef(false)
  const lastRef    = useRef<{ x: number; y: number } | null>(null)
  const histRef    = useRef<ImageData[]>([])

  // pan
  const panRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)
  const tRef   = useRef({ x: 20, y: 20, scale: 0.6 })

  // object drag (needs stable refs to avoid stale closures)
  const objDragRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null)
  const objsRef    = useRef<PlacedObj[]>([])
  const selRef     = useRef<string | null>(null)

  // state
  const [tool,      setTool]      = useState<ToolId>('brush')
  const [terrain,   setTerrain]   = useState<TerrainId>('grass')
  const [brushSize, setBrushSize] = useState(28)
  const [objects,   _setObjects]  = useState<PlacedObj[]>([])
  const [selObj,    _setSelObj]   = useState<string | null>(null)
  const [placeType, setPlaceType] = useState<ObjDef>(OBJ_DEFS[0])
  const [objSize,   setObjSize]   = useState(36)
  const [t,         setT]         = useState({ x: 20, y: 20, scale: 0.6 })
  const [zoom,      setZoomLabel] = useState(60)

  function setObjects(next: PlacedObj[]) { objsRef.current = next; _setObjects(next) }
  function setSelObj(id: string | null)  { selRef.current  = id;   _setSelObj(id)   }

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
      if (saved?.canvasData) {
        if (saved.objs) setObjects(saved.objs)
        const img = new Image()
        img.onload = () => ctx.drawImage(img, 0, 0)
        img.src = saved.canvasData
        return
      }
    } catch {}
    ctx.fillStyle = TERRAIN_COLOR.grass
    ctx.fillRect(0, 0, W, H)
  }, [])

  // ── Keyboard ───────────────────────────────────────────────────────────────
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
        const next = objsRef.current.filter(o => o.id !== selRef.current)
        setObjects(next)
        setSelObj(null)
        doSave(next)
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])

  // ── Zoom ───────────────────────────────────────────────────────────────────
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
      tRef.current = nt
      setT(nt)
      setZoomLabel(Math.round(ns * 100))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ── Helpers ────────────────────────────────────────────────────────────────
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

  function doSave(objs = objsRef.current) {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        canvasData: canvas.toDataURL('image/jpeg', 0.82),
        objs,
      }))
    } catch {}
  }

  function paintCircle(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2)
    ctx.fill()
  }

  function paintLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
    ctx.strokeStyle  = color
    ctx.lineWidth    = brushSize
    ctx.lineCap      = 'round'
    ctx.lineJoin     = 'round'
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  // ── Mouse on canvas container ──────────────────────────────────────────────
  function onMouseDown(e: React.MouseEvent) {
    // Middle mouse or pan tool → start pan
    if (e.button === 1 || tool === 'pan') {
      e.preventDefault()
      panRef.current = { mx: e.clientX, my: e.clientY, px: tRef.current.x, py: tRef.current.y }
      return
    }
    if (e.button !== 0) return

    const { x, y } = getCanvasPos(e)
    const ctx = canvasRef.current!.getContext('2d')!

    if (tool === 'fill') {
      pushHistory()
      floodFill(ctx, x, y, TERRAIN_COLOR[terrain])
      doSave()
      return
    }
    if (tool === 'brush' || tool === 'erase') {
      pushHistory()
      drawingRef.current = true
      lastRef.current    = { x, y }
      const color = tool === 'erase' ? TERRAIN_COLOR.grass : TERRAIN_COLOR[terrain]
      paintCircle(ctx, x, y, color)
      return
    }
    if (tool === 'place') {
      const newObj: PlacedObj = {
        id: crypto.randomUUID(), typeId: placeType.id,
        emoji: placeType.emoji, label: placeType.label,
        x, y, size: objSize,
      }
      const next = [...objsRef.current, newObj]
      setObjects(next)
      doSave(next)
      return
    }
    // select mode — deselect if clicking canvas bg (objects stop propagation)
    if (tool === 'select') setSelObj(null)
  }

  function onMouseMove(e: React.MouseEvent) {
    // Pan
    if (panRef.current) {
      const dx = e.clientX - panRef.current.mx
      const dy = e.clientY - panRef.current.my
      const nt = { ...tRef.current, x: panRef.current.px + dx, y: panRef.current.py + dy }
      tRef.current = nt; setT(nt)
      return
    }
    // Object drag
    if (objDragRef.current) {
      const scale = tRef.current.scale
      const dx    = (e.clientX - objDragRef.current.sx) / scale
      const dy    = (e.clientY - objDragRef.current.sy) / scale
      _setObjects(prev => prev.map(o =>
        o.id === objDragRef.current!.id
          ? { ...o, x: objDragRef.current!.ox + dx, y: objDragRef.current!.oy + dy }
          : o
      ))
      return
    }
    // Draw
    if (!drawingRef.current || (tool !== 'brush' && tool !== 'erase')) return
    const ctx   = canvasRef.current!.getContext('2d')!
    const { x, y } = getCanvasPos(e)
    const color = tool === 'erase' ? TERRAIN_COLOR.grass : TERRAIN_COLOR[terrain]
    if (lastRef.current) paintLine(ctx, lastRef.current.x, lastRef.current.y, x, y, color)
    lastRef.current = { x, y }
  }

  function onMouseUp() {
    if (panRef.current)   { panRef.current = null }
    if (objDragRef.current) {
      // sync ref with final state
      objsRef.current = objects
      objDragRef.current = null
      doSave()
    }
    if (drawingRef.current) {
      drawingRef.current = false
      lastRef.current    = null
      doSave()
    }
  }

  // ── Object events ──────────────────────────────────────────────────────────
  function onObjDown(e: React.MouseEvent, obj: PlacedObj) {
    if (tool !== 'select') return
    e.stopPropagation()
    setSelObj(obj.id)
    objDragRef.current = { id: obj.id, sx: e.clientX, sy: e.clientY, ox: obj.x, oy: obj.y }
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  function clearAll() {
    if (!confirm('Очистити всю карту та всі обʼєкти?')) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    pushHistory()
    ctx.fillStyle = TERRAIN_COLOR.grass
    ctx.fillRect(0, 0, W, H)
    setObjects([])
    setSelObj(null)
    doSave([])
  }

  function deleteSelected() {
    if (!selRef.current) return
    const next = objsRef.current.filter(o => o.id !== selRef.current)
    setObjects(next)
    setSelObj(null)
    doSave(next)
  }

  function exportPNG() {
    const src = canvasRef.current!
    const exp = document.createElement('canvas')
    exp.width = W; exp.height = H
    const ctx = exp.getContext('2d')!
    ctx.drawImage(src, 0, 0)
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'
    for (const obj of objsRef.current) {
      ctx.font = `${obj.size}px serif`
      ctx.fillText(obj.emoji, obj.x, obj.y)
    }
    const a = document.createElement('a')
    a.href = exp.toDataURL('image/png')
    a.download = 'seraphites-map.png'
    a.click()
  }

  function fitCanvas() {
    const el = containerRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const scale = Math.min((width - 40) / W, (height - 40) / H)
    const x     = (width  - W * scale) / 2
    const y     = (height - H * scale) / 2
    const nt    = { x, y, scale }
    tRef.current = nt; setT(nt); setZoomLabel(Math.round(scale * 100))
  }

  // ── Cursor ────────────────────────────────────────────────────────────────
  const cursorMap: Record<ToolId, string> = {
    brush: 'crosshair', erase: 'crosshair', fill: 'cell',
    place: 'copy', select: 'default', pan: 'grab',
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const TOOLS: { id: ToolId; label: string }[] = [
    { id: 'brush',  label: '🖌 Пензель'  },
    { id: 'erase',  label: '⬜ Гумка'    },
    { id: 'fill',   label: '🪣 Заливка'  },
    { id: 'place',  label: '📍 Обʼєкт'  },
    { id: 'select', label: '↖ Вибрати'  },
    { id: 'pan',    label: '✋ Рух'      },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#0f0e09', color: '#f0e8d8', fontFamily: "'Inter', sans-serif", userSelect: 'none', overflow: 'hidden' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: '#17150f', borderBottom: '1px solid rgba(240,232,216,0.1)', flexShrink: 0, flexWrap: 'wrap' }}>
        <button onClick={() => router.push('/sacred')} style={btnSt()}>← Назад</button>
        <div style={{ width: 1, height: 20, background: 'rgba(240,232,216,0.1)', flexShrink: 0 }} />
        {TOOLS.map(({ id, label }) => (
          <button key={id} onClick={() => setTool(id)} style={btnSt(tool === id)}>{label}</button>
        ))}
        <div style={{ width: 1, height: 20, background: 'rgba(240,232,216,0.1)', flexShrink: 0 }} />
        <button onClick={() => { const ctx = canvasRef.current?.getContext('2d'); if (!ctx || !histRef.current.length) return; ctx.putImageData(histRef.current.pop()!, 0, 0); doSave() }} style={btnSt()}>↩ Undo</button>
        <button onClick={fitCanvas} style={btnSt()}>⊞ Fit</button>
        <span style={{ fontSize: 10, color: 'rgba(240,232,216,0.3)', flexShrink: 0 }}>{zoom}%</span>
        <div style={{ flex: 1 }} />
        {selObj && tool === 'select' && (
          <button onClick={deleteSelected} style={btnSt(false, '192,112,112')}>🗑 Видалити</button>
        )}
        <button onClick={clearAll}   style={btnSt()}>🗑 Очистити</button>
        <button onClick={() => doSave()} style={btnSt(false, '111,166,122')}>💾 Зберегти</button>
        <button onClick={exportPNG}  style={btnSt(false, '212,168,90')}>📤 PNG</button>
      </div>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* Left sidebar — terrain + brush */}
        <div style={{ width: 136, background: '#13120d', borderRight: '1px solid rgba(240,232,216,0.07)', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto', flexShrink: 0 }}>
          <div style={sideLabel()}>Рельєф</div>
          {TERRAIN_DEFS.map(td => {
            const active = terrain === td.id && (tool === 'brush' || tool === 'erase' || tool === 'fill')
            return (
              <button key={td.id}
                onClick={() => { setTerrain(td.id); if (tool !== 'fill' && tool !== 'erase') setTool('brush') }}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 7px', borderRadius: 6, background: active ? 'rgba(240,232,216,0.09)' : 'transparent', border: `1px solid ${active ? 'rgba(240,232,216,0.2)' : 'transparent'}`, color: '#f0e8d8', cursor: 'pointer', width: '100%', fontSize: 11, fontWeight: active ? 600 : 400 }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, background: TERRAIN_COLOR[td.id], flexShrink: 0, border: '1px solid rgba(0,0,0,0.3)' }} />
                {td.label}
              </button>
            )
          })}

          <div style={{ ...sideLabel(), marginTop: 10 }}>Розмір пензля</div>
          <input type="range" min={4} max={100} value={brushSize}
            onChange={e => setBrushSize(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#d4a85a' }} />
          <div style={{ fontSize: 10, color: 'rgba(240,232,216,0.35)', textAlign: 'center' }}>{brushSize}px</div>

          <div style={{ ...sideLabel(), marginTop: 10 }}>Підказки</div>
          <div style={{ fontSize: 9, color: 'rgba(240,232,216,0.22)', lineHeight: 1.6, padding: '2px 0' }}>
            Скрол = зум<br />
            Сер. кнопка = рух<br />
            Ctrl+Z = undo<br />
            Del = видалити обʼєкт
          </div>
        </div>

        {/* Canvas container */}
        <div
          ref={containerRef}
          style={{ flex: 1, overflow: 'hidden', position: 'relative', cursor: panRef.current ? 'grabbing' : cursorMap[tool], background: '#1a1814' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onContextMenu={e => e.preventDefault()}
        >
          {/* Grid hint */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
            backgroundImage: 'radial-gradient(circle, rgba(240,232,216,0.03) 1px, transparent 1px)',
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
              style={{ display: 'block', boxShadow: '0 0 0 2px rgba(240,232,216,0.15), 0 8px 40px rgba(0,0,0,0.6)' }}
            />
            {/* Objects overlay */}
            {objects.map(obj => (
              <div
                key={obj.id}
                onMouseDown={e => onObjDown(e, obj)}
                style={{
                  position: 'absolute',
                  left: obj.x,
                  top:  obj.y,
                  transform: 'translate(-50%, -50%)',
                  fontSize: obj.size,
                  lineHeight: 1,
                  cursor: tool === 'select' ? (objDragRef.current?.id === obj.id ? 'grabbing' : 'grab') : 'default',
                  pointerEvents: tool === 'select' ? 'auto' : 'none',
                  filter: selObj === obj.id ? 'drop-shadow(0 0 6px #d4a85a)' : undefined,
                  transition: 'filter 0.1s',
                }}
                title={obj.label}
              >
                {obj.emoji}
              </div>
            ))}
          </div>
        </div>

        {/* Right sidebar — objects */}
        <div style={{ width: 136, background: '#13120d', borderLeft: '1px solid rgba(240,232,216,0.07)', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto', flexShrink: 0 }}>
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

function sideLabel(): React.CSSProperties {
  return { fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(240,232,216,0.3)', textTransform: 'uppercase' as const, marginBottom: 4 }
}
