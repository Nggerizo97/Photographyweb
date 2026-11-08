/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  CURATION MANIFEST
 * ─────────────────────────────────────────────────────────────────────────────
 *  This is the single place where editorial decisions live.
 *
 *  - Drop source frames (JPG / PNG / TIFF / WebP / AVIF) into ./image
 *  - `npm run ingest` analyses every frame and prints a curation report.
 *  - List the frames you want published in `selected`, in display order.
 *    Anything not listed is NOT published. Ruthless by default.
 *  - While `selected` is empty, the pipeline falls back to a computational
 *    pre-curation (quality gate + near-duplicate rejection + heuristic series
 *    assignment) so the site never ships empty. Treat that as a draft.
 *
 *  Matching on `id` is the filename without extension, case-insensitive.
 */

/** @typedef {'structural' | 'chiaroscuro' | 'street' | 'altitude'} SeriesId */

export default {
  /** Source directory (relative to repo root). */
  source: 'image',

  /** The only frame with the photographer in it. Reserved for the About section. */
  portrait: {
    id: 'DSC05898',
    alt: 'Nicolas Guarin Gaviria, the photographer — the only frame in the archive with the observer in it.',
  },

  /** Hero frame id. `null` = the published landscape frame with the highest visual weight. */
  hero: null,

  /** Fallback pre-curation: share of eligible frames kept (the brief: 60–75%). */
  autoKeepRatio: 0.7,

  /** Hamming distance on the 64-bit dHash under which two frames count as the same shot. */
  duplicateThreshold: 10,

  series: [
    {
      id: 'structural',
      index: '01',
      title: 'Structural Tension',
      kicker: 'Urban geometry',
      description:
        'Facades, stairwells, cables, concrete. Load paths made visible. I read a building the way I read a system diagram — where the forces go, what holds, and where the symmetry breaks.',
    },
    {
      id: 'chiaroscuro',
      index: '02',
      title: 'Chiaroscuro',
      kicker: 'Light & shadow',
      description:
        'Hard light, deep shadow, very little in between. A thresholding problem: most of the frame is allowed to fall to zero so the remaining edge carries all of the information.',
    },
    {
      id: 'street',
      index: '03',
      title: 'Human Signal',
      kicker: 'Street',
      description:
        'People as moving data points inside rigid geometry — the one variable a city cannot fully constrain. Unposed, unstaged, mostly unaware.',
    },
    {
      id: 'altitude',
      index: '04',
      title: 'High-Altitude Isolation',
      kicker: 'Mountain & forest',
      description:
        'Ridgelines, cloud forest, thin air. Up here the signal-to-noise ratio inverts: no facades, no traffic — only weather, scale and silence.',
    },
  ],

  /**
   * Published frames, in display order.
   * { id: 'DSC01234', series: 'structural', title?: string, alt?: string, note?: string }
   */
  selected: [],

  /** Optional: record why frames were cut. Shown in the ingest report only. */
  rejected: [
    // { id: 'DSC01111', reason: 'Redundant with DSC01112 — weaker diagonal.' },
  ],
};
