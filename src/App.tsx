import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { About } from './components/About'
import { Footer, Header, type View } from './components/Chrome'
import { Gallery } from './components/Gallery'
import { Hero } from './components/Hero'
import { IndexView } from './components/IndexView'
import { Lightbox } from './components/Lightbox'
import { photoById, photos, type Photo } from './photos'

const idFromHash = () => (photoById(location.hash.slice(1)) ? location.hash.slice(1) : null)

export default function App() {
  const [view, setView] = useState<View>('gallery')
  const [openId, setOpenId] = useState<string | null>(idFromHash)
  const [sequence, setSequence] = useState<Photo[]>(photos)
  const origin = useRef<DOMRect | null>(null)
  const work = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sync = () => setOpenId(idFromHash())
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  useEffect(() => {
    document.documentElement.style.overflow = openId ? 'hidden' : ''
  }, [openId])

  const open = useCallback((id: string, rect: DOMRect | null, order: Photo[] = photos) => {
    origin.current = rect
    setSequence(order)
    history.pushState({ lightbox: true }, '', `#${id}`)
    setOpenId(id)
  }, [])

  const navigate = useCallback((id: string) => {
    origin.current = null
    history.replaceState(history.state, '', `#${id}`)
    setOpenId(id)
  }, [])

  const close = useCallback(() => {
    if (openId) document.getElementById(`plate-${openId}`)?.scrollIntoView({ block: 'center', behavior: 'instant' })
    if (history.state?.lightbox) {
      history.back()
    } else {
      history.replaceState(null, '', location.pathname + location.search)
      setOpenId(null)
    }
  }, [openId])

  const changeView = useCallback((next: View) => {
    setView(next)
    work.current?.scrollIntoView({ behavior: 'instant' })
  }, [])

  const lightboxOrder = useMemo(
    () => (sequence.some((p) => p.id === openId) ? sequence : photos),
    [sequence, openId],
  )

  return (
    <>
      <div inert={openId !== null}>
        <Header view={view} onView={changeView} />
        <main>
          <Hero />
          <div ref={work} className="scroll-mt-12">
            {view === 'gallery' ? <Gallery onOpen={open} /> : <IndexView onOpen={open} />}
          </div>
          <About />
        </main>
        <Footer />
      </div>
      <Lightbox
        id={openId}
        sequence={lightboxOrder}
        origin={origin.current}
        onNavigate={navigate}
        onClose={close}
      />
    </>
  )
}
