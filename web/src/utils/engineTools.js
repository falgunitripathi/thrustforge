/**
 * Per-engine setup for the shared design tools (parameter sweep and
 * save & compare) — what each engine can sweep, over what range, and
 * which of its inputs identify a saved design. Ranges stay inside each
 * input's own limits on the engine's form. The single-spool turbojet
 * keeps its original lists (sweepParams.js / ConfigCompare's defaults).
 */
import { fmt } from "./format.js";

const p = (key, label, unit, min, max, defaultMin, defaultMax, rangeStep, axisDecimals) => ({
  key, label, unit, min, max, defaultMin, defaultMax, rangeStep, axisDecimals,
});
const altitude = p("altitude_m", "Altitude", "m", 0, 11000, 0, 11000, 100, 0);
const mach = (min, max, dMin, dMax) => p("mach_flight", "Flight Mach number", "M", min, max, dMin, dMax, 0.05, 2);

const col = (key, label, digits = 1, suffix = "") => ({
  label,
  get: (cfg) => (cfg[key] === undefined ? "—" : `${fmt(cfg[key], digits)}${suffix}`),
  csv: (cfg) => cfg[key],
});
const afterburner = (key) => ({
  label: "Afterburner",
  get: (cfg) => (cfg.afterburner_on ? `on, ${fmt(cfg[key], 0)} K` : "off"),
  csv: (cfg) => (cfg.afterburner_on ? cfg[key] : "off"),
});

const TURBOFAN_TOOLS = {
  params: (cfg) => [
    altitude,
    mach(0, 2, 0, 1.5),
    ...(cfg.layout === "mixed" ? [] : [p("beta", "Bypass ratio β", "β", 0.5, 15, 2, 12, 0.5, 1)]),
    cfg.layout === "mixed"
      ? p("pi_f", "Fan pressure ratio π_f", "π_f", 1.1, 6, 2, 5, 0.1, 2)
      : p("pi_f", "Fan pressure ratio π_f", "π_f", 1.1, 3, 1.2, 2.2, 0.05, 2),
    p("pi_HPC", "HPC pressure ratio π_HPC", "π_HPC", 2, 25, 6, 20, 0.5, 1),
    p("T05", "Turbine inlet temperature T05", "K", 1000, 2000, 1200, 1800, 25, 0),
  ],
  columns: [
    { label: "Layout", get: (cfg) => cfg.layout, csv: (cfg) => cfg.layout },
    { label: "β", get: (cfg, r) => fmt(r.mixer?.beta ?? cfg.beta, 2), csv: (cfg, r) => r.mixer?.beta ?? cfg.beta },
    col("pi_f", "π_f", 2), col("pi_LPC", "π_LPC", 2), col("pi_HPC", "π_HPC", 1), col("T05", "T05 (K)", 0),
    afterburner("T08_ab"),
  ],
};

export const ENGINE_TOOLS = {
  turbojet2: {
    params: () => [
      altitude, mach(0, 3, 0, 2),
      p("pi_LPC", "LP compressor pressure ratio π_LPC", "π_LPC", 1.2, 8, 2, 6, 0.1, 1),
      p("pi_HPC", "HP compressor pressure ratio π_HPC", "π_HPC", 1.2, 10, 2, 6, 0.1, 1),
      p("T05", "Turbine inlet temperature T05", "K", 900, 2000, 1100, 1700, 25, 0),
    ],
    columns: [col("pi_LPC", "π_LPC"), col("pi_HPC", "π_HPC"), col("T05", "T05 (K)", 0), afterburner("T08_ab")],
  },
  turboprop: {
    params: () => [
      altitude, mach(0.05, 0.8, 0.1, 0.7),
      p("pi_c", "Compressor pressure ratio π_c", "π_c", 1.01, 40, 4, 20, 0.5, 1),
      p("T04", "Turbine inlet temperature T04", "K", 800, 2200, 1000, 1600, 25, 0),
      p("alpha", "Power split α", "α", 0.5, 0.98, 0.6, 0.95, 0.01, 2),
    ],
    columns: [col("pi_c", "π_c"), col("T04", "T04 (K)", 0), col("alpha", "α", 2)],
  },
  turboshaft: {
    power: true,
    params: () => [
      altitude, mach(0, 0.6, 0, 0.5),
      p("pi_c", "Compressor pressure ratio π_c", "π_c", 1.01, 40, 4, 20, 0.5, 1),
      p("T04", "Turbine inlet temperature T04", "K", 800, 2200, 1000, 1600, 25, 0),
    ],
    columns: [col("pi_c", "π_c"), col("T04", "T04 (K)", 0)],
  },
  turbofan: TURBOFAN_TOOLS,
  propfan: {
    params: () => [
      altitude, mach(0, 0.9, 0.3, 0.85),
      p("pi_IPC", "IPC pressure ratio π_IPC", "π_IPC", 1, 5, 1.5, 4, 0.1, 1),
      p("pi_HPC", "HPC pressure ratio π_HPC", "π_HPC", 2, 25, 4, 15, 0.5, 1),
      p("T05", "Turbine inlet temperature T05", "K", 1000, 2000, 1200, 1800, 25, 0),
      p("pi_UDF", "Unducted fan pressure ratio π_UDF", "π_UDF", 1.02, 2, 1.05, 1.5, 0.01, 2),
      p("alpha", "Power split α", "α", 0.5, 1, 0.6, 0.95, 0.01, 2),
    ],
    columns: [col("pi_IPC", "π_IPC"), col("pi_HPC", "π_HPC"), col("T05", "T05 (K)", 0), col("pi_UDF", "π_UDF", 2), col("alpha", "α", 2)],
  },
  turboramjet: {
    params: () => [
      altitude, mach(0, 5, 0, 4.5),
      p("pi_c", "Compressor pressure ratio π_c", "π_c", 1.5, 30, 3, 16, 0.5, 1),
      p("T04", "Turbine inlet temperature T04", "K", 900, 2000, 1100, 1700, 25, 0),
      p("T09", "Ramjet combustor exit temperature T09", "K", 1000, 2400, 1400, 2200, 25, 0),
      p("mach_switch", "Switch Mach number", "M", 1, 4, 1.5, 4, 0.1, 1),
    ],
    columns: [
      { label: "Mode", get: (cfg) => cfg.mode, csv: (cfg) => cfg.mode },
      col("pi_c", "π_c"), col("T04", "T04 (K)", 0), col("T09", "T09 (K)", 0), afterburner("T06_ab"),
    ],
  },
  ramjet: {
    params: () => [
      altitude, mach(0.3, 6, 1, 5),
      p("T04", "Combustor exit temperature T04", "K", 1000, 2400, 1400, 2300, 25, 0),
    ],
    columns: [col("T04", "T04 (K)", 0), { label: "Nozzle", get: (cfg) => cfg.nozzle_type, csv: (cfg) => cfg.nozzle_type }],
  },
  scramjet: {
    params: () => [
      altitude, mach(3, 12, 5, 10),
      p("f", "Fuel-air ratio f", "f", 0.001, 0.08, 0.005, 0.03, 0.001, 3),
      p("mach_combustor_inlet", "Combustor-entrance Mach M2", "M2", 1.05, 6, 1.5, 4, 0.05, 2),
    ],
    columns: [col("mach_combustor_inlet", "M2", 2), col("f", "f", 3)],
  },
};
