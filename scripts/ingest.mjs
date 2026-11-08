#!/usr/bin/env node
/**
 * INGEST — ./image  ->  public/photos/*  +  src/data/photos.json
 *
 *   1. hash every source frame (content-addressed cache in .cache/analysis)
 *   2. read EXIF (camera, optics, exposure; never GPS)
 *   3. measure the pixels: tonal distribution, Sobel geometry, noise, acutance,
 *      colour, OKLab palette, perceptual hash
 *   4. render responsive AVIF + WebP derivatives (metadata stripped, sRGB)
 *   5. curate (manual manifest, or computational fallback) and emit JSON
 *
 * Flags / env
 *   --auto | PHOTO_CURATION=auto   ignore `selected` and run the fallback curation
 *   --force                        bypass the analysis cache
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import config from '../photo.config.mjs';
import { toLuma, tonalStats, gradientStats, noiseStats, sharpness, colorStats, dHash, compositeScores, round } from './lib/analyze.mjs';
import { extractPalette } from './lib/palette.mjs';
import { readExif, emptyExif } from './lib/exif.mjs';
import { curate, classify } from './lib/curate.mjs';
import { ensureCalibration } from './lib/calibration.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, config.source);
const CACHE = path.join(ROOT, '.cache');
const OUT_IMG = path.join(ROOT, 'public', 'photos');
const OUT_JSON = path.join(ROOT, 'src', 'data', 'photos.json');
const REPORT = path.join(CACHE, 'curation-report.md');

const PIPELINE_VERSION = 3; // bump to invalidate the analysis cache
const WIDTHS = [480, 800, 1200, 1800, 2560];
const LONG_EDGE_CAP = 2560;
const SUPPORTED = /\.(jpe?g|png|tiff?|webp|avif)$/i;
const UNSUPPORTED = /\.(heic|heif|arw|cr2|cr3|nef|nrw|dng|raf|orf|rw2|pef|srw)$/i;

const args = new Set(process.argv.slice(2));
const FORCE_AUTO = args.has('--auto') || process.env.PHOTO_CURATION === 'auto';
const FORCE = args.has('--force');

sharp.cache(false);
const log = (...a) => console.log('[ingest]', ...a);
const slugify = (s) => s.replace(/[^A-Za-z0-9_-]+/g, '-');

async function sha1(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha1');
    createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function listSources() {
  if (!(await exists(SRC))) return { files: [], skipped: [] };
  const entries = await fs.readdir(SRC, { withFileTypes: true });
  const files = [];
  const skipped = [];
  const seen = new Map();
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!e.isFile() || e.name.startsWith('.')) continue;
    const full = path.join(SRC, e.name);
    if (UNSUPPORTED.test(e.name)) { skipped.push({ name: e.name, reason: 'RAW/HEIC — export a JPEG/TIFF first' }); continue; }
    if (!SUPPORTED.test(e.name)) continue;
    const id = path.parse(e.name).name;
    if (seen.has(id.toLowerCase())) { skipped.push({ name: e.name, reason: `id collides with ${seen.get(id.toLowerCase())}` }); continue; }
    seen.set(id.toLowerCase(), e.name);
    files.push({ id, file: full, name: e.name });
  }
  return { files, skipped };
}

/** Full analysis of one frame. Expensive; results are cached by content hash. */
async function analyse(src) {
  const meta = await sharp(src.file, { failOn: 'none' }).metadata();
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = rotated ? meta.height : meta.width;
  const height = rotated ? meta.width : meta.height;
  const base = () => sharp(src.file, { failOn: 'none' }).rotate();

  // 1024px working copy for tone / geometry / colour / acutance.
  const work = await base()
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .removeAlpha().toColourspace('srgb').raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
  const { data, info } = work;
  const luma = toLuma(data, info.width, info.height, info.channels);
  const tonal = tonalStats(luma);
  const geometry = gradientStats(luma, info.width, info.height);
  const sharp_ = sharpness(luma, info.width, info.height);
  const color = colorStats(data, info.width, info.height, info.channels);

  // Native-resolution centre crop for noise (downsampling would average it away).
  const side = Math.min(768, meta.width, meta.height);
  const crop = await sharp(src.file, { failOn: 'none' })
    .extract({ left: Math.floor((meta.width - side) / 2), top: Math.floor((meta.height - side) / 2), width: side, height: side })
    .removeAlpha().toColourspace('srgb').raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
  const noise = noiseStats(toLuma(crop.data, crop.info.width, crop.info.height, crop.info.channels), crop.info.width, crop.info.height);

  // Palette on a thumbnail (k-means doesn't need a megapixel).
  const thumb = await base().resize({ width: 96, height: 96, fit: 'inside' }).removeAlpha().toColourspace('srgb').raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
  const palette = extractPalette(thumb.data, thumb.info.width, thumb.info.height, thumb.info.channels, 5);

  const tiny = await base().resize(9, 8, { fit: 'fill' }).greyscale().raw({ depth: 'uchar' }).toBuffer();
  const hash = dHash(Array.from(tiny));

  const lqipBuf = await base().resize({ width: 24 }).removeAlpha().webp({ quality: 40 }).toBuffer();
  const exif = await readExif(src.file);
  const scores = compositeScores({ tonal, geometry, noise, sharp: sharp_, color });

  return {
    width, height, hash, exif, palette, scores,
    lqip: `data:image/webp;base64,${lqipBuf.toString('base64')}`,
    signal: { ...tonal, ...noise, ...sharp_ },
    geometry,
    color,
  };
}

async function renderDerivatives(src, slug, a) {
  const dir = path.join(OUT_IMG, slug);
  const maxW = Math.min(a.width, Math.round((LONG_EDGE_CAP * a.width) / Math.max(a.width, a.height)));
  const widths = [...new Set([...WIDTHS.filter((w) => w < maxW), maxW])];
  const variants = widths.map((w) => ({ w, h: Math.round((w * a.height) / a.width) }));
  const done = await Promise.all(variants.map((v) => exists(path.join(dir, `${v.w}.avif`))));
  if (done.every(Boolean) && (await exists(path.join(dir, `${maxW}.webp`)))) return variants;

  await fs.mkdir(dir, { recursive: true });
  // Decode once at the largest size, then fan out from a lossless master.
  const master = await sharp(src.file, { failOn: 'none' }).rotate().resize({ width: maxW }).removeAlpha().toColourspace('srgb')
    .raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
  const raw = { raw: { width: master.info.width, height: master.info.height, channels: master.info.channels } };
  for (const v of variants) {
    const img = () => sharp(master.data, raw).resize({ width: v.w });
    await img().avif({ quality: 54, effort: 4, chromaSubsampling: '4:4:4' }).toFile(path.join(dir, `${v.w}.avif`));
    await img().webp({ quality: 82, smartSubsample: true }).toFile(path.join(dir, `${v.w}.webp`));
  }
  return variants;
}

async function processFrame(src, hints) {
  const key = await sha1(src.file);
  const cacheFile = path.join(CACHE, 'analysis', `${key}.v${PIPELINE_VERSION}.json`);
  let a = null;
  if (!FORCE && (await exists(cacheFile))) a = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
  if (!a) {
    a = await analyse(src);
    await fs.mkdir(path.dirname(cacheFile), { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify(a));
  }
  const slug = `${slugify(src.id)}-${key.slice(0, 8)}`;
  const variants = await renderDerivatives(src, slug, a);
  return { id: src.id, name: src.name, slug, key, variants, hint: hints?.[src.id] ?? null, ...a };
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

// ── shaping the published dataset ───────────────────────────────────────────

function gcd(a, b) { return b ? gcd(b, a % b) : a; }
function ratioLabel(w, h) {
  const r = w / h;
  const known = [[1, 1], [5, 4], [4, 3], [3, 2], [16, 10], [16, 9], [2, 1], [21, 9], [3, 1]];
  for (const [x, y] of known) {
    if (Math.abs(r - x / y) < 0.012) return `${x}:${y}`;
    if (Math.abs(r - y / x) < 0.012) return `${y}:${x}`;
  }
  const g = gcd(w, h);
  return w / g < 50 ? `${w / g}:${h / g}` : `${r.toFixed(2)}:1`;
}
function orientation(r) {
  if (r >= 1.95) return 'panorama';
  if (r >= 1.12) return 'landscape';
  if (r > 0.9) return 'square';
  return 'portrait';
}

const R = (v, d = 3) => (v == null ? null : round(v, d));

function shapePhoto(f, extra = {}) {
  const r = f.width / f.height;
  const base = `photos/${f.slug}`;
  return {
    id: f.id,
    slug: slugify(f.id),
    title: extra.title ?? f.hint?.title ?? f.id,
    alt: extra.alt ?? f.hint?.alt ?? null,
    note: extra.note ?? null,
    series: extra.series ?? null,
    width: f.width,
    height: f.height,
    ratio: R(r, 4),
    ratioLabel: ratioLabel(f.width, f.height),
    orientation: orientation(r),
    src: {
      avif: f.variants.map((v) => ({ w: v.w, h: v.h, url: `${base}/${v.w}.avif` })),
      webp: f.variants.map((v) => ({ w: v.w, h: v.h, url: `${base}/${v.w}.webp` })),
    },
    lqip: f.lqip,
    dominant: f.palette[0]?.hex ?? '#111111',
    palette: f.palette.map((p) => ({ hex: p.hex, share: R(p.share), lightness: R(p.lightness) })),
    exif: { ...f.exif, ev100: R(f.exif.ev100, 1) },
    signal: {
      mean: R(f.signal.mean), std: R(f.signal.std), p05: R(f.signal.p05), p50: R(f.signal.p50), p95: R(f.signal.p95),
      dynamicRange: R(f.signal.dynamicRange), shadowClip: R(f.signal.shadowClip, 4), highlightClip: R(f.signal.highlightClip, 4),
      shadowMass: R(f.signal.shadowMass), highlightMass: R(f.signal.highlightMass), entropy: R(f.signal.entropy, 2),
      noiseSigma: R(f.signal.noiseSigma, 2), snrDb: R(f.signal.snrDb, 1), sharpness: R(f.signal.sharpness),
      histogram: f.signal.histogram.map((v) => R(v)),
    },
    geometry: {
      edgeDensity: R(f.geometry.edgeDensity), orthogonality: R(f.geometry.orthogonality), dominantAxis: f.geometry.dominantAxis,
      anisotropy: R(f.geometry.anisotropy), rose: f.geometry.rose.map((v) => R(v)),
    },
    color: { saturation: R(f.color.saturation), colorfulness: R(f.color.colorfulness), greenShare: R(f.color.greenShare), blueShare: R(f.color.blueShare) },
    scores: Object.fromEntries(Object.entries(f.scores).map(([k, v]) => [k, R(v)])),
    hash: f.hash,
  };
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function meanVector(vs) {
  if (!vs.length) return [];
  const out = vs[0].map((_, i) => mean(vs.map((v) => v[i])));
  const peak = Math.max(...out) || 1;
  return out.map((v) => R(v / peak));
}
function tally(values) {
  const m = new Map();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = performance.now();
  let { files, skipped } = await listSources();
  let mode = 'archive';
  let hints = null;
  let portraitCfg = config.portrait;

  if (!files.length) {
    mode = 'calibration';
    const cal = await ensureCalibration(path.join(CACHE, 'calibration'));
    hints = cal.hints;
    portraitCfg = cal.portrait;
    const names = (await fs.readdir(cal.dir)).filter((n) => SUPPORTED.test(n)).sort();
    files = names.map((name) => ({ id: path.parse(name).name, file: path.join(cal.dir, name), name }));
    log(`./${config.source} has no supported frames -> CALIBRATION MODE (${files.length} synthetic frames).`);
    log('Drop your JPG/TIFF exports into ./image and re-run to switch to your archive.');
  }

  for (const s of skipped) log(`skip ${s.name}: ${s.reason}`);
  log(`analysing ${files.length} frames…`);
  const frames = await pool(files, 2, async (src, i) => {
    const f = await processFrame(src, hints);
    process.stdout.write(`\r[ingest] ${String(i + 1).padStart(3)}/${files.length} ${src.name.padEnd(28)}`);
    return f;
  });
  process.stdout.write('\n');

  // In calibration mode the series is known (hint); in an archive with no
  // manifest it's inferred. Either way `classify` is reported for comparison.
  const cfg = { ...config, portrait: portraitCfg };
  const result = curate(frames, cfg, { forceAuto: FORCE_AUTO || mode === 'calibration' });
  if (mode === 'calibration') {
    const order = config.series.map((s) => s.id);
    for (const p of result.published) p.series = p.frame.hint?.series ?? p.series;
    result.published.sort((a, b) => order.indexOf(a.series) - order.indexOf(b.series) || b.frame.scores.quality - a.frame.scores.quality);
  }
  for (const w of result.warnings) log(`warn: ${w}`);

  const published = result.published.map((p, i) => ({
    ...shapePhoto(p.frame, { series: p.series, title: p.title, alt: p.alt, note: p.note }),
    index: i + 1,
  }));
  const portrait = result.portrait ? shapePhoto(result.portrait, { title: 'The Observer', alt: portraitCfg.alt }) : null;

  // Series: only those with frames, in config order, with aggregate signatures.
  const series = config.series
    .map((s) => {
      const members = published.filter((p) => p.series === s.id);
      return {
        ...s,
        count: members.length,
        stats: {
          luminance: R(mean(members.map((m) => m.signal.mean))),
          contrast: R(mean(members.map((m) => m.signal.std))),
          orthogonality: R(mean(members.map((m) => m.geometry.orthogonality))),
          chiaroscuro: R(mean(members.map((m) => m.scores.chiaroscuro))),
          snrDb: R(mean(members.map((m) => m.signal.snrDb).filter((v) => v != null)), 1),
          histogram: meanVector(members.map((m) => m.signal.histogram)),
          rose: meanVector(members.map((m) => m.geometry.rose)),
        },
      };
    })
    .filter((s) => s.count > 0);
  for (const s of series) published.filter((p) => p.series === s.id).forEach((p, i) => (p.seriesIndex = i + 1));

  const heroId = config.hero && published.find((p) => p.id.toLowerCase() === String(config.hero).toLowerCase())?.id;
  const hero = heroId ?? [...published].filter((p) => p.orientation === 'landscape' || p.orientation === 'panorama')
    .sort((a, b) => b.scores.visualWeight - a.scores.visualWeight)[0]?.id ?? published[0]?.id ?? null;

  const all = frames;
  const years = all.map((f) => f.exif.year).filter(Boolean);
  const focals = published.map((p) => p.exif.focal35 ?? p.exif.focal).filter(Boolean);
  const dataset = {
    version: PIPELINE_VERSION,
    generatedAt: new Date().toISOString(),
    mode,
    curation: result.mode,
    hero,
    archive: {
      ingested: all.length,
      published: published.length,
      reserved: portrait ? 1 : 0,
      rejected: result.rejected.length,
      keepRate: R(published.length / Math.max(1, all.length - (portrait ? 1 : 0)), 3),
      megapixels: R(all.reduce((a, f) => a + (f.width * f.height) / 1e6, 0), 1),
      cameras: tally(all.map((f) => f.exif.camera)),
      lenses: tally(published.map((p) => p.exif.lens)),
      focalRange: focals.length ? [Math.min(...focals), Math.max(...focals)] : null,
      yearRange: years.length ? [Math.min(...years), Math.max(...years)] : null,
    },
    series,
    photos: published,
    portrait,
  };

  await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fs.writeFile(OUT_JSON, JSON.stringify(dataset, null, 1));

  // Garbage-collect derivatives that no longer belong to any frame.
  const live = new Set(frames.map((f) => f.slug));
  if (await exists(OUT_IMG)) {
    for (const d of await fs.readdir(OUT_IMG)) if (!live.has(d)) await fs.rm(path.join(OUT_IMG, d), { recursive: true, force: true });
  }

  await writeReport({ dataset, result, frames, mode, skipped });
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  log(`${mode.toUpperCase()} · curation=${result.mode} · published ${published.length}/${all.length - (portrait ? 1 : 0)} · portrait ${portrait ? portrait.id : 'missing'} · ${secs}s`);
  log(`report -> ${path.relative(ROOT, REPORT)}`);
}

async function writeReport({ dataset, result, frames, mode, skipped }) {
  const pub = new Map(result.published.map((p) => [p.frame, p]));
  const rej = new Map(result.rejected.map((r) => [r.frame, r.reason]));
  const rows = frames.map((f) => {
    const p = pub.get(f);
    const status = f === result.portrait ? 'RESERVED' : p ? 'PUBLISH' : 'REJECT';
    return [
      f.id, status, p?.series ?? (f === result.portrait ? 'about' : '—'), classify(f.scores),
      f.scores.quality.toFixed(2), f.scores.visualWeight.toFixed(2), f.scores.chiaroscuro.toFixed(2),
      f.scores.structure.toFixed(2), f.scores.nature.toFixed(2), f.signal.sharpness.toFixed(2),
      f.signal.snrDb == null ? '—' : f.signal.snrDb.toFixed(1), rej.get(f) ?? '',
    ];
  });
  const head = ['id', 'status', 'series', 'auto', 'quality', 'weight', 'chiaro', 'struct', 'nature', 'acut', 'snr', 'reason'];
  const md = [
    `# Curation report`,
    ``,
    `- mode: **${mode}** · curation: **${result.mode}** · generated ${dataset.generatedAt}`,
    `- ingested ${dataset.archive.ingested} · published ${dataset.archive.published} · rejected ${dataset.archive.rejected} · reserved ${dataset.archive.reserved} · keep rate ${(dataset.archive.keepRate * 100).toFixed(0)}%`,
    ...skipped.map((s) => `- skipped \`${s.name}\`: ${s.reason}`),
    ...result.warnings.map((w) => `- ⚠ ${w}`),
    ``,
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
    ``,
    `\`auto\` is what the heuristic classifier would assign — a sanity check, not a verdict.`,
  ].join('\n');
  await fs.mkdir(CACHE, { recursive: true });
  await fs.writeFile(REPORT, md);

  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (r) => r.map((c, i) => (i === r.length - 1 ? String(c) : String(c).padEnd(widths[i]))).join('  ');
  console.log('\n' + line(head) + '\n' + widths.map((w) => '─'.repeat(w)).join('  '));
  for (const r of rows) console.log(line(r));
  console.log('');
}

main().catch((err) => {
  console.error('[ingest] failed:', err);
  process.exit(1);
});
