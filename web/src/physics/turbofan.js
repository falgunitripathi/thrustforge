/**
 * Turbofan (two-spool, unmixed) — a fan added ahead of the turbojet's
 * own core, splitting the intake air into a core (hot) stream through
 * the compressor/combustor/turbine/hot-nozzle, and a bypass (cold)
 * stream straight from the fan to its own cold nozzle.
 *
 * Faithful JS port of aeropropsim/turbofan.py — see that file (and
 * reference/turbofan.md) for full provenance and flagged judgment
 * calls, including the "NOT IN SOURCE" defaults (bypass ratio, fan
 * pressure ratio, fan/spool efficiencies) sourced from general
 * literature rather than this project's primary reference.
 *
 * Layouts (cfg.layout): "unmixed", "geared" (LPT work x eta_gb),
 * "three_spool" (IPT drives the IPC, LPT the fan alone) and "mixed"
 * (beta solved from p03' = p07, mixed-gas properties, optional
 * afterburner after the mixer, one nozzle) — see turbofan.py.
 */

import { GAMMA_C, CP_C, GAMMA_H, CP_H, DEFAULTS } from "./constants.js";
import { isaTroposphere, freestreamStagnation } from "./atmosphere.js";
import { intakeExitState } from "./intake.js";
import { fuelAirRatio, combustorExitPressure } from "./combustor.js";
import { turbineTempRatio, turbinePressureRatio } from "./matching.js";
import {
  criticalPressure, isChoked, chokedExitTemperature,
  chokedExitVelocity, unchokedExitVelocity, thrust as nozzleThrust,
} from "./nozzle.js";
import { tsfc as perfTsfc } from "./performance.js";
import { Station } from "./gasstate.js";

/** Default turbofan configuration — mirrors TurbofanConfig in turbofan.py. */
export function defaultTurbofanConfig() {
  return {
    altitude_m: 10000.0,
    mach_flight: 0.8,
    beta: 5.0,
    pi_f: 1.65,
    eta_f: 0.90,
    pi_LPC: 1.5,
    eta_LPC: 0.90,
    pi_HPC: 12.0,
    eta_HPC: 0.90,
    T05: 1500.0,
    eta_b: DEFAULTS.eta_b,
    delta_p_cc_pct: DEFAULTS.delta_p_cc_pct,
    Q_R: DEFAULTS.Q_R,
    eta_HPT: DEFAULTS.eta_tt_stage,
    eta_LPT: DEFAULTS.eta_tt_stage,
    eta_m1: DEFAULTS.eta_m,
    eta_m2: DEFAULTS.eta_m,
    lambda1: 1.0,
    lambda2: 1.0,
    delta_p_jetpipe: 0.02,
    eta_n1: DEFAULTS.eta_N,
    eta_fn: DEFAULTS.eta_N,
    mdot_a: 1.0,
    // Afterburner (core stream, jet pipe 7 -> 8) — off by default.
    afterburner_on: false,
    T08_ab: 2000.0,
    delta_p_ab_pct: 0.05,
    layout: "unmixed",
    eta_gb: 0.99,
    eta_IPT: DEFAULTS.eta_tt_stage,
    eta_m3: DEFAULTS.eta_m,
    lambda3: 1.0,
    r_mix: 0.98,
    delta_p_duct: 0.0,
    eta_d: DEFAULTS.eta_d,
    gamma_c: GAMMA_C,
    cp_c: CP_C,
    gamma_h: GAMMA_H,
    cp_h: CP_H,
  };
}

/** T_out/T_in = 1 + (pi^((gamma-1)/gamma) - 1)/eta, p_out = p_in*pi. */
function compressorStep(T_in, p_in, pi, eta, gamma) {
  const exponent = (gamma - 1.0) / gamma;
  const T_out = T_in * (1.0 + (pi ** exponent - 1.0) / eta);
  const p_out = p_in * pi;
  return [T_out, p_out];
}

/** Solve one single-design-point two-spool unmixed turbofan cycle. */
export function solveTurbofan(cfg) {
  if (!TURBOFAN_LAYOUTS.includes(cfg.layout)) {
    throw new Error(`solveTurbofan: layout must be one of ${TURBOFAN_LAYOUTS.join(", ")}, got '${cfg.layout}'.`);
  }
  if (cfg.afterburner_on && cfg.layout !== "unmixed" && cfg.layout !== "mixed") {
    throw new Error(
      "solveTurbofan: the afterburner is only modelled for the unmixed and mixed-flow " +
      "layouts — geared and three-spool turbofans are high-bypass airliner engines. " +
      "Turn the afterburner off or pick one of those layouts."
    );
  }
  const result = {
    config: cfg, atmosphere: {}, intake: {}, fan: {}, lpc: {}, hpc: {},
    combustor: {}, hpt: {}, lpt: {}, hot_nozzle: {}, afterburner: {}, cold_nozzle: {},
    ipt: {}, mixer: {},
    performance: {}, stations: {},
  };
  const R_c = cfg.cp_c * (cfg.gamma_c - 1.0) / cfg.gamma_c;
  const R_h = cfg.cp_h * (cfg.gamma_h - 1.0) / cfg.gamma_h;

  // --- Atmosphere ---
  const [T_a, p_a] = isaTroposphere(cfg.altitude_m);
  const V_flight = cfg.mach_flight * Math.sqrt(cfg.gamma_c * R_c * T_a);
  const [T0a, p0a] = freestreamStagnation(T_a, p_a, cfg.mach_flight, cfg.gamma_c);
  result.atmosphere = { T_a, p_a, V_flight, T0a, p0a };

  // --- Intake (identical to the turbojet) ---
  const intake = intakeExitState(T_a, p_a, cfg.mach_flight, cfg.eta_d, cfg.gamma_c);
  result.intake = intake;
  const { T02, p02 } = intake;

  // --- Fan ---
  const [T010, p010] = compressorStep(T02, p02, cfg.pi_f, cfg.eta_f, cfg.gamma_c);
  result.fan = { T010, p010, pi_f: cfg.pi_f };

  // --- LPC (booster) ---
  const [T03, p03] = compressorStep(T010, p010, cfg.pi_LPC, cfg.eta_LPC, cfg.gamma_c);
  result.lpc = { T03, p03, pi_LPC: cfg.pi_LPC };

  // --- HPC ---
  const [T04, p04] = compressorStep(T03, p03, cfg.pi_HPC, cfg.eta_HPC, cfg.gamma_c);
  result.hpc = { T04, p04, pi_HPC: cfg.pi_HPC };

  // --- Combustor (same formulas as the turbojet's) ---
  const f = fuelAirRatio(T04, cfg.T05, cfg.eta_b, cfg.Q_R, cfg.cp_c, cfg.cp_h);
  const p05 = combustorExitPressure(p04, cfg.delta_p_cc_pct);
  result.combustor = { f, p05, T05: cfg.T05 };

  // --- HPT: algebraically identical to the turbojet's shaft balance ---
  const T06_over_T05 = turbineTempRatio(T03, T04, cfg.T05, cfg.lambda1, cfg.eta_m1, f, cfg.cp_c, cfg.cp_h);
  const T06 = T06_over_T05 * cfg.T05;
  const p06_over_p05 = turbinePressureRatio(T06_over_T05, cfg.eta_HPT, cfg.gamma_h);
  const p06 = p06_over_p05 * p05;
  result.hpt = { T06, p06, T06_over_T05 };

  const ctx = { R_c, R_h, T_a, p_a, V: V_flight, T0a, p0a, T02, p02, T010, p010, T03, p03, T04, p04, f, p05, T06, p06 };
  if (cfg.layout === "three_spool") return finishThreeSpool(cfg, result, ctx);
  if (cfg.layout === "mixed") return finishMixed(cfg, result, ctx);

  // --- LPT: drives fan+LPC together, extra bypass-ratio term ---
  const compressorWorkSpecific =
    (1.0 + cfg.beta) * cfg.cp_c * (T010 - T02) + cfg.cp_c * (T03 - T010);
  let turbineCapacity = cfg.lambda2 * cfg.eta_m2 * (1.0 + f) * cfg.cp_h * T06;
  if (cfg.layout === "geared") turbineCapacity *= cfg.eta_gb;  // §7: gearbox loss
  const T07_over_T06 = 1.0 - compressorWorkSpecific / turbineCapacity;
  const T07 = T07_over_T06 * T06;
  const p07_over_p06 = turbinePressureRatio(T07_over_T06, cfg.eta_LPT, cfg.gamma_h);
  const p07 = p07_over_p06 * p06;
  result.lpt = { T07, p07, T07_over_T06 };

  // --- Jet pipe (7 -> 8): plain duct, or the afterburner when lit ---
  let fab, T08, p08;
  if (cfg.afterburner_on) {
    if (!(cfg.T08_ab > T07)) {
      throw new Error(
        `solveTurbofan: the afterburner exit temperature T08 = ${cfg.T08_ab.toFixed(0)} K must ` +
        `be above the low-pressure turbine exit temperature T07 = ${T07.toFixed(0)} K — an ` +
        `afterburner can only add heat. Raise T08 or turn the afterburner off.`
      );
    }
    const abDenom = cfg.eta_b * cfg.Q_R - cfg.cp_h * cfg.T08_ab;
    if (!(abDenom > 0)) {
      throw new Error(
        "solveTurbofan: the afterburner exit temperature is too high for this fuel — even " +
        "burning it perfectly can't heat the gas that much. Lower T08."
      );
    }
    fab = (1.0 + f) * (cfg.cp_h * cfg.T08_ab - cfg.cp_h * T07) / abDenom;
    T08 = cfg.T08_ab;
    p08 = p07 * (1.0 - cfg.delta_p_ab_pct);
  } else {
    fab = 0.0;
    T08 = T07;
    p08 = p07 * (1.0 - cfg.delta_p_jetpipe);
  }
  const f_total = f + fab;
  result.afterburner = { on: !!cfg.afterburner_on, fab, T07, p07, T08, p08 };

  // --- Hot nozzle (reuses nozzle.js exactly, as the turbojet does) ---
  const p_c_hot = criticalPressure(p08, cfg.eta_n1, cfg.gamma_h);
  const chokedHot = isChoked(p_c_hot, p_a);
  let T9, V9, p9;
  if (chokedHot) {
    T9 = chokedExitTemperature(T08, cfg.gamma_h);
    V9 = chokedExitVelocity(T9, cfg.gamma_h, R_h);
    p9 = p_c_hot;
  } else {
    V9 = unchokedExitVelocity(T08, p_a, p08, cfg.eta_n1, cfg.gamma_h, cfg.cp_h);
    p9 = p_a;
    T9 = T08 - V9 ** 2 / (2.0 * cfg.cp_h);
  }
  const rho9 = p9 / (R_h * T9);
  const A9 = (1.0 + f_total) * cfg.mdot_a / (rho9 * V9);
  result.hot_nozzle = { choked: chokedHot, p_exit: p9, T_exit: T9, V_exit: V9, rho_exit: rho9, A_exit: A9 };

  // --- Cold (fan) nozzle — same nozzle.js functions, cold-side properties ---
  const p_c_cold = criticalPressure(p010, cfg.eta_fn, cfg.gamma_c);
  const chokedCold = isChoked(p_c_cold, p_a);
  let T11, V11, p11;
  if (chokedCold) {
    T11 = chokedExitTemperature(T010, cfg.gamma_c);
    V11 = chokedExitVelocity(T11, cfg.gamma_c, R_c);
    p11 = p_c_cold;
  } else {
    V11 = unchokedExitVelocity(T010, p_a, p010, cfg.eta_fn, cfg.gamma_c, cfg.cp_c);
    p11 = p_a;
    T11 = T010 - V11 ** 2 / (2.0 * cfg.cp_c);
  }
  const rho11 = p11 / (R_c * T11);
  const mdotCold = cfg.beta * cfg.mdot_a;
  const A11 = mdotCold / (rho11 * V11);
  result.cold_nozzle = { choked: chokedCold, p_exit: p11, T_exit: T11, V_exit: V11, rho_exit: rho11, A_exit: A11 };

  // --- Combined two-stream thrust and TSFC ---
  const T_hot = nozzleThrust(cfg.mdot_a, f_total, V9, V_flight, p9, p_a, A9);
  const T_cold = nozzleThrust(mdotCold, 0.0, V11, V_flight, p11, p_a, A11);
  const T_total = T_hot + T_cold;
  const sp_thrust = T_total / cfg.mdot_a;
  const tsfc_val = perfTsfc(f_total, sp_thrust);
  const mdot_f = f_total * cfg.mdot_a;
  const eta_0 = (mdot_f > 0 && V_flight > 0) ? (T_total * V_flight / (mdot_f * cfg.Q_R)) : null;
  result.performance = {
    thrust: T_total, thrust_hot: T_hot, thrust_cold: T_cold,
    specific_thrust: sp_thrust, tsfc: tsfc_val, f, f_ab: fab, f_total, eta_overall: eta_0, beta: cfg.beta,
  };

  // --- Key-station table: a, 2, 10, 3, 4, 5, 6, 7, 9, 11 ---
  result.stations = {
    a: new Station("a", T0a, p0a, cfg.gamma_c, cfg.cp_c, R_c, V_flight),
    "2": new Station("2", T02, p02, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "10": new Station("10", T010, p010, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "3": new Station("3", T03, p03, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "4": new Station("4", T04, p04, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "5": new Station("5", cfg.T05, p05, cfg.gamma_h, cfg.cp_h, R_h, 0.0),
    "6": new Station("6", T06, p06, cfg.gamma_h, cfg.cp_h, R_h, 0.0),
    "7": new Station("7", T07, p07, cfg.gamma_h, cfg.cp_h, R_h, 0.0),
    ...(cfg.afterburner_on ? { "8": new Station("8", T08, p08, cfg.gamma_h, cfg.cp_h, R_h, 0.0) } : {}),
    "9": Station.fromStatic("9", T9, p9, V9, cfg.gamma_h, cfg.cp_h, R_h),
    "11": Station.fromStatic("11", T11, p11, V11, cfg.gamma_c, cfg.cp_c, R_c),
  };

  return result;
}

export const TURBOFAN_LAYOUTS = ["unmixed", "geared", "three_spool", "mixed"];

function nozzle(T0, p0, eta_n, gamma, cp, R, p_a) {
  const p_c = criticalPressure(p0, eta_n, gamma);
  if (isChoked(p_c, p_a)) {
    const T = chokedExitTemperature(T0, gamma);
    return [T, chokedExitVelocity(T, gamma, R), p_c, true];
  }
  const V = unchokedExitVelocity(T0, p_a, p0, eta_n, gamma, cp);
  return [T0 - V ** 2 / (2.0 * cp), V, p_a, false];
}

function turbineStep(T_in, p_in, work, lam, eta_m, f, eta_t, cfg) {
  const ratio = 1.0 - work / (lam * eta_m * (1.0 + f) * cfg.cp_h * T_in);
  const pRatio = turbinePressureRatio(ratio, eta_t, cfg.gamma_h);
  return [ratio * T_in, pRatio * p_in];
}

function finishThreeSpool(cfg, result, c) {
  const f = c.f;
  const ipcWork = cfg.cp_c * (c.T03 - c.T010);
  const [T07, p07] = turbineStep(c.T06, c.p06, ipcWork, cfg.lambda3, cfg.eta_m3, f, cfg.eta_IPT, cfg);
  result.ipt = { T07, p07 };
  const fanWork = (1.0 + cfg.beta) * cfg.cp_c * (c.T010 - c.T02);
  const [T08, p08] = turbineStep(T07, p07, fanWork, cfg.lambda2, cfg.eta_m2, f, cfg.eta_LPT, cfg);
  result.lpt = { T08, p08 };
  result.afterburner = { on: false, fab: 0.0 };

  const pJet = p08 * (1.0 - cfg.delta_p_jetpipe);
  const [T9, V9, p9, chokedHot] = nozzle(T08, pJet, cfg.eta_n1, cfg.gamma_h, cfg.cp_h, c.R_h, c.p_a);
  const rho9 = p9 / (c.R_h * T9);
  const A9 = (1.0 + f) * cfg.mdot_a / (rho9 * V9);
  result.hot_nozzle = { choked: chokedHot, p_exit: p9, T_exit: T9, V_exit: V9, rho_exit: rho9, A_exit: A9 };
  const [T11, V11, p11, chokedCold] = nozzle(c.T010, c.p010, cfg.eta_fn, cfg.gamma_c, cfg.cp_c, c.R_c, c.p_a);
  const rho11 = p11 / (c.R_c * T11);
  const mdotCold = cfg.beta * cfg.mdot_a;
  const A11 = mdotCold / (rho11 * V11);
  result.cold_nozzle = { choked: chokedCold, p_exit: p11, T_exit: T11, V_exit: V11, rho_exit: rho11, A_exit: A11 };

  const V = c.V;
  const T_hot = nozzleThrust(cfg.mdot_a, f, V9, V, p9, c.p_a, A9);
  const T_cold = nozzleThrust(mdotCold, 0.0, V11, V, p11, c.p_a, A11);
  const T_total = T_hot + T_cold;
  const sp = T_total / cfg.mdot_a;
  const mdot_f = f * cfg.mdot_a;
  result.performance = {
    thrust: T_total, thrust_hot: T_hot, thrust_cold: T_cold,
    specific_thrust: sp, tsfc: perfTsfc(f, sp), f, f_ab: 0.0, f_total: f,
    eta_overall: (mdot_f > 0 && V > 0) ? (T_total * V / (mdot_f * cfg.Q_R)) : null,
    beta: cfg.beta,
  };
  const { R_c, R_h } = c;
  result.stations = {
    a: new Station("a", c.T0a, c.p0a, cfg.gamma_c, cfg.cp_c, R_c, V),
    "2": new Station("2", c.T02, c.p02, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "10": new Station("10", c.T010, c.p010, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "3": new Station("3", c.T03, c.p03, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "4": new Station("4", c.T04, c.p04, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "5": new Station("5", cfg.T05, c.p05, cfg.gamma_h, cfg.cp_h, R_h, 0.0),
    "6": new Station("6", c.T06, c.p06, cfg.gamma_h, cfg.cp_h, R_h, 0.0),
    "7": new Station("7", T07, p07, cfg.gamma_h, cfg.cp_h, R_h, 0.0),
    "8": new Station("8", T08, p08, cfg.gamma_h, cfg.cp_h, R_h, 0.0),
    "9": Station.fromStatic("9", T9, p9, V9, cfg.gamma_h, cfg.cp_h, R_h),
    "11": Station.fromStatic("11", T11, p11, V11, cfg.gamma_c, cfg.cp_c, R_c),
  };
  return result;
}

function lptExitPressure(cfg, c, beta) {
  const f = c.f;
  const work = (1.0 + beta) * cfg.cp_c * (c.T010 - c.T02) + cfg.cp_c * (c.T03 - c.T010);
  const ratio = 1.0 - work / (cfg.lambda2 * cfg.eta_m2 * (1.0 + f) * cfg.cp_h * c.T06);
  const sRatio = 1.0 - (1.0 - ratio) / cfg.eta_LPT;
  if (!(ratio > 0 && sRatio > 0)) return [0.0, 0.0];
  return [ratio * c.T06, c.p06 * sRatio ** (cfg.gamma_h / (cfg.gamma_h - 1.0))];
}

function finishMixed(cfg, result, c) {
  const f = c.f;
  const pTarget = c.p010 * (1.0 - cfg.delta_p_duct);
  if (lptExitPressure(cfg, c, 0.0)[1] <= pTarget) {
    throw new Error(
      "solveTurbofan: mixed-flow — the fan pressure ratio is too high for the core to match " +
      "at the mixer: even with no bypass air, the gas leaving the low-pressure turbine is at a " +
      "lower pressure than the fan air, so the two streams can't mix. Lower the fan pressure " +
      "ratio, or raise the turbine inlet temperature or the core pressure ratios."
    );
  }
  const betaHi = 30.0;
  if (lptExitPressure(cfg, c, betaHi)[1] > pTarget) {
    throw new Error(
      "solveTurbofan: mixed-flow — the fan pressure ratio is too low: matching the core's " +
      "exit pressure would need a bypass ratio above 30. Raise the fan pressure ratio."
    );
  }
  let lo = 0.0, hi = betaHi;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (lptExitPressure(cfg, c, mid)[1] > pTarget) lo = mid; else hi = mid;
  }
  const beta = 0.5 * (lo + hi);
  const [T07, p07] = lptExitPressure(cfg, c, beta);
  result.lpt = { T07, p07 };

  const m = 1.0 + f + beta;
  const cp8 = ((1.0 + f) * cfg.cp_h + beta * cfg.cp_c) / m;
  const R8 = ((1.0 + f) * c.R_h + beta * c.R_c) / m;
  const gamma8 = cp8 / (cp8 - R8);
  const T08 = (beta * cfg.cp_c * c.T010 + (1.0 + f) * cfg.cp_h * T07) / (m * cp8);
  const p08 = cfg.r_mix * p07;
  result.mixer = { beta, T03p: c.T010, p03p: pTarget, T08, p08, cp8, R8, gamma8 };

  let fab, T0n, p0n, g_n, cp_n, R_n;
  if (cfg.afterburner_on) {
    if (!(cfg.T08_ab > T08)) {
      throw new Error(
        `solveTurbofan: the afterburner exit temperature T011 = ${cfg.T08_ab.toFixed(0)} K must be ` +
        `above the mixed-stream temperature T08 = ${T08.toFixed(0)} K — an afterburner can only add ` +
        `heat. Raise it or turn the afterburner off.`
      );
    }
    const abDenom = cfg.eta_b * cfg.Q_R - cfg.cp_h * cfg.T08_ab;
    if (!(abDenom > 0)) {
      throw new Error(
        "solveTurbofan: the afterburner exit temperature is too high for this fuel — even " +
        "burning it perfectly can't heat the gas that much. Lower it."
      );
    }
    fab = (cfg.cp_h * cfg.T08_ab - cp8 * T08) / abDenom;
    T0n = cfg.T08_ab; p0n = p08 * (1.0 - cfg.delta_p_ab_pct);
    g_n = cfg.gamma_h; cp_n = cfg.cp_h; R_n = c.R_h;
  } else {
    fab = 0.0; T0n = T08; p0n = p08; g_n = gamma8; cp_n = cp8; R_n = R8;
  }
  result.afterburner = { on: !!cfg.afterburner_on, fab, T08, p08, T011: T0n, p011: p0n };

  const [T9, V9, p9, choked] = nozzle(T0n, p0n, cfg.eta_n1, g_n, cp_n, R_n, c.p_a);
  const mass = m * (1.0 + fab);
  const rho9 = p9 / (R_n * T9);
  const A9 = mass * cfg.mdot_a / (rho9 * V9);
  result.hot_nozzle = { choked, p_exit: p9, T_exit: T9, V_exit: V9, rho_exit: rho9, A_exit: A9 };
  result.cold_nozzle = {};

  const V = c.V;
  const T_total = cfg.mdot_a * (mass * V9 - (1.0 + beta) * V) + A9 * (p9 - c.p_a);
  const sp = T_total / cfg.mdot_a;
  const fuel = f + fab * m;
  const mdot_f = fuel * cfg.mdot_a;
  result.performance = {
    thrust: T_total, thrust_hot: T_total, thrust_cold: 0.0,
    specific_thrust: sp, tsfc: perfTsfc(fuel, sp), f, f_ab: fab, f_total: fuel,
    eta_overall: (mdot_f > 0 && V > 0) ? (T_total * V / (mdot_f * cfg.Q_R)) : null,
    beta,
  };
  const { R_c, R_h } = c;
  const stations = {
    a: new Station("a", c.T0a, c.p0a, cfg.gamma_c, cfg.cp_c, R_c, V),
    "2": new Station("2", c.T02, c.p02, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "10": new Station("10", c.T010, c.p010, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "3": new Station("3", c.T03, c.p03, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "4": new Station("4", c.T04, c.p04, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "5": new Station("5", cfg.T05, c.p05, cfg.gamma_h, cfg.cp_h, R_h, 0.0),
    "6": new Station("6", c.T06, c.p06, cfg.gamma_h, cfg.cp_h, R_h, 0.0),
    "7": new Station("7", T07, p07, cfg.gamma_h, cfg.cp_h, R_h, 0.0),
    "8": new Station("8", T08, p08, gamma8, cp8, R8, 0.0),
  };
  if (cfg.afterburner_on) stations["11"] = new Station("11", T0n, p0n, cfg.gamma_h, cfg.cp_h, R_h, 0.0);
  stations["9"] = Station.fromStatic("9", T9, p9, V9, g_n, cp_n, R_n);
  result.stations = stations;
  return result;
}
