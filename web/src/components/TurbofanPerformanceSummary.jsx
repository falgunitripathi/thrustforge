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
export default function TurbofanPerformanceSummary({ performance, hotNozzle, coldNozzle, layout = "unmixed" }) {
  const mixed = layout === "mixed";
  return (
    <div className="performance-summary">
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Total thrust"
          formula={mixed
            ? "T = mdot_a·[(1+β+f)·(1+f_ab)·V9 − (1+β)·U] + A9·(p9−p_a) (§5-6) — the whole mixed stream (core gas plus bypass air, plus any afterburner fuel) leaving one nozzle, minus the momentum of all the air swallowed."
            : "T = T_hot + T_cold (§3) — the core (hot) stream's thrust plus the bypass (cold) stream's, each from the same nozzle-thrust formula the turbojet uses."}
        />
        <Stat value={performance.thrust} digits={1} unit="N" />
      </div>
      {!mixed && <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Hot-stream thrust"
          formula="T_hot = mdot_a·[(1+f)·V9 − U] + A9·(p9−p_a) (§3) — the core stream, through the combustor/turbines/hot nozzle, exactly like the turbojet's own thrust formula."
        />
        <Stat value={performance.thrust_hot} digits={1} unit="N" />
      </div>}
      {!mixed && <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Cold-stream thrust"
          formula="T_cold = β·mdot_a·[V11 − U] + A11·(p11−p_a) (§3) — the bypass stream, accelerated only by the fan, no combustion."
        />
        <Stat value={performance.thrust_cold} digits={1} unit="N" />
      </div>}
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="TSFC"
          formula="TSFC = Thrust-Specific Fuel Consumption. TSFC = (f + f_ab) / (T/mdot_a) (§3) — same definition as the turbojet's, using total thrust and all the core-stream fuel (f_ab = afterburner fuel, 0 when it's off)."
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
      {performance.f_ab > 0 && (
        <div className="perf-card">
          <FormulaLabel
            className="perf-label"
            label="Afterburner fuel f_ab"
            formula={mixed
              ? "f_ab = (Cp·T011 − Cp8·T08) / (η_b·Q_R − Cp·T011) (§6) — extra fuel burned after the mixer, per kg of mixed gas. TSFC above counts it: fuel per kg of core air = f + f_ab·(1+β+f)."
              : "f_ab = (1+f)·(Cp_h·T08A − Cp_h·T07) / (η_b·Q_R − Cp_h·T08A) — extra fuel burned in the core-stream afterburner per kg of core air, from its energy balance. TSFC above counts it: TSFC = (f + f_ab)/(T/mdot_a)."}
          />
          <Stat value={performance.f_ab} digits={4} />
        </div>
      )}
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
          label={mixed ? "Bypass ratio β (solved)" : "Bypass ratio β"}
          formula={mixed
            ? "In a mixed-flow turbofan the bypass air and the core gas must meet at the mixer at the same pressure, p03′ = p07 (§5). With the fan pressure ratio set, that fixes how much air can bypass the core, so β is solved, not chosen."
            : "β = mdot_cold/mdot_hot (§2) — you set this in the Fan / bypass section."}
        />
        <span className="perf-value">{fmt(performance.beta, mixed ? 3 : 2)}</span>
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label={mixed ? "Nozzle (mixed stream)" : "Hot nozzle"}
          formula="Same choking check as the turbojet's nozzle, using the hot-gas properties."
        />
        <span className="perf-value">{hotNozzle.choked ? "Choked" : "Unchoked"}</span>
      </div>
      {!mixed && <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Cold (fan) nozzle"
          formula="Same choking check as the hot nozzle, but with cold-side (γ_c, Cp_c) properties — the fan nozzle chokes at a different pressure ratio than the hot nozzle."
        />
        <span className="perf-value">{coldNozzle.choked ? "Choked" : "Unchoked"}</span>
      </div>}
    </div>
  );
}
