import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { animate, AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { photoById, seriesName, type Photo } from '../photos'
import { Picture } from './Picture'

interface Props {
  id: string | null
  sequence: Photo[]
  origin: DOMRect | null
  onNavigate: (id: string) => void
  onClose: () => void
}

const slide = { type: 'spring', stiffness: 260, damping: 32 } as const
const variants = {
  enter: (dir: number) => ({ x: dir * 90, opacity: 0 }),
  centre: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -90, opacity: 0 }),
}

const sizesFor = (aspect: number) => `min(100vw, ${Math.round(aspect * 100)}vh)`

function useIdle(ms: number) {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    let timer: number
    const wake = () => {
      setIdle(false)
      clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), ms)
    }
    wake()
    const events = ['pointermove', 'pointerdown', 'keydown'] as const
    events.forEach((e) => window.addEventListener(e, wake))
    return () => {
      clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, wake))
    }
  }, [ms])
  return idle
}

/** Flies the first image out of the thumbnail that was clicked. */
function FromThumbnail({ origin, children }: { origin: DOMRect | null; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !origin || reduced) return
    const target = el.getBoundingClientRect()
    const x = origin.left + origin.width / 2 - (target.left + target.width / 2)
    const y = origin.top + origin.height / 2 - (target.top + target.height / 2)
    const scale = origin.width / target.width
    el.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
    const controls = animate(el, { x: [x, 0], y: [y, 0], scale: [scale, 1] }, { type: 'spring', stiffness: 190, damping: 27 })
    return () => controls.stop()
    // Runs once per slide: only the slide that opened the lightbox receives an origin.
  }, [])

  return <div ref={ref}>{children}</div>
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-rule/60 py-1">
      <dt className="text-ash">{label}</dt>
      <dd className="text-right">{value ?? <span className="text-ash">Not embedded</span>}</dd>
    </div>
  )
}

function Histogram({ bins }: { bins: number[] }) {
  const d = bins.map((v, i) => `M${i + 0.5} 20V${20 - (v / 100) * 20}`).join('')
  return (
    <svg
      viewBox={`0 0 ${bins.length} 20`}
      preserveAspectRatio="none"
      className="h-16 w-full text-bone"
      role="img"
      aria-label="Luminance histogram"
    >
      <path d={d} stroke="currentColor" strokeWidth="0.8" fill="none" />
    </svg>
  )
}

function Telemetry({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  const { exif, metrics } = photo
  return (
    <motion.aside
      aria-label="Telemetry"
      initial={{ opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 32 }}
      transition={slide}
      className="absolute inset-x-0 bottom-0 z-10 max-h-[62%] overflow-y-auto border-t border-rule bg-ink p-4 pb-14 text-[11px] tracking-wide uppercase md:inset-x-auto md:top-0 md:right-0 md:max-h-none md:w-[340px] md:border-t-0 md:border-l"
    >
      <div className="flex items-baseline justify-between">
        <p className="text-signal">{photo.id}</p>
        <button type="button" onClick={onClose} className="cursor-pointer text-ash hover:text-bone md:hidden">
          Hide
        </button>
      </div>
      <h2 className="mt-1 font-display text-4xl leading-none font-black">{photo.title}</h2>
      <p className="mt-1 text-ash">{seriesName(photo.series)}</p>

      <h3 className="mt-5 mb-1 text-ash">// Luminance</h3>
      <Histogram bins={metrics.histogram} />

      <h3 className="mt-5 mb-1 text-ash">// Sensor</h3>
      <dl>
        <Row label="Camera" value={exif.camera} />
        <Row label="Lens" value={exif.lens} />
        <Row label="Focal" value={exif.focal && `${exif.focal}mm`} />
        <Row label="Aperture" value={exif.aperture && `ƒ/${exif.aperture}`} />
        <Row label="Shutter" value={exif.shutter} />
        <Row label="ISO" value={exif.iso} />
        <Row label="Date" value={exif.date} />
      </dl>

      <h3 className="mt-5 mb-1 text-ash">// Measured</h3>
      <dl>
        <Row label="Native" value={`${photo.width} × ${photo.height}`} />
        <Row label="Ratio" value={photo.ratio} />
        <Row label="Mean luma" value={metrics.luma} />
        <Row label="Contrast" value={metrics.contrast} />
        <Row label="Shadows" value={`${metrics.shadows}%`} />
        <Row label="Highlights" value={`${metrics.highlights}%`} />
        <Row label="Edge density" value={`${metrics.edges}%`} />
        <Row label="Visual weight" value={metrics.weight} />
      </dl>

      <h3 className="mt-5 mb-1 text-ash">// Palette</h3>
      <ul className="flex">
        {photo.palette.map((c) => (
          <li key={c} className="flex-1">
            <span className="block h-6" style={{ background: c }} />
            <span className="mt-1 block text-[9px] text-ash normal-case">{c}</span>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-ash">{photo.tags.join(' / ')}</p>
      <p className="mt-1 text-ash normal-case">{photo.source}</p>
    </motion.aside>
  )
}

function Dialog({ photo, sequence, origin, onNavigate, onClose }: Omit<Props, 'id'> & { photo: Photo }) {
  const [panel, setPanel] = useState(false)
  const [direction, setDirection] = useState(0)
  const idle = useIdle(2600)
  const [fades] = useState(() => matchMedia('(hover: hover)').matches)
  const closeButton = useRef<HTMLButtonElement>(null)
  const index = sequence.findIndex((p) => p.id === photo.id)
  const neighbour = (d: number) => sequence[(index + d + sequence.length) % sequence.length]

  const step = useCallback(
    (d: number) => {
      setDirection(d)
      onNavigate(sequence[(index + d + sequence.length) % sequence.length].id)
    },
    [index, sequence, onNavigate],
  )

  useEffect(() => {
    closeButton.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key.toLowerCase() === 'i') setPanel((p) => !p)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, onClose])

  const hidden = idle && fades && !panel
  const chrome = `transition-opacity duration-500 ${hidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`
  const control = 'cursor-pointer px-2 py-1 uppercase text-ash hover:text-bone'
  const arrow = `absolute top-1/2 z-[5] hidden -translate-y-1/2 cursor-pointer p-4 text-lg text-ash hover:text-bone md:block ${chrome}`

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`${photo.id}, ${photo.title}`}
      className={`fixed inset-0 z-50 bg-ink ${hidden ? 'cursor-none' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <div
        className={`size-full px-2 pt-2 pb-11 transition-[padding] duration-300 md:px-14 md:pt-4 ${panel ? 'max-md:pb-[62dvh] md:pr-[396px]' : ''}`}
      >
        <div
          className="relative size-full overflow-hidden [container-type:size]"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <AnimatePresence initial={false} custom={direction}>
            <motion.div
              key={photo.id}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="centre"
              exit="exit"
              transition={slide}
              drag="x"
              dragSnapToOrigin
              dragElastic={0.2}
              onDragEnd={(_, { offset, velocity }) => {
                if (Math.abs(offset.x) > 90 || Math.abs(velocity.x) > 500) step(offset.x < 0 ? 1 : -1)
              }}
              className="absolute inset-0 m-auto h-fit"
              style={{ width: `min(100cqw, calc(100cqh * ${photo.aspect}))` }}
            >
              <FromThumbnail origin={origin}>
                <Picture img={photo} priority sizes={sizesFor(photo.aspect)} imgClassName="object-contain" />
              </FromThumbnail>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Neighbours are decoded ahead of time so arrow keys feel instant. */}
      <div aria-hidden className="absolute size-0 overflow-hidden">
        {[neighbour(1), neighbour(-1)].map((p) => (
          <div key={p.id} className="w-screen">
            <Picture img={p} eager sizes={sizesFor(p.aspect)} />
          </div>
        ))}
      </div>

      <button type="button" aria-label="Previous frame" onClick={() => step(-1)} className={`${arrow} left-1`}>
        ←
      </button>
      <button
        type="button"
        aria-label="Next frame"
        onClick={() => step(1)}
        className={`${arrow} transition-[right] ${panel ? 'md:right-[344px]' : 'right-1'}`}
      >
        →
      </button>

      <AnimatePresence>{panel && <Telemetry photo={photo} onClose={() => setPanel(false)} />}</AnimatePresence>

      <div
        className={`absolute inset-x-0 bottom-0 z-20 flex h-11 items-center justify-between gap-3 bg-ink px-3 text-[11px] tracking-wider md:px-5 ${chrome}`}
      >
        <p className="truncate uppercase">
          <span className="text-signal">{photo.id}</span> {photo.title}
          <span className="ml-3 text-ash">
            {String(index + 1).padStart(2, '0')}/{String(sequence.length).padStart(2, '0')}
          </span>
        </p>
        <div className="flex shrink-0 items-center">
          <button type="button" aria-pressed={panel} onClick={() => setPanel((p) => !p)} className={control}>
            <span className={panel ? 'text-signal' : ''}>
              <span className="max-md:hidden">[I] </span>Telemetry
            </span>
          </button>
          <button ref={closeButton} type="button" onClick={onClose} className={control}>
            <span className="max-md:hidden">[Esc] </span>Close
          </button>
        </div>
      </div>
    </motion.div>
  )
}

export function Lightbox({ id, ...rest }: Props) {
  const photo = photoById(id)
  return <AnimatePresence>{photo && <Dialog key="lightbox" photo={photo} {...rest} />}</AnimatePresence>
}
