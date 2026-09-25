import { defaultEngineConfig } from "../physics/engine.js";

/**
 * Shareable configuration links for every engine.
 *
 * A link carries `engine=<type>` (left out for the turbojet, so links made
 * before other engines existed still open the same way) plus only the
 * fields that differ from that engine's default config — short links, and
 * a link missing a field (older, or hand-edited) falls back to the default
 * instead of breaking. Each value is parsed back using the type of the
 * default it replaces (number, string or boolean).
 */
export const ENGINE_PARAM = "engine";
const INT_KEYS = new Set(["n_compressor_stages", "n_turbine_stages"]);

export function configToSearchParams(config, defaults = defaultEngineConfig()) {
  const params = new URLSearchParams();
  for (const key of Object.keys(defaults)) {
    const value = config[key];
    if (value === null || value === undefined) continue;
    if (typeof value === "number" && !Number.isFinite(value)) continue;
    if (value === defaults[key]) continue;
    params.set(key, String(value));
  }
  return params;
}

/** Inverse of `configToSearchParams` — a partial config patch to spread
 *  over the engine's defaults. Unknown keys and unparseable values are
 *  skipped rather than throwing, since this only ever reads a URL someone
 *  could have hand-edited. */
export function configFromSearchParams(params, defaults = defaultEngineConfig()) {
  const patch = {};
  for (const key of Object.keys(defaults)) {
    if (!params.has(key)) continue;
    const raw = params.get(key);
    const def = defaults[key];
    if (typeof def === "boolean") {
      if (raw === "true" || raw === "false") patch[key] = raw === "true";
    } else if (typeof def === "string") {
      patch[key] = raw;
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

/** The link to this engine and design — also what the address bar shows
 *  (App.jsx keeps the two in sync with history.replaceState). */
export function buildShareUrl(config, { engineType = "turbojet", defaults = defaultEngineConfig() } = {}) {
  const params = configToSearchParams(config, defaults);
  const query = engineType === "turbojet"
    ? params.toString()
    : `${ENGINE_PARAM}=${encodeURIComponent(engineType)}${params.toString() ? `&${params.toString()}` : ""}`;
  const base = `${window.location.origin}${window.location.pathname}`;
  return query ? `${base}?${query}` : base;
}
