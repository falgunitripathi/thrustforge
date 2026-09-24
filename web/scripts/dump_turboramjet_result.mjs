#!/usr/bin/env node
/**
 * Parity-harness helper: solve one TurboramjetConfig-equivalent scenario
 * with the JS engine and print a flat JSON result to stdout.
 *
 * Usage: node scripts/dump_ramjet_result.mjs '<json-encoded config overrides>'
 */

import { defaultTurboramjetConfig, solveTurboramjet } from "../src/physics/turboramjet.js";

function flatten(result) {
  const stations = {};
  for (const [key, st] of Object.entries(result.stations)) stations[key] = st.asDict();
  return {
    mode_active: result.mode_active,
    atmosphere: result.atmosphere,
    turbojet: result.turbojet,
    ramjet: result.ramjet,
    performance: result.performance,
    stations,
  };
}

const overrides = JSON.parse(process.argv[2] || "{}");
const cfg = { ...defaultTurboramjetConfig(), ...overrides };
try {
  process.stdout.write(JSON.stringify(flatten(solveTurboramjet(cfg))));
} catch (err) {
  process.stdout.write(JSON.stringify({ error: "ValueError", message: err.message }));
}
