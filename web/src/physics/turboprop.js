/**
 * Turboprop — same gas-generator core as the turbojet (intake, compressor,
 * combustor), but the turbine's ideal enthalpy drop is split between the
 * shaft (driving a propeller through a reduction gearbox) and the
 * residual exhaust jet.
 *
 * Faithful JS port of aeropropsim/turboprop.py — see that file (and
 * reference/turboprop.md) for full provenance and flagged judgment calls.
 */

import { GAMMA_C, CP_C, GAMMA_H, CP_H, DEFAULTS } from "./constants.js";
import { isaTroposphere, freestreamStagnation } from "./atmosphere.js";
import { intakeExitState } from "./intake.js";
import {
  stackAxialCompressor, centrifugalStagePressureRatio,
  centrifugalTempRiseRatio, overallIsentropicEfficiency,
} from "./compressor.js";
import { fuelAirRatio, combustorExitPressure } from "./combustor.js";
import { turbinePressureRatio } from "./matching.js";
import { stackAxialTurbine, spoutingVelocity, radialTurbineSizeU2 } from "./turbine.js";
import { tsfc as perfTsfc } from "./performance.js";
import { Station } from "./gasstate.js";

/** Default turboprop configuration — mirrors TurbopropConfig in turboprop.py. */
export function defaultTurbopropConfig() {
  return {
    altitude_m: 6000.0,
    mach_flight: 0.5,
    compressor_type: "axial",
    n_compressor_stages: 8,
    pi_c: 10.0,
    centrifugal_U2: 400.0,
    T04: 1400.0,
    turbine_type: "axial",
    n_turbine_stages: 2,
    eta_t: DEFAULTS.eta_tt_stage,
    alpha: 0.85,
    eta_Pr: 0.80,
    eta_g: 0.98,
    eta_mt: DEFAULTS.eta_m,
    eta_mc: DEFAULTS.eta_m,
    bleed_ratio: 0.0,
    eta_N: DEFAULTS.eta_N,
    mdot_a: 1.0,
    eta_d: DEFAULTS.eta_d,
    eta_c_stage: DEFAULTS.eta_c_stage,
    eta_b: DEFAULTS.eta_b,
    delta_p_cc_pct: DEFAULTS.delta_p_cc_pct,
    Q_R: DEFAULTS.Q_R,
    gamma_c: GAMMA_C,
    cp_c: CP_C,
    gamma_h: GAMMA_H,
    cp_h: CP_H,
  };
}

/** Solve one single-design-point single-spool turboprop cycle. */
export function solveTurboprop(cfg) {
  const result = {
    config: cfg, atmosphere: {}, intake: {}, compressor: {}, combustor: {},
    turbine: {}, nozzle: {}, propeller: {}, performance: {}, stations: {},
  };
  const R_c = cfg.cp_c * (cfg.gamma_c - 1.0) / cfg.gamma_c;
  const R_h = cfg.cp_h * (cfg.gamma_h - 1.0) / cfg.gamma_h;

  if (cfg.mach_flight <= 0) {
    throw new Error(
      "solveTurboprop: mach_flight must be > 0 — propeller thrust divides " +
      "by flight speed and is only valid in flight."
    );
  }

  // --- Atmosphere ---
  const [T_a, p_a] = isaTroposphere(cfg.altitude_m);
  const V_flight = cfg.mach_flight * Math.sqrt(cfg.gamma_c * R_c * T_a);
  const [T0a, p0a] = freestreamStagnation(T_a, p_a, cfg.mach_flight, cfg.gamma_c);
  result.atmosphere = { T_a, p_a, V_flight, T0a, p0a };

  // --- Intake (identical to the turbojet) ---
  const intake = intakeExitState(T_a, p_a, cfg.mach_flight, cfg.eta_d, cfg.gamma_c);
  result.intake = intake;
  const { T02, p02 } = intake;

  // --- Compressor (identical to the turbojet) ---
  let T03, p03, pi_actual;
  if (cfg.compressor_type === "axial") {
    const comp = stackAxialCompressor(cfg.pi_c, cfg.n_compressor_stages, T02,
      cfg.eta_c_stage, cfg.eta_c_stage, cfg.gamma_c);
    T03 = comp.T01_out;
    pi_actual = comp.pi_actual;
    p03 = p02 * pi_actual;
    const eta_c_overall = overallIsentropicEfficiency(pi_actual, cfg.eta_c_stage, cfg.gamma_c);
    result.compressor = { ...comp, p03, pi_actual, eta_c_overall_derived: eta_c_overall, type: "axial" };
  } else if (cfg.compressor_type === "centrifugal") {
    let a01 = Math.sqrt(cfg.gamma_c * R_c * T02);
    const stages = [];
    let T01_running = T02, p_rel_running = 1.0;
    for (let i = 0; i < cfg.n_compressor_stages; i++) {
      const pi_stage = centrifugalStagePressureRatio(cfg.eta_c_stage, cfg.centrifugal_U2, a01, cfg.gamma_c);
      const dT_ratio = centrifugalTempRiseRatio(cfg.centrifugal_U2, a01, cfg.gamma_c);
      const dT0 = dT_ratio * T01_running;
      stages.push({
        T01_in: T01_running, T01_out: T01_running + dT0, dT0, pi_stage,
        p01_in_rel: p_rel_running, p01_out_rel: p_rel_running * pi_stage,
      });
      T01_running += dT0;
      p_rel_running *= pi_stage;
      a01 = Math.sqrt(cfg.gamma_c * R_c * T01_running);
    }
    T03 = T01_running;
    pi_actual = p_rel_running;
    p03 = p02 * pi_actual;
    result.compressor = { stages, T01_out: T03, pi_actual, p03, type: "centrifugal" };
  } else {
    throw new Error(`Unknown compressor_type: ${cfg.compressor_type}`);
  }

  // --- Combustor (identical to the turbojet) ---
  const f = fuelAirRatio(T03, cfg.T04, cfg.eta_b, cfg.Q_R, cfg.cp_c, cfg.cp_h);
  const p04 = combustorExitPressure(p03, cfg.delta_p_cc_pct);
  result.combustor = { f, p04, T04: cfg.T04 };
  const massFactor = 1.0 + f - cfg.bleed_ratio;

  // --- Turbine/nozzle power split ---
  const delta_hc = cfg.cp_c * (T03 - T02);
  const pressureTerm = (p_a / p04) ** ((cfg.gamma_h - 1.0) / cfg.gamma_h);
  if (pressureTerm >= 1.0) {
    throw new Error(
      `solveTurboprop: non-physical (pa/p04=${pressureTerm.toFixed(4)} >= 1) — ` +
      `combustor exit pressure p04 must exceed ambient.`
    );
  }
  const delta_h = cfg.cp_h * cfg.T04 * (1.0 - pressureTerm);
  const delta_h_ts = cfg.alpha * delta_h;
  const delta_h_ns = (1.0 - cfg.alpha) * delta_h;

  const delta_ht = cfg.eta_t * delta_h_ts;
  const T05 = cfg.T04 - delta_ht / cfg.cp_h;
  const p05_over_p04 = turbinePressureRatio(T05 / cfg.T04, cfg.eta_t, cfg.gamma_h);
  const p05 = p05_over_p04 * p04;

  // --- Turbine stage-stacking for display ---
  if (cfg.turbine_type === "axial") {
    const turb = stackAxialTurbine(p05_over_p04, cfg.n_turbine_stages, cfg.T04, cfg.eta_t, cfg.gamma_h);
    result.turbine = { ...turb, type: "axial" };
  } else if (cfg.turbine_type === "radial") {
    if (cfg.n_turbine_stages !== 1) {
      throw new Error("Radial turbines are single-stage only in this model.");
    }
    const T03ss_approx = cfg.T04 - (cfg.T04 - T05) / cfg.eta_t;
    const V0 = spoutingVelocity(cfg.cp_h, cfg.T04, T03ss_approx);
    const U2 = radialTurbineSizeU2(V0);
    result.turbine = {
      type: "radial", T01_out: T05, pr_actual: p05_over_p04,
      V0_spouting: V0, U2_sized: U2,
      stages: [{ T01_in: cfg.T04, T01_out: T05, dT0: cfg.T04 - T05, pr_stage: p05_over_p04 }],
    };
  } else {
    throw new Error(`Unknown turbine_type: ${cfg.turbine_type}`);
  }

  // --- Nozzle: always fully expanded to ambient in this model ---
  const ue = Math.sqrt(2.0 * cfg.eta_N * delta_h_ns);
  const T_exit = T05 - ue ** 2 / (2.0 * cfg.cp_h);
  const p_exit = p_a;
  const rho_exit = T_exit > 0 ? p_exit / (R_h * T_exit) : NaN;
  result.nozzle = { choked: false, p_exit, T_exit, V_exit: ue, rho_exit };

  // --- Shaft power and propeller thrust ---
  const Wshaft = cfg.eta_mt * massFactor * delta_ht - delta_hc / cfg.eta_mc;
  if (Wshaft <= 0) {
    throw new Error(
      `solveTurboprop: the compressor needs more power than the turbine can ` +
      `supply (net shaft power would be ${(Wshaft * cfg.mdot_a / 1000).toFixed(1)} kW). ` +
      `Lower the compressor pressure ratio or stage count, or raise the ` +
      `turbine inlet temperature.`
    );
  }
  const shaft_power_W = Wshaft * cfg.mdot_a;
  const Tpr = cfg.mdot_a * cfg.eta_Pr * cfg.eta_g * Wshaft / V_flight;
  const Tn = cfg.mdot_a * (massFactor * ue - V_flight);
  const T_total = Tpr + Tn;
  result.propeller = { Wshaft, shaft_power_W, Tpr, Tn };

  const alpha_opt = 1.0 - (V_flight ** 2 / (2.0 * delta_h)) * (
    cfg.eta_N / (cfg.eta_Pr ** 2 * cfg.eta_g ** 2 * cfg.eta_mt ** 2 * cfg.eta_t ** 2)
  );

  // --- Overall performance ---
  const sp_thrust = T_total / cfg.mdot_a;
  const tsfc_val = perfTsfc(f, sp_thrust);
  const mdot_f = f * cfg.mdot_a;
  const ESHP_W = shaft_power_W + Tn * V_flight / cfg.eta_Pr;
  const ESFC_kg_per_kWh = ESHP_W > 0 ? (mdot_f * 3600.0 * 1000.0) / ESHP_W : NaN;
  const eta_0 = mdot_f > 0 ? (T_total * V_flight / (mdot_f * cfg.Q_R)) : null;
  result.performance = {
    thrust: T_total, specific_thrust: sp_thrust, tsfc: tsfc_val,
    f, eta_overall: eta_0, ESHP_W, ESFC_kg_per_kWh, alpha: cfg.alpha, alpha_opt,
  };

  // --- Key-station table: a, 2, 3, 4, 5, 9 — same six as the turbojet ---
  result.stations = {
    a: new Station("a", T0a, p0a, cfg.gamma_c, cfg.cp_c, R_c, V_flight),
    "2": new Station("2", T02, p02, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "3": new Station("3", T03, p03, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "4": new Station("4", cfg.T04, p04, cfg.gamma_h, cfg.cp_h, R_h, 0.0),
    "5": new Station("5", T05, p05, cfg.gamma_h, cfg.cp_h, R_h, 0.0),
    "9": Station.fromStatic("9", T_exit, p_exit, ue, cfg.gamma_h, cfg.cp_h, R_h),
  };

  return result;
}
