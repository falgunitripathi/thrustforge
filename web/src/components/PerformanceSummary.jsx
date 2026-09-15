import { fmt, tsfcPerHour } from "../utils/format.js";
import { useAnimatedNumber } from "../hooks/useAnimatedNumber.js";

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
          title="Outside the physically meaningful 0-100% range: this flight condition has pushed the idealized efficiency formula (Ref §9) past where its assumption (exhaust jet faster than flight speed) holds. Not a random glitch — a sign this configuration is far from its efficient design point at this Mach/altitude/throttle."
        >
          {" "}⚠
        </span>
      )}
    </span>
  );
}

/**
 * Headline overall-performance numbers — Ref §9 (Overall Performance).
 * `performance` is `EngineResult.performance` (thrust, specific_thrust,
 * tsfc, eta_thermal, eta_propulsive, eta_overall, f).
 */
export default function PerformanceSummary({ performance, nozzle }) {
  const tsfcHr = tsfcPerHour(performance.tsfc);
  const anyFlagged = [performance.eta_thermal, performance.eta_propulsive, performance.eta_overall].some(
    (v) => v !== null && v !== undefined && (v < 0 || v > 1)
  );
  return (
    <div className="performance-summary">
      <div className="perf-card">
        <span
          className="perf-label"
          title="T = mdot_a·[(1+f)·V_exit − V_flight] + (p_exit − p_a)·A_exit (Ref §8/§9). The pressure term is zero except when the nozzle is choked (or, for a C-D nozzle, off-design)."
        >
          Thrust
        </span>
        <Stat value={performance.thrust} digits={1} unit="N" />
      </div>
      <div className="perf-card">
        <span
          className="perf-label"
          title="T/mdot_a = [(1+f)·V_exit − V_flight] + (A_exit/mdot_a)·(p_exit − p_a) (Ref §9) — thrust per unit air mass flow rate, independent of mdot_a by definition. Change mdot_a on the left and plain Thrust scales with it; this and TSFC don't, on purpose."
        >
          Specific thrust
        </span>
        <Stat value={performance.specific_thrust} digits={2} unit="N·s/kg" />
      </div>
      <div className="perf-card">
        <span
          className="perf-label"
          title="TSFC = f / (T/mdot_a) (Ref §9) — fuel consumption per unit thrust, also independent of mdot_a by definition, same reason as specific thrust."
        >
          TSFC
        </span>
        <Stat value={tsfcHr} digits={3} unit="kg/(N·h)" />
      </div>
      <div className="perf-card">
        <span
          className="perf-label"
          title="Combustor energy balance solved for f (Ref §5): f = [(Cp_h/Cp_c)(T04/T03) − 1] / [(η_b·Q_R)/(Cp_c·T03) − (Cp_h/Cp_c)(T04/T03)]"
        >
          Fuel-air ratio f
        </span>
        <Stat value={performance.f} digits={4} />
      </div>
      <div className="perf-card">
        <span
          className="perf-label"
          title="η_th = [(1+f)·V_exit²/2 − V_flight²/2] / (f·Q_R) (Ref §9) — propulsive-jet kinetic energy gained per unit fuel energy released."
        >
          Thermal efficiency
        </span>
        <PctStat value={performance.eta_thermal} />
      </div>
      <div className="perf-card">
        <span
          className="perf-label"
          title="η_p = 2·(V_flight/V_exit) / (1 + V_flight/V_exit) (Ref §9) — how much of the jet's kinetic energy converts to useful propulsive work. η_p → 1 as V_flight → V_exit, but thrust → 0 there too."
        >
          Propulsive efficiency
        </span>
        <PctStat value={performance.eta_propulsive} />
      </div>
      <div className="perf-card">
        <span
          className="perf-label"
          title="η_0 = η_th · η_p (Ref §9), cross-checked internally against the direct definition η_0 = T·V_flight / (mdot_f·Q_R) — both should agree."
        >
          Overall efficiency
        </span>
        <PctStat value={performance.eta_overall} />
      </div>
      <div className="perf-card">
        <span className="perf-label">Nozzle</span>
        <span className="perf-value">{nozzle.choked ? "Choked" : "Unchoked (fully expanded)"}</span>
      </div>
      {anyFlagged && (
        <p className="section-note perf-flag-note">
          ⚠ An efficiency above is outside the physically meaningful 0-100%
          range. That&rsquo;s this configuration&rsquo;s idealized formulas
          (Ref §9) breaking down at this flight condition — usually very
          high Mach relative to this engine&rsquo;s specific thrust, or a
          fuel-air ratio near zero — not a calculation error. Hover the ⚠
          for details.
        </p>
      )}
    </div>
  );
}
