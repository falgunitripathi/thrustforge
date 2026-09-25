import { fmt, fmtKPa, tsfcPerHour } from "../utils/format.js";
import { useAnimatedNumber } from "../hooks/useAnimatedNumber.js";
import FormulaLabel from "./FormulaLabel.jsx";

/** A headline number that glides to its new value instead of jumping. */
function Stat({ value, digits = 2, unit }) {
  const shown = useAnimatedNumber(value);
  return (
    <span className="perf-value">
      {fmt(shown, digits)} {unit && <small>{unit}</small>}
    </span>
  );
}

/**
 * Same, formatted as a percentage (value is a 0-1 ratio, or null).
 *
 * The idealized efficiency formulas here (Ref §9) assume the exhaust jet
 * is faster than the flight speed — the normal case for a working engine.
 * Push a fixed-geometry engine well outside its efficient regime (very
 * high flight Mach for its specific thrust, or a fuel-air ratio near
 * zero) and that assumption breaks: the formulas can print above 100% or
 * go negative. That's a real, documented property of the idealized
 * formulas at that operating point — not a random glitch — so rather than
 * silently showing a misleading number, an out-of-[0,100]% value is
 * flagged with a ⚠ and an explanation on hover.
 */
function PctStat({ value }) {
  const shown = useAnimatedNumber(value === null || value === undefined ? NaN : value * 100);
  if (!Number.isFinite(shown)) return <span className="perf-value">—</span>;
  const outOfRange = value < 0 || value > 1;
  return (
    <span className={`perf-value${outOfRange ? " perf-value-flagged" : ""}`}>
      {fmt(shown, 1)}%
      {outOfRange && (
        <span
          className="perf-flag"
          title="Outside the physically meaningful 0-100% range: this flight condition has pushed the idealized efficiency formula past where its assumption (exhaust jet faster than flight speed) holds. Not a random glitch — a sign this configuration is far from its efficient design point at this Mach/altitude/throttle."
        >
          {" "}⚠
        </span>
      )}
    </span>
  );
}

/**
 * The nozzle's choked/unchoked explanation is only meaningful with the
 * actual numbers behind the yes/no comparison (Ref §8: choked iff
 * p_c >= p_a) — a generic "here's the choking rule" wouldn't tell you why
 * *this* configuration landed on one side of it, so it's built fresh from
 * this result's own p_c and ambient pressure rather than a static string.
 */
function nozzleExplanation(nozzle, ambientPressure) {
  const pc = fmtKPa(nozzle.p_c, 1);
  const pa = fmtKPa(ambientPressure, 1);
  if (nozzle.choked) {
    return `Choked: the nozzle's critical (throat) pressure p_c = ${pc} kPa is at or above ambient p_a = ${pa} kPa — p_c ≥ p_a — so the flow is already sonic (M=1) at the throat and can't be pulled any faster by the ambient pressure drop alone. Exit temperature/velocity come from the choked-flow relations (T_exit = T0/[(γ_h+1)/2], V_exit = √(γ_h·R_h·T_exit)), and the exit stays above ambient pressure, which is why Thrust above includes a nonzero (p_exit−p_a)·A_exit term.`;
  }
  return `Unchoked (fully expanded): the nozzle's critical (throat) pressure p_c = ${pc} kPa is below ambient p_a = ${pa} kPa — p_c < p_a — so the flow never reaches sonic (M=1); it expands all the way down to ambient pressure instead, p_exit = p_a by construction. That's why Thrust above has no pressure term for this configuration — only the momentum term contributes.`;
}

/**
 * Headline overall-performance numbers — Ref §9 (Overall Performance).
 * `performance` is `EngineResult.performance` (thrust, specific_thrust,
 * tsfc, eta_thermal, eta_propulsive, eta_overall, f). `ambientPressure` is
 * this result's station-a static pressure (p_a), needed only to explain
 * the nozzle's choked/unchoked verdict in plain numbers.
 */
export default function PerformanceSummary({ performance, nozzle, ambientPressure }) {
  const tsfcHr = tsfcPerHour(performance.tsfc);
  const abOn = performance.f_ab > 0;
  const anyFlagged = [performance.eta_thermal, performance.eta_propulsive, performance.eta_overall].some(
    (v) => v !== null && v !== undefined && (v < 0 || v > 1)
  );
  return (
    <div className="performance-summary">
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Thrust"
          formula="T = mdot_a·[(1+f+f_ab)·V_exit − V_flight] + (p_exit − p_a)·A_exit (Ref §8/§9). f_ab = afterburner fuel-air ratio (0 with the afterburner off). The pressure term is zero except when the nozzle is choked (or, for a C-D nozzle, off-design)."
        />
        <Stat value={performance.thrust} digits={1} unit="N" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Specific thrust"
          formula="T/mdot_a = [(1+f+f_ab)·V_exit − V_flight] + (A_exit/mdot_a)·(p_exit − p_a) (Ref §9) — thrust per unit air mass flow rate, independent of mdot_a by definition. Change mdot_a on the left and plain Thrust scales with it; this and TSFC don't, on purpose."
        />
        <Stat value={performance.specific_thrust} digits={2} unit="N·s/kg" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="TSFC"
          formula="TSFC = Thrust-Specific Fuel Consumption. TSFC = (f + f_ab) / (T/mdot_a) (Ref §9), counting the afterburner's fuel too — fuel consumption per unit thrust, also independent of mdot_a by definition, same reason as specific thrust."
        />
        <Stat value={tsfcHr} digits={3} unit="kg/(N·h)" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Fuel-air ratio f"
          formula="f = [(Cp_h/Cp_c)(T04/T03) − 1] / [(η_b·Q_R)/(Cp_c·T03) − (Cp_h/Cp_c)(T04/T03)] (Ref §5) — the combustor's energy balance, solved for the fuel-air ratio f."
        />
        <Stat value={performance.f} digits={4} />
      </div>
      {abOn && (
        <div className="perf-card">
          <FormulaLabel
            className="perf-label"
            label="Afterburner fuel f_ab"
            formula="f_ab = (1+f)·(Cp_h·T06A − Cp_h·T05) / (η_b·Q_R − Cp_h·T06A) — the extra fuel burned in the afterburner per kg of air, from its energy balance (1+f)·Cp·T05 + η_b·f_ab·Q_R = (1+f+f_ab)·Cp·T06A."
          />
          <Stat value={performance.f_ab} digits={4} />
        </div>
      )}
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Thermal efficiency"
          formula="η_th = [(1+f+f_ab)·V_exit²/2 − V_flight²/2] / ((f+f_ab)·Q_R) (Ref §9) — propulsive-jet kinetic energy gained per unit fuel energy released."
        />
        <PctStat value={performance.eta_thermal} />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Propulsive efficiency"
          formula="η_p = 2·(V_flight/V_exit) / (1 + V_flight/V_exit) (Ref §9) — how much of the jet's kinetic energy converts to useful propulsive work. η_p → 1 as V_flight → V_exit, but thrust → 0 there too."
        />
        <PctStat value={performance.eta_propulsive} />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Overall efficiency"
          formula="η_0 = η_th · η_p (Ref §9), cross-checked internally against the direct definition η_0 = T·V_flight / (mdot_f·Q_R) — both should agree."
        />
        <PctStat value={performance.eta_overall} />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Nozzle"
          formula={nozzleExplanation(nozzle, ambientPressure)}
        />
        <span className="perf-value">{nozzle.choked ? "Choked" : "Unchoked (fully expanded)"}</span>
      </div>
      {anyFlagged && (
        <p className="section-note perf-flag-note">
          ⚠ An efficiency above is outside the physically meaningful 0-100%
          range. That&rsquo;s this configuration&rsquo;s idealized formulas
          breaking down at this flight condition — usually very
          high Mach relative to this engine&rsquo;s specific thrust, or a
          fuel-air ratio near zero — not a calculation error. Hover the ⚠
          for details.
        </p>
      )}
    </div>
  );
}
