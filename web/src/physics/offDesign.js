/**
 * Off-design / component-map matching for a FIXED piece of hardware.
 *
 * NOT IN SOURCE. Everything else in this project solves one single design
 * point per call (engine.solveEngine): you hand it a compressor pressure
 * ratio, a TIT, a mass flow, etc. and it sizes a cycle to hit those targets
 * exactly. That's the right tool for designing an engine, but it is not
 * what a real, already-built engine does in the air — a real engine has
 * FIXED hardware (a compressor wheel, a turbine, a fixed nozzle throat),
 * and as altitude, Mach number and throttle change, its actual operating
 * point drifts along that fixed hardware's own performance characteristics
 * rather than magically re-solving to a fresh "design" cycle every time.
 * Mission Analysis, before this module existed, was doing exactly that
 * re-solve — this module is what fixes it.
 *
 * The reference textbook this whole project is built from explicitly scopes
 * this out (see README "Known limitations"): true off-design matching needs
 * compressor and turbine performance MAPS, and the reference never supplies
 * any. Rather than fake that data or skip the feature, this module borrows
 * the standard method for exactly this situation from the broader
 * gas-turbine literature — Cohen, Rogers & Saravanamuttoo, "Gas Turbine
 * Theory" (the standard English-language reference for this specific
 * problem) — and pairs it with a generic, clearly-synthetic compressor map
 * (compressorMap.js) since no real map is available. Every number this
 * module produces should be read as "the standard method's answer given a
 * generic map calibrated to this design point," not as validated against
 * any specific real compressor.
 *
 * The matching method, in outline
 * --------------------------------
 * A single-spool turbojet's fixed hardware has, in the classical treatment,
 * two places that choke across most of the flight envelope: the turbine
 * nozzle guide vanes (NGVs) just downstream of the combustor, and the
 * propelling (exhaust) nozzle itself. Cohen/Rogers/Saravanamuttoo's key
 * simplifying result is this: WHENEVER BOTH stay choked, the turbine's
 * temperature ratio T05/T04 and pressure ratio p05/p04 are pinned to
 * CONSTANT values, independent of engine operating condition — because a
 * choked nozzle's non-dimensional mass-flow parameter (mdot*sqrt(T0)/p0) is
 * fixed by its geometry alone, and having that hold at BOTH the NGVs and
 * the propelling nozzle simultaneously algebraically forces the ratio
 * between the two stations' temperatures and pressures to stay fixed too.
 * This project locks those two ratios (`r_t05_t04`, `r_p05_p04`) once, from
 * the design-point solve, and reuses them at every off-design condition —
 * so off-design and design-point results agree on the turbine's operating
 * ratios by construction, and differ only in what the compressor and
 * combustor are doing.
 *
 * With T05/T04 and p05/p04 fixed, the real unknowns at any flight condition
 * are: the compressor's non-dimensional (corrected) speed Nr and its
 * non-dimensional (corrected) flow mr, relative to the locked design point
 * (Nr=mr=1 there). This module finds them with two nested root-finds:
 *
 *   1. INNER (`solveOperatingPointAtSpeed`): for a trial Nr, find the mr on
 *      that speed line where the turbine's fixed choked-flow capacity
 *      (`k_turbine`, also locked at the design point) is exactly satisfied
 *      by the compressor's mass flow — i.e., the point on the compressor's
 *      Nr speed-line that is actually compatible with the fixed turbine.
 *      Nested inside this is a 1-D solve for T04 itself: T04 is NOT a free
 *      input in true off-design (see module docstring above) — it's
 *      whatever value satisfies the compressor/turbine SHAFT POWER BALANCE
 *      at that (Nr, mr), using the same first-principles balance as
 *      matching.turbineTempRatio, just solved for T04 instead of T05.
 *
 *   2. OUTER (`solveOffDesign`): the user still thinks in terms of "set a
 *      throttle" (T04), like the rest of this project's UI — so the outer
 *      loop searches over Nr until the INNER loop's resulting T04 lands on
 *      the user's requested target. This keeps the UI/config mental model
 *      unchanged (T04 as the throttle) while the underlying physics
 *      correctly treats corrected speed, not TIT, as the independent
 *      variable a fixed-hardware engine actually responds to.
 *
 * v1 scope: axial compressor design points only (compressorMap.js's generic
 * characteristic is shaped for an axial stage-stack; a centrifugal
 * off-design characteristic would need an entirely different generic map
 * and is not attempted here), and a convergent propelling nozzle only (the
 * constant-turbine-ratio derivation above assumes a single choked throat at
 * the propelling nozzle; a convergent-divergent nozzle's off-design
 * behavior — over/under-expansion, shock structure in the diverging section
 * — is a materially different problem, left for future work). Both
 * restrictions are enforced in `lockDesignPoint`.
 *
 * Faithful JS port of aeropropsim/off_design.py.
 */

import { solveEngine } from "./engine.js";
import { isaTroposphere, freestreamStagnation } from "./atmosphere.js";
import { intakeExitState } from "./intake.js";
import { fuelAirRatio, combustorExitPressure } from "./combustor.js";
import {
  criticalPressure, isChoked, chokedExitTemperature, chokedExitVelocity,
  unchokedExitVelocity, thrust as nozzleThrust,
} from "./nozzle.js";
import { specificThrust as perfSpecificThrust, tsfc as perfTsfc } from "./performance.js";
import { Station, criticalPressureRatio } from "./gasstate.js";
import { mapPoint } from "./compressorMap.js";

/**
 * Raised when a requested off-design point is outside this model's valid
 * envelope — either the design point itself doesn't satisfy this method's
 * own preconditions (see `lockDesignPoint`), or a specific (altitude, Mach,
 * T04_target) triple has no solution reachable within the generic map's
 * physical range (roughly idle to a modest overspeed margin — see
 * `lockDesignPoint`'s docstring). This is a real modeling boundary, not a
 * bug: a fixed-geometry engine genuinely cannot reach every combination of
 * altitude/Mach/TIT, and this project would rather say so clearly than
 * extrapolate silently.
 */
export class OffDesignError extends Error {
  constructor(message) {
    super(message);
    this.name = "OffDesignError";
  }
}

// ---------------------------------------------------------------------------
// Generic 1-D root-finding helpers.
//
// NOT IN SOURCE (plain numerical-methods utilities, not physics). Written
// from scratch, matching this project's zero-runtime-dependency footprint
// and keeping the algorithm a trivial line-for-line port of the Python
// module (see aeropropsim/off_design.py's own note on this).
// ---------------------------------------------------------------------------

/**
 * Standard bisection given an already-bracketed sign change (flo, fhi
 * already evaluated and of opposite sign — callers here go through
 * `expandingBracketSolve`, which guarantees this).
 */
function bisect(residual, lo, hi, flo, fhi, tol = 1e-9, maxIter = 200) {
  for (let i = 0; i < maxIter; i++) {
    const mid = 0.5 * (lo + hi);
    const fm = residual(mid);
    if (fm === 0.0) {
      return mid;
    }
    if ((fm > 0) === (flo > 0)) {
      lo = mid;
      flo = fm;
    } else {
      hi = mid;
      fhi = fm;
    }
    if (hi - lo < tol) {
      break;
    }
  }
  return 0.5 * (lo + hi);
}

/**
 * Search outward from an initial guess x0 for a sign change in `residual`,
 * widening the search window geometrically each attempt, then bisect once
 * one is found.
 *
 * This project's off-design equations don't have an analytically known
 * bracket ahead of time (the feasible range genuinely shrinks as the
 * operating point moves away from the design point — see module
 * docstring), so a fixed bracket either misses the root entirely at some
 * conditions or spans regions where the underlying map/combustor formulas
 * aren't even physically valid. Starting AT a good guess (the design-point
 * value, x0) and growing outward is both more robust and mirrors how a
 * real root-finder would be used on this kind of problem.
 *
 * `xLoHard`/`xHiHard` are optional hard walls (e.g. this model's
 * idle/overspeed Nr envelope) — the search window is clipped to them and
 * expansion stops once both walls are reached without a bracket, raising
 * `OffDesignError` (this operating point is outside the model's valid
 * range, not a numerical bug).
 */
function expandingBracketSolve(residual, x0, initStep, {
  growth = 1.6, maxExpand = 40, xLoHard = null, xHiHard = null, tol = 1e-9, name = "",
} = {}) {
  const f0 = residual(x0);
  if (f0 === 0.0) {
    return x0;
  }
  let w = initStep;
  let lo = x0, hi = x0;
  for (let i = 0; i < maxExpand; i++) {
    lo = x0 - w;
    hi = x0 + w;
    if (xLoHard !== null) lo = Math.max(lo, xLoHard);
    if (xHiHard !== null) hi = Math.min(hi, xHiHard);
    const flo = residual(lo);
    const fhi = residual(hi);
    if ((flo > 0) !== (fhi > 0)) {
      return bisect(residual, lo, hi, flo, fhi, tol);
    }
    const hitLoWall = xLoHard !== null && lo <= xLoHard;
    const hitHiWall = xHiHard !== null && hi >= xHiHard;
    if (hitLoWall && hitHiWall) {
      break;
    }
    w *= growth;
  }
  throw new OffDesignError(
    `off-design solve[${name}]: no self-consistent operating point found ` +
    `searching around ${x0.toPrecision(4)} (last window tried: [${lo.toPrecision(4)}, ${hi.toPrecision(4)}]). ` +
    `This usually means the requested condition is outside this fixed ` +
    `hardware's reachable envelope (too far below idle, or would need ` +
    `more overspeed than this generic model allows) — try a less ` +
    `extreme altitude/Mach/throttle combination.`
  );
}

// ---------------------------------------------------------------------------
// Design-point locking.
// ---------------------------------------------------------------------------

/**
 * Run the normal single-design-point solve and freeze the constants this
 * module's off-design matching needs.
 *
 * Restrictions (v1 — see module docstring):
 *   - cfg.compressor_type must be "axial".
 *   - cfg.nozzle_type must be "convergent".
 *   - the design point's nozzle must be choked, and its turbine pressure
 *     ratio must be above the hot-gas choking threshold — both NGVs and the
 *     propelling nozzle choked is the physical precondition this whole
 *     method rests on (see module docstring). A design point picked well
 *     inside the usual §10 default ranges (moderate-to-high pi_c, TIT a
 *     four-figure Kelvin number) satisfies this comfortably; only a very
 *     low-pressure-ratio, low-TIT design point is likely to fail these
 *     checks.
 *
 * Throws OffDesignError if any of the above don't hold.
 *
 * @returns {object} DesignPoint: { cfg, T04_design, r_t05_t04, r_p05_p04,
 *   pi_c_design, eta_c_design, mc2_design, k_turbine, a_exit_design,
 *   mdot_a_design }
 */
export function lockDesignPoint(cfg) {
  if (cfg.compressor_type !== "axial") {
    throw new OffDesignError(
      `lockDesignPoint: off-design matching (v1) only supports an axial-` +
      `compressor design point (got compressor_type=${JSON.stringify(cfg.compressor_type)}) ` +
      `— the generic compressor map is shaped for an axial stage-stack.`
    );
  }
  if (cfg.afterburner_on) {
    throw new OffDesignError(
      "lockDesignPoint: off-design matching (v1) doesn't model a lit afterburner " +
      "(the nozzle throat would have to open up to keep the turbine's operating " +
      "point, a variable-nozzle problem not modelled here)."
    );
  }
  if (cfg.nozzle_type !== "convergent") {
    throw new OffDesignError(
      `lockDesignPoint: off-design matching (v1) only supports a convergent ` +
      `propelling nozzle (got nozzle_type=${JSON.stringify(cfg.nozzle_type)}) ` +
      `— the fixed-T05/T04 derivation assumes one choked throat at the ` +
      `propelling nozzle; a convergent-divergent nozzle's off-design ` +
      `behavior is a different problem, not modelled here.`
    );
  }

  const design = solveEngine(cfg);

  if (!design.nozzle.choked) {
    throw new OffDesignError(
      "lockDesignPoint: this design point's propelling nozzle is not " +
      "choked. This method's off-design matching relies on both the " +
      "turbine NGVs and the propelling nozzle staying choked (see module " +
      "docstring) — pick a design point with a higher pressure ratio " +
      "and/or TIT so the nozzle chokes at the design condition."
    );
  }
  const p04_over_p05 = 1.0 / design.shaft.p05_over_p04;
  const pr_crit_hot = 1.0 / criticalPressureRatio(cfg.gamma_h);
  if (p04_over_p05 < pr_crit_hot) {
    throw new OffDesignError(
      `lockDesignPoint: this design point's turbine pressure ratio ` +
      `(${p04_over_p05.toFixed(3)}) is below the ~${pr_crit_hot.toFixed(3)} needed for ` +
      `choked NGVs, which this off-design method assumes hold at every ` +
      `operating point — pick a design point with a higher pressure ` +
      `ratio and/or TIT.`
    );
  }

  const T02_d = design.intake.T02, p02_d = design.intake.p02;
  const T03_d = design.compressor.T01_out;
  const pi_c_design = design.compressor.pi_actual;
  const f_design = design.combustor.f;
  const p04_design = design.combustor.p04;

  // Calibrate a single-step isentropic efficiency that reproduces the
  // ACTUAL (stage-stacked) design-point T03 exactly at (Nr=1, mr=1) —
  // deliberately not the same quantity as
  // compressor.overallIsentropicEfficiency, which answers a related but
  // different question (relating overall eta_c to an assumed constant
  // POLYTROPIC efficiency, not to this exact design T03). Using that
  // different number here would make the off-design solve disagree with
  // the design point it's supposed to exactly reproduce at Nr=1.
  const exp_c = (cfg.gamma_c - 1.0) / cfg.gamma_c;
  const eta_c_design = (pi_c_design ** exp_c - 1.0) / (T03_d / T02_d - 1.0);

  const mc2_design = cfg.mdot_a * Math.sqrt(T02_d) / p02_d;
  const k_turbine = cfg.mdot_a * (1.0 + f_design) * Math.sqrt(cfg.T04) / p04_design;

  return {
    cfg,
    T04_design: cfg.T04,
    r_t05_t04: design.shaft.T05_over_T04,
    r_p05_p04: design.shaft.p05_over_p04,
    pi_c_design,
    eta_c_design,
    mc2_design,
    k_turbine,
    a_exit_design: design.nozzle.A_exit,
    mdot_a_design: cfg.mdot_a,
  };
}

// ---------------------------------------------------------------------------
// The matching solve itself.
// ---------------------------------------------------------------------------

/** T03, p03, mdot_a at a trial (Nr, mr), from the generic map. */
function compressorState(dp, T02, p02, Nr, mr) {
  const m = mapPoint(Nr, mr, dp.pi_c_design, dp.eta_c_design);
  const cfg = dp.cfg;
  const exp_c = (cfg.gamma_c - 1.0) / cfg.gamma_c;
  const p03 = p02 * m.pi_c;
  const T03 = T02 * (1.0 + (m.pi_c ** exp_c - 1.0) / m.eta_c);
  const mc2 = mr * dp.mc2_design;
  const mdot_a = mc2 * p02 / Math.sqrt(T02);
  return { T03, p03, mdot_a };
}

/**
 * The T04 that satisfies the shaft power balance for this compressor
 * state, given the design point's fixed turbine temperature ratio
 * r_t05_t04 — see module docstring for why T04 (not T05) is the unknown
 * here. Mirrors matching.turbineTempRatio's physics, solved in the other
 * direction.
 */
function solveT04FromShaftBalance(dp, T02, T03) {
  const cfg = dp.cfg;
  const compressor_work = cfg.cp_c * (T03 - T02);

  function residual(T04) {
    const f = fuelAirRatio(T03, T04, cfg.eta_b, cfg.Q_R, cfg.cp_c, cfg.cp_h);
    const turbine_capacity = (cfg.lambda_shaft * cfg.eta_m * (1.0 + f) * cfg.cp_h
      * T04 * (1.0 - dp.r_t05_t04));
    return turbine_capacity - compressor_work;
  }

  const x0 = T03 * 1.5;
  return expandingBracketSolve(residual, x0, T03 * 0.15, {
    xLoHard: T03 * 1.0001, xHiHard: 2400.0, name: "T04 (shaft balance)",
  });
}

/**
 * Inner loop: find the mr on this Nr speed-line that is mass-flow-
 * compatible with the turbine's fixed choked capacity, and the T04 the
 * shaft balance then requires.
 */
function solveOperatingPointAtSpeed(dp, T02, p02, Nr) {
  const cfg = dp.cfg;

  function residual(mr) {
    const { T03, p03, mdot_a } = compressorState(dp, T02, p02, Nr, mr);
    const T04v = solveT04FromShaftBalance(dp, T02, T03);
    const fv = fuelAirRatio(T03, T04v, cfg.eta_b, cfg.Q_R, cfg.cp_c, cfg.cp_h);
    const p04v = combustorExitPressure(p03, cfg.delta_p_cc_pct);
    const mdot_from_choking = dp.k_turbine * p04v / Math.sqrt(T04v) / (1.0 + fv);
    return mdot_from_choking - mdot_a;
  }

  const mr_final = expandingBracketSolve(residual, Nr * 1.0, Nr * 0.05, {
    xLoHard: Nr * 0.3, xHiHard: Nr * 1.65, name: "mr (mass-flow compatibility)",
  });
  const { T03, p03, mdot_a } = compressorState(dp, T02, p02, Nr, mr_final);
  const T04v = solveT04FromShaftBalance(dp, T02, T03);
  const fv = fuelAirRatio(T03, T04v, cfg.eta_b, cfg.Q_R, cfg.cp_c, cfg.cp_h);
  const p04v = combustorExitPressure(p03, cfg.delta_p_cc_pct);
  return { mr: mr_final, T04: T04v, T03, p03, mdot_a, f: fv, p04: p04v };
}

/**
 * Default hard walls for the outer (Nr) search — roughly a real
 * single-spool turbojet's idle-to-modest-overspeed envelope. NOT IN
 * SOURCE (no textbook basis for these exact numbers); chosen generously
 * wide relative to typical real engines (which usually run ~65-103% N)
 * so this model's own feasibility limits (see module docstring) are what
 * actually stops an unreachable query, rather than these walls doing it
 * prematurely.
 */
export const NR_LO_HARD = 0.25;
export const NR_HI_HARD = 1.3;

/**
 * Solve for this fixed hardware's actual operating point at a given
 * flight condition and throttle (expressed as target TIT, matching this
 * project's existing config/UI convention).
 *
 * @param {object} dp - a locked DesignPoint (see `lockDesignPoint`).
 * @param {number} altitude_m
 * @param {number} mach_flight - flight condition (same envelope/limits as
 *   engine.solveEngine — isaTroposphere's 0-11000 m range).
 * @param {number} T04_target - desired turbine inlet temperature, K. NOTE:
 *   unlike engine.solveEngine, this is not directly imposed — it is the
 *   target the outer Nr search converges to (see module docstring's
 *   "matching method" section for why TIT is an output of the real
 *   physics, not a free input).
 * @param {number} Nr_guess - starting guess for the corrected-speed search
 *   — the default (the design point itself) is a good starting guess for
 *   most nearby conditions; only worth overriding for a targeted retry
 *   after an OffDesignError.
 *
 * @returns {object} OffDesignResult: { design_point, altitude_m,
 *   mach_flight, Nr, mr, T04, f, mdot_a, thrust, tsfc, specific_thrust,
 *   nozzle_choked, stations } — `stations` is shaped like
 *   engine.solveEngine's result.stations, so existing station/diagram UI
 *   components can be reused unchanged.
 *
 * @throws {OffDesignError} this (altitude, Mach, T04_target) combination
 *   has no solution within this fixed hardware's reachable envelope.
 */
export function solveOffDesign(dp, altitude_m, mach_flight, T04_target, Nr_guess = 1.0) {
  const cfg = dp.cfg;
  const R_c = cfg.cp_c * (cfg.gamma_c - 1.0) / cfg.gamma_c;
  const R_h = cfg.cp_h * (cfg.gamma_h - 1.0) / cfg.gamma_h;

  const [T_a, p_a] = isaTroposphere(altitude_m);
  const intake = intakeExitState(T_a, p_a, mach_flight, cfg.eta_d, cfg.gamma_c);
  const T02 = intake.T02, p02 = intake.p02;
  const V_flight = mach_flight * (cfg.gamma_c * R_c * T_a) ** 0.5;

  function outerResidual(Nr) {
    const st = solveOperatingPointAtSpeed(dp, T02, p02, Nr);
    return st.T04 - T04_target;
  }

  const Nr_final = expandingBracketSolve(outerResidual, Nr_guess, 0.05, {
    xLoHard: NR_LO_HARD, xHiHard: NR_HI_HARD, name: "Nr (corrected speed)",
  });
  const st = solveOperatingPointAtSpeed(dp, T02, p02, Nr_final);
  const { T03, p03, mdot_a, f, p04 } = st;

  const T05 = dp.r_t05_t04 * T04_target;
  const p05 = dp.r_p05_p04 * p04;

  const p_c = criticalPressure(p05, cfg.eta_N, cfg.gamma_h);
  const choked = isChoked(p_c, p_a);
  let V_exit, p_exit, T_exit;
  if (choked) {
    T_exit = chokedExitTemperature(T05, cfg.gamma_h);
    V_exit = chokedExitVelocity(T_exit, cfg.gamma_h, R_h);
    p_exit = p_c;
  } else {
    V_exit = unchokedExitVelocity(T05, p_a, p05, cfg.eta_N, cfg.gamma_h, cfg.cp_h);
    p_exit = p_a;
    T_exit = T05 - V_exit ** 2 / (2.0 * cfg.cp_h);
  }

  // eslint-disable-next-line no-unused-vars -- computed for parity with off_design.py, which
  // also derives it here and leaves it unused (A_exit is fixed geometry, not recomputed).
  const _rho_exit = p_exit / (R_h * T_exit);
  const A_exit = dp.a_exit_design; // fixed geometry — NOT recomputed off-design
  const T_val = nozzleThrust(mdot_a, f, V_exit, V_flight, p_exit, p_a, A_exit);
  const sp_thrust = perfSpecificThrust(f, V_exit, V_flight, A_exit, mdot_a, p_exit, p_a);
  const tsfc_val = perfTsfc(f, sp_thrust);

  const [T0a, p0a] = freestreamStagnation(T_a, p_a, mach_flight, cfg.gamma_c);
  const stations = {
    a: new Station("a", T0a, p0a, cfg.gamma_c, cfg.cp_c, R_c, V_flight),
    "2": new Station("2", T02, p02, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "3": new Station("3", T03, p03, cfg.gamma_c, cfg.cp_c, R_c, 0.0),
    "4": new Station("4", T04_target, p04, cfg.gamma_h, cfg.cp_h, R_h, 0.0),
    "5": new Station("5", T05, p05, cfg.gamma_h, cfg.cp_h, R_h, 0.0),
    "9": Station.fromStatic("9", T_exit, p_exit, V_exit, cfg.gamma_h, cfg.cp_h, R_h),
  };

  return {
    design_point: dp,
    altitude_m,
    mach_flight,
    Nr: Nr_final,
    mr: st.mr,
    T04: T04_target,
    f,
    mdot_a,
    thrust: T_val,
    tsfc: tsfc_val,
    specific_thrust: sp_thrust,
    nozzle_choked: choked,
    stations,
  };
}
