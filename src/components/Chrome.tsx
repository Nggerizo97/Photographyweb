import { SITE } from '../config'

export type View = 'gallery' | 'index'

const VIEWS: { value: View; label: string }[] = [
  { value: 'gallery', label: 'Gallery' },
  { value: 'index', label: 'Index' },
]

function ViewToggle({ view, onView }: { view: View; onView: (v: View) => void }) {
  return (
    <div role="group" aria-label="View mode" className="relative grid grid-cols-2 border border-rule">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1/2 bg-bone transition-transform duration-300 ease-[cubic-bezier(0.2,1.25,0.4,1)]"
        style={{ transform: view === 'index' ? 'translateX(100%)' : undefined }}
      />
      {VIEWS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={view === value}
          onClick={() => onView(value)}
          className={`relative cursor-pointer px-3 py-1.5 uppercase transition-colors duration-150 ${view === value ? 'text-ink' : 'text-ash hover:text-bone'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function Header({ view, onView }: { view: View; onView: (v: View) => void }) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-12 items-center justify-between gap-3 border-b border-rule bg-ink/90 px-4 text-[11px] tracking-wider backdrop-blur-sm md:px-8">
      <a href="#top" className="uppercase">
        <span className="sm:hidden">NG</span>
        <span className="hidden sm:inline">{SITE.author} // Observations</span>
      </a>
      <ViewToggle view={view} onView={onView} />
      <a
        href={SITE.engineeringUrl}
        aria-label="Switch to Software & AI Engineering Portfolio"
        className="bridge border border-rule px-2 py-1.5 whitespace-nowrap uppercase"
      >
        <span className="text-signal [.bridge:hover_&]:text-ink">[ -&gt; </span>
        <span className="md:hidden">Engineer</span>
        <span className="hidden md:inline xl:hidden">Software &amp; AI</span>
        <span className="hidden xl:inline">Switch to Software &amp; AI Engineering Portfolio</span>
        <span className="text-signal [.bridge:hover_&]:text-ink"> ]</span>
      </a>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-rule px-4 pt-12 pb-6 md:px-8 md:pt-20">
      <p className="text-xs text-ash">$ cd ~/engineering</p>
      <a
        href={SITE.engineeringUrl}
        className="bridge -mx-2 mt-3 block px-2 py-3 font-display text-[clamp(2.25rem,7.5vw,7.5rem)] leading-[0.95] font-black uppercase"
      >
        <span className="text-signal [.bridge:hover_&]:text-ink">[ -&gt; </span>
        Switch to Software &amp; AI Engineering Portfolio
        <span className="text-signal [.bridge:hover_&]:text-ink"> ]</span>
      </a>
      <div className="mt-12 flex flex-wrap justify-between gap-2 text-[11px] tracking-wider text-ash uppercase md:mt-20">
        <span>
          © {SITE.activeSince}–{new Date().getFullYear()} {SITE.author}
        </span>
        <span>All frames all rights reserved</span>
      </div>
    </footer>
  )
}
