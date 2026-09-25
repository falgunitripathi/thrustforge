/**
 * Two-spool (twin-spool) turbojet. Faithful JS port of
 * aeropropsim/twin_spool_turbojet.py — see that file for the source
 * relations (NPTEL double-spool turbojet, p.297-303) and station numbering
 * a, 2-7, 8 (afterburner exit, only when lit), 9.
 */

import { GAMMA_C, CP_C, GAMMA_H, CP_H, DEFAULTS } from "./constants.js";
import { isaTroposphere, freestreamStagnation } from "./atmosphere.js";
import { intakeExitState } from "./intake.js";
import { fuelAirRatio, combustorExitPressure } from "./combustor.js";
import { turbinePressureRatio } from "./matching.js";
import {
  criticalPressure, isChoked, chokedExitTemperature, chokedExitVelocity, unchokedExitVelocity,
} from "./nozzle.js";
import { Station } from "./gasstate.js";

export function defaultTwinSpoolTurbojetConfig() {
  return {
    altitude_m: 10000.0,
    mach_flight: 0.8,
    pi_LPC: 4.0,
    eta_LPC: 0.88,
    pi_HPC: 3.75,
    eta_HPC: 0.88,
    T05: 1400.0,
    eta_b: DEFAULTS.eta_b,
    delta_p_cc_pct: DEFAULTS.delta_p_cc_pct,
    Q_R: DEFAULTS.Q_R,
    eta_HPT: DEFAULTS.eta_tt_stage,
    eta_LPT: DEFAULTS.eta_tt_stage,
    eta_m1: 0.99,
    eta_m2: 0.99,
    lambda1: DEFAULTS.lambda_shaft,
    lambda2: DEFAULTS.lambda_shaft,
    afterburner_on: false,
    T08_ab: 2000.0,
    delta_p_ab_pct: 0.05,
    eta_N: DEFAULTS.eta_N,
    mdot_a: 1.0,
    eta_d: DEFAULTS.eta_d,
    gamma_c: GAMMA_C,
    cp_c: CP_C,
    gamma_h: GAMMA_H,
    cp_h: CP_H,
  };
}

function compress(T_in, p_in, pi, eta, gamma) {
  return [T_in * (1.0 + (pi ** ((gamma - 1.0) / gamma) - 1.0) / eta), p_in * pi];
}

function fail(msg) {
  throw new Error(`solveTwinSpoolTurbojet: ${msg}`);
}

export function solveTwinSpoolTurbojet(cfg) {
  const result = {
    config: cfg, atmosphere: {}, intake: {}, lpc: {}, hpc: {}, combustor: {}, hpt: {}, lpt: {},
    afterburner: {}, nozzle: {}, performance: {}, stations: {},
  };
  const gc = cfg.gamma_c, gh = cfg.gamma_h;
  const R_c = cfg.cp_c * (gc - 1.0) / gc;
  const R_h = cfg.cp_h * (gh - 1.0) / gh;

  const [T_a, p_a] = isaTroposphere(cfg.altitude_m);
  const V = cfg.mach_flight * Math.sqrt(gc * R_c * T_a);
  const [T0a, p0a] = freestreamStagnation(T_a, p_a, cfg.mach_flight, gc);
  result.atmosphere = { T_a, p_a, V_flight: V, T0a, p0a };

  const intake = intakeExitState(T_a, p_a, cfg.mach_flight, cfg.eta_d, gc);
  result.intake = intake;
  const { T02, p02 } = intake;

  const [T03, p03] = compress(T02, p02, cfg.pi_LPC, cfg.eta_LPC, gc);
  result.lpc = { T03, p03 };
  const [T04, p04] = compress(T03, p03, cfg.pi_HPC, cfg.eta_HPC, gc);
  result.hpc = { T04, p04 };

  if (!(cfg.T05 > T04)) {
    fail(
      `the compressors already deliver air at T04 = ${T04.toFixed(0)} K, hotter than the turbine ` +
      `inlet temperature T05 = ${cfg.T05.toFixed(0)} K. Lower the pressure ratios or the flight ` +
      `Mach number, or raise T05.`
    );
  }
  const f = fuelAirRatio(T04, cfg.T05, cfg.eta_b, cfg.Q_R, cfg.cp_c, cfg.cp_h);
  const p05 = combustorExitPressure(p04, cfg.delta_p_cc_pct);
  result.combustor = { f, T05: cfg.T05, p05 };

  const r_hpt = 1.0 - cfg.cp_c * (T04 - T03) / (cfg.lambda1 * (1.0 + f) * cfg.eta_m1 * cfg.cp_h * cfg.T05);
  const T06 = r_hpt * cfg.T05;
  const p06 = turbinePressureRatio(r_hpt, cfg.eta_HPT, gh) * p05;
  result.hpt = { T06, p06, work: cfg.cp_c * (T04 - T03) };

  const r_lpt = 1.0 - cfg.cp_c * (T03 - T02) / (cfg.lambda2 * (1.0 + f) * cfg.eta_m2 * cfg.cp_h * T06);
  const T07 = r_lpt * T06;
  const p07 = turbinePressureRatio(r_lpt, cfg.eta_LPT, gh) * p06;
  result.lpt = { T07, p07, work: cfg.cp_c * (T03 - T02) };

  let fab, T08, p08;
  if (cfg.afterburner_on) {
    if (!(cfg.T08_ab > T07)) {
      fail(
        `the afterburner exit temperature T08 = ${cfg.T08_ab.toFixed(0)} K must be above the ` +
        `low-pressure turbine exit temperature T07 = ${T07.toFixed(0)} K — an afterburner can ` +
        `only add heat. Raise T08 or turn the afterburner off.`
      );
    }
    const denom = cfg.eta_b * cfg.Q_R - cfg.cp_h * cfg.T08_ab;
    if (!(denom > 0)) {
      fail("the afterburner exit temperature is too high for this fuel — even burning it " +
        "perfectly can't heat the gas that much. Lower T08.");
    }
    fab = (1.0 + f) * (cfg.cp_h * cfg.T08_ab - cfg.cp_h * T07) / denom;
    T08 = cfg.T08_ab;
    p08 = p07 * (1.0 - cfg.delta_p_ab_pct);
  } else {
    fab = 0.0; T08 = T07; p08 = p07;
  }
  result.afterburner = { on: !!cfg.afterburner_on, fab, T07, p07, T08, p08 };

  const p_c = criticalPressure(p08, cfg.eta_N, gh);
  const choked = isChoked(p_c, p_a);
  let T9, V9, p9;
  if (choked) {
    T9 = chokedExitTemperature(T08, gh);
    V9 = chokedExitVelocity(T9, gh, R_h);
    p9 = p_c;
  } else {
    V9 = unchokedExitVelocity(T08, p_a, p08, cfg.eta_N, gh, cfg.cp_h);
    p9 = p_a;
    T9 = T08 - V9 ** 2 / (2.0 * cfg.cp_h);
  }
  const mass = 1.0 + f + fab;
  const rho9 = p9 / (R_h * T9);
  const A9_over_m = mass / (rho9 * V9);
  result.nozzle = { choked, p_c, p_exit: p9, T_exit: T9, V_exit: V9, rho_exit: rho9, A_exit: A9_over_m * cfg.mdot_a };

  const sp = (mass * V9 - V) + A9_over_m * (p9 - p_a);
  const fuel = f + fab;
  const tsfc = sp > 0 ? fuel / sp : NaN;
  const ke = 0.5 * mass * (V9 - V) ** 2;
  const useful = sp * V;
  const eta_p = sp > 0 ? useful / (useful + ke) : null;
  const eta_th = sp > 0 ? (useful + ke) / (fuel * cfg.Q_R) : null;
  const eta_o = sp > 0 ? eta_p * eta_th : null;
  result.performance = {
    thrust: sp * cfg.mdot_a, specific_thrust: sp, tsfc,
    f, f_ab: fab, f_total: fuel,
    eta_propulsive: eta_p, eta_thermal: eta_th, eta_overall: eta_o,
  };

  const st = {
    a: new Station("a", T0a, p0a, gc, cfg.cp_c, R_c, V),
    "2": new Station("2", T02, p02, gc, cfg.cp_c, R_c, 0.0),
    "3": new Station("3", T03, p03, gc, cfg.cp_c, R_c, 0.0),
    "4": new Station("4", T04, p04, gc, cfg.cp_c, R_c, 0.0),
    "5": new Station("5", cfg.T05, p05, gh, cfg.cp_h, R_h, 0.0),
    "6": new Station("6", T06, p06, gh, cfg.cp_h, R_h, 0.0),
    "7": new Station("7", T07, p07, gh, cfg.cp_h, R_h, 0.0),
  };
  if (cfg.afterburner_on) st["8"] = new Station("8", T08, p08, gh, cfg.cp_h, R_h, 0.0);
  st["9"] = Station.fromStatic("9", T9, p9, V9, gh, cfg.cp_h, R_h);
  result.stations = st;
  return result;
}
