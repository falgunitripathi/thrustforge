#!/usr/bin/env node
/**
 * Parity-harness helper: solve one RamjetConfig-equivalent scenario with
 * the JS engine and print a flat JSON result to stdout.
 *
 * Usage: node scripts/dump_ramjet_result.mjs '<json-encoded config overrides>'
 *
 * Companion to scripts/dump_ramjet_result.py, which does the same thing
 * for the Python reference implementation. scripts/parity_check.mjs runs
 * both for a battery of scenarios and diffs the results numerically.
 */

import { defaultRamjetConfig, solveRamjet } from "../src/physics/ramjet.js";

function flatten(result) {
  const stationsFlat = {};
  for (const [key, st] of Object.entries(result.stations)) {
    stationsFlat[key] = st.asDict();
  }
  return {
    atmosphere: result.atmosphere,
    intake: result.intake,
    combustor: result.combustor,
    nozzle: result.nozzle,
    performance: result.performance,
    stations: stationsFlat,
  };
}

const argJson = process.argv[2] || "{}";
const overrides = JSON.parse(argJson);
const cfg = { ...defaultRamjetConfig(), ...overrides };
try {
  const result = solveRamjet(cfg);
  process.stdout.write(JSON.stringify(flatten(result)));
} catch (err) {
  process.stdout.write(JSON.stringify({ error: "ValueError", message: err.message }));
}
