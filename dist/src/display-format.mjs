/** Locale-aware display formatting only — does not alter engine numeric precision. */

export function formatDisplayNumber(value, lang = 'en', { maximumFractionDigits = 2, minimumFractionDigits = null } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const opts = { maximumFractionDigits };
  if (minimumFractionDigits != null) opts.minimumFractionDigits = minimumFractionDigits;
  const locale = lang === 'ar' ? 'ar' : 'en';
  return new Intl.NumberFormat(locale, opts).format(n);
}

/** Model thresholds and depths (mm) — two decimal places typical for demo budgets like 623.86. */
export function formatDepthMm(value, lang = 'en') {
  return formatDisplayNumber(value, lang, { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

/** Field volumes (m³) — whole units with grouping. */
export function formatVolumeM3(value, lang = 'en') {
  return formatDisplayNumber(value, lang, { maximumFractionDigits: 0, minimumFractionDigits: 0 });
}

export function formatRangeDisplay(min, max, lang, unit, { depth = unit === 'mm' } = {}) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return '';
  const fmt = depth ? (v) => formatDepthMm(v, lang) : (v) => formatVolumeM3(v, lang);
  const text = Math.abs(max - min) < 1e-8 ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
  return text;
}