/**
 * Ramjet — no-compressor, no-turbine engine: intake ram compression,
 * combustor, nozzle, thrust.
 *
 * Faithful JS port of aeropropsim/ramjet.py — see that file (and
 * reference/ramjet.md) for full provenance, formula derivations, and
 * flagged judgment calls. Reuses intakeExitState, fuelAirRatio/
 * combustorExitPressure, and every nozzle.js function exactly as the
 * turbojet does — a ramjet is a turbojet with the compressor and turbine
 * removed, so T02/p02 stand in directly for T03/p03 (no compression
 * between them) and T04/p04 stand in directly for T05/p05 (no turbine
 * work extracted).
 */

import { GAMMA_C, CP_C, GAMMA_H, CP_H, DEFAULTS } from "./constants.js";
import { isaTroposphere, freestreamStagnation } from "./atmosphere.js";
import { intakeExitState } from "./intake.js";
import { fuelAirRatio, combustorExitPressure } from "./combustor.js";
import {
  criticalPressure, isChoked, chokedExitTemperature,
  chokedExitVelocity, unchokedExitVelocity, thrust as nozzleThrust,
} from "./nozzle.js";
import {
  specificThrust as perfSpecificThrust, tsfc as perfTsfc,
  thermalEfficiency, propulsiveEfficiency, overallEfficiencyFromComponents,
} from "./performance.js";
import { Station } from "./gasstate.js";

/** Default ramjet configuration — mirrors RamjetConfig in ramjet.py. */
export function defaultRamjetConfig() {
  return {
    altitude_m: 11000.0,
    mach_flight: 2.5,
    T04: 1800.0,
    mdot_a: 1.0,
    eta_d: DEFAULTS.eta_d,
    eta_b: DEFAULTS.eta_b,
    delta_p_cc_pct: DEFAULTS.delta_p_cc_pct,
    Q_R: DEFAULTS.Q_R,
    eta_N: DEFAULTS.eta_N,
    gamma_c: GAMMA_C,
    cp_c: CP_C,
    gamma_h: GAMMA_H,
    cp_h: CP_H,
  };
}

/**
 * Solve one single-design-point ramjet cycle.
 *
 * Solve order (mirrors solveEngine minus the compressor/turbine/shaft
 * steps, which don't exist in a ramjet): atmosphere -> intake ->
 * combustor -> nozzle -> performance.
 */
export function solveRamjet(cfg) {
  const result = {
    config: cfg, atmosphere: {}, intake: {}, combustor: {}, nozzle: {},
    performance: {}, stations: {},
  };
  const R_c = cfg.cp_c * (cfg.gamma_c - 1.0) / cfg.gamma_c;
  const R_h = cfg.cp_h * (cfg.gamma_h - 1.0) / cfg.gamma_h;

  // --- Atmosphere ---
  const [T_a, p_a] = isaTroposphere(cfg.altitude_m);
  const V_flight = cfg.mach_flight * Math.sqrt(cfg.gamma_c * R_c * T_a);
  const [T0a, p0a] = freestreamStagnation(T_a, p_a, cfg.mach_flight, cfg.gamma_c);
  result.atmosphere = { T_a, p_a, V_flight, T0a, p0a };

  // --- Intake / diffuser (station 2, no compressor after it) ---
  const intake = intakeExitState(T_a, p_a, cfg.mach_flight, cfg.eta_d, cfg.gamma_c);
  result.intake = intake;
  const { T02, p02 } = intake;

  // --- Combustor (reuses the turbojet's own fuel-air-ratio formula — see
  // this module's docstring for why T02/p02 stand in for T03/p03) ---
  const f = fuelAirRatio(T02, cfg.T04, cfg.eta_b, cfg.Q_R, cfg.cp_c, cfg.cp_h);
  const p04 = combustorExitPressure(p02, cfg.delta_p_cc_pct);
  result.combustor = { f, p04, T04: cfg.T04 };

  // --- Nozzle (no turbine before it: T04/p04 stand in as the
  // nozzle-inlet state) ---
  const p_c = criticalPressure(p04, cfg.eta_N, cfg.gamma_h);
  const choked = isChoked(p_c, p_a);
  let T_exit, V_exit, p_exit;
  if (choked) {
    T_exit = chokedExitTemperature(cfg.T04, cfg.gamma_h);
    V_exit = chokedExitVelocity(T_exit, cfg.gamma_h, R_h);
    p_exit = p_c;
  } else {
    V_exit = unchokedExitVelocity(cfg.T04, p_a, p04, cfg.eta_N, cfg.gamma_h, cfg.cp_h);
    p_exit = p_a;
    T_exit = cfg.T04 - V_exit ** 2 / (2.0 * cfg.cp_h);
  }

  const rho_exit = p_exit / (R_h * T_exit);
  const Ae_over_mdot_a = (1.0 + f) / (rho_exit * V_exit);
  const A_exit = Ae_over_mdot_a * cfg.mdot_a;

  const T_val = nozzleThrust(cfg.mdot_a, f, V_exit, V_flight, p_exit, p_a, A_exit);
  result.nozzle = { choked, p_c, p_exit, T_exit, V_exit, rho_exit, A_exit };

  // --- Overall performance ---
  const sp_thrust = perfSpecificThrust(f, V_exit, V_flight, A_exit, cfg.mdot_a, p_exit, p_a);
  const tsfc_val = perfTsfc(f, sp_thrust);
  const eta_th = (V_flight > 0 || f > 0) ? thermalEfficiency(f, V_exit, V_flight, cfg.Q_R) : null;
  const eta_p = V_flight > 0 ? propulsiveEfficiency(V_flight, V_exit) : 0.0;
  const eta_0 = eta_th !== null ? overallEfficiencyFromComponents(eta_th, eta_p) : null;
  result.performance = {
    thrust: T_val, specific_thrust: sp_thrust, tsfc: tsfc_val,
    eta_thermal: eta_th, eta_propulsive: eta_p, eta_overall: eta_0, f,
  };

  // --- Key-station table: a, 2, 4, 9 only — no 3/5 (nothing sits there
  // in a ramjet, unlike the turbojet).
  result.stations = {
    a: new Station("a", T0a, p0a, cfg.gamma_c, cfg.cp_c, R_c, V_flight),
    "2": new Station("2", T02, p02, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "4": new Station("4", cfg.T04, p04, cfg.gamma_h, cfg.cp_h, R_h, 0.0),
    "9": Station.fromStatic("9", T_exit, p_exit, V_exit, cfg.gamma_h, cfg.cp_h, R_h),
  };

  return result;
}
