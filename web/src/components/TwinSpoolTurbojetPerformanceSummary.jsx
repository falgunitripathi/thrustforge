import { fmt, fmtPct, tsfcPerHour } from "../utils/format.js";
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

/** Headline numbers for the two-spool turbojet (NPTEL p.303-306). */
export default function TwinSpoolTurbojetPerformanceSummary({ result }) {
  const { performance: p, nozzle, config } = result;
  const pct = (v) => (v !== null && v !== undefined ? fmtPct(v, 1) : "—");
  return (
    <div className="performance-summary">
      <div className="perf-card">
        <FormulaLabel className="perf-label" label="Thrust"
          formula="T = mdot_a·{[(1+f+f_ab)·V9 − V] + (A9/mdot_a)·(p9 − p_a)} — exhaust momentum minus the momentum of the air swallowed, plus a pressure term when the nozzle is choked. f_ab = 0 with the afterburner off." />
        <Stat value={p.thrust} digits={1} unit="N" />
      </div>
      <div className="perf-card">
        <FormulaLabel className="perf-label" label="Specific thrust"
          formula="T/mdot_a = [(1+f+f_ab)·V9 − V] + (A9/mdot_a)·(p9 − p_a) — thrust per kg/s of air." />
        <Stat value={p.specific_thrust} digits={1} unit="N·s/kg" />
      </div>
      <div className="perf-card">
        <FormulaLabel className="perf-label" label="TSFC"
          formula="TSFC = Thrust-Specific Fuel Consumption — kg of fuel per hour for each newton of thrust (lower is better). TSFC = (f + f_ab)/(T/mdot_a)." />
        <Stat value={tsfcPerHour(p.tsfc)} digits={4} unit="kg/(N·h)" />
      </div>
      <div className="perf-card">
        <FormulaLabel className="perf-label" label="Fuel-air ratio f"
          formula="f = [(Cp_h/Cp_c)(T05/T04) − 1] / [η_b·Q_R/(Cp_c·T04) − (Cp_h/Cp_c)(T05/T04)] — from the main combustor's energy balance." />
        <Stat value={p.f} digits={4} />
      </div>
      {p.f_ab > 0 && (
        <div className="perf-card">
          <FormulaLabel className="perf-label" label="Afterburner fuel f_ab"
            formula="f_ab = (1+f)·(Cp_h·T08A − Cp_h·T07)/(η_b·Q_R − Cp_h·T08A) — extra fuel burned in the afterburner, per kg of air." />
          <Stat value={p.f_ab} digits={4} />
        </div>
      )}
      <div className="perf-card">
        <FormulaLabel className="perf-label" label="Overall pressure ratio"
          formula="π_overall = π_LPC·π_HPC = p04/p02 — split across two compressors on two shafts." />
        <Stat value={config.pi_LPC * config.pi_HPC} digits={2} />
      </div>
      <div className="perf-card">
        <FormulaLabel className="perf-label" label="Thermal efficiency"
          formula="η_th = [T·V + ½·mdot_e·(V9 − V)²] / (mdot_f·Q_R) — how much of the fuel's heat becomes useful work plus jet kinetic energy." />
        <span className="perf-value">{pct(p.eta_thermal)}</span>
      </div>
      <div className="perf-card">
        <FormulaLabel className="perf-label" label="Propulsive efficiency"
          formula="η_p = T·V / [T·V + ½·mdot_e·(V9 − V)²] — how much of the jet's energy becomes thrust work. Zero at standstill (no flight speed, no useful work yet)." />
        <span className="perf-value">{pct(p.eta_propulsive)}</span>
      </div>
      <div className="perf-card">
        <FormulaLabel className="perf-label" label="Overall efficiency"
          formula="η_o = η_p·η_th — the fraction of the fuel's heat that ends up as useful thrust work." />
        <span className="perf-value">{pct(p.eta_overall)}</span>
      </div>
      <div className="perf-card">
        <FormulaLabel className="perf-label" label="Nozzle"
          formula="Convergent nozzle: it chokes (exit Mach 1, exit pressure above ambient) once the critical pressure p_c = p08·[1 − (1/η_N)·(γ_h−1)/(γ_h+1)]^(γ_h/(γ_h−1)) is at least the outside pressure." />
        <span className="perf-value">{nozzle.choked ? "Choked" : "Unchoked"}</span>
      </div>
    </div>
  );
}
