'use client'

import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

type TerrainId = 'grass' | 'forest' | 'water' | 'shallow' | 'mountain' | 'desert' | 'snow' | 'sand' | 'swamp'
type RoadSub   = 'dirt' | 'main' | 'paved'
type RiverSub  = 'stream' | 'river' | 'wide'
type ToolId    = 'brush' | 'erase' | 'fill' | 'place' | 'select' | 'pan' | 'text' | 'road' | 'river'

interface ObjDef    { id: string; emoji: string; label: string }
interface PlacedObj { id: string; typeId: string; emoji: string; label: string; x: number; y: number; size: number }
interface MapLabel  { id: string; text: string; x: number; y: number; fontSize: number; color: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const W = 1400
const H = 900
const PAT = 96
const PARCHMENT = '#e8dbb0'
const MIN_STROKE_DIST = 5

const TERRAIN_COLOR: Record<TerrainId, string> = {
  grass:    '#8a9e52',
  forest:   '#4a6230',
  water:    '#4a7090',
  shallow:  '#6a98b2',
  mountain: '#8a7a68',
  desert:   '#c8a030',
  snow:     '#dedad0',
  sand:     '#cca84a',
  swamp:    '#5c6e3a',
}

const TERRAIN_DEFS: { id: TerrainId; label: string }[] = [
  { id: 'grass',    label: 'Поле'    },
  { id: 'forest',   label: 'Ліс'     },
  { id: 'water',    label: 'Море'    },
  { id: 'shallow',  label: 'Мілина'  },
  { id: 'mountain', label: 'Гори'    },
  { id: 'desert',   label: 'Пустеля' },
  { id: 'swamp',    label: 'Болото'  },
  { id: 'sand',     label: 'Пісок'   },
  { id: 'snow',     label: 'Сніг'    },
]

const ROAD_DEFS: { id: RoadSub; label: string }[] = [
  { id: 'dirt',  label: 'Грунтова' },
  { id: 'main',  label: 'Мощена'   },
  { id: 'paved', label: 'Бруківка' },
]

const RIVER_DEFS: { id: RiverSub; label: string }[] = [
  { id: 'stream', label: 'Струмок'    },
  { id: 'river',  label: 'Річка'      },
  { id: 'wide',   label: 'Широка'     },
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

// ── SVG pattern generation ────────────────────────────────────────────────────

function seededRng(seed: number) {
  let s = (seed * 1664525 + 1013904223) & 0x7fffffff
  return () => { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff }
}

function wave(y: number, A: number, S = PAT): string {
  const h = S / 2
  return `M0,${y} C${S*.14},${y-A} ${S*.36},${y-A} ${h},${y} C${S*.64},${y+A} ${S*.86},${y+A} ${S},${y}`
}

function scatter(n: number, S: number, seed: number, rMin = 0.5, rMax = 1.5): [number,number,number][] {
  const rng = seededRng(seed)
  return Array.from({ length: n }, () => [rng()*S, rng()*S, rMin + rng()*(rMax-rMin)])
}

function makeSVG(id: TerrainId | 'erase'): string {
  const S    = PAT
  const fill = id === 'erase' ? PARCHMENT : TERRAIN_COLOR[id as TerrainId]
  const bg   = `<rect width="${S}" height="${S}" fill="${fill}"/>`
  let body   = ''

  if (id === 'water') {
    body = `
      <g stroke="rgba(255,255,255,0.32)" stroke-width="1.4" fill="none">
        ${[8,22,36,50,64,78,90].map(y=>`<path d="${wave(y,3)}"/>`).join('')}
      </g>
      <g stroke="rgba(255,255,255,0.12)" stroke-width="0.7" fill="none">
        ${[15,29,43,57,71,85].map(y=>`<path d="${wave(y,2.5)}"/>`).join('')}
      </g>`

  } else if (id === 'shallow') {
    body = `
      <g stroke="rgba(255,255,255,0.4)" stroke-width="1.1" fill="none">
        ${[6,16,26,36,46,56,66,76,86].map(y=>`<path d="${wave(y,2)}"/>`).join('')}
      </g>`

  } else if (id === 'forest') {
    body = `
      <g fill="rgba(0,0,0,0.28)">
        <circle cx="20" cy="18" r="11"/><circle cx="68" cy="14" r="10"/>
        <circle cx="44" cy="48" r="13"/><circle cx="10" cy="66" r="9"/>
        <circle cx="80" cy="64" r="11"/><circle cx="38" cy="84" r="9"/>
        <circle cx="84" cy="90" r="8"/>
      </g>
      <g fill="rgba(255,255,255,0.12)">
        <circle cx="15" cy="13" r="6"/><circle cx="63" cy="9" r="5"/>
        <circle cx="39" cy="43" r="7"/><circle cx="6" cy="61" r="5"/>
        <circle cx="75" cy="59" r="6"/>
      </g>`

  } else if (id === 'swamp') {
    body = `
      <g fill="rgba(0,0,0,0.24)">
        <circle cx="22" cy="20" r="9"/><circle cx="70" cy="16" r="8"/>
        <circle cx="40" cy="56" r="11"/><circle cx="76" cy="74" r="9"/>
      </g>
      <g stroke="rgba(0,0,0,0.2)" stroke-width="1" fill="none">
        ${[44,68].map(y=>`<path d="${wave(y,3.5)}"/>`).join('')}
      </g>
      <g stroke="rgba(0,0,0,0.38)" stroke-width="1.3" stroke-linecap="round" fill="none">
        <line x1="10" y1="90" x2="10" y2="72"/><line x1="8" y1="78" x2="14" y2="73"/>
        <line x1="52" y1="90" x2="52" y2="70"/><line x1="50" y1="76" x2="56" y2="71"/>
      </g>`

  } else if (id === 'mountain') {
    body = `
      <g stroke="rgba(0,0,0,0.52)" stroke-width="1.4" stroke-linejoin="round">
        <path d="M2,90 L28,22 L54,90" fill="rgba(0,0,0,0.18)"/>
        <path d="M42,90 L68,14 L94,90" fill="rgba(0,0,0,0.16)"/>
      </g>
      <g stroke="rgba(0,0,0,0.22)" stroke-width="0.8" fill="none">
        <line x1="22" y1="52" x2="15" y2="70"/>
        <line x1="27" y1="42" x2="19" y2="62"/>
        <line x1="32" y1="52" x2="25" y2="70"/>
        <line x1="62" y1="44" x2="55" y2="64"/>
        <line x1="67" y1="34" x2="59" y2="56"/>
        <line x1="72" y1="44" x2="65" y2="64"/>
      </g>
      <g fill="rgba(255,255,255,0.22)">
        <polygon points="28,22 22,36 34,36"/>
        <polygon points="68,14 62,29 74,29"/>
      </g>`

  } else if (id === 'desert') {
    const dots  = scatter(70,S,33,0.5,1.6).map(([x,y,r])=>`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`).join('')
    const light = scatter(28,S,34,0.4,1.0).map(([x,y,r])=>`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`).join('')
    body = `<g fill="rgba(0,0,0,0.26)">${dots}</g><g fill="rgba(255,235,150,0.22)">${light}</g>`

  } else if (id === 'sand') {
    const dots = scatter(30,S,55,0.4,1.2).map(([x,y,r])=>`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`).join('')
    body = `
      <g stroke="rgba(0,0,0,0.14)" stroke-width="0.9" fill="none">
        ${[10,24,38,52,66,80,92].map(y=>`<path d="${wave(y,2.5)}"/>`).join('')}
      </g>
      <g fill="rgba(0,0,0,0.2)">${dots}</g>`

  } else if (id === 'grass') {
    const rng    = seededRng(19)
    const blades = Array.from({length:24}, ()=>{
      const x = rng()*S, y = rng()*S, h = 3+rng()*5, lean = (rng()-.5)*5
      return `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x+lean).toFixed(1)}" y2="${(y-h).toFixed(1)}"/>`
    }).join('')
    body = `<g stroke="rgba(0,0,0,0.2)" stroke-width="0.9" stroke-linecap="round" fill="none">${blades}</g>`

  } else if (id === 'snow') {
    const dots   = scatter(22,S,7,0.5,2.2).map(([x,y,r])=>`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`).join('')
    const flakes = scatter(8,S,14,3,4.5).map(([cx,cy,r])=>
      Array.from({length:6},(_,i)=>{
        const a=i*Math.PI/3
        return `<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(cx+Math.cos(a)*r).toFixed(1)}" y2="${(cy+Math.sin(a)*r).toFixed(1)}"/>`
      }).join('')
    ).join('')
    body = `
      <g fill="rgba(140,160,210,0.3)">${dots}</g>
      <g stroke="rgba(140,160,210,0.45)" stroke-width="0.6" stroke-linecap="round">${flakes}</g>`

  } else if (id === 'erase') {
    const dots = scatter(32,S,9,0.4,1.8).map(([x,y,r])=>`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`).join('')
    body = `<g fill="rgba(120,80,30,0.09)">${dots}</g>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${bg}${body}</svg>`
}

// ── Async pattern builder ─────────────────────────────────────────────────────

function buildPatterns(ctx: CanvasRenderingContext2D, ref: React.MutableRefObject<Partial<Record<TerrainId|'erase', CanvasPattern>>>): Promise<void> {
  const ids: (TerrainId|'erase')[] = [...TERRAIN_DEFS.map(t=>t.id), 'erase']
  return Promise.all(ids.map(id => new Promise<void>(resolve => {
    const blob = new Blob([makeSVG(id)], { type: 'image/svg+xml' })
    const url  = URL.createObjectURL(blob)
    const img  = new Image()
    img.onload = () => {
      const pat = ctx.createPattern(img, 'repeat')
      if (pat) ref.current[id] = pat
      URL.revokeObjectURL(url)
      resolve()
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve() }
    img.src = url
  }))).then(()=>{})
}

// ── Flood fill ────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number,number,number] {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)]
}

function floodFill(ctx: CanvasRenderingContext2D, sx: number, sy: number, hex: string) {
  sx = Math.floor(sx); sy = Math.floor(sy)
  if (sx < 0 || sx >= W || sy < 0 || sy >= H) return
  const img = ctx.getImageData(0,0,W,H)
  const d   = img.data
  const si  = (sy*W+sx)*4
  const [sr,sg,sb] = [d[si],d[si+1],d[si+2]]
  const [fr,fg,fb] = hexToRgb(hex)
  if (sr===fr&&sg===fg&&sb===fb) return
  const match = (i:number) => d[i]===sr&&d[i+1]===sg&&d[i+2]===sb
  const vis   = new Uint8Array(W*H)
  const q     = [sx+sy*W]; vis[sx+sy*W] = 1
  while (q.length) {
    const pos=q.pop()!; const px=pos%W; const py=(pos/W)|0; const i=pos*4
    d[i]=fr; d[i+1]=fg; d[i+2]=fb; d[i+3]=255
    for (const [nx,ny] of [[px+1,py],[px-1,py],[px,py+1],[px,py-1]] as [number,number][]) {
      if (nx>=0&&nx<W&&ny>=0&&ny<H) { const np=nx+ny*W; if (!vis[np]&&match(np*4)){vis[np]=1;q.push(np)} }
    }
  }
  ctx.putImageData(img,0,0)
}

function floodFillTextured(
  ctx: CanvasRenderingContext2D, sx: number, sy: number,
  id: TerrainId,
  patRef: React.MutableRefObject<Partial<Record<TerrainId|'erase', CanvasPattern>>>,
) {
  const baseHex = TERRAIN_COLOR[id]
  floodFill(ctx, sx, sy, baseHex)
  const pat = patRef.current[id]
  if (!pat) return

  const [fr,fg,fb] = hexToRgb(baseHex)
  const mainImg = ctx.getImageData(0,0,W,H)
  const d       = mainImg.data

  const mask  = document.createElement('canvas'); mask.width=W; mask.height=H
  const mc    = mask.getContext('2d')!
  const mdata = mc.createImageData(W,H)
  const md    = mdata.data
  for (let i=0; i<W*H; i++) {
    const idx=i*4
    const hit = Math.abs(d[idx]-fr)<8 && Math.abs(d[idx+1]-fg)<8 && Math.abs(d[idx+2]-fb)<8
    md[idx]=md[idx+1]=md[idx+2]=255
    md[idx+3] = hit ? 255 : 0
  }
  mc.putImageData(mdata,0,0)
  mc.globalCompositeOperation = 'source-in'
  mc.fillStyle = pat
  mc.fillRect(0,0,W,H)
  ctx.drawImage(mask,0,0)
}

// ── Catmull-Rom spline ────────────────────────────────────────────────────────

function catmullRom(pts: [number,number][], steps = 6): [number,number][] {
  if (pts.length < 2) return pts
  const result: [number,number][] = []
  const n = pts.length
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(n - 1, i + 2)]
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      const t2 = t*t, t3 = t2*t
      const x = 0.5*((2*p1[0])+(-p0[0]+p2[0])*t+(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2+(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3)
      const y = 0.5*((2*p1[1])+(-p0[1]+p2[1])*t+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3)
      result.push([x, y])
    }
  }
  result.push(pts[n - 1])
  return result
}

// ── Road stroke renderer ──────────────────────────────────────────────────────

function drawRoadStroke(ctx: CanvasRenderingContext2D, pts: [number,number][], sub: RoadSub, width: number) {
  if (pts.length < 2) return
  const smooth = catmullRom(pts)
  if (smooth.length < 2) return

  const cfg: Record<RoadSub, { outer: string; inner: string; innerW: number; dash: [string, number, number[]] | null }> = {
    dirt:  { outer: 'rgba(82,50,14,0.92)',  inner: 'rgba(148,104,46,0.78)', innerW: 0.54, dash: null },
    main:  { outer: 'rgba(62,40,10,0.94)',  inner: 'rgba(172,128,56,0.82)', innerW: 0.58, dash: ['rgba(230,210,155,0.2)', 0.14, [0.7, 0.55]] },
    paved: { outer: 'rgba(70,62,50,0.92)',  inner: 'rgba(115,105,85,0.8)',  innerW: 0.58, dash: ['rgba(255,255,255,0.22)', 0.12, [0.5, 0.5]] },
  }
  const c = cfg[sub]

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  function drawPath() {
    ctx.beginPath()
    ctx.moveTo(smooth[0][0], smooth[0][1])
    for (let i = 1; i < smooth.length; i++) ctx.lineTo(smooth[i][0], smooth[i][1])
  }

  ctx.strokeStyle = c.outer; ctx.lineWidth = width; drawPath(); ctx.stroke()
  ctx.strokeStyle = c.inner; ctx.lineWidth = width * c.innerW; drawPath(); ctx.stroke()

  if (c.dash) {
    const [color, wR, pat] = c.dash
    ctx.strokeStyle = color
    ctx.lineWidth   = width * wR
    ctx.setLineDash(pat.map(d => d * width))
    drawPath(); ctx.stroke()
    ctx.setLineDash([])
  }

  ctx.restore()
}

// ── River stroke renderer (tapered) ──────────────────────────────────────────

function drawRiverStroke(ctx: CanvasRenderingContext2D, pts: [number,number][], sub: RiverSub, width: number) {
  if (pts.length < 2) return
  const smooth = catmullRom(pts)
  const n = smooth.length
  if (n < 2) return

  const cfg: Record<RiverSub, { color: string; shadow: string; hl: string; minW: number; maxW: number; shadowR: number; hlR: number }> = {
    stream: { color: 'rgba(75,115,162,0.86)', shadow: 'rgba(32,60,105,0.3)',  hl: 'rgba(148,192,228,0.44)', minW: 0.25, maxW: 0.62, shadowR: 1.32, hlR: 0.32 },
    river:  { color: 'rgba(55,95,150,0.9)',   shadow: 'rgba(28,55,105,0.36)', hl: 'rgba(122,172,215,0.48)', minW: 0.3,  maxW: 1.0,  shadowR: 1.38, hlR: 0.28 },
    wide:   { color: 'rgba(44,82,140,0.92)',  shadow: 'rgba(22,46,100,0.42)', hl: 'rgba(105,158,205,0.5)',  minW: 0.35, maxW: 1.45, shadowR: 1.44, hlR: 0.24 },
  }
  const c = cfg[sub]

  ctx.save()
  ctx.lineCap = 'round'

  // Three separate passes so z-order is correct: all shadows first, then all color, then all highlights
  ctx.strokeStyle = c.shadow
  for (let i = 0; i < n - 1; i++) {
    const t = i / (n - 1)
    const w = width * (c.minW + (c.maxW - c.minW) * t)
    ctx.lineWidth = w * c.shadowR
    ctx.beginPath(); ctx.moveTo(smooth[i][0], smooth[i][1]); ctx.lineTo(smooth[i+1][0], smooth[i+1][1]); ctx.stroke()
  }

  ctx.strokeStyle = c.color
  for (let i = 0; i < n - 1; i++) {
    const t = i / (n - 1)
    const w = width * (c.minW + (c.maxW - c.minW) * t)
    ctx.lineWidth = w
    ctx.beginPath(); ctx.moveTo(smooth[i][0], smooth[i][1]); ctx.lineTo(smooth[i+1][0], smooth[i+1][1]); ctx.stroke()
  }

  ctx.strokeStyle = c.hl
  for (let i = 0; i < n - 1; i++) {
    const t = i / (n - 1)
    const w = width * (c.minW + (c.maxW - c.minW) * t)
    ctx.lineWidth = w * c.hlR
    ctx.beginPath(); ctx.moveTo(smooth[i][0], smooth[i][1]); ctx.lineTo(smooth[i+1][0], smooth[i+1][1]); ctx.stroke()
  }

  ctx.restore()
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function btnSt(active=false, rgb?: string): React.CSSProperties {
  return {
    padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
    background: active ? `rgba(${rgb??'212,168,90'},0.18)` : 'rgba(240,232,216,0.05)',
    border: `1px solid ${active ? `rgba(${rgb??'212,168,90'},0.45)` : 'rgba(240,232,216,0.12)'}`,
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
  const patternsRef  = useRef<Partial<Record<TerrainId|'erase', CanvasPattern>>>({})

  const drawingRef       = useRef(false)
  const lastRef          = useRef<{x:number;y:number}|null>(null)
  const histRef          = useRef<ImageData[]>([])
  const panRef           = useRef<{mx:number;my:number;px:number;py:number}|null>(null)
  const tRef             = useRef({ x:20, y:20, scale:0.6 })
  const objDragRef       = useRef<{id:string;sx:number;sy:number;ox:number;oy:number}|null>(null)
  const objsRef          = useRef<PlacedObj[]>([])
  const labelsRef        = useRef<MapLabel[]>([])
  const selRef           = useRef<string|null>(null)
  const currentStrokeRef = useRef<[number,number][]>([])
  const preStrokeRef     = useRef<ImageData|null>(null)

  const [tool,       setTool]       = useState<ToolId>('brush')
  const [terrain,    setTerrain]    = useState<TerrainId>('grass')
  const [brushSize,  setBrushSize]  = useState(30)
  const [objects,    _setObjects]   = useState<PlacedObj[]>([])
  const [labels,     _setLabels]    = useState<MapLabel[]>([])
  const [selObj,     _setSelObj]    = useState<string|null>(null)
  const [placeType,  setPlaceType]  = useState<ObjDef>(OBJ_DEFS[0])
  const [objSize,    setObjSize]    = useState(36)
  const [t,          setT]          = useState({ x:20, y:20, scale:0.6 })
  const [zoom,       setZoom]       = useState(60)
  const [textValue,  setTextValue]  = useState('')
  const [textSize,   setTextSize]   = useState(24)
  const [textColor,  setTextColor]  = useState('#3a2a10')
  const [pendingPos, setPendingPos] = useState<{x:number;y:number}|null>(null)
  const [roadSub,    setRoadSub]    = useState<RoadSub>('dirt')
  const [riverSub,   setRiverSub]   = useState<RiverSub>('river')
  const [strokeWidth,setStrokeWidth]= useState(12)

  // stable ref accessors to avoid stale closures
  const roadSubRef   = useRef<RoadSub>('dirt')
  const riverSubRef  = useRef<RiverSub>('river')
  const strokeWRef   = useRef(12)
  const toolRef      = useRef<ToolId>('brush')

  function setRoadSubS(v: RoadSub)   { roadSubRef.current = v;  setRoadSub(v) }
  function setRiverSubS(v: RiverSub) { riverSubRef.current = v; setRiverSub(v) }
  function setStrokeWidthS(v: number){ strokeWRef.current = v;  setStrokeWidth(v) }
  function setToolS(v: ToolId)       { toolRef.current = v;     setTool(v) }

  function setObjects(n:PlacedObj[]) { objsRef.current=n; _setObjects(n) }
  function setLabels(n:MapLabel[])   { labelsRef.current=n; _setLabels(n) }
  function setSelObj(id:string|null) { selRef.current=id; _setSelObj(id) }

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    buildPatterns(ctx, patternsRef).then(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
        if (saved?.canvasData) {
          if (saved.objs)   setObjects(saved.objs)
          if (saved.labels) setLabels(saved.labels)
          const img = new Image()
          img.onload = () => ctx.drawImage(img,0,0)
          img.src = saved.canvasData
          return
        }
      } catch {}
      drawParchment(ctx)
    })
  }, [])

  function drawParchment(ctx: CanvasRenderingContext2D) {
    const pat = patternsRef.current['erase']
    if (pat) { ctx.fillStyle = pat; ctx.fillRect(0,0,W,H) }
    else      { ctx.fillStyle = PARCHMENT; ctx.fillRect(0,0,W,H) }
    const vg = ctx.createRadialGradient(W/2,H/2,H*.3,W/2,H/2,H*.9)
    vg.addColorStop(0,'rgba(90,55,10,0)')
    vg.addColorStop(1,'rgba(70,40,8,0.25)')
    ctx.fillStyle = vg; ctx.fillRect(0,0,W,H)
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey||e.ctrlKey) && e.key==='z') {
        e.preventDefault()
        const ctx = canvasRef.current?.getContext('2d')
        if (ctx && histRef.current.length) { ctx.putImageData(histRef.current.pop()!,0,0); doSave() }
      }
      if ((e.key==='Delete'||e.key==='Backspace') && selRef.current) {
        e.preventDefault()
        const no = objsRef.current.filter(o=>o.id!==selRef.current)
        const nl = labelsRef.current.filter(l=>l.id!==selRef.current)
        setObjects(no); setLabels(nl); setSelObj(null); doSave(no,nl)
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])

  // ── Zoom ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const onW = (e:WheelEvent) => {
      e.preventDefault()
      const rect=el.getBoundingClientRect(), mx=e.clientX-rect.left, my=e.clientY-rect.top
      const factor=e.deltaY<0?1.1:0.9, cur=tRef.current
      const ns=Math.max(0.15,Math.min(5,cur.scale*factor)), sf=ns/cur.scale
      const nt={x:mx-(mx-cur.x)*sf, y:my-(my-cur.y)*sf, scale:ns}
      tRef.current=nt; setT(nt); setZoom(Math.round(ns*100))
    }
    el.addEventListener('wheel',onW,{passive:false})
    return ()=>el.removeEventListener('wheel',onW)
  }, [])

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getPos(e:React.MouseEvent) {
    const canvas=canvasRef.current!, rect=canvas.getBoundingClientRect()
    return { x:(e.clientX-rect.left)*(W/rect.width), y:(e.clientY-rect.top)*(H/rect.height) }
  }
  function pushHistory() {
    const ctx=canvasRef.current?.getContext('2d'); if (!ctx) return
    histRef.current=[...histRef.current.slice(-14), ctx.getImageData(0,0,W,H)]
  }
  function doSave(objs=objsRef.current, labs=labelsRef.current) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ canvasData: canvasRef.current!.toDataURL('image/jpeg',0.85), objs, labels:labs })) } catch {}
  }
  function getPattern(id:TerrainId|'erase'): CanvasPattern|string {
    return patternsRef.current[id] ?? (id==='erase' ? PARCHMENT : TERRAIN_COLOR[id])
  }
  function dot(ctx:CanvasRenderingContext2D, x:number, y:number, id:TerrainId|'erase') {
    ctx.fillStyle=getPattern(id); ctx.beginPath(); ctx.arc(x,y,brushSize/2,0,Math.PI*2); ctx.fill()
  }
  function seg(ctx:CanvasRenderingContext2D, x1:number,y1:number, x2:number,y2:number, id:TerrainId|'erase') {
    ctx.strokeStyle=getPattern(id); ctx.lineWidth=brushSize; ctx.lineCap='round'; ctx.lineJoin='round'
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke()
  }

  // ── Mouse ─────────────────────────────────────────────────────────────────
  function onMouseDown(e:React.MouseEvent) {
    if (e.button===1||tool==='pan') { e.preventDefault(); panRef.current={mx:e.clientX,my:e.clientY,px:tRef.current.x,py:tRef.current.y}; return }
    if (e.button!==0) return
    const {x,y}=getPos(e)
    const ctx=canvasRef.current!.getContext('2d')!

    if (tool==='text') { setPendingPos({x,y}); return }

    if (tool==='fill') {
      pushHistory()
      floodFillTextured(ctx,x,y,terrain,patternsRef)
      doSave(); return
    }
    if (tool==='brush'||tool==='erase') {
      pushHistory(); drawingRef.current=true; lastRef.current={x,y}
      dot(ctx,x,y,tool==='erase'?'erase':terrain); return
    }
    if (tool==='road'||tool==='river') {
      pushHistory()
      preStrokeRef.current = ctx.getImageData(0,0,W,H)
      currentStrokeRef.current = [[x,y]]
      drawingRef.current = true
      return
    }
    if (tool==='place') {
      const next=[...objsRef.current,{id:crypto.randomUUID(),typeId:placeType.id,emoji:placeType.emoji,label:placeType.label,x,y,size:objSize}]
      setObjects(next); doSave(next); return
    }
    if (tool==='select') setSelObj(null)
  }

  function onMouseMove(e:React.MouseEvent) {
    if (panRef.current) {
      const nt={...tRef.current,x:panRef.current.px+e.clientX-panRef.current.mx,y:panRef.current.py+e.clientY-panRef.current.my}
      tRef.current=nt; setT(nt); return
    }
    if (objDragRef.current) {
      const scale=tRef.current.scale
      _setObjects(prev=>prev.map(o=>o.id===objDragRef.current!.id?{...o,x:objDragRef.current!.ox+(e.clientX-objDragRef.current!.sx)/scale,y:objDragRef.current!.oy+(e.clientY-objDragRef.current!.sy)/scale}:o))
      return
    }

    if (!drawingRef.current) return
    const {x,y} = getPos(e)
    const ctx = canvasRef.current!.getContext('2d')!

    if (tool==='brush'||tool==='erase') {
      if (lastRef.current) seg(ctx,lastRef.current.x,lastRef.current.y,x,y,tool==='erase'?'erase':terrain)
      lastRef.current={x,y}
      return
    }

    if (tool==='road'||tool==='river') {
      const pts = currentStrokeRef.current
      const last = pts[pts.length - 1]
      if (last) {
        const dx = x - last[0], dy = y - last[1]
        if (dx*dx + dy*dy < MIN_STROKE_DIST*MIN_STROKE_DIST) return
      }
      currentStrokeRef.current = [...pts, [x,y]]
      // Raw preview (fast)
      if (last) {
        ctx.save()
        ctx.strokeStyle = tool==='river' ? 'rgba(55,95,155,0.55)' : 'rgba(90,58,18,0.55)'
        ctx.lineWidth   = strokeWRef.current
        ctx.lineCap     = 'round'
        ctx.beginPath(); ctx.moveTo(last[0],last[1]); ctx.lineTo(x,y); ctx.stroke()
        ctx.restore()
      }
    }
  }

  function onMouseUp() {
    if (panRef.current) { panRef.current=null; return }
    if (objDragRef.current) { objsRef.current=objects; objDragRef.current=null; doSave(); return }

    if (drawingRef.current) {
      drawingRef.current = false

      if (tool==='road'||tool==='river') {
        const pts = currentStrokeRef.current
        const ctx = canvasRef.current!.getContext('2d')!
        if (pts.length >= 2 && preStrokeRef.current) {
          // Restore clean pre-stroke canvas, then draw smooth version
          ctx.putImageData(preStrokeRef.current, 0, 0)
          if (tool==='road') drawRoadStroke(ctx, pts, roadSubRef.current, strokeWRef.current)
          else               drawRiverStroke(ctx, pts, riverSubRef.current, strokeWRef.current)
        }
        preStrokeRef.current = null
        currentStrokeRef.current = []
        doSave()
        return
      }

      lastRef.current = null
      doSave()
    }
  }

  function onObjDown(e:React.MouseEvent, obj:PlacedObj) {
    if (tool!=='select') return
    e.stopPropagation(); setSelObj(obj.id)
    objDragRef.current={id:obj.id,sx:e.clientX,sy:e.clientY,ox:obj.x,oy:obj.y}
  }

  function commitText() {
    if (!pendingPos||!textValue.trim()) { setPendingPos(null); return }
    const next=[...labelsRef.current,{id:crypto.randomUUID(),text:textValue.trim(),x:pendingPos.x,y:pendingPos.y,fontSize:textSize,color:textColor}]
    setLabels(next); setPendingPos(null); setTextValue(''); doSave(objsRef.current,next)
  }

  function clearAll() {
    if (!confirm('Очистити всю карту?')) return
    pushHistory()
    const ctx=canvasRef.current?.getContext('2d'); if (!ctx) return
    drawParchment(ctx); setObjects([]); setLabels([]); setSelObj(null); doSave([],[])
  }

  function deleteSelected() {
    if (!selRef.current) return
    const no=objsRef.current.filter(o=>o.id!==selRef.current)
    const nl=labelsRef.current.filter(l=>l.id!==selRef.current)
    setObjects(no); setLabels(nl); setSelObj(null); doSave(no,nl)
  }

  function fitCanvas() {
    const el=containerRef.current; if (!el) return
    const {width,height}=el.getBoundingClientRect()
    const scale=Math.min((width-40)/W,(height-40)/H)
    const nt={x:(width-W*scale)/2,y:(height-H*scale)/2,scale}
    tRef.current=nt; setT(nt); setZoom(Math.round(scale*100))
  }

  function exportPNG() {
    const src=canvasRef.current!
    const exp=document.createElement('canvas'); exp.width=W; exp.height=H
    const ctx=exp.getContext('2d')!; ctx.drawImage(src,0,0)
    ctx.textAlign='center'; ctx.textBaseline='middle'
    for (const l of labelsRef.current) {
      ctx.font=`bold ${l.fontSize}px 'Palatino Linotype',Georgia,serif`
      ctx.fillStyle=l.color; ctx.shadowColor='rgba(240,220,160,0.9)'; ctx.shadowBlur=5
      ctx.fillText(l.text,l.x,l.y); ctx.shadowBlur=0
    }
    for (const obj of objsRef.current) {
      ctx.font=`${obj.size}px serif`; ctx.fillText(obj.emoji,obj.x,obj.y)
    }
    const a=document.createElement('a'); a.href=exp.toDataURL('image/png'); a.download='seraphites-map.png'; a.click()
  }

  const isLineTool = tool === 'road' || tool === 'river'
  const cursorMap: Record<ToolId,string> = {
    brush:'crosshair', erase:'crosshair', fill:'cell', place:'copy',
    select:'default', pan:'grab', text:'text', road:'crosshair', river:'crosshair',
  }
  const TOOLS = [
    {id:'brush'  as ToolId, label:'🖌 Пензель'},
    {id:'erase'  as ToolId, label:'⬜ Гумка'  },
    {id:'fill'   as ToolId, label:'🪣 Заливка'},
    {id:'road'   as ToolId, label:'🛤 Дорога' },
    {id:'river'  as ToolId, label:'〜 Річка'  },
    {id:'place'  as ToolId, label:'📍 Обʼєкт' },
    {id:'text'   as ToolId, label:'✏️ Текст'  },
    {id:'select' as ToolId, label:'↖ Вибрати' },
    {id:'pan'    as ToolId, label:'✋ Рух'    },
  ]

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100dvh',background:'#0f0e09',color:'#f0e8d8',fontFamily:"'Inter',sans-serif",userSelect:'none',overflow:'hidden'}}>
      <svg style={{display:'none'}}>
        <defs>
          <filter id="pf" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="1.06 0.02 0 0 0.02  0 0.97 0 0 0.01  0 -0.04 0.82 0 0  0 0 0 1 0"/>
          </filter>
        </defs>
      </svg>

      {/* Top bar */}
      <div style={{display:'flex',alignItems:'center',gap:6,padding:'7px 12px',background:'#17150f',borderBottom:'1px solid rgba(240,232,216,0.1)',flexShrink:0,flexWrap:'wrap'}}>
        <button onClick={()=>router.push('/sacred')} style={btnSt()}>← Назад</button>
        <div style={{width:1,height:20,background:'rgba(240,232,216,0.1)',flexShrink:0}}/>
        {TOOLS.map(({id,label})=>(
          <button key={id} onClick={()=>{setToolS(id);setPendingPos(null)}} style={btnSt(tool===id)}>{label}</button>
        ))}
        <div style={{width:1,height:20,background:'rgba(240,232,216,0.1)',flexShrink:0}}/>
        <button onClick={()=>{const ctx=canvasRef.current?.getContext('2d');if(ctx&&histRef.current.length){ctx.putImageData(histRef.current.pop()!,0,0);doSave()}}} style={btnSt()}>↩ Undo</button>
        <button onClick={fitCanvas} style={btnSt()}>⊞ Fit</button>
        <span style={{fontSize:10,color:'rgba(240,232,216,0.3)',flexShrink:0}}>{zoom}%</span>
        <div style={{flex:1}}/>
        {selObj&&tool==='select'&&<button onClick={deleteSelected} style={btnSt(false,'192,112,112')}>🗑 Видалити</button>}
        <button onClick={clearAll}   style={btnSt()}>🗑 Очистити</button>
        <button onClick={()=>doSave()} style={btnSt(false,'111,166,122')}>💾 Зберегти</button>
        <button onClick={exportPNG}  style={btnSt(false,'212,168,90')}>📤 PNG</button>
      </div>

      <div style={{display:'flex',flex:1,minHeight:0}}>

        {/* Left sidebar */}
        <div style={{width:140,background:'#13120d',borderRight:'1px solid rgba(240,232,216,0.07)',padding:'10px 8px',display:'flex',flexDirection:'column',gap:3,overflowY:'auto',flexShrink:0}}>

          {/* Terrain section — hidden for road/river/place/text/select */}
          {!isLineTool && tool!=='place' && tool!=='text' && tool!=='select' && <>
            <div style={sideLabel()}>Рельєф</div>
            {TERRAIN_DEFS.map(td=>{
              const active=terrain===td.id&&(tool==='brush'||tool==='erase'||tool==='fill')
              return (
                <button key={td.id} onClick={()=>{setTerrain(td.id);if(tool!=='fill'&&tool!=='erase')setToolS('brush')}}
                  style={{display:'flex',alignItems:'center',gap:7,padding:'5px 7px',borderRadius:6,background:active?'rgba(240,232,216,0.09)':'transparent',border:`1px solid ${active?'rgba(240,232,216,0.2)':'transparent'}`,color:'#f0e8d8',cursor:'pointer',width:'100%',fontSize:11,fontWeight:active?600:400}}>
                  <div style={{width:14,height:14,borderRadius:3,background:TERRAIN_COLOR[td.id],flexShrink:0,border:'1px solid rgba(0,0,0,0.25)'}}/>
                  {td.label}
                </button>
              )
            })}

            <div style={{...sideLabel(),marginTop:10}}>Розмір пензля</div>
            <input type="range" min={4} max={100} value={brushSize} onChange={e=>setBrushSize(Number(e.target.value))} style={{width:'100%',accentColor:'#d4a85a'}}/>
            <div style={{fontSize:10,color:'rgba(240,232,216,0.35)',textAlign:'center'}}>{brushSize}px</div>
          </>}

          {/* Road controls */}
          {tool==='road'&&<>
            <div style={sideLabel()}>Тип дороги</div>
            {ROAD_DEFS.map(rd=>(
              <button key={rd.id} onClick={()=>setRoadSubS(rd.id)}
                style={{...btnSt(roadSub===rd.id), width:'100%', textAlign:'left', marginBottom:2}}>
                {rd.label}
              </button>
            ))}
            <div style={{...sideLabel(),marginTop:10}}>Товщина</div>
            <input type="range" min={4} max={40} value={strokeWidth} onChange={e=>setStrokeWidthS(Number(e.target.value))} style={{width:'100%',accentColor:'#d4a85a'}}/>
            <div style={{fontSize:10,color:'rgba(240,232,216,0.35)',textAlign:'center'}}>{strokeWidth}px</div>
            <div style={{marginTop:10,fontSize:9,color:'rgba(240,232,216,0.22)',lineHeight:1.7}}>
              Тягни мишу →<br/>плавна крива<br/>Undo = скасувати
            </div>
          </>}

          {/* River controls */}
          {tool==='river'&&<>
            <div style={sideLabel()}>Тип ріки</div>
            {RIVER_DEFS.map(rv=>(
              <button key={rv.id} onClick={()=>setRiverSubS(rv.id)}
                style={{...btnSt(riverSub===rv.id,'80,130,200'), width:'100%', textAlign:'left', marginBottom:2}}>
                {rv.label}
              </button>
            ))}
            <div style={{...sideLabel(),marginTop:10}}>Товщина</div>
            <input type="range" min={6} max={60} value={strokeWidth} onChange={e=>setStrokeWidthS(Number(e.target.value))} style={{width:'100%',accentColor:'#5a8ec8'}}/>
            <div style={{fontSize:10,color:'rgba(240,232,216,0.35)',textAlign:'center'}}>{strokeWidth}px</div>
            <div style={{marginTop:10,fontSize:9,color:'rgba(240,232,216,0.22)',lineHeight:1.7}}>
              Малюй від витоку<br/>до гирла →<br/>авто-розширення
            </div>
          </>}

          {/* Text controls */}
          {tool==='text'&&<>
            <div style={sideLabel()}>Розмір тексту</div>
            <input type="range" min={10} max={72} value={textSize} onChange={e=>setTextSize(Number(e.target.value))} style={{width:'100%',accentColor:'#d4a85a'}}/>
            <div style={{fontSize:10,color:'rgba(240,232,216,0.35)',textAlign:'center'}}>{textSize}px</div>
            <div style={{...sideLabel(),marginTop:8}}>Колір</div>
            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
              {['#3a2a10','#1a3a1a','#1a1a3a','#3a1a1a','#1a2a3a','#5a4a30'].map(c=>(
                <div key={c} onClick={()=>setTextColor(c)} style={{width:18,height:18,borderRadius:3,background:c,cursor:'pointer',border:`2px solid ${textColor===c?'#d4a85a':'transparent'}`}}/>
              ))}
            </div>
          </>}

          {/* Hints for non-terrain tools */}
          {(tool==='select'||tool==='place'||tool==='pan')&&(
            <div style={{marginTop:10,fontSize:9,color:'rgba(240,232,216,0.22)',lineHeight:1.6}}>
              Скрол = зум<br/>Сер. кнопка = рух<br/>Ctrl+Z = undo<br/>Del = видалити
            </div>
          )}
        </div>

        {/* Canvas */}
        <div ref={containerRef}
          style={{flex:1,overflow:'hidden',position:'relative',background:'#1a1814',cursor:cursorMap[tool]}}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
          onContextMenu={e=>e.preventDefault()}>

          <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:0,
            backgroundImage:'radial-gradient(circle, rgba(240,232,216,0.025) 1px, transparent 1px)',
            backgroundSize:'32px 32px'}}/>

          <div style={{position:'absolute',top:0,left:0,transform:`translate(${t.x}px,${t.y}px) scale(${t.scale})`,transformOrigin:'0 0',willChange:'transform'}}>
            <canvas ref={canvasRef} width={W} height={H}
              style={{display:'block',filter:'url(#pf)',boxShadow:'0 0 0 2px rgba(180,140,60,0.3),0 8px 50px rgba(0,0,0,0.7)'}}/>

            {labels.map(lbl=>(
              <div key={lbl.id} onMouseDown={e=>{if(tool!=='select')return;e.stopPropagation();setSelObj(lbl.id)}}
                style={{position:'absolute',left:lbl.x,top:lbl.y,transform:'translate(-50%,-50%)',
                  fontSize:lbl.fontSize,fontFamily:"'Palatino Linotype',Georgia,'Times New Roman',serif",
                  fontWeight:700,color:lbl.color,whiteSpace:'nowrap',
                  pointerEvents:tool==='select'?'auto':'none',cursor:tool==='select'?'pointer':'default',
                  textShadow:'0 0 8px rgba(240,220,160,0.8),0 1px 3px rgba(0,0,0,0.4)',
                  outline:selObj===lbl.id?'1px dashed rgba(212,168,90,0.7)':'none',padding:'2px 4px'}}>
                {lbl.text}
              </div>
            ))}

            {objects.map(obj=>(
              <div key={obj.id} onMouseDown={e=>onObjDown(e,obj)}
                style={{position:'absolute',left:obj.x,top:obj.y,transform:'translate(-50%,-50%)',
                  fontSize:obj.size,lineHeight:1,
                  cursor:tool==='select'?(objDragRef.current?.id===obj.id?'grabbing':'grab'):'default',
                  pointerEvents:tool==='select'?'auto':'none',
                  filter:selObj===obj.id?'drop-shadow(0 0 6px rgba(212,168,90,0.9))':'drop-shadow(1px 2px 3px rgba(0,0,0,0.5))',
                  transition:'filter 0.1s'}}
                title={obj.label}>
                {obj.emoji}
              </div>
            ))}

            {pendingPos&&(
              <div style={{position:'absolute',left:pendingPos.x,top:pendingPos.y,transform:'translate(-50%,-50%)',
                pointerEvents:'none',fontSize:textSize,fontFamily:"'Palatino Linotype',Georgia,serif",
                fontWeight:700,color:textColor,opacity:0.4,whiteSpace:'nowrap'}}>|</div>
            )}
          </div>

          {pendingPos&&(
            <div style={{position:'absolute',bottom:20,left:'50%',transform:'translateX(-50%)',
              background:'#1c1a12',border:'1px solid rgba(212,168,90,0.4)',borderRadius:10,
              padding:'12px 16px',display:'flex',gap:8,alignItems:'center',
              boxShadow:'0 4px 24px rgba(0,0,0,0.6)',zIndex:20}}>
              <input autoFocus value={textValue} onChange={e=>setTextValue(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter')commitText();if(e.key==='Escape')setPendingPos(null)}}
                placeholder="Назва..."
                style={{background:'rgba(240,232,216,0.07)',border:'1px solid rgba(240,232,216,0.2)',
                  borderRadius:6,padding:'7px 12px',color:'#f0e8d8',fontSize:13,outline:'none',width:200,
                  fontFamily:"'Palatino Linotype',Georgia,serif"}}/>
              <button onClick={commitText} style={btnSt(true)}>✓</button>
              <button onClick={()=>setPendingPos(null)} style={btnSt()}>✕</button>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div style={{width:140,background:'#13120d',borderLeft:'1px solid rgba(240,232,216,0.07)',padding:'10px 8px',display:'flex',flexDirection:'column',gap:3,overflowY:'auto',flexShrink:0}}>
          <div style={sideLabel()}>Обʼєкти</div>
          {OBJ_DEFS.map(od=>{
            const active=placeType.id===od.id&&tool==='place'
            return (
              <button key={od.id} onClick={()=>{setPlaceType(od);setToolS('place')}}
                style={{display:'flex',alignItems:'center',gap:6,padding:'4px 7px',borderRadius:6,background:active?'rgba(240,232,216,0.09)':'transparent',border:`1px solid ${active?'rgba(240,232,216,0.2)':'transparent'}`,color:'#f0e8d8',cursor:'pointer',width:'100%'}}>
                <span style={{fontSize:20,lineHeight:1}}>{od.emoji}</span>
                <span style={{fontSize:10,fontWeight:active?600:400}}>{od.label}</span>
              </button>
            )
          })}
          <div style={{...sideLabel(),marginTop:10}}>Розмір обʼєкта</div>
          <input type="range" min={16} max={72} value={objSize} onChange={e=>setObjSize(Number(e.target.value))} style={{width:'100%',accentColor:'#d4a85a'}}/>
          <div style={{fontSize:10,color:'rgba(240,232,216,0.35)',textAlign:'center'}}>{objSize}px</div>
        </div>
      </div>
    </div>
  )
}
