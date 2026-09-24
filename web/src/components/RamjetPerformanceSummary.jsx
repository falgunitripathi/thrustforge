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

/**
 * Headline ramjet performance numbers — Ref: reference/ramjet.md §2.
 * Efficiencies use the effective exhaust velocity (judgment call #3 in
 * aeropropsim/ramjet.py), so a choked convergent nozzle's pressure thrust
 * is credited. When thrust is zero or negative there's no meaningful
 * TSFC or efficiency, and those cards show a dash.
 */
export default function RamjetPerformanceSummary({ performance, intake, nozzle }) {
  const pct = (v) => (v !== null && v !== undefined ? fmtPct(v, 1) : "—");
  const noThrust = !(performance.specific_thrust > 0);
  return (
    <>
      {noThrust && (
        <p className="section-note fuel-card-warn">
          No useful thrust at these settings: the exhaust leaves no faster than the air came in, so the
          engine&rsquo;s drag wins. Switch to the convergent-divergent nozzle, raise T04, or fly slower.
        </p>
      )}
      <div className="performance-summary">
        <div className="perf-card">
          <FormulaLabel
            className="perf-label"
            label="Thrust"
            formula="T = mdot_a·{[(1+f)·V9 − V] + (A9/mdot_a)·(p9 − p_a)} — the exhaust's momentum (air plus burned fuel, leaving at V9) minus the momentum of the air swallowed at flight speed V, plus a pressure term if the nozzle exit is above ambient pressure."
          />
          <Stat value={performance.thrust} digits={1} unit="N" />
        </div>
        <div className="perf-card">
          <FormulaLabel
            className="perf-label"
            label="Specific thrust"
            formula="T/mdot_a = [(1+f)·V9 − V] + (A9/mdot_a)·(p9 − p_a) — thrust per kg/s of air, independent of engine size."
          />
          <Stat value={performance.specific_thrust} digits={1} unit="N·s/kg" />
        </div>
        <div className="perf-card">
          <FormulaLabel
            className="perf-label"
            label="TSFC"
            formula="TSFC = Thrust-Specific Fuel Consumption — kg of fuel burned per hour for every newton of thrust (lower is better). TSFC = f/(T/mdot_a). For a ramjet it's poor at low speed and best around Mach 3."
          />
          <Stat value={tsfcPerHour(performance.tsfc)} digits={4} unit="kg/(N·h)" />
        </div>
        <div className="perf-card">
          <FormulaLabel
            className="perf-label"
            label="Fuel-air ratio f"
            formula="f = (Cp_h·T04 − Cp_c·T02)/(eta_b·Q_R − Cp_h·T04) — kg of fuel per kg of air, solved from your combustor exit temperature T04. It falls as flight Mach rises, because ram heating already brings the air closer to T04."
          />
          <Stat value={performance.f} digits={4} />
        </div>
        <div className="perf-card">
          <FormulaLabel
            className="perf-label"
            label="Ram pressure ratio"
            formula="p02/p_a = (1 + eta_d·(gamma_c−1)/2·M²)^(gamma_c/(gamma_c−1)) — how much the intake squeezes the air using nothing but flight speed. This does the job a turbojet's whole compressor does."
          />
          <Stat value={intake.ram_pressure_ratio} digits={2} />
        </div>
        <div className="perf-card">
          <FormulaLabel
            className="perf-label"
            label="Nozzle exit Mach"
            formula="M9 = V9/sqrt(gamma_h·R_h·T9) — a convergent-divergent nozzle expands to outside air pressure and goes supersonic; a convergent nozzle chokes at exactly Mach 1 once the pressure ratio is high enough."
          />
          <span className="perf-value">
            {fmt(nozzle.M_exit, 2)} <small>{nozzle.choked ? "choked" : "fully expanded"}</small>
          </span>
        </div>
        <div className="perf-card">
          <FormulaLabel
            className="perf-label"
            label="Propulsive efficiency"
            formula="eta_P = 2·(V/V_eff)/(1 + V/V_eff), with V_eff = (T/mdot_a + V)/(1+f) — how much of the jet's added kinetic energy becomes useful thrust work. V_eff equals the exit velocity for a fully expanded nozzle."
          />
          <span className="perf-value">{pct(performance.eta_propulsive)}</span>
        </div>
        <div className="perf-card">
          <FormulaLabel
            className="perf-label"
            label="Thermal efficiency"
            formula="eta_th = [(1+f)·V_eff²/2 − V²/2]/(f·Q_R) — how much of the fuel's heat becomes jet kinetic energy. It climbs with flight Mach, because more ram compression means a better cycle."
          />
          <span className="perf-value">{pct(performance.eta_thermal)}</span>
        </div>
        <div className="perf-card">
          <FormulaLabel
            className="perf-label"
            label="Overall efficiency"
            formula="eta_o = eta_P·eta_th — the fraction of the fuel's heat that ends up as useful thrust work."
          />
          <span className="perf-value">{pct(performance.eta_overall)}</span>
        </div>
      </div>
    </>
  );
}
