import { SITE } from '../config'
import { manifest, photoById } from '../photos'
import { Picture } from './Picture'

export function Hero() {
  const hero = photoById(manifest.hero)!
  const { selected } = manifest.stats

  return (
    // The frame's lower third is true black, so the title sits in the photograph's own shadow.
    <section id="top" className="relative flex min-h-svh flex-col justify-end overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[92svh] md:h-full">
        <Picture
          img={hero}
          fill
          priority
          sizes="100vw"
          className="size-full"
          imgClassName="object-cover object-[74%_top] md:object-top"
        />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ink to-transparent md:h-[18%]" />
      </div>
      <div className="relative px-4 pb-6 md:px-8">
        <h1 className="font-display text-[clamp(4.5rem,min(13vw,21svh),14rem)] leading-[0.85] font-black uppercase">
          Light, measured.
        </h1>
        <div className="mt-4 flex flex-wrap justify-between gap-x-8 gap-y-1 text-xs text-ash">
          <p className="max-w-[60ch]">Field notes on light, geometry and the human environment.</p>
          <p className="tracking-wider uppercase">
            {selected} frames // {manifest.series.length} states // Active since {SITE.activeSince}
          </p>
        </div>
      </div>
    </section>
  )
}
