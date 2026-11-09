import { SITE } from '../config'
import { manifest } from '../photos'
import { Picture } from './Picture'

const TRANSLATION = [
  ['Computer vision', 'Edges and gradients first. The subject arrives later.'],
  ['Mechatronics', 'Load paths, tolerances, where a structure is working hardest.'],
  ['Software architecture', 'Constraints are the design. One zoom, one phone, whatever light exists.'],
  ['Data engineering', 'Most of any signal is noise. The job is deciding what to throw away.'],
]

export function About() {
  const { portrait, stats } = manifest

  return (
    <section id="about" className="border-t border-rule px-4 py-16 md:px-8 md:py-28">
      <div className="grid grid-cols-12 gap-x-6 gap-y-10">
        <figure className="col-span-12 sm:col-span-7 md:col-span-5 lg:col-span-4">
          <Picture img={portrait} sizes="(min-width: 1024px) 33vw, (min-width: 768px) 42vw, (min-width: 640px) 58vw, 100vw" />
          <figcaption className="mt-2 text-[11px] tracking-wider text-ash uppercase">The operator // {SITE.author}</figcaption>
        </figure>

        <div className="col-span-12 md:col-span-7 lg:col-span-7 lg:col-start-6">
          <p className="text-xs tracking-wider text-signal uppercase">
            {String(manifest.series.length + 1).padStart(2, '0')} // Synergy
          </p>
          <h2 className="mt-3 font-display text-[clamp(3.25rem,7.5vw,8rem)] leading-[0.88] font-black uppercase">
            The engineer behind the lens
          </h2>

          <div className="mt-8 max-w-[64ch] space-y-5 text-sm leading-relaxed md:text-[15px]">
            <p>
              I build systems for a living: robotics and computer vision first, then cloud architecture, data
              platforms and AI in production. I have been photographing since {SITE.activeSince}, and for most of that
              time I have been doing the same job with a different instrument.
            </p>
            <p>
              A camera is a sensor. What it records is photons, and everything after that is a decision about what to
              keep. I stand in a place, measure what the light does to concrete, stone, fog and people, and treat the
              result as an observation. If a frame does not hold up, it goes.
            </p>
            <p>
              {stats.reviewed} frames went through review for this site. {stats.selected} survived. The numbers next to
              them are real, read from the files at build time. Where a file has no sensor data, the field says so.
            </p>
          </div>

          <dl className="mt-10 border-t border-rule text-[11px] tracking-wider uppercase">
            {TRANSLATION.map(([discipline, effect]) => (
              <div key={discipline} className="grid gap-x-6 border-b border-rule py-2.5 sm:grid-cols-[14rem_1fr]">
                <dt className="text-signal">{discipline}</dt>
                <dd className="text-ash">{effect}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-4 text-[11px] tracking-wider text-ash uppercase">
            Sensor data on {stats.withSensorData}/{stats.selected} frames // {stats.mirrorless} on ILCE-7C + {stats.lens}{' '}
            // {stats.phone} on phone
          </p>
        </div>
      </div>
    </section>
  )
}
