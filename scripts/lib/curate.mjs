import { hamming } from './analyze.mjs';

/**
 * Heuristic series classifier. Deliberately simple and inspectable:
 * it's a first pass for a human editor, not a replacement for one.
 */
export function classify(scores) {
  if (scores.nature >= 0.55) return 'altitude';
  if (scores.chiaroscuro >= 0.6) return 'chiaroscuro';
  if (scores.structure >= 0.5) return 'structural';
  return 'street';
}

const lc = (s) => String(s).toLowerCase();

/**
 * @param {Array<{id:string, hash:string, scores:object, signal:object}>} frames analysed frames
 * @param {object} config photo.config.mjs default export
 * @param {{forceAuto?: boolean}} opts
 */
export function curate(frames, config, opts = {}) {
  const seriesIds = new Set(config.series.map((s) => s.id));
  const portraitId = config.portrait?.id ? lc(config.portrait.id) : null;
  const portrait = frames.find((f) => lc(f.id) === portraitId) ?? null;
  const pool = frames.filter((f) => f !== portrait);
  const warnings = [];
  const rejected = [];
  const published = [];

  const manual = !opts.forceAuto && Array.isArray(config.selected) && config.selected.length > 0;

  if (manual) {
    const byId = new Map(pool.map((f) => [lc(f.id), f]));
    const used = new Set();
    for (const entry of config.selected) {
      const frame = byId.get(lc(entry.id));
      if (!frame) {
        warnings.push(`selected id "${entry.id}" has no matching file in ./${config.source}`);
        continue;
      }
      if (!seriesIds.has(entry.series)) {
        warnings.push(`"${entry.id}" references unknown series "${entry.series}"`);
        continue;
      }
      if (used.has(frame)) {
        warnings.push(`"${entry.id}" is listed twice — keeping the first`);
        continue;
      }
      used.add(frame);
      published.push({ frame, series: entry.series, title: entry.title, alt: entry.alt, note: entry.note });
    }
    const reasons = new Map((config.rejected ?? []).map((r) => [lc(r.id), r.reason]));
    for (const f of pool) if (!used.has(f)) rejected.push({ frame: f, reason: reasons.get(lc(f.id)) ?? 'not selected' });
  } else {
    const ranked = [...pool].sort((a, b) => b.scores.quality - a.scores.quality);
    const survivors = [];
    for (const f of ranked) {
      if (f.signal.std < 0.06) {
        rejected.push({ frame: f, reason: `no tonal separation (σ=${f.signal.std.toFixed(3)})` });
        continue;
      }
      if (f.signal.sharpness < 0.2) {
        rejected.push({ frame: f, reason: `soft / missed focus (acutance ${f.signal.sharpness.toFixed(2)})` });
        continue;
      }
      const twin = survivors.find((s) => hamming(s.hash, f.hash) <= (config.duplicateThreshold ?? 10));
      if (twin) {
        rejected.push({ frame: f, reason: `near-duplicate of ${twin.id} (Δ${hamming(twin.hash, f.hash)} bits)` });
        continue;
      }
      survivors.push(f);
    }
    const keep = Math.min(survivors.length, Math.max(1, Math.round(pool.length * (config.autoKeepRatio ?? 0.7))));
    survivors.forEach((f, rank) => {
      if (rank < keep) published.push({ frame: f, series: classify(f.scores) });
      else rejected.push({ frame: f, reason: `below quality cut (rank ${rank + 1}/${survivors.length}, q=${f.scores.quality.toFixed(2)})` });
    });
    // Within a series, strongest first; series order follows the config.
    const order = config.series.map((s) => s.id);
    published.sort((a, b) => order.indexOf(a.series) - order.indexOf(b.series) || b.frame.scores.quality - a.frame.scores.quality);
  }

  if (portraitId && !portrait) warnings.push(`portrait "${config.portrait.id}" not found — About section will render without it`);

  return { mode: manual ? 'manual' : 'auto', published, rejected, portrait, warnings };
}
