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
 * Headline propfan performance numbers — Ref: reference/propfan.md
 * §2.4-2.5. Thrust splits into the fan (unducted, freestream-fed) stream
 * and the hot-nozzle (gas-generator residual) stream, each computed
 * differently: the fan from its own pressure-ratio/exit-velocity cycle,
 * the hot nozzle from the same style of nozzle-thrust formula the
 * turbojet uses. Unlike the turbofan, the source DOES give a two-stream
 * propulsive efficiency formula here (§2.5) — shown directly, alongside
 * the overall efficiency, rather than omitted the way turbofan's
 * PerformanceSummary omits a thermal/propulsive split (see that file's
 * own judgment-call note).
 */
export default function PropfanPerformanceSummary({ performance, hotNozzle }) {
  return (
    <div className="performance-summary">
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Total thrust"
          formula="T_total = T_UDF + Tn (§2.4) — the unducted fan's thrust plus the hot nozzle's residual jet thrust."
        />
        <Stat value={performance.thrust} digits={1} unit="N" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Fan thrust"
          formula="T_UDF = β·mdot_a·[(ue)_UDF − U] (§2.4) — the unducted fan's own thrust, from its solved power-split fraction β and exit velocity."
        />
        <Stat value={performance.thrust_fan} digits={1} unit="N" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Hot-nozzle thrust"
          formula="Tn = mdot_a·[(1+f−b)·(ue)_n − U] (§2.3) — the gas generator's residual jet, fully expanded to ambient, same style of nozzle-thrust formula as the turbojet's."
        />
        <Stat value={performance.thrust_nozzle} digits={1} unit="N" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="TSFC"
          formula="TSFC = Thrust-Specific Fuel Consumption. TSFC = f / (T_total/mdot_a) (§2.4) — same definition as the turbojet's, using total thrust and the gas generator's own fuel-air ratio."
        />
        <Stat value={performance.tsfc} digits={6} unit="kg/(N·s)" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Fuel-air ratio f"
          formula="f = (1−b)·(Cph·T05 − Cpc·T04)/(η_b·Q_R − Cph·T05) (§2.1) — only the gas-generator core carries fuel; the fan is unfuelled."
        />
        <Stat value={performance.f} digits={4} />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Propulsive efficiency"
          formula="η_P = T_total·U / (T_total·U + 0.5·mdot_a·[((ue)_n−U)² + β·((ue)_UDF−U)²]) (§2.5) — a two-stream Froude-type definition. The source's own symbol here is ambiguous (bare 'T', 'u_UDF') — read as T_total and (ue)_UDF respectively (reference/propfan.md §4, judgment call #2)."
        />
        <span className="perf-value">{performance.eta_propulsive !== null ? fmtPct(performance.eta_propulsive, 1) : "—"}</span>
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Overall efficiency"
          formula="η_0 = T_total·U / (mdot_f·Q_R) — the direct definition, applied to TOTAL thrust (fan + hot nozzle combined)."
        />
        <span className="perf-value">{performance.eta_overall !== null ? fmtPct(performance.eta_overall, 1) : "—"}</span>
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Fan power split β (solved)"
          formula="β·Cpc·(T011−T010) = η_m,UDF·(1+f−b)·Cph·(T07−T08) (§2.4) — solved from the free turbine's own energy balance against the fan, not a configured input."
        />
        <span className="perf-value">{fmt(performance.beta, 3)}</span>
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Free-turbine split α (configured)"
          formula="Fraction of the free turbine's ideal expansion sent to shaft/fan power vs. the residual hot-nozzle jet (§2.3) — a fixed design input here, not solved for an optimum. You set this in the Free (power) turbine section."
        />
        <span className="perf-value">{fmt(performance.alpha, 2)}</span>
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Hot nozzle"
          formula="Always fully expanded to ambient here — no choking check, unlike the turbojet's nozzle (§2.3)."
        />
        <span className="perf-value">{hotNozzle.choked ? "Choked" : "Unchoked"}</span>
      </div>
    </div>
  );
}
