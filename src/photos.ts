import raw from './data/manifest.json'

export interface Exif {
  camera: string | null
  lens: string | null
  focal: number | null
  aperture: number | null
  shutter: string | null
  shutterSeconds: number | null
  iso: number | null
  date: string | null
}

export interface Metrics {
  luma: number
  contrast: number
  shadows: number
  highlights: number
  edges: number
  weight: number
  histogram: number[]
}

export interface Img {
  slug: string
  alt: string
  width: number
  height: number
  widths: number[]
  lqip: string
}

export interface Photo extends Img {
  id: string
  source: string
  series: string
  title: string
  tags: string[]
  col: string
  align: string
  offset: number
  aspect: number
  ratio: string
  palette: string[]
  metrics: Metrics
  exif: Exif
}

export interface Series {
  code: string
  index: string
  name: string
  thesis: string
}

interface Manifest {
  hero: string
  series: Series[]
  portrait: Img
  stats: {
    reviewed: number
    selected: number
    withSensorData: number
    mirrorless: number
    phone: number
    lens: string | null
  }
  photos: Photo[]
}

export const manifest = raw as unknown as Manifest
export const photos = manifest.photos
export const photoById = (id: string | null) => photos.find((p) => p.id === id)
export const seriesName = (code: string) => manifest.series.find((s) => s.code === code)?.name ?? code

export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`

export const srcSet = (img: Img, ext: 'avif' | 'webp') =>
  img.widths.map((w) => `${asset(`photos/${img.slug}-${w}.${ext}`)} ${w}w`).join(', ')

export const exposureLine = ({ focal, aperture, shutter, iso }: Exif) =>
  [focal && `${focal}mm`, aperture && `ƒ/${aperture}`, shutter, iso && `ISO ${iso}`].filter(Boolean).join(' · ')

export const measuredLine = ({ luma, contrast, edges }: Metrics) => `L ${luma} · Δ ${contrast} · EDGE ${edges}%`
