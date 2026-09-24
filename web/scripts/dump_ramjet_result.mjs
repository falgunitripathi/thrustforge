#!/usr/bin/env node
/**
 * Parity-harness helper: solve one RamjetConfig-equivalent scenario
 * with the JS engine and print a flat JSON result to stdout.
 *
 * Usage: node scripts/dump_ramjet_result.mjs '<json-encoded config overrides>'
 */

import { defaultRamjetConfig, solveRamjet } from "../src/physics/ramjet.js";

function flatten(result) {
  const stations = {};
  for (const [key, st] of Object.entries(result.stations)) stations[key] = st.asDict();
  return {
    atmosphere: result.atmosphere,
    intake: result.intake,
    combustor: result.combustor,
    nozzle: result.nozzle,
    performance: result.performance,
    stations,
  };
}

const overrides = JSON.parse(process.argv[2] || "{}");
const cfg = { ...defaultRamjetConfig(), ...overrides };
try {
  process.stdout.write(JSON.stringify(flatten(solveRamjet(cfg))));
} catch (err) {
  process.stdout.write(JSON.stringify({ error: "ValueError", message: err.message }));
}
