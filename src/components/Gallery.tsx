import type { CSSProperties, MouseEvent } from 'react'
import { motion } from 'motion/react'
import { exposureLine, manifest, measuredLine, photos, type Photo } from '../photos'
import { Picture } from './Picture'

type OnOpen = (id: string, rect: DOMRect | null) => void

const reveal = { type: 'spring', stiffness: 55, damping: 17, mass: 0.9 } as const

function sizesFor(col: string) {
  const span = Number(/span (\d+)/.exec(col)?.[1] ?? 12)
  return `(min-width: 768px) ${Math.round((span / 12) * 100)}vw, 100vw`
}

function Plate({ photo, onOpen }: { photo: Photo; onOpen: OnOpen }) {
  const open = (e: MouseEvent<HTMLButtonElement>) => onOpen(photo.id, e.currentTarget.getBoundingClientRect())
  const style = {
    '--col': photo.col,
    '--align': photo.align,
    '--offset': `${photo.offset}vw`,
  } as CSSProperties

  return (
    <motion.figure
      id={`plate-${photo.id}`}
      data-orient={photo.aspect < 1 ? 'portrait' : 'landscape'}
      className="plate col-span-12"
      style={style}
      initial={{ opacity: 0, y: 48 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={reveal}
    >
      <button
        type="button"
        onClick={open}
        aria-label={`Open ${photo.id}, ${photo.title}`}
        className="relative block w-full cursor-zoom-in"
      >
        <Picture img={photo} sizes={sizesFor(photo.col)} />
        <span aria-hidden className="ticks" />
      </button>
      <figcaption className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-[11px] tracking-wider uppercase">
        <span>
          <span className="text-signal">{photo.id}</span> {photo.title}
        </span>
        <span className="telemetry text-ash">{exposureLine(photo.exif) || measuredLine(photo.metrics)}</span>
      </figcaption>
    </motion.figure>
  )
}

export function Gallery({ onOpen }: { onOpen: OnOpen }) {
  return (
    <div className="flex flex-col gap-28 px-4 pt-16 pb-28 md:gap-44 md:px-8 md:pt-28 md:pb-44">
      {manifest.series.map((series) => {
        const members = photos.filter((p) => p.series === series.code)
        return (
          <section key={series.code} aria-labelledby={`series-${series.code}`}>
            <header className="mb-10 grid grid-cols-12 gap-x-4 gap-y-3 border-t border-rule pt-3 md:mb-20">
              <p className="col-span-12 text-xs tracking-wider text-signal uppercase md:col-span-2">
                {series.index} // {String(members.length).padStart(2, '0')} frames
              </p>
              <h2
                id={`series-${series.code}`}
                className="col-span-12 font-display text-[clamp(3.75rem,10.5vw,11rem)] leading-[0.85] font-black uppercase md:col-span-7"
              >
                {series.name}
              </h2>
              <p className="col-span-12 max-w-[42ch] self-end text-sm leading-relaxed text-ash md:col-span-3">
                {series.thesis}
              </p>
            </header>
            <div className="grid grid-cols-12 gap-x-4 gap-y-14 md:gap-x-6 md:gap-y-24">
              {members.map((photo) => (
                <Plate key={photo.id} photo={photo} onOpen={onOpen} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
