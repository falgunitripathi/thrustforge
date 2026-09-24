/**
 * Turboramjet (turbine-based combined cycle, TJRJ). Faithful JS port of
 * aeropropsim/turboramjet.py — see that file and reference/turboramjet.md
 * for provenance and the judgment calls (+fab in turbojet-mode thrust,
 * fully expanded nozzles, one equation set for both layouts, switch Mach
 * default 3.0, user-set air split in dual mode).
 */

import { GAMMA_C, CP_C, GAMMA_H, CP_H, DEFAULTS } from "./constants.js";
import { isaTroposphere, freestreamStagnation } from "./atmosphere.js";
import { intakeExitState } from "./intake.js";
import { fuelAirRatio, combustorExitPressure } from "./combustor.js";
import { unchokedExitVelocity } from "./nozzle.js";
import { defaultRamjetConfig, solveRamjet } from "./ramjet.js";
import { Station } from "./gasstate.js";

export const TURBORAMJET_MODES = ["auto", "turbojet", "ramjet", "dual"];

/** Default configuration — mirrors TurboramjetConfig in turboramjet.py. */
export function defaultTurboramjetConfig() {
  return {
    altitude_m: 11000.0,
    mach_flight: 2.0,
    mode: "auto",
    mach_switch: 3.0,
    beta: 0.5,
    pi_c: 8.0,
    eta_c: 0.88,
    T04: 1400.0,
    eta_t: 0.90,
    eta_m: DEFAULTS.eta_m,
    afterburner_on: true,
    T06_ab: 2000.0,
    delta_p_ab_pct: 0.05,
    T09: 1800.0,
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

function fail(msg) {
  throw new Error(`solveTurboramjet: ${msg}`);
}

function legEfficiencies(sp, V, Vexit, massFactor, fuel, Q_R) {
  const ke = 0.5 * (Vexit - V) ** 2 * massFactor;
  const useful = sp * V;
  const eta_p = useful + ke > 0 ? useful / (useful + ke) : null;
  const eta_th = fuel > 0 ? (useful + ke) / (Q_R * fuel) : null;
  const eta_o = eta_p !== null && eta_th !== null ? eta_p * eta_th : null;
  return { ke, eta_p, eta_th, eta_o };
}

function solveTurbojetLeg(cfg, T_a, p_a, V, R_c, R_h) {
  const gc = cfg.gamma_c, gh = cfg.gamma_h;
  const intake = intakeExitState(T_a, p_a, cfg.mach_flight, cfg.eta_d, gc);
  const { T02, p02 } = intake;

  const T03 = T02 * (1.0 + (cfg.pi_c ** ((gc - 1.0) / gc) - 1.0) / cfg.eta_c);
  const p03 = p02 * cfg.pi_c;
  if (!(cfg.T04 > T03)) {
    fail(
      `turbojet mode — the compressor already delivers air at T03 = ${T03.toFixed(0)} K, ` +
      `hotter than the turbine inlet temperature T04 = ${cfg.T04.toFixed(0)} K. At high Mach, ` +
      `ram heating plus compression overheats the air: that's why a turboramjet ` +
      `switches to ramjet mode. Lower π_c or the flight Mach, raise T04, or use ` +
      `ramjet mode.`
    );
  }

  const f = fuelAirRatio(T03, cfg.T04, cfg.eta_b, cfg.Q_R, cfg.cp_c, cfg.cp_h);
  const p04 = combustorExitPressure(p03, cfg.delta_p_cc_pct);

  const dT_turb = cfg.cp_c * (T03 - T02) / (cfg.eta_m * (1.0 + f) * cfg.cp_h);
  const T05 = cfg.T04 - dT_turb;
  const T05s = cfg.T04 - dT_turb / cfg.eta_t;
  if (!(T05s > 0)) {
    fail("turbojet mode — the turbine can't supply the compressor's work. Lower π_c or raise T04.");
  }
  const p05 = p04 * (T05s / cfg.T04) ** (gh / (gh - 1.0));

  let fab, T06, p06;
  if (cfg.afterburner_on) {
    if (!(cfg.T06_ab > T05)) {
      fail(
        `turbojet mode — the afterburner exit temperature T06 = ${cfg.T06_ab.toFixed(0)} K ` +
        `must be above the turbine exit temperature T05 = ${T05.toFixed(0)} K. Raise T06 ` +
        `or turn the afterburner off.`
      );
    }
    const denom = cfg.eta_b * cfg.Q_R - cfg.cp_h * cfg.T06_ab;
    if (!(denom > 0)) fail("turbojet mode — afterburner temperature too high for this fuel's heating value.");
    fab = (1.0 + f) * (cfg.cp_h * cfg.T06_ab - cfg.cp_h * T05) / denom;
    T06 = cfg.T06_ab;
    p06 = p05 * (1.0 - cfg.delta_p_ab_pct);
  } else {
    fab = 0.0; T06 = T05; p06 = p05;
  }

  if (!(p06 > p_a)) {
    fail(
      `turbojet mode — the gas reaches the nozzle at ${(p06 / 1000).toFixed(1)} kPa, not above ` +
      `the outside air pressure (${(p_a / 1000).toFixed(1)} kPa), so it can't flow out. Raise π_c ` +
      `or T04, or fly faster.`
    );
  }
  const V7 = unchokedExitVelocity(T06, p_a, p06, cfg.eta_N, gh, cfg.cp_h);
  const T7 = T06 - V7 ** 2 / (2.0 * cfg.cp_h);

  const mass = 1.0 + f + fab;
  const sp = mass * V7 - V;
  const fuel = f + fab;
  const { ke, eta_p, eta_th, eta_o } = legEfficiencies(sp, V, V7, mass, fuel, cfg.Q_R);
  const leg = {
    T02, p02, r_d: intake.r_d,
    T03, p03, T04: cfg.T04, p04,
    T05, p05, T06, p06,
    T7, V7, p7: p_a,
    f, fab, fuel_air: fuel,
    specific_thrust: sp, ke,
    tsfc: sp > 0 ? fuel / sp : NaN,
    eta_propulsive: eta_p, eta_thermal: eta_th, eta_overall: eta_o,
    compressor_work: cfg.cp_c * (T03 - T02),
  };
  const stations = {
    "2": new Station("2", T02, p02, gc, cfg.cp_c, R_c, 0.0),
    "3": new Station("3", T03, p03, gc, cfg.cp_c, R_c, 0.0),
    "4": new Station("4", cfg.T04, p04, gh, cfg.cp_h, R_h, 0.0),
    "5": new Station("5", T05, p05, gh, cfg.cp_h, R_h, 0.0),
    "6": new Station("6", T06, p06, gh, cfg.cp_h, R_h, 0.0),
    "7": Station.fromStatic("7", T7, p_a, V7, gh, cfg.cp_h, R_h),
  };
  return { leg, stations };
}

function solveRamjetLeg(cfg, V, R_c, R_h) {
  let r;
  try {
    r = solveRamjet({
      ...defaultRamjetConfig(),
      altitude_m: cfg.altitude_m, mach_flight: cfg.mach_flight, T04: cfg.T09,
      nozzle_type: "expanded", mdot_a: 1.0, eta_d: cfg.eta_d, eta_b: cfg.eta_b,
      delta_p_cc_pct: cfg.delta_p_cc_pct, Q_R: cfg.Q_R, eta_N: cfg.eta_N,
      gamma_c: cfg.gamma_c, cp_c: cfg.cp_c, gamma_h: cfg.gamma_h, cp_h: cfg.cp_h,
    });
  } catch (err) {
    const msg = err.message.replace("solveRamjet: ", "").replace("T04", "T09");
    fail(`ramjet mode — ${msg}`);
  }
  const fR = r.combustor.f;
  const V10 = r.nozzle.V_exit;
  const mass = 1.0 + fR;
  const sp = mass * V10 - V;
  const { ke, eta_p, eta_th, eta_o } = legEfficiencies(sp, V, V10, mass, fR, cfg.Q_R);
  const leg = {
    T08: r.intake.T02, p08: r.intake.p02, r_d: r.intake.r_d,
    ram_pressure_ratio: r.intake.ram_pressure_ratio,
    T09: cfg.T09, p09: r.combustor.p04,
    T10: r.nozzle.T_exit, V10, p10: r.nozzle.p_exit,
    M10: r.nozzle.M_exit,
    f: fR, fuel_air: fR,
    specific_thrust: sp, ke,
    tsfc: sp > 0 ? fR / sp : NaN,
    eta_propulsive: eta_p, eta_thermal: eta_th, eta_overall: eta_o,
  };
  const s2 = r.stations["2"], s4 = r.stations["4"], s9 = r.stations["9"];
  const stations = {
    "8": new Station("8", s2.T0, s2.p0, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "9": new Station("9", s4.T0, s4.p0, cfg.gamma_h, cfg.cp_h, R_h, 0.0),
    "10": Station.fromStatic("10", s9.T, s9.p, s9.V, cfg.gamma_h, cfg.cp_h, R_h),
  };
  return { leg, stations };
}

export function solveTurboramjet(cfg) {
  if (!TURBORAMJET_MODES.includes(cfg.mode)) {
    fail(`mode must be one of ${TURBORAMJET_MODES.join(", ")}, got '${cfg.mode}'.`);
  }
  if (cfg.mode === "dual" && !(cfg.beta > 0 && cfg.beta < 1)) {
    fail("the air split β (fraction through the turbojet) must be between 0 and 1 in dual mode.");
  }
  if (!(cfg.mach_flight >= 0)) fail("flight Mach number can't be negative.");

  const active = cfg.mode === "auto"
    ? (cfg.mach_flight < cfg.mach_switch ? "turbojet" : "ramjet")
    : cfg.mode;
  const beta = { turbojet: 1.0, ramjet: 0.0, dual: cfg.beta }[active];

  const result = {
    config: cfg, mode_active: active, atmosphere: {}, turbojet: null, ramjet: null,
    performance: {}, stations: {},
  };
  const R_c = cfg.cp_c * (cfg.gamma_c - 1.0) / cfg.gamma_c;
  const R_h = cfg.cp_h * (cfg.gamma_h - 1.0) / cfg.gamma_h;

  const [T_a, p_a] = isaTroposphere(cfg.altitude_m);
  const V = cfg.mach_flight * Math.sqrt(cfg.gamma_c * R_c * T_a);
  const [T0a, p0a] = freestreamStagnation(T_a, p_a, cfg.mach_flight, cfg.gamma_c);
  result.atmosphere = { T_a, p_a, V_flight: V, T0a, p0a };
  result.stations = { a: new Station("a", T0a, p0a, cfg.gamma_c, cfg.cp_c, R_c, V) };

  if (beta > 0) {
    const { leg, stations } = solveTurbojetLeg(cfg, T_a, p_a, V, R_c, R_h);
    result.turbojet = leg;
    Object.assign(result.stations, stations);
  }
  if (beta < 1) {
    const { leg, stations } = solveRamjetLeg(cfg, V, R_c, R_h);
    result.ramjet = leg;
    Object.assign(result.stations, stations);
  }

  const tj = result.turbojet, rj = result.ramjet;
  const sp = (tj ? beta * tj.specific_thrust : 0.0) + (rj ? (1 - beta) * rj.specific_thrust : 0.0);
  const fuel = (tj ? beta * tj.fuel_air : 0.0) + (rj ? (1 - beta) * rj.fuel_air : 0.0);
  const ke = (tj ? beta * tj.ke : 0.0) + (rj ? (1 - beta) * rj.ke : 0.0);
  const useful = sp * V;
  const eta_p = useful + ke > 0 ? useful / (useful + ke) : null;
  const eta_th = fuel > 0 ? (useful + ke) / (cfg.Q_R * fuel) : null;
  const eta_o = eta_p !== null && eta_th !== null ? eta_p * eta_th : null;
  result.performance = {
    thrust: cfg.mdot_a * sp, specific_thrust: sp,
    tsfc: sp > 0 ? fuel / sp : NaN,
    f: fuel, mdot_f: cfg.mdot_a * fuel,
    mdot_a_turbojet: cfg.mdot_a * beta, mdot_a_ramjet: cfg.mdot_a * (1 - beta),
    beta,
    thrust_turbojet: tj ? cfg.mdot_a * beta * tj.specific_thrust : 0.0,
    thrust_ramjet: rj ? cfg.mdot_a * (1 - beta) * rj.specific_thrust : 0.0,
    eta_propulsive: eta_p, eta_thermal: eta_th, eta_overall: eta_o,
  };
  return result;
}
