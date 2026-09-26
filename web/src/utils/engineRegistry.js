/**
 * Every engine (and turbofan layout) the site can solve, in one list —
 * used by the tools that put different engines side by side
 * (engine-vs-engine comparison, the "which engine wins?" chart).
 */
import { isaTroposphere } from "../physics/atmosphere.js";
import { defaultEngineConfig, solveEngine } from "../physics/engine.js";
import { defaultTurbopropConfig, solveTurboprop } from "../physics/turboprop.js";
import { defaultTurboshaftConfig, solveTurboshaft } from "../physics/turboshaft.js";
import { defaultTurbofanConfig, solveTurbofan } from "../physics/turbofan.js";
import { defaultPropfanConfig, solvePropfan } from "../physics/propfan.js";
import { defaultScramjetConfig, solveScramjet } from "../physics/scramjet.js";
import { defaultRamjetConfig, solveRamjet } from "../physics/ramjet.js";
import { defaultTurboramjetConfig, solveTurboramjet } from "../physics/turboramjet.js";
import { defaultTwinSpoolTurbojetConfig, solveTwinSpoolTurbojet } from "../physics/twinSpoolTurbojet.js";

// Starting values when switching turbofan layout (general-literature
// figures for each type; the mixed-flow bypass ratio is solved).
export const TURBOFAN_LAYOUT_DEFAULTS = {
  unmixed: { beta: 5.0, pi_f: 1.65, pi_LPC: 1.5, pi_HPC: 12.0, T05: 1500.0 },
  mixed: { pi_f: 3.0, pi_LPC: 1.0, pi_HPC: 12.0, T05: 1500.0 },
  geared: { beta: 11.0, pi_f: 1.45, pi_LPC: 1.6, pi_HPC: 15.0, T05: 1700.0, afterburner_on: false },
  three_spool: { beta: 8.0, pi_f: 1.5, pi_LPC: 5.0, pi_HPC: 5.0, T05: 1650.0, afterburner_on: false },
};

// machMin/machMax match each engine's own flight-Mach input limits; a
// turboshaft makes no thrust, so it has no TSFC to plot (thrust: false).
export const ENGINES = [
  { key: "turbojet", type: "turbojet", label: "Turbojet (single-spool)", solve: solveEngine, defaults: defaultEngineConfig, machMin: 0, machMax: 3 },
  { key: "turbojet2", type: "turbojet2", label: "Turbojet (two-spool)", solve: solveTwinSpoolTurbojet, defaults: defaultTwinSpoolTurbojetConfig, machMin: 0, machMax: 3 },
  { key: "turboprop", type: "turboprop", label: "Turboprop", solve: solveTurboprop, defaults: defaultTurbopropConfig, machMin: 0.05, machMax: 0.8 },
  { key: "turboshaft", type: "turboshaft", label: "Turboshaft", solve: solveTurboshaft, defaults: defaultTurboshaftConfig, machMin: 0, machMax: 0.6, thrust: false },
  { key: "turbofan_unmixed", type: "turbofan", layout: "unmixed", label: "Turbofan (unmixed)", solve: solveTurbofan, defaults: defaultTurbofanConfig, machMin: 0, machMax: 2 },
  { key: "turbofan_mixed", type: "turbofan", layout: "mixed", label: "Turbofan (mixed-flow)", solve: solveTurbofan, defaults: defaultTurbofanConfig, machMin: 0, machMax: 2 },
  { key: "turbofan_geared", type: "turbofan", layout: "geared", label: "Turbofan (geared)", solve: solveTurbofan, defaults: defaultTurbofanConfig, machMin: 0, machMax: 2 },
  { key: "turbofan_three_spool", type: "turbofan", layout: "three_spool", label: "Turbofan (three-spool)", solve: solveTurbofan, defaults: defaultTurbofanConfig, machMin: 0, machMax: 2 },
  { key: "propfan", type: "propfan", label: "Propfan", solve: solvePropfan, defaults: defaultPropfanConfig, machMin: 0, machMax: 0.9 },
  { key: "turboramjet", type: "turboramjet", label: "Turboramjet", solve: solveTurboramjet, defaults: defaultTurboramjetConfig, machMin: 0, machMax: 5 },
  { key: "ramjet", type: "ramjet", label: "Ramjet", solve: solveRamjet, defaults: defaultRamjetConfig, machMin: 0.3, machMax: 6 },
  { key: "scramjet", type: "scramjet", label: "Scramjet", solve: solveScramjet, defaults: defaultScramjetConfig, machMin: 3, machMax: 12 },
];

export const ENGINE_BY_KEY = Object.fromEntries(ENGINES.map((e) => [e.key, e]));

/** The registry key for the engine currently open in the app. */
export function engineKey(engineType, config) {
  return engineType === "turbofan" ? `turbofan_${config.layout ?? "unmixed"}` : engineType;
}

/**
 * The config to use for an engine: its live settings from the app when
 * that's the engine (and layout) the user has set up, else its defaults.
 * `configs` maps engine type -> the app's current config for it.
 */
export function engineConfig(entry, configs) {
  const live = configs?.[entry.type];
  if (entry.type === "turbofan") {
    if (live && (live.layout ?? "unmixed") === entry.layout) return live;
    return { ...entry.defaults(), ...TURBOFAN_LAYOUT_DEFAULTS[entry.layout], layout: entry.layout };
  }
  return live ?? entry.defaults();
}

/**
 * Headline numbers from any engine's result, null where one doesn't apply.
 *
 * Overall efficiency is recomputed here from its definition — useful power
 * over fuel power, η_o = T·V/(ṁ_f·Q_R), or P_shaft/(ṁ_f·Q_R) for a
 * turboshaft — so every engine is judged the same way. (The engines' own
 * panels use their textbook formulas, which differ slightly: e.g. the
 * turbojet's η_p = 2V/(V+V_exit) leaves out a choked nozzle's pressure
 * thrust.)
 */
export function headline(result) {
  const p = result.performance;
  const cfg = result.config;
  const num = (v) => (Number.isFinite(v) ? v : null);
  const thrust = num(p.thrust);
  const power = num(p.ESHP_W ?? p.Pload_W);
  const f = num(p.f_total ?? p.f);
  const fuelPower = f !== null && f > 0 ? f * cfg.mdot_a * cfg.Q_R : null;
  const T_a = isaTroposphere(cfg.altitude_m)[0];
  const V = cfg.mach_flight * Math.sqrt(cfg.gamma_c * cfg.cp_c * (1 - 1 / cfg.gamma_c) * T_a);
  let etaO = null;
  if (fuelPower !== null) {
    if (thrust !== null && thrust > 0) etaO = V > 0 ? (thrust * V) / fuelPower : null;
    else if (p.Pload_W !== undefined && power !== null) etaO = power / fuelPower;
  }
  return {
    thrust,
    specificThrust: num(p.specific_thrust),
    tsfc: thrust !== null && thrust > 0 ? num(p.tsfc) : null,
    etaO: num(etaO),
    power,
    sfc: num(p.ESFC_kg_per_kWh ?? p.SFC_kg_per_kWh),
    f,
  };
}
