// Generates simple amethyst gradient PNG icons for the Metis extension.
// Pure Node — no external deps. Run: `node extension/scripts/gen-icons.mjs`
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import zlib from 'node:zlib'

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(here, '..', 'icons')
mkdirSync(outDir, { recursive: true })

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const c = Buffer.alloc(4)
  c.writeUInt32BE(crc32(td), 0)
  return Buffer.concat([len, td, c])
}

function makeIcon(size) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const raw = Buffer.alloc(size * (1 + size * 4))
  const cx = (size - 1) / 2
  const cy = (size - 1) / 2
  const radius = size / 2
  let off = 0
  for (let y = 0; y < size; y++) {
    raw[off++] = 0 // filter: None
    for (let x = 0; x < size; x++) {
      const dx = x - cx
      const dy = y - cy
      const d = Math.sqrt(dx * dx + dy * dy) / radius
      // gradient: amethyst → rose → amber, fading to transparent at edge
      let r, g, b, a
      if (d > 1) {
        r = 0; g = 0; b = 0; a = 0
      } else {
        // interpolate between 3 stops based on d
        const t = Math.min(1, d)
        const stops = [
          { r: 160, g: 107, b: 240 }, // amethyst soft
          { r: 244, g: 114, b: 182 }, // rose
          { r: 255, g: 140, b: 0 },   // amber
        ]
        const seg = t * (stops.length - 1)
        const i = Math.min(stops.length - 2, Math.floor(seg))
        const f = seg - i
        const a0 = stops[i]
        const a1 = stops[i + 1]
        r = Math.round(a0.r + (a1.r - a0.r) * f)
        g = Math.round(a0.g + (a1.g - a0.g) * f)
        b = Math.round(a0.b + (a1.b - a0.b) * f)
        // soft edge fade
        a = d > 0.92 ? Math.round(255 * (1 - (d - 0.92) / 0.08)) : 255
      }
      raw[off++] = r
      raw[off++] = g
      raw[off++] = b
      raw[off++] = a
    }
  }

  const idat = zlib.deflateSync(raw)
  return Buffer.concat([
    header,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const size of [16, 32, 48, 128]) {
  const png = makeIcon(size)
  writeFileSync(path.join(outDir, `icon-${size}.png`), png)
  console.log('wrote', `icon-${size}.png`, png.length, 'bytes')
}
