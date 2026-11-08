/**
 * Pixel-level telemetry.
 *
 * Every function here is pure: it takes a raw interleaved RGB buffer (or a
 * luma plane) plus dimensions, and returns plain numbers. No I/O, no sharp —
 * that keeps the math unit-testable and honest.
 *
 * Conventions
 *   - Channel values are 0..255 in the input buffer.
 *   - Luma is Rec.709 Y' computed on gamma-encoded sRGB, normalised to 0..1.
 *     (That's what the eye — and a histogram on the back of a camera — sees.)
 *   - Angles are in degrees. Edge orientation is the direction the *line*
 *     runs, not the gradient: 0° = horizontal, 90° = vertical.
 */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const round = (v, d = 3) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

/** RGB(A) buffer -> Float32Array luma plane in 0..1 */
export function toLuma(buf, width, height, channels = 3) {
  const n = width * height;
  const out = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += channels) {
    out[i] = (0.2126 * buf[p] + 0.7152 * buf[p + 1] + 0.0722 * buf[p + 2]) / 255;
  }
  return out;
}

function quantile(hist, total, q) {
  const target = q * total;
  let acc = 0;
  for (let i = 0; i < hist.length; i++) {
    acc += hist[i];
    if (acc >= target) return i / (hist.length - 1);
  }
  return 1;
}

/**
 * Tonal distribution: where the light sits.
 * shadow/highlight *clip* = pixels pinned at the sensor rails;
 * shadow/highlight *mass* = how much of the frame lives in deep tones.
 */
export function tonalStats(luma, bins = 32) {
  const n = luma.length;
  const h256 = new Uint32Array(256);
  let sum = 0;
  let sumSq = 0;
  let shadowClip = 0;
  let highlightClip = 0;
  let shadowMass = 0;
  let highlightMass = 0;
  for (let i = 0; i < n; i++) {
    const v = luma[i];
    sum += v;
    sumSq += v * v;
    h256[Math.min(255, Math.round(v * 255))]++;
    if (v <= 2 / 255) shadowClip++;
    if (v >= 253 / 255) highlightClip++;
    if (v < 0.15) shadowMass++;
    if (v > 0.85) highlightMass++;
  }
  const mean = sum / n;
  const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));

  // Shannon entropy of the 8-bit histogram, in bits (0..8).
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (!h256[i]) continue;
    const p = h256[i] / n;
    entropy -= p * Math.log2(p);
  }

  // Down-sampled histogram for the UI, normalised so the tallest bin = 1.
  const hist = new Array(bins).fill(0);
  for (let i = 0; i < 256; i++) hist[Math.floor((i * bins) / 256)] += h256[i];
  const peak = Math.max(...hist) || 1;

  const p05 = quantile(h256, n, 0.05);
  const p50 = quantile(h256, n, 0.5);
  const p95 = quantile(h256, n, 0.95);
  const p99 = quantile(h256, n, 0.99);

  return {
    mean,
    std,
    p05,
    p50,
    p95,
    p99,
    dynamicRange: p95 - p05,
    shadowClip: shadowClip / n,
    highlightClip: highlightClip / n,
    shadowMass: shadowMass / n,
    highlightMass: highlightMass / n,
    entropy,
    histogram: hist.map((v) => v / peak),
  };
}

/**
 * Sobel gradient field -> edge density, orientation rose, orthogonality.
 *
 * magnitude is normalised so that a hard 0→1 step edge reads ≈ 1.0.
 * The rose is an 18-bin (10° each) histogram of *line* orientation over
 * 0..180°, weighted by gradient magnitude. Orthogonality is the share of edge
 * energy within ±10° of horizontal or vertical — architecture scores high,
 * forests and faces score low.
 */
export function gradientStats(luma, width, height, threshold = 0.15) {
  const ROSE_BINS = 18;
  const rose = new Float64Array(ROSE_BINS);
  let edgePixels = 0;
  let energy = 0;
  let orthoEnergy = 0;
  let c2 = 0;
  let s2 = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    const r0 = (y - 1) * width;
    const r1 = y * width;
    const r2 = (y + 1) * width;
    for (let x = 1; x < width - 1; x++) {
      const a = luma[r0 + x - 1], b = luma[r0 + x], c = luma[r0 + x + 1];
      const d = luma[r1 + x - 1], f = luma[r1 + x + 1];
      const g = luma[r2 + x - 1], h = luma[r2 + x], i = luma[r2 + x + 1];
      const gx = c + 2 * f + i - (a + 2 * d + g);
      const gy = g + 2 * h + i - (a + 2 * b + c);
      const mag = Math.sqrt(gx * gx + gy * gy) / 4;
      count++;
      if (mag < threshold) continue;
      edgePixels++;
      energy += mag;
      // Gradient angle -> line angle (perpendicular), folded into [0, 180).
      let theta = (Math.atan2(gy, gx) * 180) / Math.PI + 90;
      theta = ((theta % 180) + 180) % 180;
      rose[Math.min(ROSE_BINS - 1, Math.floor(theta / (180 / ROSE_BINS)))] += mag;
      const dist = Math.min(theta, Math.abs(theta - 90), 180 - theta);
      if (dist <= 10) orthoEnergy += mag;
      const rad = (2 * theta * Math.PI) / 180; // axial data -> doubled angle
      c2 += mag * Math.cos(rad);
      s2 += mag * Math.sin(rad);
    }
  }

  const roseMax = Math.max(...rose) || 1;
  let peakBin = 0;
  for (let k = 1; k < ROSE_BINS; k++) if (rose[k] > rose[peakBin]) peakBin = k;

  return {
    edgeDensity: count ? edgePixels / count : 0,
    orthogonality: energy ? orthoEnergy / energy : 0,
    dominantAxis: energy ? peakBin * (180 / ROSE_BINS) + 180 / ROSE_BINS / 2 : null,
    // Resultant length of the doubled-angle vector: 1 = all lines parallel.
    anisotropy: energy ? Math.sqrt(c2 * c2 + s2 * s2) / energy : 0,
    rose: Array.from(rose, (v) => v / roseMax),
  };
}

/**
 * Noise estimate (Immerkær 1996, "Fast Noise Variance Estimation"),
 * restricted to flat regions so texture isn't mistaken for noise.
 * Returns sigma on the 0..255 scale and an SNR in dB against mean signal.
 */
export function noiseStats(luma, width, height) {
  let acc = 0;
  let n = 0;
  let sum = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const k = y * width + x;
      const a = luma[k - width - 1], b = luma[k - width], c = luma[k - width + 1];
      const d = luma[k - 1], e = luma[k], f = luma[k + 1];
      const g = luma[k + width - 1], h = luma[k + width], i = luma[k + width + 1];
      sum += e;
      // Skip structured pixels: a cheap Sobel gate.
      const gx = c + 2 * f + i - (a + 2 * d + g);
      const gy = g + 2 * h + i - (a + 2 * b + c);
      if (Math.abs(gx) + Math.abs(gy) > 0.12) continue;
      acc += Math.abs(a - 2 * b + c - 2 * d + 4 * e - 2 * f + g - 2 * h + i);
      n++;
    }
  }
  const interior = (width - 2) * (height - 2);
  const mean255 = (sum / Math.max(1, interior)) * 255;
  if (n < interior * 0.02) return { noiseSigma: null, snrDb: null };
  const sigma = (Math.sqrt(Math.PI / 2) * (acc / n) * 255) / 6;
  const snrDb = sigma > 0 ? 20 * Math.log10(mean255 / sigma) : 60;
  return { noiseSigma: sigma, snrDb: Math.max(0, Math.min(60, snrDb)) };
}

/**
 * Acutance proxy: variance of the 4-neighbour Laplacian, mapped onto 0..1
 * with a log scale. Soft / missed-focus frames land under ~0.35.
 */
export function sharpness(luma, width, height) {
  let s = 0;
  let s2 = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const k = y * width + x;
      const lap = luma[k - 1] + luma[k + 1] + luma[k - width] + luma[k + width] - 4 * luma[k];
      s += lap;
      s2 += lap * lap;
      n++;
    }
  }
  const mean = s / n;
  const variance = s2 / n - mean * mean;
  const raw = Math.max(variance, 1e-9);
  // log10(variance): ~-5.5 (mush) .. ~-2 (crisp, detailed)
  return { laplacianVar: raw, sharpness: clamp01((Math.log10(raw) + 5.5) / 3.5) };
}

/** Saturation, hue families and Hasler–Süsstrunk colourfulness. */
export function colorStats(buf, width, height, channels = 3) {
  const n = width * height;
  let satSum = 0;
  let green = 0;
  let blue = 0;
  let warm = 0;
  let rgSum = 0, ybSum = 0, rgSq = 0, ybSq = 0;
  for (let i = 0, p = 0; i < n; i++, p += channels) {
    const r = buf[p], g = buf[p + 1], b = buf[p + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const v = max / 255;
    const s = max === 0 ? 0 : (max - min) / max;
    satSum += s;
    if (s > 0.18 && v > 0.12) {
      let hue;
      const dlt = max - min;
      if (max === r) hue = ((g - b) / dlt) % 6;
      else if (max === g) hue = (b - r) / dlt + 2;
      else hue = (r - g) / dlt + 4;
      hue = (hue * 60 + 360) % 360;
      if (hue >= 70 && hue < 170) green++;
      else if (hue >= 170 && hue < 255) blue++;
      else if (hue < 50 || hue >= 330) warm++;
    }
    const rg = r - g;
    const yb = 0.5 * (r + g) - b;
    rgSum += rg; ybSum += yb; rgSq += rg * rg; ybSq += yb * yb;
  }
  const mrg = rgSum / n, myb = ybSum / n;
  const srg = Math.sqrt(Math.max(0, rgSq / n - mrg * mrg));
  const syb = Math.sqrt(Math.max(0, ybSq / n - myb * myb));
  const colorfulness = Math.sqrt(srg * srg + syb * syb) + 0.3 * Math.sqrt(mrg * mrg + myb * myb);
  return {
    saturation: satSum / n,
    greenShare: green / n,
    blueShare: blue / n,
    warmShare: warm / n,
    // 0 = monochrome, ~0.5 = moderately colourful, 1+ = extremely colourful
    colorfulness: colorfulness / 100,
  };
}

/**
 * Difference hash: 9x8 luma grid -> 64-bit fingerprint (as 16-char hex).
 * Hamming distance <= ~10 means "the same picture, give or take a step".
 */
export function dHash(luma9x8) {
  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) bits += luma9x8[y * 9 + x] < luma9x8[y * 9 + x + 1] ? '1' : '0';
  }
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function hamming(hexA, hexB) {
  let d = 0;
  for (let i = 0; i < hexA.length; i++) {
    let x = parseInt(hexA[i], 16) ^ parseInt(hexB[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

/**
 * Composite indices. These are heuristics — named, bounded, documented —
 * not ground truth. They drive sorting, the "visual weight" bar and the
 * fallback pre-curation.
 */
export function compositeScores({ tonal, geometry, noise, sharp, color }) {
  const contrast = clamp01(tonal.std / 0.3);
  const range = clamp01(tonal.dynamicRange / 0.85);
  const edge = clamp01(geometry.edgeDensity / 0.22);
  const info = clamp01(tonal.entropy / 7.6);
  const extremes = clamp01((tonal.shadowMass + tonal.highlightMass) / 0.6);

  // How hard the frame pushes back at the viewer.
  const visualWeight = clamp01(0.35 * contrast + 0.2 * edge + 0.2 * extremes + 0.15 * range + 0.1 * info);

  // Large dark mass + a real highlight + steep contrast.
  const highlightGate = clamp01((tonal.p99 - 0.45) / 0.4);
  const chiaroscuro = clamp01(
    (0.55 * contrast + 0.45 * clamp01(tonal.shadowMass / 0.45)) * highlightGate,
  );

  // Rectilinear, edge-rich, low-chroma: the built environment.
  const structure = clamp01(
    0.5 * clamp01((geometry.orthogonality - 0.2) / 0.5) + 0.3 * edge + 0.2 * (1 - clamp01(color.colorfulness / 0.45)),
  );

  // Vegetation / sky chroma, few right angles.
  const nature = clamp01(
    0.55 * clamp01((color.greenShare + 0.6 * color.blueShare) / 0.45) +
      0.45 * (1 - clamp01((geometry.orthogonality - 0.15) / 0.45)),
  );

  // Technical quality gate for the fallback curation.
  const clipPenalty = clamp01((tonal.highlightClip - 0.03) / 0.12) * (1 - chiaroscuro * 0.5);
  const flatPenalty = clamp01((0.11 - tonal.std) / 0.08);
  const quality = clamp01(
    0.4 * visualWeight + 0.3 * sharp.sharpness + 0.15 * range + 0.15 * clamp01(((noise.snrDb ?? 30) - 12) / 24) -
      0.25 * clipPenalty -
      0.35 * flatPenalty,
  );

  return { visualWeight, chiaroscuro, structure, nature, quality };
}
