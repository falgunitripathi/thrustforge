/**
 * Ramjet — no-compressor, no-turbine engine: intake ram compression,
 * combustor, nozzle, thrust.
 *
 * Faithful JS port of aeropropsim/ramjet.py — see that file and
 * reference/ramjet.md for provenance and the judgment calls (expanded
 * nozzle by default, r_d computed from eta_d, efficiencies on the
 * effective exhaust velocity, eta_th on Q_R without eta_b).
 */

import { GAMMA_C, CP_C, GAMMA_H, CP_H, DEFAULTS } from "./constants.js";
import { isaTroposphere, freestreamStagnation } from "./atmosphere.js";
import { intakeExitState } from "./intake.js";
import { fuelAirRatio, combustorExitPressure } from "./combustor.js";
import {
  criticalPressure, isChoked, chokedExitTemperature,
  chokedExitVelocity, unchokedExitVelocity,
} from "./nozzle.js";
import {
  thermalEfficiency, propulsiveEfficiency, overallEfficiencyFromComponents,
} from "./performance.js";
import { Station } from "./gasstate.js";

/** Default ramjet configuration — mirrors RamjetConfig in ramjet.py. */
export function defaultRamjetConfig() {
  return {
    altitude_m: 11000.0,
    mach_flight: 2.5,
    T04: 1800.0,
    nozzle_type: "expanded",
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

export function solveRamjet(cfg) {
  if (cfg.nozzle_type !== "expanded" && cfg.nozzle_type !== "convergent") {
    throw new Error(
      `solveRamjet: nozzle_type must be 'expanded' or 'convergent', got '${cfg.nozzle_type}'.`
    );
  }
  if (!(cfg.mach_flight > 0)) {
    throw new Error(
      "solveRamjet: a ramjet can't run at zero flight speed. It has no " +
      "compressor, so it needs forward speed to compress the air; real " +
      "ramjets are boosted to speed by a rocket or a carrier aircraft."
    );
  }

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

  // --- Intake / diffuser (station 2 = combustor inlet) ---
  const intake = intakeExitState(T_a, p_a, cfg.mach_flight, cfg.eta_d, cfg.gamma_c);
  const { T02, p02 } = intake;
  result.intake = { ...intake, ram_pressure_ratio: p02 / p_a };

  // --- Combustor ---
  if (!(cfg.T04 > T02)) {
    throw new Error(
      `solveRamjet: the combustor exit temperature T04 = ${cfg.T04.toFixed(0)} K must be ` +
      `above the air temperature arriving from the intake (T02 = ${T02.toFixed(0)} K at ` +
      `Mach ${cfg.mach_flight}). Raise T04 or lower the flight Mach number.`
    );
  }
  const f = fuelAirRatio(T02, cfg.T04, cfg.eta_b, cfg.Q_R, cfg.cp_c, cfg.cp_h);
  const p04 = combustorExitPressure(p02, cfg.delta_p_cc_pct);
  if (!(p04 > p_a)) {
    throw new Error(
      `solveRamjet: too slow to run — at Mach ${cfg.mach_flight} the ram pressure ` +
      `rise (p02/p_a = ${(p02 / p_a).toFixed(3)}) doesn't overcome the combustor pressure ` +
      `loss, so the gas can't flow out of the nozzle. Raise the flight Mach number.`
    );
  }
  result.combustor = { f, p04, T04: cfg.T04, r_c: p04 / p02 };

  // --- Nozzle (station 4 = nozzle inlet) ---
  const p_c = criticalPressure(p04, cfg.eta_N, cfg.gamma_h);
  const choked = cfg.nozzle_type === "convergent" && isChoked(p_c, p_a);
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
  const M_exit = V_exit / Math.sqrt(cfg.gamma_h * R_h * T_exit);
  result.nozzle = { choked, p_c, p_exit, T_exit, V_exit, M_exit, rho_exit, A_exit };

  // --- Performance ---
  const momentum = (1.0 + f) * V_exit - V_flight;
  const pressure_term = Ae_over_mdot_a * (p_exit - p_a);
  const sp_thrust = momentum + pressure_term;
  const thrust = cfg.mdot_a * sp_thrust;
  const tsfc_val = sp_thrust > 0 ? f / sp_thrust : NaN;
  const V_eff = (sp_thrust + V_flight) / (1.0 + f);
  let eta_th = null, eta_p = null, eta_0 = null;
  if (sp_thrust > 0) {
    eta_th = thermalEfficiency(f, V_eff, V_flight, cfg.Q_R);
    eta_p = propulsiveEfficiency(V_flight, V_eff);
    eta_0 = overallEfficiencyFromComponents(eta_th, eta_p);
  }
  result.performance = {
    thrust, specific_thrust: sp_thrust, tsfc: tsfc_val,
    momentum_thrust: momentum, pressure_thrust: pressure_term, V_eff,
    eta_thermal: eta_th, eta_propulsive: eta_p, eta_overall: eta_0, f,
  };

  // --- Stations a, 2, 4, 9 (no 3/5: no compressor/turbine) ---
  result.stations = {
    a: new Station("a", T0a, p0a, cfg.gamma_c, cfg.cp_c, R_c, V_flight),
    "2": new Station("2", T02, p02, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "4": new Station("4", cfg.T04, p04, cfg.gamma_h, cfg.cp_h, R_h, 0.0),
    "9": Station.fromStatic("9", T_exit, p_exit, V_exit, cfg.gamma_h, cfg.cp_h, R_h),
  };
  return result;
}
