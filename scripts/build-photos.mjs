// Turns the curated originals in ./image into web derivatives and a manifest.
// Only frames listed in data/curation.json are touched. Metadata (including GPS) is
// stripped from every output; the manifest keeps exposure data only.
//
//   npm run photos            encode whatever is missing, refresh the manifest
//   npm run photos -- --force re-encode everything
import { access, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import exifr from 'exifr'
import sharp from 'sharp'

const ROOT = path.resolve(import.meta.dirname, '..')
const SRC = path.join(ROOT, 'image')
const OUT = path.join(ROOT, 'public', 'photos')
const MANIFEST = path.join(ROOT, 'src', 'data', 'manifest.json')
const force = process.argv.includes('--force')

const LONG_EDGES = [800, 1600, 2400]
const MAX_EDGE = LONG_EDGES.at(-1)
const ENCODERS = {
  avif: (image) => image.avif({ quality: 56, effort: 4, chromaSubsampling: '4:4:4' }),
  webp: (image) => image.webp({ quality: 80, effort: 5, smartSubsample: true }),
}

sharp.cache(false)

const expected = new Set()
const exists = (file) => access(file).then(() => true, () => false)
// Derived from the file, not the ID, so renumbering a series never reuses another photo's encodes.
const slugFor = (source) => path.parse(source).name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
const pct = (x) => Math.round(x * 100)
const rec709 = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

function ratioLabel(w, h) {
  const ar = Math.max(w, h) / Math.min(w, h)
  for (const [a, b] of [[16, 9], [3, 2], [4, 3], [5, 4], [1, 1]]) {
    if (Math.abs(ar - a / b) / (a / b) < 0.015) return w >= h ? `${a}:${b}` : `${b}:${a}`
  }
  return `${(w / h).toFixed(2)}:1`
}

function analyse(px, w, h) {
  const n = w * h
  const luma = new Float32Array(n)
  const histogram = new Array(32).fill(0)
  let sum = 0
  let shadows = 0
  let highlights = 0
  for (let i = 0; i < n; i++) {
    const y = rec709(px[i * 3], px[i * 3 + 1], px[i * 3 + 2])
    luma[i] = y
    sum += y
    if (y < 0.12) shadows++
    if (y > 0.9) highlights++
    histogram[Math.min(31, Math.floor(y * 32))]++
  }

  const sorted = Float32Array.from(luma).sort()
  const contrast = sorted[Math.floor(n * 0.98)] - sorted[Math.floor(n * 0.02)]
  const mean = sum / n

  let edges = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const at = (dx, dy) => luma[(y + dy) * w + x + dx]
      const gx = at(1, -1) + 2 * at(1, 0) + at(1, 1) - at(-1, -1) - 2 * at(-1, 0) - at(-1, 1)
      const gy = at(-1, 1) + 2 * at(0, 1) + at(1, 1) - at(-1, -1) - 2 * at(0, -1) - at(1, -1)
      if (Math.hypot(gx, gy) / 4 > 0.1) edges++
    }
  }

  const peak = Math.max(...histogram)
  return {
    luma: pct(mean),
    contrast: pct(contrast),
    shadows: pct(shadows / n),
    highlights: pct(highlights / n),
    edges: pct(edges / ((w - 2) * (h - 2))),
    // Dark, high-contrast frames carry the most weight on a black page.
    weight: pct(0.55 * (1 - mean) + 0.45 * contrast),
    histogram: histogram.map((c) => pct(c / peak)),
  }
}

function palette(px, k = 5) {
  const points = []
  for (let i = 0; i < px.length; i += 15) points.push([px[i], px[i + 1], px[i + 2]])
  const byLuma = [...points].sort((a, b) => rec709(...a) - rec709(...b))
  let centres = Array.from({ length: k }, (_, i) => byLuma[Math.floor(((i + 0.5) / k) * byLuma.length)])
  let counts = []
  for (let iter = 0; iter < 12; iter++) {
    const totals = centres.map(() => [0, 0, 0, 0])
    for (const p of points) {
      let best = 0
      let bestDistance = Infinity
      centres.forEach((c, i) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2
        if (d < bestDistance) [best, bestDistance] = [i, d]
      })
      totals[best][0] += p[0]
      totals[best][1] += p[1]
      totals[best][2] += p[2]
      totals[best][3]++
    }
    centres = totals.map((t, i) => (t[3] ? [t[0] / t[3], t[1] / t[3], t[2] / t[3]] : centres[i]))
    counts = totals.map((t) => t[3])
  }
  const hex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
  return centres
    .map((c, i) => ({ c, n: counts[i] }))
    .sort((a, b) => b.n - a.n)
    .map(({ c }) => hex(c))
}

// XMP stores exposure as fractions ("1050/10"); EXIF stores numbers.
function num(value) {
  const v = Array.isArray(value) ? value[0] : value
  if (v == null) return null
  if (typeof v === 'number') return v
  const [a, b] = String(v).split('/').map(Number)
  const result = b ? a / b : a
  return Number.isFinite(result) ? result : null
}

function formatDate(value) {
  if (value instanceof Date) {
    // exifr builds these from the camera's wall clock, so local getters are the right ones.
    const p = (n) => String(n).padStart(2, '0')
    return `${value.getFullYear()}.${p(value.getMonth() + 1)}.${p(value.getDate())}`
  }
  return typeof value === 'string' ? value.slice(0, 10).replaceAll(/[-:]/g, '.') : null
}

async function readExif(file) {
  const e = await exifr
    .parse(file, { tiff: true, exif: true, xmp: true, gps: false, icc: false, iptc: false, mergeOutput: true })
    .catch(() => null)
  const shutterSeconds = num(e?.ExposureTime)
  // Phones report a tiny physical focal length; the 35 mm equivalent is the comparable figure.
  const focal = num(e?.FocalLengthIn35mmFormat) || num(e?.FocalLength)
  const aperture = num(e?.FNumber)
  return {
    camera: e?.Model ?? null,
    lens: e?.LensModel ?? e?.Lens ?? null,
    focal: focal == null ? null : Math.round(focal),
    aperture: aperture == null ? null : Number(aperture.toFixed(1)),
    shutter:
      shutterSeconds == null
        ? null
        : shutterSeconds >= 0.3
          ? `${Number(shutterSeconds.toFixed(1))}s`
          : `1/${Math.round(1 / shutterSeconds)}`,
    shutterSeconds,
    iso: num(e?.ISO ?? e?.ISOSpeedRatings),
    date: formatDate(e?.DateTimeOriginal ?? e?.CreateDate),
  }
}

// Decode once: the 116 MB PNGs are too slow to re-read for every derivative.
async function master(file) {
  const { data, info } = await sharp(file, { limitInputPixels: false })
    .rotate()
    .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true })
  if (info.channels !== 3) throw new Error(`${file}: expected 3 channels, got ${info.channels}`)
  return { data, raw: { raw: { width: info.width, height: info.height, channels: 3 } }, info }
}

async function encode(slug, { data, raw, info }) {
  const widths = []
  for (const edge of LONG_EDGES) {
    const scale = Math.min(1, edge / Math.max(info.width, info.height))
    const width = Math.round(info.width * scale)
    const height = Math.round(info.height * scale)
    widths.push(width)
    for (const [ext, encoder] of Object.entries(ENCODERS)) {
      const out = path.join(OUT, `${slug}-${width}.${ext}`)
      expected.add(path.basename(out))
      if (!force && (await exists(out))) continue
      await encoder(sharp(data, raw).resize(width, height)).toFile(out)
    }
  }
  return widths
}

async function describe(slug, source) {
  const file = path.join(SRC, source)
  if (!(await exists(file))) throw new Error(`Missing original: ${source}`)
  const meta = await sharp(file, { limitInputPixels: false }).metadata()
  // Phones store rotated frames with EXIF orientation 5-8; the master is already upright.
  const [nativeWidth, nativeHeight] = (meta.orientation ?? 1) >= 5 ? [meta.height, meta.width] : [meta.width, meta.height]
  const decoded = await master(file)
  const widths = await encode(slug, decoded)
  const { data: px, info } = await sharp(decoded.data, decoded.raw)
    .resize(256, 256, { fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const tiny = await sharp(decoded.data, decoded.raw)
    .resize(20, 20, { fit: 'inside' })
    .webp({ quality: 30 })
    .toBuffer()
  return {
    decoded,
    image: {
      slug,
      source,
      width: nativeWidth,
      height: nativeHeight,
      aspect: Number((nativeWidth / nativeHeight).toFixed(4)),
      ratio: ratioLabel(nativeWidth, nativeHeight),
      widths,
      lqip: `data:image/webp;base64,${tiny.toString('base64')}`,
      palette: palette(px),
      metrics: analyse(px, info.width, info.height),
      exif: await readExif(file),
    },
  }
}

const curation = JSON.parse(await readFile(path.join(ROOT, 'data', 'curation.json'), 'utf8'))
if (curation.photos.some((p) => p.source === curation.portrait.source)) {
  throw new Error('The portrait is reserved for the About section and cannot appear in the gallery.')
}
const originals = await readdir(SRC)
await mkdir(OUT, { recursive: true })
await mkdir(path.dirname(MANIFEST), { recursive: true })

const photos = []
for (const entry of curation.photos) {
  const started = Date.now()
  const slug = slugFor(entry.source)
  const { image, decoded } = await describe(slug, entry.source)
  photos.push({ ...entry, ...image })
  if (entry.id === curation.hero) {
    await sharp(decoded.data, decoded.raw)
      .resize(1200, 630, { fit: 'cover', position: 'top' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(path.join(ROOT, 'public', 'og.jpg'))
  }
  console.log(`${entry.id}  ${entry.source}  ${((Date.now() - started) / 1000).toFixed(1)}s`)
}

const portrait = {
  ...(await describe(curation.portrait.slug, curation.portrait.source)).image,
  alt: curation.portrait.alt,
}

const sensed = photos.filter((p) => p.exif.camera)
const mirrorless = sensed.filter((p) => p.exif.camera === 'ILCE-7C')
const manifest = {
  hero: curation.hero,
  series: curation.series,
  portrait,
  stats: {
    reviewed: originals.length - 1,
    selected: photos.length,
    withSensorData: sensed.length,
    mirrorless: mirrorless.length,
    phone: sensed.length - mirrorless.length,
    lens: mirrorless[0]?.exif.lens ?? null,
  },
  photos,
}
await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`)

// Frames that left the selection must not stay publishable.
for (const name of await readdir(OUT)) {
  if (expected.has(name)) continue
  // Windows refuses while another process (a running dev server, OneDrive) holds the file open.
  await rm(path.join(OUT, name)).catch((err) => console.warn(`Could not delete ${name}: ${err.code}. Rerun once it is released.`))
}

// Only current files: OneDrive can keep a just-deleted file listed but locked for a moment.
let bytes = 0
const outputs = [...expected]
for (const name of outputs) bytes += (await stat(path.join(OUT, name))).size
console.log(`\n${photos.length} frames + portrait, ${outputs.length} files, ${(bytes / 1048576).toFixed(1)} MB in public/photos`)
console.log(JSON.stringify(manifest.stats))
