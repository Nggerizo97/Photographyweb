import exifr from 'exifr';

/**
 * Camera telemetry. GPS is never read, so it can never leak into the
 * published JSON (and sharp strips all metadata from the derivatives).
 */
const PICK = [
  'Make', 'Model', 'LensModel', 'LensMake', 'FocalLength', 'FocalLengthIn35mmFormat',
  'FNumber', 'ExposureTime', 'ISO', 'ISOSpeedRatings', 'PhotographicSensitivity',
  'DateTimeOriginal', 'CreateDate', 'ExposureCompensation', 'ExposureProgram', 'Software',
];

const PROGRAMS = {
  1: 'Manual', 2: 'Program', 3: 'Aperture priority', 4: 'Shutter priority',
  5: 'Creative', 6: 'Action', 7: 'Portrait', 8: 'Landscape',
};

const MAKE_ALIASES = [
  [/^nikon/i, 'Nikon'], [/^olympus|^om digital/i, 'OM System'], [/^fujifilm/i, 'Fujifilm'],
  [/^sony/i, 'Sony'], [/^canon/i, 'Canon'], [/^panasonic/i, 'Panasonic'], [/^leica/i, 'Leica'],
  [/^ricoh|^pentax/i, 'Ricoh'], [/^apple/i, 'Apple'], [/^google/i, 'Google'], [/^samsung/i, 'Samsung'],
  [/^dji/i, 'DJI'], [/^hasselblad/i, 'Hasselblad'], [/^sigma/i, 'Sigma'],
];

const clean = (v) => {
  if (v == null) return null;
  const s = String(v).replace(/\0/g, '').trim();
  return s && !/^-+$/.test(s) ? s : null;
};

function normaliseMake(make) {
  const m = clean(make);
  if (!m) return null;
  for (const [re, name] of MAKE_ALIASES) if (re.test(m)) return name;
  return m.length > 3 && m === m.toUpperCase() ? m[0] + m.slice(1).toLowerCase() : m;
}

export function cameraName(make, model) {
  const mk = normaliseMake(make);
  let md = clean(model);
  if (!md) return mk;
  if (mk && md.toLowerCase().startsWith(mk.toLowerCase())) md = md.slice(mk.length).trim();
  if (mk && /^nikon/i.test(md)) md = md.replace(/^nikon\s*/i, '');
  return [mk, md].filter(Boolean).join(' ');
}

export function shutterLabel(t) {
  if (!Number.isFinite(t) || t <= 0) return null;
  if (t >= 0.3) return `${Number(t.toFixed(t < 10 ? 1 : 0))}s`;
  return `1/${Math.round(1 / t)}`;
}

/** EV at ISO 100: log2(N²/t) − log2(ISO/100). */
export function ev100(fNumber, t, iso) {
  if (!(fNumber > 0 && t > 0 && iso > 0)) return null;
  return Math.log2((fNumber * fNumber) / t) - Math.log2(iso / 100);
}

/** "2019:05:12 14:33:10" -> "2019-05-12T14:33:10" (no timezone games). */
export function parseExifDate(v) {
  const s = clean(v);
  if (!s) return null;
  const m = s.match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m || m[1] === '0000') return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

export async function readExif(file) {
  let raw = null;
  try {
    raw = await exifr.parse(file, { pick: PICK, reviveValues: false, translateValues: false, gps: false });
  } catch {
    raw = null;
  }
  if (!raw) return emptyExif();

  const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
  const iso = num(raw.ISO) ?? num(Array.isArray(raw.ISOSpeedRatings) ? raw.ISOSpeedRatings[0] : raw.ISOSpeedRatings) ?? num(raw.PhotographicSensitivity);
  const aperture = num(raw.FNumber);
  const shutter = num(raw.ExposureTime);
  const date = parseExifDate(raw.DateTimeOriginal) ?? parseExifDate(raw.CreateDate);

  return {
    camera: cameraName(raw.Make, raw.Model),
    lens: clean(raw.LensModel),
    focal: num(raw.FocalLength),
    focal35: num(raw.FocalLengthIn35mmFormat),
    aperture,
    shutter,
    shutterLabel: shutterLabel(shutter),
    iso,
    ev100: ev100(aperture, shutter, iso),
    exposureBias: Number.isFinite(Number(raw.ExposureCompensation)) ? Number(raw.ExposureCompensation) : null,
    program: PROGRAMS[raw.ExposureProgram] ?? null,
    date,
    year: date ? Number(date.slice(0, 4)) : null,
  };
}

export function emptyExif() {
  return {
    camera: null, lens: null, focal: null, focal35: null, aperture: null, shutter: null,
    shutterLabel: null, iso: null, ev100: null, exposureBias: null, program: null, date: null, year: null,
  };
}
