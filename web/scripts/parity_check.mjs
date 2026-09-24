#!/usr/bin/env node
/**
 * Python <-> JS parity harness.
 *
 * Runs a battery of EngineConfig-equivalent scenarios through both the
 * Python reference implementation (aeropropsim.engine.solve_engine, via
 * scripts/dump_engine_result.py) and the JS port
 * (web/src/physics/engine.js solveEngine, via
 * web/scripts/dump_engine_result.mjs), then recursively diffs the two
 * flattened JSON results with a tight numeric tolerance.
 *
 * Also runs a second battery for the off-design/component-map matching
 * solver (aeropropsim.off_design.lock_design_point/solve_off_design vs.
 * web/src/physics/offDesign.js's lockDesignPoint/solveOffDesign), via the
 * dump_off_design_result.py/.mjs pair — same diff machinery, same
 * tolerance, plus a check that both sides raise/don't-raise OffDesignError
 * in agreement for scenarios that probe the model's validity envelope.
 *
 * This is the guard against the JS and Python physics implementations
 * silently drifting apart, which is the accepted tradeoff of porting the
 * engine to JS for a static, server-free site (see project README).
 *
 * Usage (from web/):  node scripts/parity_check.mjs
 * Exit code 0 = all scenarios match; 1 = at least one mismatch.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PY_SCRIPT = path.join(REPO_ROOT, "scripts", "dump_engine_result.py");
const JS_SCRIPT = path.join(__dirname, "dump_engine_result.mjs");
const PY_OFFDESIGN_SCRIPT = path.join(REPO_ROOT, "scripts", "dump_off_design_result.py");
const JS_OFFDESIGN_SCRIPT = path.join(__dirname, "dump_off_design_result.mjs");
const PY_TURBOPROP_SCRIPT = path.join(REPO_ROOT, "scripts", "dump_turboprop_result.py");
const JS_TURBOPROP_SCRIPT = path.join(__dirname, "dump_turboprop_result.mjs");
const PY_TURBOSHAFT_SCRIPT = path.join(REPO_ROOT, "scripts", "dump_turboshaft_result.py");
const JS_TURBOSHAFT_SCRIPT = path.join(__dirname, "dump_turboshaft_result.mjs");
const PY_TURBOFAN_SCRIPT = path.join(REPO_ROOT, "scripts", "dump_turbofan_result.py");
const JS_TURBOFAN_SCRIPT = path.join(__dirname, "dump_turbofan_result.mjs");
const PY_PROPFAN_SCRIPT = path.join(REPO_ROOT, "scripts", "dump_propfan_result.py");
const JS_PROPFAN_SCRIPT = path.join(__dirname, "dump_propfan_result.mjs");
const PY_SCRAMJET_SCRIPT = path.join(REPO_ROOT, "scripts", "dump_scramjet_result.py");
const JS_SCRAMJET_SCRIPT = path.join(__dirname, "dump_scramjet_result.mjs");
const PY_RAMJET_SCRIPT = path.join(REPO_ROOT, "scripts", "dump_ramjet_result.py");
const JS_RAMJET_SCRIPT = path.join(__dirname, "dump_ramjet_result.mjs");
const PY_TURBORAMJET_SCRIPT = path.join(REPO_ROOT, "scripts", "dump_turboramjet_result.py");
const JS_TURBORAMJET_SCRIPT = path.join(__dirname, "dump_turboramjet_result.mjs");

// Relative tolerance for numeric comparisons. Floating-point arithmetic
// order can differ subtly between Python and JS (both are IEEE-754
// doubles, but not necessarily evaluated in bit-identical operation
// order), so exact equality is not the bar — matching to ~1e-9 relative
// is.
const REL_TOL = 1e-9;
const ABS_TOL = 1e-9;

const SCENARIOS = [
  {
    name: "default config (sea level, static)",
    overrides: {},
  },
  {
    name: "cruise, 10-stage axial compressor, 2-stage axial turbine",
    overrides: {
      altitude_m: 10000, mach_flight: 0.8,
      compressor_type: "axial", n_compressor_stages: 10, pi_c: 8.0,
      T04: 1400.0,
      turbine_type: "axial", n_turbine_stages: 2,
      mdot_a: 50.0,
    },
  },
  {
    name: "single-stage axial compressor, low pi_c, static ground run",
    overrides: {
      altitude_m: 0, mach_flight: 0.0,
      compressor_type: "axial", n_compressor_stages: 1, pi_c: 4.0,
      T04: 1100.0,
      turbine_type: "axial", n_turbine_stages: 1,
      mdot_a: 14.67,
    },
  },
  {
    name: "centrifugal compressor, radial turbine",
    overrides: {
      altitude_m: 3000, mach_flight: 0.3,
      compressor_type: "centrifugal", n_compressor_stages: 1, centrifugal_U2: 450.0,
      T04: 1200.0,
      turbine_type: "radial", n_turbine_stages: 1,
      mdot_a: 20.0,
    },
  },
  {
    name: "high altitude, high Mach, 3-stage centrifugal",
    overrides: {
      altitude_m: 9000, mach_flight: 0.85,
      compressor_type: "centrifugal", n_compressor_stages: 3, centrifugal_U2: 380.0,
      T04: 1500.0,
      turbine_type: "axial", n_turbine_stages: 3,
      mdot_a: 35.0,
      eta_d: 0.85, eta_c_stage: 0.88, eta_b: 0.98, eta_m: 0.97,
      eta_tt_stage: 0.91, eta_N: 0.96,
    },
  },
];

// ---------------------------------------------------------------------------
// Off-design scenario battery.
//
// Covers: exact design-point reproduction (Nr/mr should land on ~1.0),
// nearby and envelope-edge off-design points (higher altitude/Mach at
// reduced throttle, and a high-altitude/high-Mach/high-throttle point near
// the Nr_HI_HARD wall), two design points that should be REJECTED by
// lockDesignPoint (a centrifugal compressor, and a low-pi_c/low-T04 point
// whose nozzle never chokes), and one in-envelope design point given an
// off-design query that is itself infeasible (T04_target far beyond what
// the shaft-balance solve can reach) — all confirmed against the Python
// reference in scripts/off_design_scenarios.md-equivalent exploration
// before being added here.
// ---------------------------------------------------------------------------
const OFF_DESIGN_SCENARIOS = [
  {
    name: "off-design: reproduces its own design point exactly",
    args: { config_overrides: {}, altitude_m: 0.0, mach_flight: 0.0, T04_target: 1400.0 },
  },
  {
    name: "off-design: cruise altitude/Mach, reduced throttle",
    args: { config_overrides: {}, altitude_m: 8000.0, mach_flight: 0.7, T04_target: 1300.0 },
  },
  {
    name: "off-design: high altitude/Mach, near the corrected-speed envelope edge",
    args: { config_overrides: {}, altitude_m: 11000.0, mach_flight: 0.9, T04_target: 1400.0 },
  },
  {
    name: "off-design: rejects a centrifugal-compressor design point",
    args: { config_overrides: { compressor_type: "centrifugal" }, altitude_m: 0.0, mach_flight: 0.0, T04_target: 1400.0 },
    expectError: true,
  },
  {
    name: "off-design: rejects a design point whose nozzle never chokes",
    args: { config_overrides: { pi_c: 2.0, T04: 900.0 }, altitude_m: 0.0, mach_flight: 0.0, T04_target: 900.0 },
    expectError: true,
  },
  {
    name: "off-design: rejects an infeasible T04_target off-design query",
    args: { config_overrides: {}, altitude_m: 0.0, mach_flight: 0.0, T04_target: 2200.0 },
    expectError: true,
  },
];

// ---------------------------------------------------------------------------
// Turboprop scenario battery — covers axial/centrifugal compressor,
// axial/radial turbine, a range of alpha splits, and the M=0 case that
// should raise in both implementations (reference/turboprop.md §2.2:
// propeller thrust divides by flight speed).
// ---------------------------------------------------------------------------
const TURBOPROP_SCENARIOS = [
  { name: "turboprop: default cruise", overrides: { altitude_m: 6000, mach_flight: 0.5, pi_c: 10.0, T04: 1400.0, alpha: 0.85, mdot_a: 10.0 } },
  { name: "turboprop: low-alpha, high pi_c", overrides: { altitude_m: 3000, mach_flight: 0.3, pi_c: 14.0, T04: 1300.0, alpha: 0.75, n_compressor_stages: 10, mdot_a: 8.0 } },
  { name: "turboprop: high-alpha, hot cycle", overrides: { altitude_m: 7000, mach_flight: 0.6, pi_c: 8.0, T04: 1500.0, alpha: 0.92, mdot_a: 12.0 } },
  { name: "turboprop: centrifugal compressor, radial turbine", overrides: { altitude_m: 3000, mach_flight: 0.35, compressor_type: "centrifugal", n_compressor_stages: 1, centrifugal_U2: 420.0, T04: 1200.0, turbine_type: "radial", n_turbine_stages: 1, alpha: 0.85, mdot_a: 6.0 } },
  { name: "turboprop: static (M=0) — expected error in both", overrides: { altitude_m: 0, mach_flight: 0.0 }, expectError: true },
  { name: "turboprop: 8-stage centrifugal outpowers turbine — expected error in both", overrides: { compressor_type: "centrifugal", n_compressor_stages: 8 }, expectError: true },
];

// ---------------------------------------------------------------------------
// Turboshaft scenario battery — covers axial/centrifugal compressor,
// axial/radial turbine, and (unlike the turboprop) a static M=0 case
// that should solve cleanly in both implementations, since nothing in
// the turboshaft's formulas divides by flight speed.
// ---------------------------------------------------------------------------
const TURBOSHAFT_SCENARIOS = [
  { name: "turboshaft: default (hover/ground, M=0)", overrides: { altitude_m: 0, mach_flight: 0.0, pi_c: 10.0, T04: 1400.0, mdot_a: 1.0 } },
  { name: "turboshaft: altitude, low pi_c", overrides: { altitude_m: 3000, mach_flight: 0.0, pi_c: 8.0, T04: 1300.0, n_compressor_stages: 6, mdot_a: 2.0 } },
  { name: "turboshaft: forward flight, hot cycle", overrides: { altitude_m: 6000, mach_flight: 0.3, pi_c: 14.0, T04: 1500.0, mdot_a: 3.0 } },
  { name: "turboshaft: 8-stage centrifugal outpowers turbine — expected error in both", overrides: { compressor_type: "centrifugal", n_compressor_stages: 8 }, expectError: true },
  { name: "turboshaft: centrifugal compressor, radial turbine", overrides: { altitude_m: 0, mach_flight: 0.0, compressor_type: "centrifugal", n_compressor_stages: 1, centrifugal_U2: 420.0, T04: 1200.0, turbine_type: "radial", n_turbine_stages: 1, mdot_a: 1.5 } },
];

// ---------------------------------------------------------------------------
// Turbofan scenario battery — two-spool unmixed baseline, covering a
// cruise point, a low-bypass/high-FPR point, and a static (M=0) point.
// ---------------------------------------------------------------------------
const TURBOFAN_SCENARIOS = [
  { name: "turbofan: cruise, medium bypass", overrides: { altitude_m: 10000, mach_flight: 0.8, beta: 5.0, pi_f: 1.65, pi_LPC: 1.5, pi_HPC: 12.0, T05: 1500.0, mdot_a: 50.0 } },
  { name: "turbofan: low bypass, high fan PR", overrides: { altitude_m: 3000, mach_flight: 0.3, beta: 1.5, pi_f: 2.2, pi_LPC: 1.8, pi_HPC: 10.0, T05: 1600.0, mdot_a: 30.0 } },
  { name: "turbofan: static (M=0), high bypass", overrides: { altitude_m: 0, mach_flight: 0.0, beta: 8.0, pi_f: 1.5, pi_LPC: 1.3, pi_HPC: 14.0, T05: 1450.0, mdot_a: 80.0 } },
];

// ---------------------------------------------------------------------------
// Propfan scenario battery — three-spool baseline, covering a cruise
// point, a low-alpha/high-pressure-ratio point, and a high-alpha point
// (shaft/fan-heavy split).
// ---------------------------------------------------------------------------
const PROPFAN_SCENARIOS = [
  { name: "propfan: default cruise", overrides: { altitude_m: 9000, mach_flight: 0.7, pi_IPC: 2.0, pi_HPC: 6.0, T05: 1500.0, alpha: 0.85, mdot_a: 10.0 } },
  { name: "propfan: low altitude, high pressure ratio", overrides: { altitude_m: 3000, mach_flight: 0.4, pi_IPC: 2.2, pi_HPC: 8.0, T05: 1400.0, alpha: 0.75, mdot_a: 8.0 } },
  { name: "propfan: high alpha (fan-heavy split), hot cycle", overrides: { altitude_m: 7000, mach_flight: 0.6, pi_IPC: 1.8, pi_HPC: 5.0, T05: 1600.0, alpha: 0.95, mdot_a: 12.0 } },
  { name: "propfan: with bleed", overrides: { altitude_m: 9000, mach_flight: 0.7, pi_IPC: 2.0, pi_HPC: 6.0, T05: 1500.0, alpha: 0.85, mdot_a: 10.0, bleed_ratio: 0.02 } },
];

// ---------------------------------------------------------------------------
// Scramjet scenario battery — cruise points across Mach/altitude/fuel,
// plus the three fail-loud cases (thermal choking, subsonic combustor
// inlet, flight Mach below combustor Mach) that must raise in both.
// ---------------------------------------------------------------------------
const SCRAMJET_SCENARIOS = [
  { name: "scramjet: default (M6, 10 km)", overrides: {} },
  { name: "scramjet: M7, richer, faster combustor", overrides: { mach_flight: 7.0, mach_combustor_inlet: 3.0, f: 0.03, mdot_a: 20.0 } },
  { name: "scramjet: sea level, M5.5", overrides: { altitude_m: 0, mach_flight: 5.5, eta_I: 0.85, eta_N: 0.92 } },
  { name: "scramjet: thermal choke — expected error in both", overrides: { mach_flight: 5.0, mach_combustor_inlet: 2.0 }, expectError: true },
  { name: "scramjet: subsonic combustor — expected error in both", overrides: { mach_combustor_inlet: 0.8 }, expectError: true },
  { name: "scramjet: M1 < M2 — expected error in both", overrides: { mach_flight: 2.0 }, expectError: true },
  { name: "scramjet: too little fuel, negative thrust", overrides: { f: 0.001 } },
];

// ---------------------------------------------------------------------------
// Ramjet scenario battery — both nozzle types across the Mach range, the
// negative-thrust convergent case (TSFC NaN -> null on both sides), and
// the fail-loud cases.
// ---------------------------------------------------------------------------
const RAMJET_SCENARIOS = [
  { name: "ramjet: default (M2.5, 11 km, expanded)", overrides: {} },
  { name: "ramjet: M3.5, hot, big engine", overrides: { mach_flight: 3.5, T04: 2200.0, mdot_a: 50.0 } },
  { name: "ramjet: sea level M1.2", overrides: { altitude_m: 0, mach_flight: 1.2, T04: 1500.0 } },
  { name: "ramjet: convergent, choked at M3", overrides: { mach_flight: 3.0, nozzle_type: "convergent" } },
  { name: "ramjet: convergent, unchoked at M0.8", overrides: { mach_flight: 0.8, nozzle_type: "convergent" } },
  { name: "ramjet: convergent M5.5, negative thrust", overrides: { mach_flight: 5.5, nozzle_type: "convergent" } },
  { name: "ramjet: M0 — expected error in both", overrides: { mach_flight: 0 }, expectError: true },
  { name: "ramjet: too slow — expected error in both", overrides: { mach_flight: 0.2, altitude_m: 0 }, expectError: true },
  { name: "ramjet: T04 below ram temperature — expected error in both", overrides: { mach_flight: 6.0, T04: 1200.0 }, expectError: true },
];

// ---------------------------------------------------------------------------
// Turboramjet scenario battery — every mode, afterburner on/off, static
// take-off, and the fail-loud cases.
// ---------------------------------------------------------------------------
const TURBORAMJET_SCENARIOS = [
  { name: "turboramjet: default (auto, M2, turbojet leg + AB)", overrides: {} },
  { name: "turboramjet: auto above switch -> ramjet", overrides: { mach_flight: 3.5 } },
  { name: "turboramjet: static take-off, sea level", overrides: { mach_flight: 0, altitude_m: 0, mdot_a: 80.0 } },
  { name: "turboramjet: AB off, M1.2", overrides: { mach_flight: 1.2, afterburner_on: false, pi_c: 12.0 } },
  { name: "turboramjet: dual, beta 0.3, M2.5", overrides: { mode: "dual", beta: 0.3, mach_flight: 2.5, mdot_a: 30.0 } },
  { name: "turboramjet: forced ramjet, hot, M4", overrides: { mode: "ramjet", mach_flight: 4.0, T09: 2200.0 } },
  { name: "turboramjet: custom switch Mach 2.2", overrides: { mach_switch: 2.2, mach_flight: 2.4 } },
  { name: "turboramjet: turbojet too hot at M4 — expected error in both", overrides: { mode: "turbojet", mach_flight: 4.0 }, expectError: true },
  { name: "turboramjet: ramjet at M0 — expected error in both", overrides: { mode: "ramjet", mach_flight: 0 }, expectError: true },
  { name: "turboramjet: cold afterburner — expected error in both", overrides: { mach_flight: 1.0, T06_ab: 900.0 }, expectError: true },
  { name: "turboramjet: dual beta 1 — expected error in both", overrides: { mode: "dual", beta: 1.0 }, expectError: true },
];

function runPython(script, overridesOrArgs) {
  const out = execFileSync(
    "python3", [script, JSON.stringify(overridesOrArgs)],
    { cwd: REPO_ROOT, encoding: "utf-8" }
  );
  return JSON.parse(out);
}

function runJs(script, overridesOrArgs) {
  const out = execFileSync(
    "node", [script, JSON.stringify(overridesOrArgs)],
    { cwd: __dirname, encoding: "utf-8" }
  );
  return JSON.parse(out);
}

/** Recursively diff two JSON-like values; returns a list of mismatch descriptions. */
function diff(pathStr, a, b) {
  const mismatches = [];
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return mismatches;
    const absDiff = Math.abs(a - b);
    const relDiff = absDiff / Math.max(Math.abs(a), Math.abs(b), 1e-30);
    if (absDiff > ABS_TOL && relDiff > REL_TOL) {
      mismatches.push(`${pathStr}: python=${a} js=${b} (abs=${absDiff.toExponential(3)}, rel=${relDiff.toExponential(3)})`);
    }
    return mismatches;
  }
  if (a === null || b === null || typeof a === "boolean" || typeof b === "boolean" || typeof a === "string") {
    if (a !== b) {
      mismatches.push(`${pathStr}: python=${JSON.stringify(a)} js=${JSON.stringify(b)}`);
    }
    return mismatches;
  }
  if (typeof a === "object" && typeof b === "object") {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    const allKeys = new Set([...keysA, ...keysB]);
    for (const key of allKeys) {
      if (!(key in a)) {
        mismatches.push(`${pathStr}.${key}: missing in python result`);
        continue;
      }
      if (!(key in b)) {
        mismatches.push(`${pathStr}.${key}: missing in js result`);
        continue;
      }
      mismatches.push(...diff(`${pathStr}.${key}`, a[key], b[key]));
    }
    return mismatches;
  }
  if (a !== b) {
    mismatches.push(`${pathStr}: python=${JSON.stringify(a)} js=${JSON.stringify(b)}`);
  }
  return mismatches;
}

function main() {
  let anyFailed = false;
  let totalScenarios = 0;

  for (const scenario of SCENARIOS) {
    totalScenarios += 1;
    process.stdout.write(`Scenario: ${scenario.name} ... `);
    let pyResult, jsResult;
    try {
      pyResult = runPython(PY_SCRIPT, scenario.overrides);
    } catch (err) {
      console.log("FAIL (python error)");
      console.error(err.stderr ? err.stderr.toString() : err);
      anyFailed = true;
      continue;
    }
    try {
      jsResult = runJs(JS_SCRIPT, scenario.overrides);
    } catch (err) {
      console.log("FAIL (js error)");
      console.error(err.stderr ? err.stderr.toString() : err);
      anyFailed = true;
      continue;
    }
    const mismatches = diff("result", pyResult, jsResult);
    if (mismatches.length === 0) {
      console.log("OK");
    } else {
      console.log(`FAIL (${mismatches.length} mismatch(es))`);
      for (const m of mismatches) {
        console.error(`  ${m}`);
      }
      anyFailed = true;
    }
  }

  for (const scenario of OFF_DESIGN_SCENARIOS) {
    totalScenarios += 1;
    process.stdout.write(`Scenario: ${scenario.name} ... `);
    let pyResult, jsResult;
    try {
      pyResult = runPython(PY_OFFDESIGN_SCRIPT, scenario.args);
    } catch (err) {
      console.log("FAIL (python error)");
      console.error(err.stderr ? err.stderr.toString() : err);
      anyFailed = true;
      continue;
    }
    try {
      jsResult = runJs(JS_OFFDESIGN_SCRIPT, scenario.args);
    } catch (err) {
      console.log("FAIL (js error)");
      console.error(err.stderr ? err.stderr.toString() : err);
      anyFailed = true;
      continue;
    }

    const pyIsError = pyResult && pyResult.error === "OffDesignError";
    const jsIsError = jsResult && jsResult.error === "OffDesignError";
    if (scenario.expectError) {
      if (pyIsError && jsIsError) {
        console.log("OK (both raised OffDesignError, as expected)");
      } else {
        console.log("FAIL (expected both sides to raise OffDesignError)");
        console.error(`  python raised: ${pyIsError}, js raised: ${jsIsError}`);
        if (!pyIsError) console.error(`  python result: ${JSON.stringify(pyResult)}`);
        if (!jsIsError) console.error(`  js result: ${JSON.stringify(jsResult)}`);
        anyFailed = true;
      }
      continue;
    }
    if (pyIsError || jsIsError) {
      console.log("FAIL (unexpected OffDesignError)");
      if (pyIsError) console.error(`  python: ${pyResult.message}`);
      if (jsIsError) console.error(`  js: ${jsResult.message}`);
      anyFailed = true;
      continue;
    }

    const mismatches = diff("result", pyResult, jsResult);
    if (mismatches.length === 0) {
      console.log("OK");
    } else {
      console.log(`FAIL (${mismatches.length} mismatch(es))`);
      for (const m of mismatches) {
        console.error(`  ${m}`);
      }
      anyFailed = true;
    }
  }

  for (const scenario of TURBOPROP_SCENARIOS) {
    totalScenarios += 1;
    process.stdout.write(`Scenario: ${scenario.name} ... `);
    let pyResult, jsResult;
    try {
      pyResult = runPython(PY_TURBOPROP_SCRIPT, scenario.overrides);
    } catch (err) {
      console.log("FAIL (python error)");
      console.error(err.stderr ? err.stderr.toString() : err);
      anyFailed = true;
      continue;
    }
    try {
      jsResult = runJs(JS_TURBOPROP_SCRIPT, scenario.overrides);
    } catch (err) {
      console.log("FAIL (js error)");
      console.error(err.stderr ? err.stderr.toString() : err);
      anyFailed = true;
      continue;
    }

    const pyIsError = pyResult && pyResult.error === "ValueError";
    const jsIsError = jsResult && jsResult.error === "ValueError";
    if (scenario.expectError) {
      if (pyIsError && jsIsError) {
        console.log("OK (both raised, as expected)");
      } else {
        console.log("FAIL (expected both sides to raise)");
        console.error(`  python raised: ${pyIsError}, js raised: ${jsIsError}`);
        anyFailed = true;
      }
      continue;
    }
    if (pyIsError || jsIsError) {
      console.log("FAIL (unexpected error)");
      if (pyIsError) console.error(`  python: ${pyResult.message}`);
      if (jsIsError) console.error(`  js: ${jsResult.message}`);
      anyFailed = true;
      continue;
    }

    const mismatches = diff("result", pyResult, jsResult);
    if (mismatches.length === 0) {
      console.log("OK");
    } else {
      console.log(`FAIL (${mismatches.length} mismatch(es))`);
      for (const m of mismatches) {
        console.error(`  ${m}`);
      }
      anyFailed = true;
    }
  }

  for (const scenario of TURBOSHAFT_SCENARIOS) {
    totalScenarios += 1;
    process.stdout.write(`Scenario: ${scenario.name} ... `);
    let pyResult, jsResult;
    try {
      pyResult = runPython(PY_TURBOSHAFT_SCRIPT, scenario.overrides);
    } catch (err) {
      console.log("FAIL (python error)");
      console.error(err.stderr ? err.stderr.toString() : err);
      anyFailed = true;
      continue;
    }
    try {
      jsResult = runJs(JS_TURBOSHAFT_SCRIPT, scenario.overrides);
    } catch (err) {
      console.log("FAIL (js error)");
      console.error(err.stderr ? err.stderr.toString() : err);
      anyFailed = true;
      continue;
    }

    const pyIsError = pyResult && pyResult.error === "ValueError";
    const jsIsError = jsResult && jsResult.error === "ValueError";
    if (scenario.expectError) {
      if (pyIsError && jsIsError) {
        console.log("OK (both raised, as expected)");
      } else {
        console.log("FAIL (expected both sides to raise)");
        console.error(`  python raised: ${pyIsError}, js raised: ${jsIsError}`);
        anyFailed = true;
      }
      continue;
    }
    if (pyIsError || jsIsError) {
      console.log("FAIL (unexpected error)");
      if (pyIsError) console.error(`  python: ${pyResult.message}`);
      if (jsIsError) console.error(`  js: ${jsResult.message}`);
      anyFailed = true;
      continue;
    }

    const mismatches = diff("result", pyResult, jsResult);
    if (mismatches.length === 0) {
      console.log("OK");
    } else {
      console.log(`FAIL (${mismatches.length} mismatch(es))`);
      for (const m of mismatches) {
        console.error(`  ${m}`);
      }
      anyFailed = true;
    }
  }

  for (const scenario of TURBOFAN_SCENARIOS) {
    totalScenarios += 1;
    process.stdout.write(`Scenario: ${scenario.name} ... `);
    let pyResult, jsResult;
    try {
      pyResult = runPython(PY_TURBOFAN_SCRIPT, scenario.overrides);
    } catch (err) {
      console.log("FAIL (python error)");
      console.error(err.stderr ? err.stderr.toString() : err);
      anyFailed = true;
      continue;
    }
    try {
      jsResult = runJs(JS_TURBOFAN_SCRIPT, scenario.overrides);
    } catch (err) {
      console.log("FAIL (js error)");
      console.error(err.stderr ? err.stderr.toString() : err);
      anyFailed = true;
      continue;
    }

    const pyIsError = pyResult && pyResult.error === "ValueError";
    const jsIsError = jsResult && jsResult.error === "ValueError";
    if (pyIsError || jsIsError) {
      console.log("FAIL (unexpected error)");
      if (pyIsError) console.error(`  python: ${pyResult.message}`);
      if (jsIsError) console.error(`  js: ${jsResult.message}`);
      anyFailed = true;
      continue;
    }

    const mismatches = diff("result", pyResult, jsResult);
    if (mismatches.length === 0) {
      console.log("OK");
    } else {
      console.log(`FAIL (${mismatches.length} mismatch(es))`);
      for (const m of mismatches) {
        console.error(`  ${m}`);
      }
      anyFailed = true;
    }
  }

  for (const scenario of PROPFAN_SCENARIOS) {
    totalScenarios += 1;
    process.stdout.write(`Scenario: ${scenario.name} ... `);
    let pyResult, jsResult;
    try {
      pyResult = runPython(PY_PROPFAN_SCRIPT, scenario.overrides);
    } catch (err) {
      console.log("FAIL (python error)");
      console.error(err.stderr ? err.stderr.toString() : err);
      anyFailed = true;
      continue;
    }
    try {
      jsResult = runJs(JS_PROPFAN_SCRIPT, scenario.overrides);
    } catch (err) {
      console.log("FAIL (js error)");
      console.error(err.stderr ? err.stderr.toString() : err);
      anyFailed = true;
      continue;
    }

    const pyIsError = pyResult && pyResult.error === "ValueError";
    const jsIsError = jsResult && jsResult.error === "ValueError";
    if (pyIsError || jsIsError) {
      console.log("FAIL (unexpected error)");
      if (pyIsError) console.error(`  python: ${pyResult.message}`);
      if (jsIsError) console.error(`  js: ${jsResult.message}`);
      anyFailed = true;
      continue;
    }

    const mismatches = diff("result", pyResult, jsResult);
    if (mismatches.length === 0) {
      console.log("OK");
    } else {
      console.log(`FAIL (${mismatches.length} mismatch(es))`);
      for (const m of mismatches) {
        console.error(`  ${m}`);
      }
      anyFailed = true;
    }
  }

  for (const [scenarios, pyScript, jsScript] of [
    [SCRAMJET_SCENARIOS, PY_SCRAMJET_SCRIPT, JS_SCRAMJET_SCRIPT],
    [RAMJET_SCENARIOS, PY_RAMJET_SCRIPT, JS_RAMJET_SCRIPT],
    [TURBORAMJET_SCENARIOS, PY_TURBORAMJET_SCRIPT, JS_TURBORAMJET_SCRIPT],
  ]) {
    for (const scenario of scenarios) {
      totalScenarios += 1;
      if (!runSimpleScenario(scenario, pyScript, jsScript)) anyFailed = true;
    }
  }

  if (anyFailed) {
    console.error("\nParity check FAILED — Python and JS off-design/engine solvers disagree on at least one scenario.");
    process.exit(1);
  } else {
    console.log(`\nParity check PASSED — ${totalScenarios} scenario(s), Python and JS agree to rel tol ${REL_TOL}.`);
  }
}

main();

/** One scenario for a single-solver engine (scramjet, ramjet, ...).
 *  Returns true on pass. */
function runSimpleScenario(scenario, pyScript, jsScript) {
  process.stdout.write(`Scenario: ${scenario.name} ... `);
  let pyResult, jsResult;
  try {
    pyResult = runPython(pyScript, scenario.overrides);
    jsResult = runJs(jsScript, scenario.overrides);
  } catch (err) {
    console.log("FAIL (process error)");
    console.error(err.stderr ? err.stderr.toString() : err);
    return false;
  }
  const pyIsError = pyResult && pyResult.error === "ValueError";
  const jsIsError = jsResult && jsResult.error === "ValueError";
  if (scenario.expectError) {
    if (pyIsError && jsIsError) {
      console.log("OK (both raised, as expected)");
      return true;
    }
    console.log("FAIL (expected both sides to raise)");
    console.error(`  python raised: ${pyIsError}, js raised: ${jsIsError}`);
    return false;
  }
  if (pyIsError || jsIsError) {
    console.log("FAIL (unexpected error)");
    if (pyIsError) console.error(`  python: ${pyResult.message}`);
    if (jsIsError) console.error(`  js: ${jsResult.message}`);
    return false;
  }
  const mismatches = diff("result", pyResult, jsResult);
  if (mismatches.length === 0) {
    console.log("OK");
    return true;
  }
  console.log(`FAIL (${mismatches.length} mismatch(es))`);
  for (const m of mismatches) console.error(`  ${m}`);
  return false;
}
