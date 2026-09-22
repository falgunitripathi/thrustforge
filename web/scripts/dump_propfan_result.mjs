#!/usr/bin/env node
/**
 * Parity-harness helper: solve one PropfanConfig-equivalent scenario
 * with the JS engine and print a flat JSON result to stdout.
 *
 * Usage: node scripts/dump_propfan_result.mjs '<json-encoded config overrides>'
 */

import { defaultPropfanConfig, solvePropfan } from "../src/physics/propfan.js";

function flatten(result) {
  const stationsFlat = {};
  for (const [key, st] of Object.entries(result.stations)) {
    stationsFlat[key] = st.asDict();
  }
  return {
    atmosphere: result.atmosphere,
    intake: result.intake,
    ipc: result.ipc,
    hpc: result.hpc,
    combustor: result.combustor,
    hpt: result.hpt,
    ipt: result.ipt,
    fan: result.fan,
    free_turbine: result.free_turbine,
    hot_nozzle: result.hot_nozzle,
    performance: result.performance,
    stations: stationsFlat,
  };
}

const argJson = process.argv[2] || "{}";
const overrides = JSON.parse(argJson);
const cfg = { ...defaultPropfanConfig(), ...overrides };
try {
  const result = solvePropfan(cfg);
  process.stdout.write(JSON.stringify(flatten(result)));
} catch (err) {
  process.stdout.write(JSON.stringify({ error: "ValueError", message: err.message }));
}
