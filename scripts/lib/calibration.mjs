/**
 * Synthetic calibration frames.
 *
 * Used ONLY when ./image holds no supported files, so the pipeline, layout
 * engine and UI can be developed and verified end-to-end. They are rendered
 * into .cache/calibration (git-ignored), carry a visible "CALIBRATION" label,
 * and the site shows a CALIBRATION MODE banner whenever they are in use.
 *
 * The set intentionally includes bad frames (flat, soft, duplicate, weak) so
 * the curation gates have something to reject.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1-D midpoint displacement -> SVG ridge path closed to the bottom edge. */
function ridge(W, H, baseY, amp, seed, rough = 0.55, steps = 9) {
  const r = prng(seed);
  let pts = [baseY + (r() - 0.5) * amp, baseY + (r() - 0.5) * amp];
  let a = amp;
  for (let s = 0; s < steps; s++) {
    const next = [];
    for (let i = 0; i < pts.length - 1; i++) next.push(pts[i], (pts[i] + pts[i + 1]) / 2 + (r() - 0.5) * a);
    next.push(pts[pts.length - 1]);
    pts = next;
    a *= rough;
  }
  const dx = W / (pts.length - 1);
  return `M0,${H} ` + pts.map((y, i) => `L${(i * dx).toFixed(1)},${y.toFixed(1)}`).join(' ') + ` L${W},${H} Z`;
}

const figure = (x, y, s, fill = '#050505') =>
  `<g fill="${fill}"><ellipse cx="${x}" cy="${y}" rx="${7 * s}" ry="${8.5 * s}"/>` +
  `<path d="M${x - 11 * s},${y + 10 * s} Q${x},${y + 4 * s} ${x + 11 * s},${y + 10 * s} L${x + 9 * s},${y + 50 * s} L${x + 6 * s},${y + 92 * s} L${x + 1.5 * s},${y + 92 * s} L${x},${y + 56 * s} L${x - 1.5 * s},${y + 92 * s} L${x - 6 * s},${y + 92 * s} L${x - 9 * s},${y + 50 * s} Z"/></g>`;

const label = (W, H, id) =>
  `<text x="${W * 0.025}" y="${H - W * 0.022}" font-family="JetBrains Mono, DejaVu Sans Mono, monospace" font-size="${Math.round(W * 0.011)}" fill="#ffffff" fill-opacity="0.55" letter-spacing="2">CALIBRATION FRAME // ${id} // SYNTHETIC — REPLACE WITH ./image</text>`;

const wrap = (W, H, body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${body}</svg>`;

/** Each entry: id, size, series hint, title, svg(W,H). */
export const FRAMES = [
  {
    id: 'CAL-01', w: 2400, h: 1600, series: 'structural', title: 'Load Path',
    alt: 'Synthetic calibration frame: a skewed facade grid of lit and unlit windows under a pale sky.',
    svg(W, H) {
      const r = prng(1);
      let win = '';
      for (let c = 0; c < 11; c++) for (let row = 0; row < 18; row++) {
        const lit = r();
        win += `<rect x="${60 + c * W * 0.058}" y="${-H * 0.15 + row * H * 0.075}" width="${W * 0.036}" height="${H * 0.048}" fill="${lit > 0.72 ? '#f2efe8' : lit > 0.35 ? '#5a5a5a' : '#1a1a1a'}"/>`;
      }
      return wrap(W, H,
        `<rect width="${W}" height="${H}" fill="url(#sky)"/>` +
        `<g transform="skewY(-7)"><rect x="0" y="${-H * 0.3}" width="${W * 0.7}" height="${H * 1.8}" fill="url(#face)"/>${win}</g>` +
        `<polygon points="${W * 0.7},${-W * 0.7 * 0.123} ${W * 0.84},${H * 0.05} ${W * 0.84},${H} ${W * 0.7},${H}" fill="#070707"/>` +
        `<rect width="${W}" height="${H}" fill="url(#sun)"/>`,
        `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ebebeb"/><stop offset="1" stop-color="#a9a9a9"/></linearGradient>` +
        `<linearGradient id="face" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a4a4a"/><stop offset="1" stop-color="#0d0d0d"/></linearGradient>` +
        `<linearGradient id="sun" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.18"/><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></linearGradient>`);
    },
  },
  {
    id: 'CAL-02', w: 1600, h: 2400, series: 'structural', title: 'Recursion',
    alt: 'Synthetic calibration frame: nested rotated squares spiralling inward like a stairwell seen from above.',
    svg(W, H) {
      let g = '';
      let s = W * 1.25;
      for (let i = 0; i < 26; i++) {
        const v = i % 2 ? 18 + i * 3 : 225 - i * 4;
        g += `<rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" fill="rgb(${v},${v},${v})" transform="rotate(${i * 7})"/>`;
        s *= 0.86;
      }
      return wrap(W, H, `<rect width="${W}" height="${H}" fill="#0b0b0b"/><g transform="translate(${W / 2},${H * 0.52})">${g}</g><rect width="${W}" height="${H}" fill="url(#v)"/>`,
        `<radialGradient id="v" cx="0.5" cy="0.5" r="0.75"><stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.8"/></radialGradient>`);
    },
  },
  {
    id: 'CAL-03', w: 2400, h: 1500, series: 'structural', title: 'Shear',
    alt: 'Synthetic calibration frame: heavy diagonal beams casting hard parallel shadows on a pale wall.',
    svg(W, H) {
      let bars = '';
      for (let i = -4; i < 14; i++) {
        const x = i * W * 0.11;
        bars += `<rect x="${x + 38}" y="${-H}" width="${W * 0.045}" height="${H * 3}" fill="#000" fill-opacity="0.55" filter="url(#b)"/>`;
        bars += `<rect x="${x}" y="${-H}" width="${W * 0.045}" height="${H * 3}" fill="url(#bar)"/>`;
      }
      return wrap(W, H, `<rect width="${W}" height="${H}" fill="#cfccc6"/><g transform="rotate(34 ${W / 2} ${H / 2})">${bars}</g>`,
        `<linearGradient id="bar" x1="0" x2="1"><stop offset="0" stop-color="#2a2a2a"/><stop offset="1" stop-color="#0a0a0a"/></linearGradient><filter id="b"><feGaussianBlur stdDeviation="6"/></filter>`);
    },
  },
  {
    id: 'CAL-04', w: 1600, h: 2000, series: 'structural', title: 'Vertical Bias',
    alt: 'Synthetic calibration frame: tall vertical concrete slabs rising against a white sky.',
    svg(W, H) {
      const r = prng(4);
      let slabs = '';
      let x = -20;
      while (x < W) {
        const w = W * (0.05 + r() * 0.12);
        const top = H * (0.05 + r() * 0.35);
        const v = Math.round(20 + r() * 120);
        slabs += `<rect x="${x}" y="${top}" width="${w}" height="${H}" fill="rgb(${v},${v},${v + 4})"/><rect x="${x + w - 6}" y="${top}" width="6" height="${H}" fill="#000" fill-opacity="0.6"/>`;
        x += w + W * 0.012 * r();
      }
      return wrap(W, H, `<rect width="${W}" height="${H}" fill="url(#s)"/>${slabs}`,
        `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f5f5f5"/><stop offset="1" stop-color="#bdbdbd"/></linearGradient>`);
    },
  },
  {
    id: 'CAL-05', w: 1600, h: 2400, series: 'chiaroscuro', title: 'Threshold',
    alt: 'Synthetic calibration frame: a single shaft of light falling into a black room onto a lone figure.',
    svg(W, H) {
      return wrap(W, H,
        `<rect width="${W}" height="${H}" fill="#030303"/>` +
        `<polygon points="${W * 0.62},0 ${W * 0.86},0 ${W * 0.7},${H * 0.86} ${W * 0.22},${H * 0.86}" fill="url(#beam)" filter="url(#soft)"/>` +
        `<ellipse cx="${W * 0.46}" cy="${H * 0.86}" rx="${W * 0.3}" ry="${H * 0.035}" fill="#f4f1ea" filter="url(#soft)"/>` +
        figure(W * 0.47, H * 0.62, 5.2, '#000'),
        `<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.85"/><stop offset="1" stop-color="#fff" stop-opacity="0.2"/></linearGradient><filter id="soft"><feGaussianBlur stdDeviation="14"/></filter>`);
    },
  },
  {
    id: 'CAL-06', w: 2400, h: 1600, series: 'chiaroscuro', title: 'Projection',
    alt: 'Synthetic calibration frame: a dark interior where a window throws a bright skewed rectangle onto the floor.',
    svg(W, H) {
      return wrap(W, H,
        `<rect width="${W}" height="${H}" fill="#060606"/>` +
        `<rect x="${W * 0.08}" y="${H * 0.12}" width="${W * 0.22}" height="${H * 0.42}" fill="#fbfaf6"/>` +
        `<rect x="${W * 0.187}" y="${H * 0.12}" width="${W * 0.008}" height="${H * 0.42}" fill="#0a0a0a"/><rect x="${W * 0.08}" y="${H * 0.32}" width="${W * 0.22}" height="${H * 0.01}" fill="#0a0a0a"/>` +
        `<g filter="url(#f)"><polygon points="${W * 0.36},${H * 0.74} ${W * 0.78},${H * 0.66} ${W * 0.98},${H * 0.98} ${W * 0.45},${H * 1.08}" fill="#e9e5dc"/></g>` +
        `<polygon points="${W * 0.565},${H * 0.7} ${W * 0.58},${H * 0.698} ${W * 0.74},${H * 1.03} ${W * 0.725},${H * 1.035}" fill="#060606"/>`,
        `<filter id="f"><feGaussianBlur stdDeviation="5"/></filter>`);
    },
  },
  {
    id: 'CAL-07', w: 2000, h: 2000, series: 'chiaroscuro', title: 'Terminator',
    alt: 'Synthetic calibration frame: a sphere lit hard from the upper left, half of it lost to black.',
    svg(W, H) {
      return wrap(W, H, `<rect width="${W}" height="${H}" fill="#020202"/><circle cx="${W * 0.5}" cy="${H * 0.52}" r="${W * 0.32}" fill="url(#g)"/>`,
        `<radialGradient id="g" cx="0.28" cy="0.26" r="0.78"><stop offset="0" stop-color="#ffffff"/><stop offset="0.35" stop-color="#9a9a9a"/><stop offset="0.62" stop-color="#151515"/><stop offset="1" stop-color="#000"/></radialGradient>`);
    },
  },
  {
    id: 'CAL-08', w: 2400, h: 1600, series: 'street', title: 'Crossing',
    alt: 'Synthetic calibration frame: three silhouetted pedestrians crossing white zebra stripes, long shadows behind them.',
    svg(W, H) {
      let stripes = '';
      for (let i = 0; i < 9; i++) {
        const y0 = H * (0.42 + i * 0.07), y1 = y0 + H * 0.035;
        stripes += `<polygon points="${W * 0.2 - i * 40},${y0} ${W * 0.8 + i * 40},${y0} ${W * 0.82 + i * 46},${y1} ${W * 0.18 - i * 46},${y1}" fill="#e8e6e1"/>`;
      }
      const people = [[0.33, 0.36, 3.2], [0.52, 0.4, 3.6], [0.66, 0.34, 3.0]]
        .map(([x, y, s]) => `<ellipse cx="${W * x - 140}" cy="${H * y + 92 * s}" rx="${150}" ry="${14}" fill="#000" fill-opacity="0.55" transform="skewX(-30)"/>` + figure(W * x, H * y, s))
        .join('');
      return wrap(W, H, `<rect width="${W}" height="${H}" fill="url(#asph)"/>${stripes}${people}`,
        `<linearGradient id="asph" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2b2b"/><stop offset="1" stop-color="#4a4a4a"/></linearGradient>`);
    },
  },
  {
    id: 'CAL-09', w: 2400, h: 1350, series: 'street', title: 'Underpass',
    alt: 'Synthetic calibration frame: a converging concrete tunnel with a lone figure against the bright exit.',
    svg(W, H) {
      let rings = '';
      for (let i = 0; i < 16; i++) {
        const k = 1 - i / 17;
        const v = Math.round(10 + i * 9);
        rings += `<rect x="${(W - W * k) / 2}" y="${(H - H * k) / 2}" width="${W * k}" height="${H * k}" fill="rgb(${v},${v},${v})"/>`;
      }
      return wrap(W, H, `${rings}<rect x="${W * 0.455}" y="${H * 0.44}" width="${W * 0.09}" height="${H * 0.12}" fill="#fffdf6"/>` + figure(W * 0.5, H * 0.468, 0.62), '');
    },
  },
  {
    id: 'CAL-10', w: 1600, h: 2400, series: 'street', title: 'Sodium',
    alt: 'Synthetic calibration frame: a figure under an orange sodium street lamp at night on wet ground.',
    svg(W, H) {
      return wrap(W, H,
        `<rect width="${W}" height="${H}" fill="#04060a"/>` +
        `<ellipse cx="${W * 0.55}" cy="${H * 0.2}" rx="${W * 0.7}" ry="${H * 0.45}" fill="url(#glow)"/>` +
        `<rect x="${W * 0.548}" y="${H * 0.16}" width="10" height="${H}" fill="#020202"/>` +
        `<rect x="${W * 0.5}" y="${H * 0.155}" width="${W * 0.1}" height="14" fill="#ffd9a0"/>` +
        `<rect x="0" y="${H * 0.78}" width="${W}" height="${H * 0.22}" fill="url(#wet)"/>` +
        figure(W * 0.4, H * 0.62, 3.0, '#000'),
        `<radialGradient id="glow"><stop offset="0" stop-color="#ff9a3c" stop-opacity="0.9"/><stop offset="0.4" stop-color="#b8560f" stop-opacity="0.45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>` +
        `<linearGradient id="wet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a1f08"/><stop offset="1" stop-color="#050505"/></linearGradient>`);
    },
  },
  {
    id: 'CAL-11', w: 3000, h: 1250, series: 'altitude', title: 'Ridgelines',
    alt: 'Synthetic calibration frame: layered mountain ridges fading into blue haze under a pale sky.',
    svg(W, H) {
      const layers = ['#a9b8c4', '#8395a3', '#5d6f7d', '#3b4a55', '#1f2a31', '#0d1317']
        .map((c, i) => `<path d="${ridge(W, H, H * (0.36 + i * 0.1), H * (0.32 - i * 0.03), 11 + i)}" fill="${c}"/>`).join('');
      return wrap(W, H, `<rect width="${W}" height="${H}" fill="url(#sky)"/>${layers}`,
        `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3e8ec"/><stop offset="1" stop-color="#c3ced6"/></linearGradient>`);
    },
  },
  {
    id: 'CAL-12', w: 2400, h: 1600, series: 'altitude', title: 'Above the Ceiling',
    alt: 'Synthetic calibration frame: a dark summit rising above a sea of cloud under a deep blue sky.',
    svg(W, H) {
      let clouds = '';
      const r = prng(12);
      for (let i = 0; i < 40; i++) clouds += `<ellipse cx="${r() * W}" cy="${H * (0.72 + r() * 0.25)}" rx="${W * (0.08 + r() * 0.12)}" ry="${H * (0.04 + r() * 0.05)}" fill="#f3f5f7" fill-opacity="${0.6 + r() * 0.4}"/>`;
      return wrap(W, H,
        `<rect width="${W}" height="${H}" fill="url(#sky)"/>` +
        `<path d="M${W * 0.18},${H} L${W * 0.46},${H * 0.22} L${W * 0.52},${H * 0.3} L${W * 0.58},${H * 0.2} L${W * 0.86},${H} Z" fill="#14181c"/>` +
        `<path d="M${W * 0.46},${H * 0.22} L${W * 0.52},${H * 0.3} L${W * 0.58},${H * 0.2} L${W * 0.62},${H * 0.36} L${W * 0.55},${H * 0.34} L${W * 0.5},${H * 0.42} Z" fill="#dfe6ec"/>` +
        `<g filter="url(#c)">${clouds}</g>`,
        `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d2340"/><stop offset="1" stop-color="#5b7fa6"/></linearGradient><filter id="c"><feGaussianBlur stdDeviation="22"/></filter>`);
    },
  },
  {
    id: 'CAL-13', w: 1600, h: 2000, series: 'altitude', title: 'Cloud Forest',
    alt: 'Synthetic calibration frame: irregular tree trunks receding into green fog.',
    svg(W, H) {
      const r = prng(13);
      let trunks = '';
      for (let i = 0; i < 34; i++) {
        const depth = r();
        const x = r() * W;
        const w = 8 + (1 - depth) * 70;
        const bend = (r() - 0.5) * 90;
        const v = Math.round(20 + depth * 120);
        trunks += `<path d="M${x},${H} C${x + bend},${H * 0.6} ${x - bend},${H * 0.3} ${x + bend / 2},0 L${x + bend / 2 + w},0 C${x - bend + w},${H * 0.3} ${x + bend + w},${H * 0.6} ${x + w},${H} Z" fill="rgb(${v - 10},${v + 8},${v - 4})" fill-opacity="${0.35 + (1 - depth) * 0.65}"/>`;
      }
      let ferns = '';
      for (let i = 0; i < 60; i++) ferns += `<ellipse cx="${r() * W}" cy="${H * (0.9 + r() * 0.1)}" rx="${40 + r() * 90}" ry="${12 + r() * 20}" fill="#2f5a2a" fill-opacity="0.8" transform="rotate(${(r() - 0.5) * 40})"/>`;
      return wrap(W, H, `<rect width="${W}" height="${H}" fill="url(#fog)"/>${trunks}${ferns}`,
        `<linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9d6c3"/><stop offset="1" stop-color="#6f8a6a"/></linearGradient>`);
    },
  },
  {
    id: 'CAL-14', w: 2400, h: 1600, series: 'altitude', title: 'Mirror Lake',
    alt: 'Synthetic calibration frame: a mountain lake reflecting the ridge, framed by dark green grassland.',
    svg(W, H) {
      const m = ridge(W, H * 0.55, H * 0.3, H * 0.28, 140);
      return wrap(W, H,
        `<rect width="${W}" height="${H * 0.55}" fill="url(#sky)"/><path d="${m}" fill="#2c3b36"/>` +
        `<g transform="translate(0 ${H * 1.1}) scale(1 -1)" opacity="0.55"><rect width="${W}" height="${H * 0.55}" fill="url(#sky)"/><path d="${m}" fill="#2c3b36"/></g>` +
        `<path d="${ridge(W, H, H * 0.86, H * 0.08, 141)}" fill="#1c2b17"/>`,
        `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d8fb0"/><stop offset="1" stop-color="#d6dfe6"/></linearGradient>`);
    },
  },
  // ── frames the curation gates should reject ───────────────────────────────
  {
    id: 'CAL-15', w: 2400, h: 1600, title: 'Flat',
    alt: 'Synthetic calibration frame with almost no tonal separation.',
    svg(W, H) {
      return wrap(W, H, `<rect width="${W}" height="${H}" fill="#7d7d7b"/><circle cx="${W * 0.6}" cy="${H * 0.5}" r="${H * 0.3}" fill="#878785" filter="url(#b)"/>`, `<filter id="b"><feGaussianBlur stdDeviation="80"/></filter>`);
    },
  },
  {
    id: 'CAL-16', w: 3000, h: 1250, title: 'Ridgelines (second exposure)',
    alt: 'Synthetic calibration frame: a near-duplicate of Ridgelines.',
    svg(W, H) {
      const layers = ['#a4b3bf', '#7f909e', '#5a6b79', '#384751', '#1d282e', '#0c1215']
        .map((c, i) => `<path d="${ridge(W, H, H * (0.37 + i * 0.1), H * (0.32 - i * 0.03), 11 + i)}" fill="${c}" transform="translate(${W * 0.012} 0)"/>`).join('');
      return wrap(W, H, `<rect width="${W}" height="${H}" fill="#dde3e8"/>${layers}`, '');
    },
  },
  {
    id: 'CAL-17', w: 1600, h: 2000, title: 'Missed Focus', blur: 14,
    alt: 'Synthetic calibration frame: a badly out-of-focus composition.',
    svg(W, H) {
      return wrap(W, H, `<rect width="${W}" height="${H}" fill="#2a2a2a"/><rect x="${W * 0.2}" y="${H * 0.15}" width="${W * 0.25}" height="${H * 0.8}" fill="#d0d0d0"/><rect x="${W * 0.55}" y="${H * 0.3}" width="${W * 0.3}" height="${H * 0.6}" fill="#8a8a8a"/>`, '');
    },
  },
  {
    id: 'CAL-18', w: 2400, h: 1600, title: 'Snapshot',
    alt: 'Synthetic calibration frame: a muddy, low-intent composition.',
    svg(W, H) {
      const r = prng(18);
      let blobs = '';
      for (let i = 0; i < 14; i++) blobs += `<ellipse cx="${r() * W}" cy="${r() * H}" rx="${W * 0.15 * r() + 80}" ry="${H * 0.12 * r() + 60}" fill="rgb(${90 + r() * 50},${85 + r() * 40},${70 + r() * 40})"/>`;
      return wrap(W, H, `<rect width="${W}" height="${H}" fill="#6e665a"/><g filter="url(#b)">${blobs}</g>`, `<filter id="b"><feGaussianBlur stdDeviation="30"/></filter>`);
    },
  },
];

export const PORTRAIT = {
  id: 'CAL-PORTRAIT', w: 1600, h: 2000,
  alt: 'Calibration placeholder for DSC05898: a rim-lit head-and-shoulders silhouette.',
  svg(W, H) {
    return wrap(W, H,
      `<rect width="${W}" height="${H}" fill="#050505"/>` +
      `<ellipse cx="${W * 0.5}" cy="${H * 0.36}" rx="${W * 0.17}" ry="${H * 0.15}" fill="url(#rim)"/>` +
      `<path d="M${W * 0.12},${H} C${W * 0.14},${H * 0.66} ${W * 0.3},${H * 0.58} ${W * 0.5},${H * 0.58} C${W * 0.7},${H * 0.58} ${W * 0.86},${H * 0.66} ${W * 0.88},${H} Z" fill="url(#rim)"/>` +
      `<text x="${W / 2}" y="${H * 0.1}" text-anchor="middle" font-family="JetBrains Mono, DejaVu Sans Mono, monospace" font-size="${W * 0.026}" fill="#ffffff" fill-opacity="0.6" letter-spacing="4">PORTRAIT SLOT — DSC05898</text>`,
      `<linearGradient id="rim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d9d4ca"/><stop offset="0.12" stop-color="#2a2a2a"/><stop offset="0.85" stop-color="#0d0d0d"/><stop offset="1" stop-color="#5a5a5a"/></linearGradient>`);
  },
};

async function render(frame, dir) {
  const W = frame.w, H = frame.h;
  const svg = frame.svg(W, H).replace('</svg>', `${label(W, H, frame.id)}</svg>`);
  let img = sharp(Buffer.from(svg)).removeAlpha();
  if (frame.blur) img = img.blur(frame.blur);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  // Monochrome sensor-ish grain so the noise estimator has something real to measure.
  const r = prng(frame.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  for (let i = 0; i < data.length; i += 3) {
    const u = Math.max(r(), 1e-9), v = r();
    const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * 3.2;
    data[i] = Math.max(0, Math.min(255, data[i] + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + n));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + n));
  }
  const out = path.join(dir, `${frame.id}.jpg`);
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).jpeg({ quality: 90, mozjpeg: true }).toFile(out);
  return out;
}

/** Renders the calibration set if missing; returns {dir, hints}. */
export async function ensureCalibration(dir) {
  await fs.mkdir(dir, { recursive: true });
  const all = [...FRAMES, PORTRAIT];
  for (const f of all) {
    const file = path.join(dir, `${f.id}.jpg`);
    try { await fs.access(file); } catch { await render(f, dir); }
  }
  const hints = Object.fromEntries(FRAMES.map((f) => [f.id, { series: f.series, title: f.title, alt: f.alt }]));
  return { dir, hints, portrait: { id: PORTRAIT.id, alt: PORTRAIT.alt } };
}
