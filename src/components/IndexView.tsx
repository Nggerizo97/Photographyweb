import { useEffect, useMemo, useState, type PointerEvent, type ReactNode } from 'react'
import { motion, useMotionValue, useSpring, type MotionValue } from 'motion/react'
import { manifest, photos, seriesName, type Photo } from '../photos'
import { Picture } from './Picture'

type Key = 'id' | 'ratio' | 'focal' | 'aperture' | 'shutter' | 'iso' | 'date' | 'luma' | 'contrast' | 'edges' | 'weight'
type Value = string | number | null

const order = new Map(photos.map((p, i) => [p.id, i]))
const VALUE: Record<Key, (p: Photo) => Value> = {
  id: (p) => order.get(p.id)!,
  ratio: (p) => p.aspect,
  focal: (p) => p.exif.focal,
  aperture: (p) => p.exif.aperture,
  shutter: (p) => p.exif.shutterSeconds,
  iso: (p) => p.exif.iso,
  date: (p) => p.exif.date,
  luma: (p) => p.metrics.luma,
  contrast: (p) => p.metrics.contrast,
  edges: (p) => p.metrics.edges,
  weight: (p) => p.metrics.weight,
}

const PREVIEW_EDGE = 440
const GAP = 28
const HEADER = 48
const dash = (v: ReactNode) => v ?? <span className="text-rule">—</span>
const canHover = () => matchMedia('(hover: hover) and (pointer: fine)').matches

function Preview({ active, x, y }: { active: string | null; x: MotionValue<number>; y: MotionValue<number> }) {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-30"
      style={{ x, y, width: PREVIEW_EDGE, height: PREVIEW_EDGE }}
    >
      {photos.map((p) => {
        const scale = PREVIEW_EDGE / Math.max(p.width, p.height)
        const width = p.width * scale
        const height = p.height * scale
        return (
          // All previews are stacked and loaded up front so a hover never waits on the network.
          <div
            key={p.id}
            className="absolute"
            style={{
              width,
              height,
              left: (PREVIEW_EDGE - width) / 2,
              top: (PREVIEW_EDGE - height) / 2,
              visibility: active === p.id ? 'visible' : 'hidden',
            }}
          >
            <Picture img={{ ...p, widths: p.widths.slice(0, 1) }} eager sizes={`${Math.round(width)}px`} />
          </div>
        )
      })}
    </motion.div>
  )
}

interface HeadProps {
  k: Key
  sort: { key: Key; dir: 1 | -1 }
  onSort: (k: Key) => void
  className?: string
  children: ReactNode
}

function Head({ k, sort, onSort, className = '', children }: HeadProps) {
  const active = sort.key === k
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
      className={`py-2 pr-4 font-normal ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`cursor-pointer uppercase hover:text-bone ${active ? 'text-signal' : ''}`}
      >
        {children}
        {active && <span aria-hidden>{sort.dir === 1 ? ' ▲' : ' ▼'}</span>}
      </button>
    </th>
  )
}

export function IndexView({ onOpen }: { onOpen: (id: string, rect: DOMRect | null, order: Photo[]) => void }) {
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: 'id', dir: 1 })
  const [filter, setFilter] = useState<string | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [hoverable] = useState(canHover)

  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)
  const x = useSpring(rawX, { stiffness: 600, damping: 42, mass: 0.35 })
  const y = useSpring(rawY, { stiffness: 600, damping: 42, mass: 0.35 })

  // A stationary cursor fires no pointer events when the page scrolls out from under it.
  useEffect(() => {
    const clear = () => setActive(null)
    window.addEventListener('scroll', clear, { passive: true })
    return () => window.removeEventListener('scroll', clear)
  }, [])

  const rows = useMemo(() => {
    const get = VALUE[sort.key]
    return photos
      .filter((p) => !filter || p.series === filter)
      .toSorted((a, b) => {
        const av = get(a)
        const bv = get(b)
        // Frames with no sensor data sink to the bottom in both directions.
        if (av === null) return bv === null ? 0 : 1
        if (bv === null) return -1
        return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir
      })
  }, [sort, filter])

  const onSort = (key: Key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'id' ? 1 : -1 }))

  const track = (e: PointerEvent, snap = false) => {
    if (!hoverable) return
    const px = e.clientX + GAP + PREVIEW_EDGE > innerWidth ? e.clientX - GAP - PREVIEW_EDGE : e.clientX + GAP
    const py = Math.min(Math.max(HEADER + 8, e.clientY - PREVIEW_EDGE / 2), innerHeight - PREVIEW_EDGE - 8)
    rawX.set(px)
    rawY.set(py)
    if (snap) {
      x.jump(px)
      y.jump(py)
    }
  }

  const meanWeight = Math.round(rows.reduce((sum, p) => sum + p.metrics.weight, 0) / rows.length)
  const filters = [{ code: null as string | null, label: 'All' }, ...manifest.series.map((s) => ({ code: s.code, label: s.code }))]

  return (
    <section aria-label="Frame index" className="px-4 pt-16 pb-28 md:px-8 md:pt-24 md:pb-44">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3 text-[11px] tracking-wider uppercase">
        <div role="group" aria-label="Filter by state" className="flex gap-1">
          {filters.map(({ code, label }) => (
            <button
              key={label}
              type="button"
              aria-pressed={filter === code}
              onClick={() => setFilter(code)}
              className={`cursor-pointer border px-2 py-1 ${filter === code ? 'border-bone bg-bone text-ink' : 'border-rule text-ash hover:text-bone'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-ash">
          {rows.length} frames // sensor data {rows.filter((p) => p.exif.camera).length}/{rows.length}
          <span className="max-sm:hidden"> // mean weight {meanWeight}</span>
        </p>
      </div>

      <div onPointerLeave={() => setActive(null)}>
        <table className="w-full border-collapse text-left text-[11px] tracking-wide tabular-nums">
          <thead className="sticky top-12 z-10 bg-ink text-ash">
            <tr className="border-b border-rule">
              <th scope="col" className="w-14 md:hidden">
                <span className="sr-only">Preview</span>
              </th>
              <Head k="id" sort={sort} onSort={onSort}>ID</Head>
              <th scope="col" className="py-2 pr-4 font-normal uppercase">Title</th>
              <th scope="col" className="py-2 pr-4 font-normal uppercase max-xl:hidden">State</th>
              <th scope="col" className="py-2 pr-4 font-normal uppercase max-2xl:hidden">Tags</th>
              <Head k="ratio" sort={sort} onSort={onSort} className="max-sm:hidden">AR</Head>
              <Head k="focal" sort={sort} onSort={onSort} className="max-lg:hidden">Focal</Head>
              <Head k="aperture" sort={sort} onSort={onSort} className="max-lg:hidden">F</Head>
              <Head k="shutter" sort={sort} onSort={onSort} className="max-lg:hidden">Shutter</Head>
              <Head k="iso" sort={sort} onSort={onSort} className="max-lg:hidden">ISO</Head>
              <Head k="date" sort={sort} onSort={onSort} className="max-xl:hidden">Date</Head>
              <Head k="luma" sort={sort} onSort={onSort} className="max-md:hidden">L</Head>
              <Head k="contrast" sort={sort} onSort={onSort} className="max-md:hidden">Δ</Head>
              <Head k="edges" sort={sort} onSort={onSort} className="max-xl:hidden">Edge</Head>
              <Head k="weight" sort={sort} onSort={onSort}>Weight</Head>
              <th scope="col" className="py-2 font-normal uppercase max-md:hidden">Palette</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.id}
                onPointerEnter={(e) => {
                  track(e, active === null)
                  if (hoverable) setActive(p.id)
                }}
                onPointerMove={track}
                onClick={() => onOpen(p.id, null, rows)}
                className={`cursor-zoom-in border-b border-rule/60 ${active === p.id ? 'bg-bone/8' : ''}`}
              >
                <td className="w-14 py-1 md:hidden">
                  <Picture img={p} sizes="48px" className="size-12" />
                </td>
                <td className="py-2 pr-4 whitespace-nowrap">
                  <button type="button" className="cursor-zoom-in text-signal" aria-label={`Open ${p.id}, ${p.title}`}>
                    {p.id}
                  </button>
                </td>
                <td className="py-2 pr-4">{p.title}</td>
                <td className="py-2 pr-4 whitespace-nowrap text-ash max-xl:hidden">{seriesName(p.series)}</td>
                <td className="py-2 pr-4 whitespace-nowrap text-ash max-2xl:hidden">{p.tags.join(' / ')}</td>
                <td className="py-2 pr-4 whitespace-nowrap max-sm:hidden">{p.ratio}</td>
                <td className="py-2 pr-4 whitespace-nowrap max-lg:hidden">{dash(p.exif.focal && `${p.exif.focal}mm`)}</td>
                <td className="py-2 pr-4 whitespace-nowrap max-lg:hidden">{dash(p.exif.aperture)}</td>
                <td className="py-2 pr-4 whitespace-nowrap max-lg:hidden">{dash(p.exif.shutter)}</td>
                <td className="py-2 pr-4 whitespace-nowrap max-lg:hidden">{dash(p.exif.iso)}</td>
                <td className="py-2 pr-4 whitespace-nowrap max-xl:hidden">{dash(p.exif.date)}</td>
                <td className="py-2 pr-4 max-md:hidden">{p.metrics.luma}</td>
                <td className="py-2 pr-4 max-md:hidden">{p.metrics.contrast}</td>
                <td className="py-2 pr-4 max-xl:hidden">{p.metrics.edges}%</td>
                <td className="py-2 pr-4">
                  <span className="flex items-center gap-2">
                    <span className="w-5 text-right">{p.metrics.weight}</span>
                    <span aria-hidden className="h-1 w-16 bg-rule max-sm:hidden">
                      <span className="block h-full bg-bone" style={{ width: `${p.metrics.weight}%` }} />
                    </span>
                  </span>
                </td>
                <td className="py-2 max-md:hidden">
                  <span aria-hidden className="flex">
                    {p.palette.map((c) => (
                      <span key={c} className="size-3" style={{ background: c }} />
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {hoverable && <Preview active={active} x={x} y={y} />}
      </div>

      <p className="mt-6 text-[11px] tracking-wider text-ash uppercase">
        Weight = 0.55 × (1 − L) + 0.45 × Δ. L is mean Rec.709 luma, Δ is the 2nd to 98th percentile spread.
      </p>
    </section>
  )
}
