/**
 * make-icon.js — generate resources/icon.png (512x512) with no external deps.
 *
 * Renders a simple mind-map motif (central node + connected child nodes) on a
 * rounded-rect blue gradient, 2x supersampled for anti-aliasing, then writes a
 * PNG using only Node's built-in zlib. Re-run with `node resources/make-icon.js`
 * if you want to tweak the art; electron-builder converts it to icon.ico.
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const OUT = 512
const S = 2 // supersample factor
const W = OUT * S
const buf = new Float64Array(W * W * 4) // RGBA, premultiplied-ish straight alpha

function blend(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= W || y >= W || a <= 0) return
  const i = (y * W + x) * 4
  const ia = 1 - a
  buf[i] = r * a + buf[i] * ia
  buf[i + 1] = g * a + buf[i + 1] * ia
  buf[i + 2] = b * a + buf[i + 2] * ia
  buf[i + 3] = a + buf[i + 3] * ia
}

function roundedRectInside(x, y, rad) {
  // returns true if pixel center is inside the full-canvas rounded rect
  const m = 2 * S // margin
  const lo = m, hi = W - m
  if (x < lo || y < lo || x > hi || y > hi) return false
  let cx = x, cy = y
  if (x < lo + rad) cx = lo + rad
  else if (x > hi - rad) cx = hi - rad
  if (y < lo + rad) cy = lo + rad
  else if (y > hi - rad) cy = hi - rad
  return Math.hypot(x - cx, y - cy) <= rad
}

function drawBackground() {
  const rad = 96 * S
  for (let y = 0; y < W; y++) {
    const t = y / W
    // vertical gradient: #2f6fed -> #1b2f6b
    const r = Math.round(0x2f + (0x1b - 0x2f) * t)
    const g = Math.round(0x6f + (0x2f - 0x6f) * t)
    const b = Math.round(0xed + (0x6b - 0xed) * t)
    for (let x = 0; x < W; x++) {
      if (roundedRectInside(x, y, rad)) blend(x, y, r, g, b, 1)
    }
  }
}

function fillCircle(cx, cy, rad, r, g, b, a) {
  const x0 = Math.max(0, Math.floor(cx - rad - 1)), x1 = Math.min(W - 1, Math.ceil(cx + rad + 1))
  const y0 = Math.max(0, Math.floor(cy - rad - 1)), y1 = Math.min(W - 1, Math.ceil(cy + rad + 1))
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (Math.hypot(x - cx, y - cy) <= rad) blend(x, y, r, g, b, a)
}

function drawLine(ax, ay, bx, by, width, r, g, b, a) {
  const hw = width / 2
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - hw - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + hw + 1))
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - hw - 1)), y1 = Math.min(W - 1, Math.ceil(Math.max(ay, by) + hw + 1))
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy || 1
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let tt = ((x - ax) * dx + (y - ay) * dy) / len2
      tt = Math.max(0, Math.min(1, tt))
      const px = ax + tt * dx, py = ay + tt * dy
      if (Math.hypot(x - px, y - py) <= hw) blend(x, y, r, g, b, a)
    }
  }
}

drawBackground()

const cx = 256 * S, cy = 256 * S
const children = [
  { x: 372, y: 150, rad: 30, c: [0xf5, 0x9e, 0x0b] }, // amber
  { x: 398, y: 300, rad: 28, c: [0x34, 0xd3, 0x99] }, // green
  { x: 300, y: 398, rad: 26, c: [0xfb, 0x71, 0x85] }, // red/pink
  { x: 120, y: 210, rad: 27, c: [0xc0, 0x84, 0xfc] }  // purple
]

// connectors under the nodes
for (const ch of children) drawLine(cx, cy, ch.x * S, ch.y * S, 13 * S, 0xff, 0xff, 0xff, 0.85)
// child nodes
for (const ch of children) fillCircle(ch.x * S, ch.y * S, ch.rad * S, ch.c[0], ch.c[1], ch.c[2], 1)
// central node
fillCircle(cx, cy, 50 * S, 0xff, 0xff, 0xff, 1)
fillCircle(cx, cy, 32 * S, 0x2f, 0x6f, 0xed, 1)

// ---- downsample SxS -> OUT and write PNG ----
function downsample() {
  const out = Buffer.alloc(OUT * OUT * 4)
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const i = ((y * S + sy) * W + (x * S + sx)) * 4
          r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; a += buf[i + 3]
        }
      }
      const n = S * S
      const o = (y * OUT + x) * 4
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n)
      out[o + 2] = Math.round(b / n); out[o + 3] = Math.round((a / n) * 255)
    }
  }
  return out
}

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1))
  }
  return (~c) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crc])
}

function writePng(rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(OUT, 0); ihdr.writeUInt32BE(OUT, 4)
  ihdr[8] = 8; ihdr[9] = 6 // 8-bit, RGBA
  // scanlines with filter byte 0
  const raw = Buffer.alloc((OUT * 4 + 1) * OUT)
  for (let y = 0; y < OUT; y++) {
    raw[y * (OUT * 4 + 1)] = 0
    rgba.copy(raw, y * (OUT * 4 + 1) + 1, y * OUT * 4, (y + 1) * OUT * 4)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

const png = writePng(downsample())
const outPath = path.join(__dirname, 'icon.png')
fs.writeFileSync(outPath, png)
console.log('wrote', outPath, png.length, 'bytes,', OUT + 'x' + OUT)
