/**
 * Propfan (three-spool, unducted fan) — a gas generator (IPC/HPC/
 * combustor/HPT/IPT) drives a free (power) turbine, which drives an
 * UNDUCTED fan (open rotor) through a reduction gearbox, instead of a
 * turbojet's own nozzle or a turboprop's ducted propeller.
 *
 * Faithful JS port of aeropropsim/propfan.py — see that file (and
 * reference/propfan.md) for full provenance and flagged judgment
 * calls, including the uniform (1+f-b) convention, the propulsive-
 * efficiency formula's `T`/`u_inf` reading, and alpha's fixed-design-
 * input status.
 */

import { GAMMA_C, CP_C, GAMMA_H, CP_H, DEFAULTS } from "./constants.js";
import { isaTroposphere, freestreamStagnation } from "./atmosphere.js";
import { intakeExitState } from "./intake.js";
import { fuelAirRatio, combustorExitPressure } from "./combustor.js";
import { turbinePressureRatio } from "./matching.js";
import { tsfc as perfTsfc } from "./performance.js";
import { Station } from "./gasstate.js";

/** Default propfan configuration — mirrors PropfanConfig in propfan.py. */
export function defaultPropfanConfig() {
  return {
    altitude_m: 9000.0,
    mach_flight: 0.7,
    pi_IPC: 2.0,
    eta_IPC: 0.90,
    pi_HPC: 6.0,
    eta_HPC: 0.90,
    T05: 1500.0,
    eta_b: DEFAULTS.eta_b,
    delta_p_cc_pct: DEFAULTS.delta_p_cc_pct,
    Q_R: DEFAULTS.Q_R,
    eta_HPT: DEFAULTS.eta_tt_stage,
    eta_IPT: DEFAULTS.eta_tt_stage,
    eta_ft: DEFAULTS.eta_tt_stage,
    alpha: 0.85,
    pi_UDF: 1.20,
    eta_UDF: 0.88,
    eta_m_UDF: DEFAULTS.eta_m,
    eta_n: DEFAULTS.eta_N,
    mdot_a: 1.0,
    bleed_ratio: 0.0,
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

/** Solve one single-design-point three-spool propfan cycle. */
export function solvePropfan(cfg) {
  const result = {
    config: cfg, atmosphere: {}, intake: {}, ipc: {}, hpc: {},
    combustor: {}, hpt: {}, ipt: {}, fan: {}, free_turbine: {},
    hot_nozzle: {}, performance: {}, stations: {},
  };
  const R_c = cfg.cp_c * (cfg.gamma_c - 1.0) / cfg.gamma_c;
  const R_h = cfg.cp_h * (cfg.gamma_h - 1.0) / cfg.gamma_h;

  // --- Atmosphere ---
  const [T_a, p_a] = isaTroposphere(cfg.altitude_m);
  const V_flight = cfg.mach_flight * Math.sqrt(cfg.gamma_c * R_c * T_a);
  const [T0a, p0a] = freestreamStagnation(T_a, p_a, cfg.mach_flight, cfg.gamma_c);
  result.atmosphere = { T_a, p_a, V_flight, T0a, p0a };

  // --- Intake (core stream only — identical to the turbojet) ---
  const intake = intakeExitState(T_a, p_a, cfg.mach_flight, cfg.eta_d, cfg.gamma_c);
  result.intake = intake;
  const { T02, p02 } = intake;

  // --- IPC ---
  const [T03, p03] = compressorStep(T02, p02, cfg.pi_IPC, cfg.eta_IPC, cfg.gamma_c);
  result.ipc = { T03, p03, pi_IPC: cfg.pi_IPC };

  // --- HPC ---
  const [T04, p04] = compressorStep(T03, p03, cfg.pi_HPC, cfg.eta_HPC, cfg.gamma_c);
  result.hpc = { T04, p04, pi_HPC: cfg.pi_HPC };

  // --- Combustor: f = (1-b)*(Cph*T05 - Cpc*T04) / (eta_b*Q_R - Cph*T05),
  // algebraically the same energy balance as fuelAirRatio, with an
  // extra (1-b) bleed prefactor — see propfan.py module docstring. ---
  const f = (1.0 - cfg.bleed_ratio) * fuelAirRatio(T04, cfg.T05, cfg.eta_b, cfg.Q_R, cfg.cp_c, cfg.cp_h);
  const p05 = combustorExitPressure(p04, cfg.delta_p_cc_pct);
  result.combustor = { f, p05, T05: cfg.T05 };
  const massFactor = 1.0 + f - cfg.bleed_ratio; // Ref: module docstring judgment call #1

  // --- HPT: bare energy balance against the HPC, no lambda/eta_m
  // ("shaft/mechanical efficiency is taken as 100% here"). ---
  const T06 = cfg.T05 - cfg.cp_c / (massFactor * cfg.cp_h) * (T04 - T03);
  const p06_over_p05 = turbinePressureRatio(T06 / cfg.T05, cfg.eta_HPT, cfg.gamma_h);
  const p06 = p06_over_p05 * p05;
  result.hpt = { T06, p06, p06_over_p05 };

  // --- IPT: bare energy balance against the IPC. ---
  const T07 = T06 - cfg.cp_c / (massFactor * cfg.cp_h) * (T03 - T02);
  const p07_over_p06 = turbinePressureRatio(T07 / T06, cfg.eta_IPT, cfg.gamma_h);
  const p07 = p07_over_p06 * p06;
  result.ipt = { T07, p07, p07_over_p06 };

  // --- Unducted fan (UDF): sized directly off the freestream stagnation
  // state (T010=T0a, p010=p0a) — NOT the core's own p02, since the fan
  // is unducted (no intake diffuser/eta_d loss ahead of it). ---
  const T010 = T0a, p010 = p0a;
  const [T011, p011] = compressorStep(T010, p010, cfg.pi_UDF, cfg.eta_UDF, cfg.gamma_c);
  const pressureTermFan = (p_a / p011) ** ((cfg.gamma_c - 1.0) / cfg.gamma_c);
  if (pressureTermFan >= 1.0) {
    throw new Error(
      `solvePropfan: non-physical (pa/p011=${pressureTermFan.toFixed(4)} >= 1) ` +
      `— the fan's own exit pressure must exceed ambient for it to produce ` +
      `thrust; check pi_UDF.`
    );
  }
  const T12 = T011 * pressureTermFan;
  const ue_UDF = Math.sqrt(2.0 * cfg.cp_c * (T011 - T12));
  result.fan = { T010, p010, T011, p011, T12, ue_UDF };

  // --- Free (power) turbine: alpha-splits the ideal drop to ambient
  // (from station 7) between shaft/fan power and the residual
  // hot-nozzle jet, same alpha-split pattern as the turboprop. ---
  const pressureTermFt = (p_a / p07) ** ((cfg.gamma_h - 1.0) / cfg.gamma_h);
  if (pressureTermFt >= 1.0) {
    throw new Error(
      `solvePropfan: non-physical (pa/p07=${pressureTermFt.toFixed(4)} >= 1) ` +
      `— combustor/turbine pressure must exceed ambient for the free turbine ` +
      `to expand at all; check pi_IPC/pi_HPC/delta_p_cc_pct.`
    );
  }
  const T9s = T07 * pressureTermFt;
  const T08s = T07 - cfg.alpha * (T07 - T9s);
  const T08 = T07 - cfg.eta_ft * cfg.alpha * (T07 - T9s);
  const p07_over_p08 = (T07 / T08s) ** (cfg.gamma_h / (cfg.gamma_h - 1.0));
  const p08 = p07 / p07_over_p08;
  result.free_turbine = { T08, p08, T9s, T08s };

  // --- Hot nozzle: exit velocity reuses the SAME T9s computed above
  // (the source's own simplification), always fully expanded to
  // ambient (no choking check). ---
  const ue_n = Math.sqrt(2.0 * cfg.cp_h * cfg.eta_n * (T08 - T9s));
  const T9 = T08 - ue_n ** 2 / (2.0 * cfg.cp_h);
  const p9 = p_a;
  const rho9 = T9 > 0 ? p9 / (R_h * T9) : NaN;
  const Tn = cfg.mdot_a * (massFactor * ue_n - V_flight);
  result.hot_nozzle = { choked: false, p_exit: p9, T_exit: T9, V_exit: ue_n, rho_exit: rho9, Tn };

  // --- Fan power balance: solve beta from the free turbine's output
  // split between the gas generator and the fan. ---
  const beta = (cfg.eta_m_UDF * massFactor * cfg.cp_h * (T07 - T08)) / (cfg.cp_c * (T011 - T010));
  const T_UDF = beta * cfg.mdot_a * (ue_UDF - V_flight);
  const P_UDF_W = V_flight * T_UDF;
  Object.assign(result.fan, { beta, T_UDF, P_UDF_W });

  // --- Combined thrust and propulsive efficiency (see module docstring
  // judgment call #2 for the `T`/`u_inf` reading used here). ---
  const T_total = T_UDF + Tn;
  const denom = T_total * V_flight
    + 0.5 * cfg.mdot_a * (ue_n - V_flight) ** 2
    + 0.5 * cfg.mdot_a * beta * (ue_UDF - V_flight) ** 2;
  const eta_P = denom > 0 ? (T_total * V_flight) / denom : null;

  const sp_thrust = T_total / cfg.mdot_a;
  const tsfc_val = perfTsfc(f, sp_thrust);
  const mdot_f = f * cfg.mdot_a;
  const eta_0 = (mdot_f > 0 && V_flight > 0) ? (T_total * V_flight / (mdot_f * cfg.Q_R)) : null;
  result.performance = {
    thrust: T_total, thrust_fan: T_UDF, thrust_nozzle: Tn,
    specific_thrust: sp_thrust, tsfc: tsfc_val, f,
    eta_propulsive: eta_P, eta_overall: eta_0,
    beta, alpha: cfg.alpha, P_UDF_W,
  };

  // --- Key-station table: a, 2, 3, 4, 5, 6, 7, 8, 9 (gas-generator/
  // free-turbine/hot-nozzle path) plus 10, 11, 12 (unducted fan path). ---
  result.stations = {
    a: new Station("a", T0a, p0a, cfg.gamma_c, cfg.cp_c, R_c, V_flight),
    "2": new Station("2", T02, p02, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "3": new Station("3", T03, p03, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "4": new Station("4", T04, p04, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "5": new Station("5", cfg.T05, p05, cfg.gamma_h, cfg.cp_h, R_h, 0.0),
    "6": new Station("6", T06, p06, cfg.gamma_h, cfg.cp_h, R_h, 0.0),
    "7": new Station("7", T07, p07, cfg.gamma_h, cfg.cp_h, R_h, 0.0),
    "8": new Station("8", T08, p08, cfg.gamma_h, cfg.cp_h, R_h, 0.0),
    "9": Station.fromStatic("9", T9, p9, ue_n, cfg.gamma_h, cfg.cp_h, R_h),
    "10": new Station("10", T010, p010, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "11": new Station("11", T011, p011, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "12": Station.fromStatic("12", T12, p_a, ue_UDF, cfg.gamma_c, cfg.cp_c, R_c),
  };

  return result;
}
