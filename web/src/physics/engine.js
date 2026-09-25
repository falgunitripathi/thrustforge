/**
 * Engine orchestrator — wires every component module together in the
 * recommended single-design-point solve order.
 *
 * Ref: §11 (Implementation Notes for AeroPropSim), "Recommended
 * single-design-point solve order":
 *   1. §1 Atmosphere -> ambient Ta, pa; freestream stagnation state.
 *   2. §3 Intake -> T02, p02.
 *   3. §4 Compressor -> stage-stack to overall pi_c, get T03, p03, and
 *      per-stage station table.
 *   4. §5 Combustor -> solve f for the specified TIT (T04), apply
 *      pressure loss for p04.
 *   5. §7 Shaft balance -> T05, p05 from the compressor's power demand
 *      (NOT from an assumed turbine PR).
 *   6. §6 Turbine -> stage-stack the resulting overall expansion ratio
 *      p04/p05 across the chosen turbine stage count, for the per-stage
 *      station table.
 *   7. §8 Nozzle -> choking check, exit velocity, exit pressure.
 *   8. §9 Overall performance -> thrust, TSFC, efficiencies from the
 *      station-9 exit state.
 *
 * Architecture note: the turbine's THERMODYNAMIC station values (T05,
 * p05) come entirely from step 5 (shaft power balance) regardless of
 * whether the turbine is axial or radial — choosing "axial" vs. "radial"
 * only changes how many stages are used to reach that expansion and how
 * blade speeds are sized, not the fundamental cycle numbers. A radial
 * turbine is modelled as single-stage only (n_stages > 1 raises an
 * error) per the source's own design guidance (§6.2): "multi-staging a
 * radial turbine is impractical."
 *
 * Faithful JS port of aeropropsim/engine.py. `EngineConfig` there is a
 * dataclass with defaults; here `makeEngineConfig(overrides)` plays the
 * same role, returning a plain object merged over the same defaults.
 */

import * as C from "./constants.js";
import { isaTroposphere, freestreamStagnation } from "./atmosphere.js";
import { intakeExitState } from "./intake.js";
import {
  stackAxialCompressor, centrifugalStagePressureRatio,
  centrifugalTempRiseRatio, overallIsentropicEfficiency,
} from "./compressor.js";
import { fuelAirRatio, combustorExitPressure } from "./combustor.js";
import { turbineTempRatio, turbinePressureRatio } from "./matching.js";
import { stackAxialTurbine, spoutingVelocity, radialTurbineSizeU2 } from "./turbine.js";
import {
  criticalPressure, isChoked, chokedExitTemperature,
  chokedExitVelocity, unchokedExitVelocity, thrust as nozzleThrust,
} from "./nozzle.js";
import {
  specificThrust as perfSpecificThrust, tsfc as perfTsfc,
  thermalEfficiency, propulsiveEfficiency, overallEfficiencyFromComponents,
} from "./performance.js";
import { Station } from "./gasstate.js";

/**
 * Default engine configuration — mirrors the Python `EngineConfig`
 * dataclass field-for-field, including its defaults (several of which
 * come from constants.DEFAULTS, §10).
 */
export function defaultEngineConfig() {
  return {
    // --- Flight condition ---
    altitude_m: 0.0,
    mach_flight: 0.0,

    // --- Compressor ---
    compressor_type: "axial", // "axial" | "centrifugal"
    n_compressor_stages: 1,
    pi_c: 8.0, // target overall PR (axial mode)
    centrifugal_U2: 400.0, // m/s, per stage (centrifugal mode)

    // --- Combustor ---
    T04: 1400.0, // K, turbine inlet temperature (TIT)

    // --- Turbine ---
    turbine_type: "axial", // "axial" | "radial"
    n_turbine_stages: 1,

    // --- Nozzle ---
    // Afterburner (NPTEL p.291-296) — off by default = the plain turbojet.
    afterburner_on: false,
    T06_ab: 2000.0,
    delta_p_ab_pct: 0.05,
    nozzle_type: "convergent", // "convergent" | "conv-di"
    nozzle_exit_mach_design: null, // required if "conv-di"

    // --- Mass flow ---
    mdot_a: 1.0, // kg/s (v1 default: per-unit-mass-flow)

    // --- Efficiencies / constants (default from constants.DEFAULTS, §10) ---
    eta_d: C.DEFAULTS.eta_d,
    eta_c_stage: C.DEFAULTS.eta_c_stage,
    sigma_slip: C.DEFAULTS.sigma_slip,
    eta_b: C.DEFAULTS.eta_b,
    delta_p_cc_pct: C.DEFAULTS.delta_p_cc_pct,
    Q_R: C.DEFAULTS.Q_R,
    lambda_shaft: C.DEFAULTS.lambda_shaft,
    eta_m: C.DEFAULTS.eta_m,
    eta_tt_stage: C.DEFAULTS.eta_tt_stage,
    eta_N: C.DEFAULTS.eta_N,

    // gas properties (rarely overridden; exposed for what-if experiments)
    gamma_c: C.GAMMA_C,
    cp_c: C.CP_C,
    gamma_h: C.GAMMA_H,
    cp_h: C.CP_H,
  };
}

/** Build an EngineConfig by merging `overrides` over `defaultEngineConfig()`. */
export function makeEngineConfig(overrides = {}) {
  return { ...defaultEngineConfig(), ...overrides };
}

/**
 * Solve one single-design-point turbojet cycle. Ref: §11 solve order.
 *
 * @param {object} cfg - an EngineConfig (see makeEngineConfig).
 * @returns {object} EngineResult-equivalent: { config, atmosphere, intake,
 *   compressor, combustor, shaft, turbine, nozzle, performance, stations }
 */
export function solveEngine(cfg) {
  const result = {
    config: cfg,
    atmosphere: {}, intake: {}, compressor: {}, combustor: {},
    shaft: {}, turbine: {}, afterburner: {}, nozzle: {}, performance: {}, stations: {},
  };

  const R_c = cfg.cp_c * (cfg.gamma_c - 1.0) / cfg.gamma_c;
  const R_h = cfg.cp_h * (cfg.gamma_h - 1.0) / cfg.gamma_h;

  // --- Step 1: Atmosphere (§1) ---
  const [T_a, p_a] = isaTroposphere(cfg.altitude_m);
  const V_flight = cfg.mach_flight * (cfg.gamma_c * R_c * T_a) ** 0.5;
  const [T0a, p0a] = freestreamStagnation(T_a, p_a, cfg.mach_flight, cfg.gamma_c);
  result.atmosphere = { T_a, p_a, V_flight, T0a, p0a };

  // --- Step 2: Intake (§3) ---
  const intake = intakeExitState(T_a, p_a, cfg.mach_flight, cfg.eta_d, cfg.gamma_c);
  result.intake = intake;
  const T02 = intake.T02, p02 = intake.p02;

  // --- Step 3: Compressor (§4) ---
  let T03, p03, pi_actual;
  if (cfg.compressor_type === "axial") {
    const comp = stackAxialCompressor(
      cfg.pi_c, cfg.n_compressor_stages, T02, cfg.eta_c_stage, cfg.eta_c_stage, cfg.gamma_c
    );
    T03 = comp.T01_out;
    pi_actual = comp.pi_actual;
    p03 = p02 * pi_actual;
    const eta_c_overall = overallIsentropicEfficiency(pi_actual, cfg.eta_c_stage, cfg.gamma_c);
    result.compressor = {
      ...comp, p03, pi_actual, eta_c_overall_derived: eta_c_overall, type: "axial",
    };
  } else if (cfg.compressor_type === "centrifugal") {
    let a01 = (cfg.gamma_c * R_c * T02) ** 0.5;
    const stages = [];
    let T01_running = T02, p_rel_running = 1.0;
    for (let i = 0; i < cfg.n_compressor_stages; i++) {
      const pi_stage = centrifugalStagePressureRatio(
        cfg.eta_c_stage, cfg.centrifugal_U2, a01, cfg.gamma_c
      );
      const dT_ratio = centrifugalTempRiseRatio(cfg.centrifugal_U2, a01, cfg.gamma_c);
      const dT0 = dT_ratio * T01_running;
      stages.push({
        T01_in: T01_running, T01_out: T01_running + dT0,
        dT0, pi_stage,
        p01_in_rel: p_rel_running, p01_out_rel: p_rel_running * pi_stage,
      });
      T01_running += dT0;
      p_rel_running *= pi_stage;
      a01 = (cfg.gamma_c * R_c * T01_running) ** 0.5;
    }
    T03 = T01_running;
    pi_actual = p_rel_running;
    p03 = p02 * pi_actual;
    result.compressor = { stages, T01_out: T03, pi_actual, p03, type: "centrifugal" };
  } else {
    throw new Error(`Unknown compressor_type: ${cfg.compressor_type}`);
  }

  // --- Step 4: Combustor (§5) ---
  const f = fuelAirRatio(T03, cfg.T04, cfg.eta_b, cfg.Q_R, cfg.cp_c, cfg.cp_h);
  const p04 = combustorExitPressure(p03, cfg.delta_p_cc_pct);
  result.combustor = { f, p04, T04: cfg.T04 };

  // --- Step 5: Shaft power balance (§7) ---
  const T05_over_T04 = turbineTempRatio(T02, T03, cfg.T04, cfg.lambda_shaft,
                                         cfg.eta_m, f, cfg.cp_c, cfg.cp_h);
  const T05 = T05_over_T04 * cfg.T04;
  // eta_t here is the OVERALL turbine isentropic efficiency needed for the
  // pressure-ratio step; approximate it with the per-stage eta_tt_stage
  // (a total-to-total value) as the working overall value for v1 — see
  // README "Known simplifications" item 8 (quantifies the resulting gap
  // vs. a true stage-by-stage reheat-factor calculation).
  const p05_over_p04 = turbinePressureRatio(T05_over_T04, cfg.eta_tt_stage, cfg.gamma_h);
  const p05 = p05_over_p04 * p04;
  result.shaft = { T05, p05, T05_over_T04, p05_over_p04 };

  // --- Step 6: Turbine stage-stacking (§6) ---
  if (cfg.turbine_type === "axial") {
    const turb = stackAxialTurbine(p05_over_p04, cfg.n_turbine_stages, cfg.T04,
                                    cfg.eta_tt_stage, cfg.gamma_h);
    result.turbine = { ...turb, type: "axial" };
  } else if (cfg.turbine_type === "radial") {
    if (cfg.n_turbine_stages !== 1) {
      throw new Error(
        "Radial turbines are single-stage only in this model — the " +
        "source (§6.2) notes multi-staging a radial turbine is impractical."
      );
    }
    // Informational radial-specific sizing, computed from the cycle's own
    // T04/T05 (see module docstring: cycle numbers are architecture-
    // independent). T03ss below is the radial turbine's own local
    // notation for the ideal static exit temp; approximate here using the
    // stage's own T05 as the (only) stage.
    const T03ss_approx = cfg.T04 - (cfg.T04 - T05) / cfg.eta_tt_stage;
    const V0 = spoutingVelocity(cfg.cp_h, cfg.T04, T03ss_approx);
    const U2 = radialTurbineSizeU2(V0);
    result.turbine = {
      type: "radial", T01_out: T05, pr_actual: p05_over_p04,
      V0_spouting: V0, U2_sized: U2,
      stages: [{
        T01_in: cfg.T04, T01_out: T05,
        dT0: cfg.T04 - T05, pr_stage: p05_over_p04,
      }],
    };
  } else {
    throw new Error(`Unknown turbine_type: ${cfg.turbine_type}`);
  }

  // --- Step 6b: Afterburner (NPTEL p.291-296) --- see engine.py.
  let fab, T06, p06;
  if (cfg.afterburner_on) {
    if (!(cfg.T06_ab > T05)) {
      throw new Error(
        `solveEngine: the afterburner exit temperature T06 = ${cfg.T06_ab.toFixed(0)} K must ` +
        `be above the turbine exit temperature T05 = ${T05.toFixed(0)} K — an afterburner ` +
        `can only add heat. Raise T06 or turn the afterburner off.`
      );
    }
    const abDenom = cfg.eta_b * cfg.Q_R - cfg.cp_h * cfg.T06_ab;
    if (!(abDenom > 0)) {
      throw new Error(
        "solveEngine: the afterburner exit temperature is too high for this fuel — even " +
        "burning it perfectly can't heat the gas that much. Lower T06."
      );
    }
    fab = (1.0 + f) * (cfg.cp_h * cfg.T06_ab - cfg.cp_h * T05) / abDenom;
    T06 = cfg.T06_ab;
    p06 = p05 * (1.0 - cfg.delta_p_ab_pct);
  } else {
    fab = 0.0; T06 = T05; p06 = p05;
  }
  const f_total = f + fab;
  result.afterburner = { on: !!cfg.afterburner_on, fab, T05, p05, T06, p06 };

  // --- Step 7: Nozzle (§8) --- expands from station 6 (= 5, AB off).
  const p_c = criticalPressure(p06, cfg.eta_N, cfg.gamma_h);
  const choked = isChoked(p_c, p_a);
  let V_exit, p_exit, T_exit;
  if (choked) {
    T_exit = chokedExitTemperature(T06, cfg.gamma_h);
    V_exit = chokedExitVelocity(T_exit, cfg.gamma_h, R_h);
    p_exit = p_c;
  } else {
    V_exit = unchokedExitVelocity(T06, p_a, p06, cfg.eta_N, cfg.gamma_h, cfg.cp_h);
    p_exit = p_a;
    T_exit = T06 - V_exit ** 2 / (2.0 * cfg.cp_h); // for rho_exit below
  }

  const rho_exit = p_exit / (R_h * T_exit);
  // Ae/mdot_a from mass continuity (mdot_exit = mdot_a*(1+f+fab) = rho*Ae*V):
  // this lets specific thrust/TSFC be reported per unit mass flow without
  // requiring an assumed absolute engine size (see engine.py module note).
  const Ae_over_mdot_a = (1.0 + f_total) / (rho_exit * V_exit);
  const A_exit = Ae_over_mdot_a * cfg.mdot_a;

  const T_val = nozzleThrust(cfg.mdot_a, f_total, V_exit, V_flight, p_exit, p_a, A_exit);
  result.nozzle = { choked, p_c, p_exit, T_exit, V_exit, rho_exit, A_exit };

  // --- Step 8: Overall performance (§9) --- (1+f+fab), (f+fab): NPTEL p.296.
  const sp_thrust = perfSpecificThrust(f_total, V_exit, V_flight, A_exit, cfg.mdot_a, p_exit, p_a);
  const tsfc_val = perfTsfc(f_total, sp_thrust);
  const eta_th = (V_flight > 0 || f_total > 0) ? thermalEfficiency(f_total, V_exit, V_flight, cfg.Q_R) : null;
  const eta_p = V_flight > 0 ? propulsiveEfficiency(V_flight, V_exit) : 0.0;
  const eta_0 = eta_th !== null ? overallEfficiencyFromComponents(eta_th, eta_p) : null;
  result.performance = {
    thrust: T_val, specific_thrust: sp_thrust, tsfc: tsfc_val,
    eta_thermal: eta_th, eta_propulsive: eta_p, eta_overall: eta_0,
    f, f_ab: fab, f_total,
  };

  // --- Key-station table (for a "Station Analysis" view) ---
  result.stations = {
    a: new Station("a", T0a, p0a, cfg.gamma_c, cfg.cp_c, R_c, V_flight),
    "2": new Station("2", T02, p02, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "3": new Station("3", T03, p03, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "4": new Station("4", cfg.T04, p04, cfg.gamma_h, cfg.cp_h, R_h, 0.0),
    "5": new Station("5", T05, p05, cfg.gamma_h, cfg.cp_h, R_h, 0.0),
    ...(cfg.afterburner_on ? { "6": new Station("6", T06, p06, cfg.gamma_h, cfg.cp_h, R_h, 0.0) } : {}),
    // Station 9 (nozzle exit) is built FROM its already-known static state
    // (T_exit, p_exit, V_exit — all already loss-aware, computed in the
    // §8 nozzle step above), not from (T05, p05, V_exit) — see
    // Station.fromStatic's docstring for why that distinction matters.
    // Its reported p0 will come out < p05, correctly showing the
    // nozzle's real total-pressure loss; its reported T0 should equal T05
    // (adiabatic nozzle, no heat transfer) as a self-consistency check.
    "9": Station.fromStatic("9", T_exit, p_exit, V_exit, cfg.gamma_h, cfg.cp_h, R_h),
  };

  return result;
}
