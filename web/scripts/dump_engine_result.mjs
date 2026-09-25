#!/usr/bin/env node
/**
 * Parity-harness helper: solve one EngineConfig-equivalent scenario with
 * the JS engine and print a flat JSON result to stdout.
 *
 * Usage: node scripts/dump_engine_result.mjs '<json-encoded config overrides>'
 *
 * Companion to scripts/dump_engine_result.py, which does the same thing
 * for the Python reference implementation. scripts/parity_check.mjs runs
 * both for a battery of scenarios and diffs the results numerically.
 */

import { makeEngineConfig, solveEngine } from "../src/physics/engine.js";

function flatten(result) {
  const stationsFlat = {};
  for (const [key, st] of Object.entries(result.stations)) {
    stationsFlat[key] = st.asDict();
  }
  return {
    atmosphere: result.atmosphere,
    intake: result.intake,
    compressor: {
      pi_actual: result.compressor.pi_actual,
      T01_out: result.compressor.T01_out,
      p03: result.compressor.p03,
      type: result.compressor.type,
    },
    combustor: result.combustor,
    shaft: result.shaft,
    turbine: {
      pr_actual: result.turbine.pr_actual,
      T01_out: result.turbine.T01_out,
      type: result.turbine.type,
    },
    afterburner: result.afterburner,
    nozzle: result.nozzle,
    performance: result.performance,
    stations: stationsFlat,
  };
}

const argJson = process.argv[2] || "{}";
const overrides = JSON.parse(argJson);
const cfg = makeEngineConfig(overrides);
const result = solveEngine(cfg);
process.stdout.write(JSON.stringify(flatten(result)));
