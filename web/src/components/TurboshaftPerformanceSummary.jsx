import { fmt } from "../utils/format.js";
import { useAnimatedNumber } from "../hooks/useAnimatedNumber.js";
import FormulaLabel from "./FormulaLabel.jsx";

function Stat({ value, digits = 2, unit }) {
  const shown = useAnimatedNumber(value);
  return (
    <span className="perf-value">
      {fmt(shown, digits)} {unit && <small>{unit}</small>}
    </span>
  );
}

/**
 * Headline turboshaft performance numbers — Ref: reference/turboshaft.md
 * §2.1. A turboshaft has no thrust at all: the turbine expands fully to
 * ambient and every bit of that work goes to an output shaft, so
 * performance is reported in load power delivered and specific fuel
 * consumption referenced to that power — no thrust/TSFC cards here,
 * unlike the turbojet/turboprop.
 */
export default function TurboshaftPerformanceSummary({ shaft, performance }) {
  const ploadKW = performance.Pload_W / 1000.0;
  return (
    <div className="performance-summary">
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Load power"
          formula="Pload = mdot_a·η_m·Wshaft (§2.1) — the actual power delivered to the external load (rotor, generator, ...), after mechanical losses between the shaft and the load."
        />
        <Stat value={ploadKW} digits={1} unit="kW" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="SFC"
          formula="SFC = Specific Fuel Consumption — fuel burned per unit of load power delivered. SFC = mdot_f / Pload — fuel consumption per unit load power. Not spelled out explicitly for the turboshaft in the source; inferred by analogy to the turboprop's ESFC (reference/turboshaft.md §4, item 4)."
        />
        <Stat value={performance.SFC_kg_per_kWh} digits={3} unit="kg/(kW·h)" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Shaft power (before load losses)"
          formula="Wshaft = (1+f−b)·η_mt·Wt − Wc/η_mc (§2.1) — the power available past the compressor's own draw, before the load-drive's own mechanical losses (η_m) are applied to get Load power."
        />
        <Stat value={shaft.Wshaft / 1000.0} digits={1} unit="kJ/kg" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Turbine specific work"
          formula="Wt = η_t·Cp_h·(T04−T05s) (this project's inferred derivation — see aeropropsim/turboshaft.py module docstring — since the source states Wshaft in terms of Wt without spelling out Wt's own formula)."
        />
        <Stat value={shaft.Wt / 1000.0} digits={1} unit="kJ/kg" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Compressor specific work"
          formula="Wc = Cp_c·(T03−T02) — same formula as the turbojet's/turboprop's compressor work."
        />
        <Stat value={shaft.Wc / 1000.0} digits={1} unit="kJ/kg" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Fuel-air ratio f"
          formula="same combustor energy balance as the turbojet's"
        />
        <Stat value={performance.f} digits={4} />
      </div>
    </div>
  );
}
