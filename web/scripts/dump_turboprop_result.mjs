#!/usr/bin/env node
/**
 * Parity-harness helper: solve one TurbopropConfig-equivalent scenario
 * with the JS engine and print a flat JSON result to stdout.
 *
 * Usage: node scripts/dump_turboprop_result.mjs '<json-encoded config overrides>'
 */

import { defaultTurbopropConfig, solveTurboprop } from "../src/physics/turboprop.js";

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
    turbine: {
      pr_actual: result.turbine.pr_actual,
      T01_out: result.turbine.T01_out,
      type: result.turbine.type,
    },
    nozzle: result.nozzle,
    propeller: result.propeller,
    performance: result.performance,
    stations: stationsFlat,
  };
}

const argJson = process.argv[2] || "{}";
const overrides = JSON.parse(argJson);
const cfg = { ...defaultTurbopropConfig(), ...overrides };
try {
  const result = solveTurboprop(cfg);
  process.stdout.write(JSON.stringify(flatten(result)));
} catch (err) {
  process.stdout.write(JSON.stringify({ error: "ValueError", message: err.message }));
}
