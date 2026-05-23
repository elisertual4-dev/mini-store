import sharp from 'sharp'
import { writeFileSync } from 'node:fs'

const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#2563eb"/>
  <text x="50%" y="50%" font-family="system-ui,sans-serif" font-size="${size * 0.42}"
    font-weight="700" fill="#ffffff" text-anchor="middle" dominant-baseline="central">MS</text>
</svg>
`

async function gen(size, out) {
  const buf = await sharp(Buffer.from(svg(size))).png().toBuffer()
  writeFileSync(out, buf)
  console.log('wrote', out, buf.length, 'bytes')
}

await gen(192, 'public/icon-192.png')
await gen(512, 'public/icon-512.png')
await gen(180, 'public/apple-touch-icon.png')
await gen(32, 'public/favicon-32.png')
