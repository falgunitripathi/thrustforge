#!/usr/bin/env node
/**
 * Parity-harness helper: solve one TwinSpoolTurbojetConfig-equivalent scenario
 * with the JS engine and print a flat JSON result to stdout.
 *
 * Usage: node scripts/dump_ramjet_result.mjs '<json-encoded config overrides>'
 */

import { defaultTwinSpoolTurbojetConfig, solveTwinSpoolTurbojet } from "../src/physics/twinSpoolTurbojet.js";

function flatten(result) {
  const stations = {};
  for (const [key, st] of Object.entries(result.stations)) stations[key] = st.asDict();
  return {
    atmosphere: result.atmosphere,
    intake: result.intake,
    lpc: result.lpc, hpc: result.hpc,
    combustor: result.combustor,
    hpt: result.hpt, lpt: result.lpt,
    afterburner: result.afterburner,
    nozzle: result.nozzle,
    performance: result.performance,
    stations,
  };
}

const overrides = JSON.parse(process.argv[2] || "{}");
const cfg = { ...defaultTwinSpoolTurbojetConfig(), ...overrides };
try {
  process.stdout.write(JSON.stringify(flatten(solveTwinSpoolTurbojet(cfg))));
} catch (err) {
  process.stdout.write(JSON.stringify({ error: "ValueError", message: err.message }));
}
