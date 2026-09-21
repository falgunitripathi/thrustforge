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
  const result = {
    config: cfg, atmosphere: {}, intake: {}, fan: {}, lpc: {}, hpc: {},
    combustor: {}, hpt: {}, lpt: {}, hot_nozzle: {}, cold_nozzle: {},
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

  // --- LPT: drives fan+LPC together, extra bypass-ratio term ---
  const compressorWorkSpecific =
    (1.0 + cfg.beta) * cfg.cp_c * (T010 - T02) + cfg.cp_c * (T03 - T010);
  const turbineCapacity = cfg.lambda2 * cfg.eta_m2 * (1.0 + f) * cfg.cp_h * T06;
  const T07_over_T06 = 1.0 - compressorWorkSpecific / turbineCapacity;
  const T07 = T07_over_T06 * T06;
  const p07_over_p06 = turbinePressureRatio(T07_over_T06, cfg.eta_LPT, cfg.gamma_h);
  const p07 = p07_over_p06 * p06;
  result.lpt = { T07, p07, T07_over_T06 };

  // --- Jet pipe loss ---
  const T08 = T07;
  const p08 = p07 * (1.0 - cfg.delta_p_jetpipe);

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
  const A9 = (1.0 + f) * cfg.mdot_a / (rho9 * V9);
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
  const T_hot = nozzleThrust(cfg.mdot_a, f, V9, V_flight, p9, p_a, A9);
  const T_cold = nozzleThrust(mdotCold, 0.0, V11, V_flight, p11, p_a, A11);
  const T_total = T_hot + T_cold;
  const sp_thrust = T_total / cfg.mdot_a;
  const tsfc_val = perfTsfc(f, sp_thrust);
  const mdot_f = f * cfg.mdot_a;
  const eta_0 = (mdot_f > 0 && V_flight > 0) ? (T_total * V_flight / (mdot_f * cfg.Q_R)) : null;
  result.performance = {
    thrust: T_total, thrust_hot: T_hot, thrust_cold: T_cold,
    specific_thrust: sp_thrust, tsfc: tsfc_val, f, eta_overall: eta_0, beta: cfg.beta,
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
    "9": Station.fromStatic("9", T9, p9, V9, cfg.gamma_h, cfg.cp_h, R_h),
    "11": Station.fromStatic("11", T11, p11, V11, cfg.gamma_c, cfg.cp_c, R_c),
  };

  return result;
}
