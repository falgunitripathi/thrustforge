#!/usr/bin/env node
/**
 * Parity-harness helper: solve one ScramjetConfig-equivalent scenario
 * with the JS engine and print a flat JSON result to stdout.
 *
 * Usage: node scripts/dump_scramjet_result.mjs '<json-encoded config overrides>'
 */

import { defaultScramjetConfig, solveScramjet } from "../src/physics/scramjet.js";

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
const cfg = { ...defaultScramjetConfig(), ...overrides };
try {
  process.stdout.write(JSON.stringify(flatten(solveScramjet(cfg))));
} catch (err) {
  process.stdout.write(JSON.stringify({ error: "ValueError", message: err.message }));
}
