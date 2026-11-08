/**
 * Dominant palette via k-means++ in OKLab (perceptually uniform), seeded so
 * every build produces byte-identical output.
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const toGamma = (v) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, c)) * 255);
};

export function rgbToOklab(r, g, b) {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToRgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/**
 * @param {Uint8Array|Buffer} buf interleaved RGB(A)
 * @returns {{hex:string, share:number, lightness:number}[]} sorted by share desc
 */
export function extractPalette(buf, width, height, channels = 3, k = 5, iterations = 14) {
  const n = width * height;
  const pts = new Float64Array(n * 3);
  for (let i = 0, p = 0; i < n; i++, p += channels) {
    const [L, A, B] = rgbToOklab(buf[p], buf[p + 1], buf[p + 2]);
    pts[i * 3] = L;
    pts[i * 3 + 1] = A;
    pts[i * 3 + 2] = B;
  }

  const rand = mulberry32(0x5eed ^ n);
  const centers = new Float64Array(k * 3);
  const dist = new Float64Array(n).fill(Infinity);

  // k-means++ seeding
  let first = Math.floor(rand() * n);
  centers.set(pts.subarray(first * 3, first * 3 + 3), 0);
  for (let c = 1; c < k; c++) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      const dl = pts[i * 3] - centers[(c - 1) * 3];
      const da = pts[i * 3 + 1] - centers[(c - 1) * 3 + 1];
      const db = pts[i * 3 + 2] - centers[(c - 1) * 3 + 2];
      const d = dl * dl + da * da + db * db;
      if (d < dist[i]) dist[i] = d;
      total += dist[i];
    }
    let target = rand() * total;
    let pick = n - 1;
    for (let i = 0; i < n; i++) {
      target -= dist[i];
      if (target <= 0) { pick = i; break; }
    }
    centers.set(pts.subarray(pick * 3, pick * 3 + 3), c * 3);
  }

  const assign = new Uint8Array(n);
  const sums = new Float64Array(k * 3);
  const counts = new Uint32Array(k);
  for (let it = 0; it < iterations; it++) {
    sums.fill(0);
    counts.fill(0);
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const dl = pts[i * 3] - centers[c * 3];
        const da = pts[i * 3 + 1] - centers[c * 3 + 1];
        const db = pts[i * 3 + 2] - centers[c * 3 + 2];
        const d = dl * dl + da * da + db * db;
        if (d < bestD) { bestD = d; best = c; }
      }
      assign[i] = best;
      counts[best]++;
      sums[best * 3] += pts[i * 3];
      sums[best * 3 + 1] += pts[i * 3 + 1];
      sums[best * 3 + 2] += pts[i * 3 + 2];
    }
    for (let c = 0; c < k; c++) {
      if (!counts[c]) continue;
      centers[c * 3] = sums[c * 3] / counts[c];
      centers[c * 3 + 1] = sums[c * 3 + 1] / counts[c];
      centers[c * 3 + 2] = sums[c * 3 + 2] / counts[c];
    }
  }

  // Merge near-identical clusters (ΔE_ok < 0.03) so flat frames don't fake variety.
  const merged = [];
  for (let c = 0; c < k; c++) {
    if (!counts[c]) continue;
    const lab = [centers[c * 3], centers[c * 3 + 1], centers[c * 3 + 2]];
    const twin = merged.find((m) => Math.hypot(m.lab[0] - lab[0], m.lab[1] - lab[1], m.lab[2] - lab[2]) < 0.03);
    if (twin) {
      const w = twin.count + counts[c];
      twin.lab = twin.lab.map((v, j) => (v * twin.count + lab[j] * counts[c]) / w);
      twin.count = w;
    } else {
      merged.push({ lab, count: counts[c] });
    }
  }

  return merged
    .map((m) => ({ hex: hex(oklabToRgb(...m.lab)), share: m.count / n, lightness: m.lab[0] }))
    .sort((a, b) => b.share - a.share);
}
