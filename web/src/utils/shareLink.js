import { defaultEngineConfig } from "../physics/engine.js";

const STRING_KEYS = new Set(["compressor_type", "turbine_type", "nozzle_type"]);
const INT_KEYS = new Set(["n_compressor_stages", "n_turbine_stages"]);
const BOOL_KEYS = new Set(["afterburner_on"]);

/**
 * Shareable configuration links — Phase 3, item 02.
 *
 * Every `EngineConfig` field (physics/engine.js `defaultEngineConfig`) is a
 * plain number, string, or null, so the whole config round-trips through
 * URL query params with no backend: only fields that differ from the
 * default are written, which keeps a typical link short (most designs
 * only touch a handful of values) and lets a link missing a field — an
 * older link, or one someone hand-edited — fall back to that field's
 * current default instead of breaking.
 */
export function configToSearchParams(config) {
  const defaults = defaultEngineConfig();
  const params = new URLSearchParams();
  for (const key of Object.keys(defaults)) {
    const value = config[key];
    if (value === null || value === undefined) continue;
    if (value === defaults[key]) continue;
    params.set(key, String(value));
  }
  return params;
}

/** Inverse of `configToSearchParams` — returns a partial config patch,
 *  meant to be spread over `defaultEngineConfig()` (or merged into it),
 *  never a full config on its own. Unknown keys and unparseable numbers
 *  are silently skipped rather than throwing, since this only ever reads
 *  a URL someone could have hand-edited. */
export function configFromSearchParams(params) {
  const defaults = defaultEngineConfig();
  const patch = {};
  for (const key of Object.keys(defaults)) {
    if (!params.has(key)) continue;
    const raw = params.get(key);
    if (STRING_KEYS.has(key)) {
      patch[key] = raw;
    } else if (BOOL_KEYS.has(key)) {
      if (raw === "true" || raw === "false") patch[key] = raw === "true";
    } else if (INT_KEYS.has(key)) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) patch[key] = n;
    } else {
      const n = parseFloat(raw);
      if (Number.isFinite(n)) patch[key] = n;
    }
  }
  return patch;
}

/** The current page URL, with the query string replaced by exactly the
 *  config's non-default fields — this is both "the link to copy" and
 *  "the URL the address bar should already show" (App.jsx keeps the two
 *  in sync via history.replaceState as the config changes). */
export function buildShareUrl(config) {
  const query = configToSearchParams(config).toString();
  const base = `${window.location.origin}${window.location.pathname}`;
  return query ? `${base}?${query}` : base;
}
