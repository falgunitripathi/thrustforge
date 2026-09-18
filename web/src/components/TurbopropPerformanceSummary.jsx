import { fmt, fmtPct } from "../utils/format.js";
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
 * Headline turboprop performance numbers — Ref: reference/turboprop.md
 * §2.2, §2.4-2.5. Unlike the turbojet, thrust splits into a propeller
 * share and a residual-jet share, and the conventional performance
 * metrics for this engine family are equivalent shaft horsepower (ESHP)
 * and equivalent specific fuel consumption (ESFC) rather than pure
 * thrust/TSFC — both are shown here, plus TSFC/overall-efficiency for
 * direct comparison with the turbojet's own metrics.
 */
export default function TurbopropPerformanceSummary({ performance, propeller }) {
  const eshpKW = performance.ESHP_W / 1000.0;
  return (
    <div className="performance-summary">
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Total thrust"
          formula="T = Tpr + Tn (§2.2) — propeller thrust plus the residual jet's thrust. Most of it should come from the propeller at a typical 80–90% power split."
        />
        <Stat value={performance.thrust} digits={1} unit="N" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Propeller thrust"
          formula="Tpr = mdot_a·η_Pr·η_g·Wshaft/U (§2.2), with Wshaft = η_mt·(1+f−b)·Δh_t − Δh_c/η_mc the shaft power left over after driving the compressor."
        />
        <Stat value={propeller.Tpr} digits={1} unit="N" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Nozzle (jet) thrust"
          formula="Tn = mdot_a·[(1+f−b)·ue − U] (§2.2) — the residual jet's momentum thrust, from the (1−α) share of the turbine's available enthalpy drop not sent to the shaft."
        />
        <Stat value={propeller.Tn} digits={1} unit="N" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Equivalent shaft power"
          formula="ESHP = shaft power + Tn·U/η_Pr (§2.4, this project's SI form — see aeropropsim/turboprop.py docstring for why the source's imperial constant isn't needed in SI): the residual jet's thrust power, expressed as if it had instead gone through the propeller at the same efficiency, added to the actual shaft power."
        />
        <Stat value={eshpKW} digits={1} unit="kW" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="ESFC"
          formula="ESFC = mdot_f / ESHP (§2.5) — fuel consumption per unit equivalent shaft power. Source's own cited typical value: ~0.272 kg/(kW·hr)."
        />
        <Stat value={performance.ESFC_kg_per_kWh} digits={3} unit="kg/(kW·h)" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="TSFC"
          formula="TSFC = f / (T/mdot_a) — same definition as the turbojet's, using total thrust, for direct comparison."
        />
        <Stat value={performance.tsfc} digits={5} unit="kg/(N·s)" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Fuel-air ratio f"
          formula="same combustor energy balance as the turbojet's (§2.1, aeropropsim/combustor.py)"
        />
        <Stat value={performance.f} digits={4} />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Overall efficiency"
          formula="η_0 = T·U / (mdot_f·Q_R) — the direct definition, applied to TOTAL thrust (propeller + jet combined). This model doesn't decompose it into separate thermal/propulsive terms the way the turbojet's does — a turboprop's propeller and jet streams don't share one clean velocity-ratio formula."
        />
        <span className="perf-value">{performance.eta_overall !== null ? fmtPct(performance.eta_overall, 1) : "—"}</span>
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Power split α"
          formula="alpha_opt = 1 − [U²/(2Δh)]·[η_N/(η_Pr²·η_g²·η_mt²·η_t²)] (§2.2) — the split that would maximize total thrust at THIS flight condition. This solver never auto-selects it; compare against the α you've set in the Propeller section."
        />
        <span className="perf-value perf-value-compact">
          {fmt(performance.alpha, 3)} <small>(optimal {fmt(performance.alpha_opt, 3)})</small>
        </span>
      </div>
    </div>
  );
}
