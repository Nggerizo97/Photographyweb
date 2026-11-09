import { useCallback, useState } from 'react'
import { asset, srcSet, type Img } from '../photos'

interface Props {
  img: Img
  sizes: string
  /** Above-the-fold image: load eagerly at high priority. */
  priority?: boolean
  /** Load immediately without raising priority. */
  eager?: boolean
  /** Fill the parent instead of reserving the photo's own aspect ratio. */
  fill?: boolean
  className?: string
  imgClassName?: string
}

export function Picture({ img, sizes, priority, eager, fill, className = '', imgClassName = 'object-cover' }: Props) {
  const [loaded, setLoaded] = useState(false)
  // A cached image can finish before React attaches onLoad.
  const measure = useCallback((el: HTMLImageElement | null) => {
    if (el?.complete && el.naturalWidth) setLoaded(true)
  }, [])

  return (
    <div
      className={`relative overflow-hidden bg-cover bg-center ${className}`}
      style={{
        aspectRatio: fill ? undefined : `${img.width} / ${img.height}`,
        backgroundImage: `url(${img.lqip})`,
      }}
    >
      <picture>
        <source type="image/avif" srcSet={srcSet(img, 'avif')} sizes={sizes} />
        <source type="image/webp" srcSet={srcSet(img, 'webp')} sizes={sizes} />
        <img
          ref={measure}
          src={asset(`photos/${img.slug}-${img.widths[Math.min(1, img.widths.length - 1)]}.webp`)}
          alt={img.alt}
          width={img.width}
          height={img.height}
          loading={priority || eager ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          className={`absolute inset-0 size-full transition-opacity duration-500 ${imgClassName} ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      </picture>
    </div>
  )
}
