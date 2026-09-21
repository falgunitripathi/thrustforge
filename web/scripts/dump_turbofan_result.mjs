#!/usr/bin/env node
/**
 * Parity-harness helper: solve one TurbofanConfig-equivalent scenario
 * with the JS engine and print a flat JSON result to stdout.
 *
 * Usage: node scripts/dump_turbofan_result.mjs '<json-encoded config overrides>'
 */

import { defaultTurbofanConfig, solveTurbofan } from "../src/physics/turbofan.js";

function flatten(result) {
  const stationsFlat = {};
  for (const [key, st] of Object.entries(result.stations)) {
    stationsFlat[key] = st.asDict();
  }
  return {
    atmosphere: result.atmosphere,
    intake: result.intake,
    fan: result.fan,
    lpc: result.lpc,
    hpc: result.hpc,
    combustor: result.combustor,
    hpt: result.hpt,
    lpt: result.lpt,
    hot_nozzle: result.hot_nozzle,
    cold_nozzle: result.cold_nozzle,
    performance: result.performance,
    stations: stationsFlat,
  };
}

const argJson = process.argv[2] || "{}";
const overrides = JSON.parse(argJson);
const cfg = { ...defaultTurbofanConfig(), ...overrides };
try {
  const result = solveTurbofan(cfg);
  process.stdout.write(JSON.stringify(flatten(result)));
} catch (err) {
  process.stdout.write(JSON.stringify({ error: "ValueError", message: err.message }));
}
