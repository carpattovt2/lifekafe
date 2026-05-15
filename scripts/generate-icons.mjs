// Generates public/icon-192.png and public/icon-512.png using only Node.js built-ins.
import { writeFileSync, mkdirSync } from 'fs'
import { deflateSync } from 'zlib'

// ── CRC32 ────────────────────────────────────────────────────────────────────
const CRC_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[i] = c
}
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ── PNG encoder ───────────────────────────────────────────────────────────────
function pngChunk(type, data) {
  const t   = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crcBuf])
}

function buildPNG(pixels, w, h) {
  // pixels: Buffer of RGB triples, row-major
  const sig = Buffer.from([137,80,78,71,13,10,26,10])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8]  = 8  // bit depth
  ihdr[9]  = 2  // color type: RGB
  ihdr[10] = 0  // compression: deflate/inflate
  ihdr[11] = 0  // filter: adaptive
  ihdr[12] = 0  // interlace: none

  // Build raw scan lines (filter byte 0 = None + RGB data)
  const stride = 1 + w * 3
  const raw = Buffer.alloc(h * stride)
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0 // filter: None
    pixels.copy(raw, y * stride + 1, y * w * 3, (y + 1) * w * 3)
  }

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Icon design ───────────────────────────────────────────────────────────────
function renderIcon(size) {
  const buf = Buffer.alloc(size * size * 3)

  // Theme colors
  const BG   = [0x2d, 0x2d, 0x44]  // --bg
  const BG2  = [0x36, 0x36, 0x53]  // --bg2
  const CYAN = [0x22, 0xd3, 0xee]  // --c-dash
  const ACC  = [0x8b, 0x5c, 0xf6]  // --accent (purple)

  function put(x, y, c) {
    if (x < 0 || x >= size || y < 0 || y >= size) return
    const i = (y * size + x) * 3
    buf[i] = c[0]; buf[i+1] = c[1]; buf[i+2] = c[2]
  }

  function rect(x, y, w, h, c) {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++)
        put(x + dx, y + dy, c)
  }

  const s = size
  const pad = Math.round(s * 0.10)  // 10% padding
  const bw  = Math.max(3, Math.round(s * 0.028)) // border width

  // Background
  rect(0, 0, s, s, BG)

  // Inner card
  rect(pad, pad, s - pad*2, s - pad*2, BG2)

  // Cyan border ring
  rect(pad,          pad,          s - pad*2, bw, CYAN) // top
  rect(pad,          s-pad-bw,     s - pad*2, bw, CYAN) // bottom
  rect(pad,          pad,          bw, s-pad*2, CYAN)   // left
  rect(s-pad-bw,     pad,          bw, s-pad*2, CYAN)   // right

  // ── Draw "LK" letter art, centered ──────────────────────────────────────
  // Each letter defined on a 4-wide × 6-tall pixel grid
  const L = [
    [1,0,0,0],
    [1,0,0,0],
    [1,0,0,0],
    [1,0,0,0],
    [1,0,0,0],
    [1,1,1,1],
  ]
  const K = [
    [1,0,0,1],
    [1,0,1,0],
    [1,1,0,0],
    [1,1,0,0],
    [1,0,1,0],
    [1,0,0,1],
  ]

  const cols  = 4
  const rows  = 6
  const gap   = 1          // pixel columns between letters
  const cs    = Math.round(s * 0.075) // cell size
  const totalW = (cols * 2 + gap) * cs
  const totalH = rows * cs
  const ox = Math.round((s - totalW) / 2)
  const oy = Math.round((s - totalH) / 2)

  // Draw L (cyan)
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (L[r][c]) rect(ox + c*cs, oy + r*cs, cs, cs, CYAN)

  // Draw K (purple)
  const kx = ox + (cols + gap) * cs
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (K[r][c]) rect(kx + c*cs, oy + r*cs, cs, cs, ACC)

  return buf
}

// ── Write files ───────────────────────────────────────────────────────────────
mkdirSync('public', { recursive: true })

for (const size of [192, 512]) {
  const pixels = renderIcon(size)
  const png    = buildPNG(pixels, size, size)
  writeFileSync(`public/icon-${size}.png`, png)
  console.log(`✓  public/icon-${size}.png  (${size}×${size}, ${png.length} bytes)`)
}
