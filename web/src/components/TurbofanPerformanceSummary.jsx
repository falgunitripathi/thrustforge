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
 * Headline turbofan performance numbers — Ref: reference/turbofan.md
 * §3. Thrust splits into a hot (core) stream and a cold (bypass)
 * stream, each computed by the same nozzle.thrust() formula the
 * turbojet uses (aeropropsim/turbofan.py reuses it directly for both).
 * No separate thermal/propulsive efficiency breakdown is shown — the
 * source never gives one for the two-stream case (reference/
 * turbofan.md judgment call #4) — only the direct overall-efficiency
 * definition, same resolution used for the turboprop.
 */
export default function TurbofanPerformanceSummary({ performance, hotNozzle, coldNozzle }) {
  return (
    <div className="performance-summary">
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Total thrust"
          formula="T = T_hot + T_cold (§3) — the core (hot) stream's thrust plus the bypass (cold) stream's, each from the same nozzle-thrust formula the turbojet uses."
        />
        <Stat value={performance.thrust} digits={1} unit="N" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Hot-stream thrust"
          formula="T_hot = mdot_a·[(1+f)·V9 − U] + A9·(p9−p_a) (§3) — the core stream, through the combustor/turbines/hot nozzle, exactly like the turbojet's own thrust formula."
        />
        <Stat value={performance.thrust_hot} digits={1} unit="N" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Cold-stream thrust"
          formula="T_cold = β·mdot_a·[V11 − U] + A11·(p11−p_a) (§3) — the bypass stream, accelerated only by the fan, no combustion."
        />
        <Stat value={performance.thrust_cold} digits={1} unit="N" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="TSFC"
          formula="TSFC = Thrust-Specific Fuel Consumption. TSFC = f / (T/mdot_a) (§3) — same definition as the turbojet's, using total thrust and core-stream fuel-air ratio."
        />
        <Stat value={performance.tsfc} digits={6} unit="kg/(N·s)" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Fuel-air ratio f"
          formula="same combustor energy balance as the turbojet's — only the core stream carries fuel"
        />
        <Stat value={performance.f} digits={4} />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Overall efficiency"
          formula="η_0 = T·U / (mdot_f·Q_R) — the direct definition, applied to TOTAL thrust (hot + cold combined). The source never gives a decomposed thermal/propulsive split for the two-stream case (reference/turbofan.md judgment call #4)."
        />
        <span className="perf-value">{performance.eta_overall !== null ? fmtPct(performance.eta_overall, 1) : "—"}</span>
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Bypass ratio β"
          formula="β = mdot_cold/mdot_hot (§2) — you set this in the Fan / bypass section."
        />
        <span className="perf-value">{fmt(performance.beta, 2)}</span>
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Hot nozzle"
          formula="Same choking check as the turbojet's nozzle, using the hot-gas properties."
        />
        <span className="perf-value">{hotNozzle.choked ? "Choked" : "Unchoked"}</span>
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Cold (fan) nozzle"
          formula="Same choking check as the hot nozzle, but with cold-side (γ_c, Cp_c) properties — the fan nozzle chokes at a different pressure ratio than the hot nozzle."
        />
        <span className="perf-value">{coldNozzle.choked ? "Choked" : "Unchoked"}</span>
      </div>
    </div>
  );
}
