/**
 * Scramjet (supersonic-combustion ramjet). Faithful JS port of
 * aeropropsim/scramjet.py — see that file and reference/scramjet.md for
 * provenance and the five documented judgment calls (nozzle expanded to
 * ambient instead of the source's anomalous p2/p3, Isp on fuel flow, the
 * T02 identity, eta_I path used over MIL-E-5007D, f<<1 efficiency forms).
 */

import { GAMMA_C, CP_C, GAMMA_H, CP_H, DEFAULTS } from "./constants.js";
import { isaTroposphere, freestreamStagnation } from "./atmosphere.js";
import { Station } from "./gasstate.js";

const G0 = 9.80665;

/** Default scramjet configuration — mirrors ScramjetConfig in scramjet.py. */
export function defaultScramjetConfig() {
  return {
    altitude_m: 10000.0,
    mach_flight: 6.0,
    mach_combustor_inlet: 2.5,
    eta_I: 0.90,
    f: 0.02,
    eta_b: DEFAULTS.eta_b,
    Q_R: DEFAULTS.Q_R,
    eta_N: DEFAULTS.eta_N,
    mdot_a: 1.0,
    gamma_c: GAMMA_C,
    cp_c: CP_C,
    gamma_h: GAMMA_H,
    cp_h: CP_H,
  };
}

export function milE5007dRecovery(M1) {
  if (M1 <= 1.0) return 1.0;
  // Published MIL-E-5007D constants — the source's 0.776/1.5 goes negative above M~2.2.
  if (M1 <= 5.0) return 1.0 - 0.075 * (M1 - 1.0) ** 1.35;
  return 800.0 / (M1 ** 4 + 935.0);
}

export function rayleighTempRatio(M2, M3, gamma_c, gamma_h) {
  return ((M3 ** 2 / M2 ** 2)
    * ((1.0 + gamma_c * M2 ** 2) / (1.0 + gamma_h * M3 ** 2)) ** 2
    * (1.0 + 0.5 * (gamma_h - 1.0) * M3 ** 2) / (1.0 + 0.5 * (gamma_c - 1.0) * M2 ** 2));
}

export function solveCombustorExitMach(target, M2, gamma_c, gamma_h) {
  let lo = 1.0, hi = 50.0;
  if (target > rayleighTempRatio(M2, lo, gamma_c, gamma_h)) {
    throw new Error(
      `solveScramjet: combustor thermally chokes — T03/T02=${target.toFixed(4)} exceeds ` +
      `the maximum heat addition a supersonic flow entering at M2=${M2.toFixed(3)} can ` +
      `absorb before reaching Mach 1. Lower the fuel-air ratio or raise M2.`
    );
  }
  if (target < rayleighTempRatio(M2, hi, gamma_c, gamma_h)) {
    throw new Error(`solveScramjet: no supersonic combustor-exit Mach for T03/T02=${target.toFixed(4)}.`);
  }
  for (let i = 0; i < 200; i += 1) {
    const mid = 0.5 * (lo + hi);
    if (rayleighTempRatio(M2, mid, gamma_c, gamma_h) > target) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

export function solveScramjet(cfg) {
  const result = {
    config: cfg, atmosphere: {}, intake: {}, combustor: {}, nozzle: {},
    performance: {}, stations: {},
  };
  const R_c = cfg.cp_c * (cfg.gamma_c - 1.0) / cfg.gamma_c;
  const R_h = cfg.cp_h * (cfg.gamma_h - 1.0) / cfg.gamma_h;
  const M1 = cfg.mach_flight, M2 = cfg.mach_combustor_inlet;

  if (!(M2 > 1.0)) {
    throw new Error(
      "solveScramjet: combustor-inlet Mach M2 must be > 1 — a scramjet keeps the " +
      "flow supersonic through the combustor (below that it's a ramjet)."
    );
  }
  if (!(M1 > M2)) {
    throw new Error(
      "solveScramjet: flight Mach M1 must exceed the combustor-inlet Mach M2 — the " +
      "intake decelerates the flow; scramjets need roughly Mach 5+ to operate."
    );
  }

  // --- Atmosphere / station 1 ---
  const [T1, p1] = isaTroposphere(cfg.altitude_m);
  const V1 = M1 * Math.sqrt(cfg.gamma_c * R_c * T1);
  const [T0a, p0a] = freestreamStagnation(T1, p1, M1, cfg.gamma_c);
  result.atmosphere = { T_a: T1, p_a: p1, V_flight: V1, T0a, p0a };

  // --- Intake ---
  const gc = cfg.gamma_c;
  const T2 = T1 * (1.0 + 0.5 * (gc - 1.0) * M1 ** 2) / (1.0 + 0.5 * (gc - 1.0) * M2 ** 2);
  const p2 = p1 * (1.0 + cfg.eta_I * (T2 / T1 - 1.0)) ** (gc / (gc - 1.0));
  const A2_over_A1 = (M1 / M2) * ((1.0 + 0.5 * (gc - 1.0) * M1 ** 2)
    / (1.0 + 0.5 * (gc - 1.0) * M2 ** 2)) ** ((gc + 1.0) / (2.0 * (gc - 1.0)));
  const T02 = T2 * (1.0 + 0.5 * (gc - 1.0) * M2 ** 2);
  const V2 = M2 * Math.sqrt(gc * R_c * T2);
  result.intake = { T2, p2, T02, A2_over_A1, M2, recovery_mil_e_5007d: milE5007dRecovery(M1) };

  // --- Combustor ---
  const f = cfg.f;
  const T03 = (f * cfg.eta_b * cfg.Q_R + cfg.cp_c * T02) / (cfg.cp_h * (1.0 + f));
  const M3 = solveCombustorExitMach(T03 / T02, M2, gc, cfg.gamma_h);
  const p3 = p2 * (1.0 + gc * M2 ** 2) / (1.0 + gc * M3 ** 2);
  const T3 = T03 / (1.0 + 0.5 * (cfg.gamma_h - 1.0) * M3 ** 2);
  const V3 = M3 * Math.sqrt(cfg.gamma_h * R_h * T3);
  result.combustor = { f, T03, T03_over_T02: T03 / T02, M3, p3, T3 };

  // --- Nozzle, expanded to ambient ---
  const gh = cfg.gamma_h;
  const p4 = p1;
  if (p3 <= p4) {
    throw new Error(
      `solveScramjet: combustor-exit static pressure p3=${p3.toFixed(1)} Pa is not above ` +
      `ambient (${p4.toFixed(1)} Pa) — nothing left for the nozzle to expand.`
    );
  }
  const T4 = T3 - T3 * cfg.eta_N * (1.0 - (p4 / p3) ** ((gh - 1.0) / gh));
  const V4 = Math.sqrt(2.0 * cfg.cp_h * (T03 - T4));
  result.nozzle = { T4, p4, V4, p_exit: p4, T_exit: T4, V_exit: V4 };

  // --- Performance ---
  const sp_thrust = (1.0 + f) * V4 - V1;
  const thrust = cfg.mdot_a * sp_thrust;
  const mdot_f = f * cfg.mdot_a;
  const tsfc = sp_thrust > 0 ? f / sp_thrust : NaN;
  // No net thrust -> the efficiencies and Isp stop meaning anything
  // (eta_P > 1, eta_th < 0), so they're null, like the ramjet.
  let eta_P = null, eta_th = null, eta_o = null, isp = null;
  if (sp_thrust > 0) {
    eta_P = 2.0 * V1 / (V1 + V4);
    eta_th = f > 0 ? (V4 ** 2 - V1 ** 2) / (2.0 * f * cfg.eta_b * cfg.Q_R) : null;
    eta_o = eta_th !== null ? eta_P * eta_th : null;
    isp = mdot_f > 0 ? thrust / (mdot_f * G0) : null;
  }
  result.performance = {
    thrust, specific_thrust: sp_thrust, tsfc, f,
    eta_propulsive: eta_P, eta_thermal: eta_th, eta_overall: eta_o, isp_s: isp,
  };

  result.stations = {
    "1": Station.fromStatic("1", T1, p1, V1, gc, cfg.cp_c, R_c),
    "2": Station.fromStatic("2", T2, p2, V2, gc, cfg.cp_c, R_c),
    "3": Station.fromStatic("3", T3, p3, V3, gh, cfg.cp_h, R_h),
    "4": Station.fromStatic("4", T4, p4, V4, gh, cfg.cp_h, R_h),
  };
  return result;
}
