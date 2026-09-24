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

const MODE_TEXT = { turbojet: "Turbojet", ramjet: "Ramjet", dual: "Turbojet + ramjet" };

/** Headline turboramjet numbers — Ref: reference/turboramjet.md §4-7. */
export default function TurboramjetPerformanceSummary({ result }) {
  const { performance: p, turbojet: tj, mode_active } = result;
  const pct = (v) => (v !== null && v !== undefined ? fmtPct(v, 1) : "—");
  return (
    <div className="performance-summary">
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Running as"
          formula="Auto mode: turbojet below the switch Mach, ramjet at or above it. There's no formula for the switch point; it's chosen by the designer, typically near Mach 3."
        />
        <span className="perf-value">{MODE_TEXT[mode_active]}</span>
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Thrust"
          formula="T = (mdot_a)_TJ·[(1+f+f_ab)·V7 − V] + (mdot_a)_RJ·[(1+f_R)·V10 − V] — the two legs' thrusts simply add. Only the running leg gets air (except in 'Both' mode). Both nozzles are fully expanded, so there's no pressure-thrust term."
        />
        <Stat value={p.thrust} digits={1} unit="N" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Specific thrust"
          formula="T/mdot_a = β·(T/mdot_a)_TJ + (1−β)·(T/mdot_a)_RJ — thrust per kg/s of total captured air. β = share of the air through the turbojet (1 in turbojet mode, 0 in ramjet mode)."
        />
        <Stat value={p.specific_thrust} digits={1} unit="N·s/kg" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="TSFC"
          formula="TSFC = Thrust-Specific Fuel Consumption — kg of fuel per hour for each newton of thrust (lower is better). TSFC = (mdot_f)_total/T, with (mdot_f)_total = (mdot_a)_TJ·(f+f_ab) + (mdot_a)_RJ·f_R."
        />
        <Stat value={tsfcPerHour(p.tsfc)} digits={4} unit="kg/(N·h)" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Total fuel-air ratio"
          formula="f_total = β·(f + f_ab) + (1−β)·f_R — all the fuel burned (main combustor, afterburner and ramjet combustor) per kg of captured air."
        />
        <Stat value={p.f} digits={4} />
      </div>
      {tj && (
        <div className="perf-card">
          <FormulaLabel
            className="perf-label"
            label="Afterburner fuel f_ab"
            formula="f_ab = (1+f)·(Cp_h·T06 − Cp_h·T05)/(eta_b·Q_R − Cp_h·T06) — extra fuel burned after the turbine, per kg of turbojet air. Zero when the afterburner is off."
          />
          <Stat value={tj.fab} digits={4} />
        </div>
      )}
      {mode_active === "dual" && (
        <div className="perf-card">
          <FormulaLabel
            className="perf-label"
            label="Thrust split TJ / RJ"
            formula="Each leg's share of the total thrust, from its own air flow and specific thrust."
          />
          <span className="perf-value">
            {fmt(p.thrust_turbojet, 0)} / {fmt(p.thrust_ramjet, 0)} <small>N</small>
          </span>
        </div>
      )}
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Propulsive efficiency"
          formula="eta_p = (T/mdot_a)·V / [(T/mdot_a)·V + (V_exit − V)²/2·(1 + fuel)] — useful thrust work over thrust work plus the kinetic energy left in the jet. In 'Both' mode the two jets' leftover energies are added."
        />
        <span className="perf-value">{pct(p.eta_propulsive)}</span>
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Thermal efficiency"
          formula="eta_th = [(T/mdot_a)·V + (V_exit − V)²/2·(1 + fuel)] / (Q_R·fuel) — how much of the fuel's heat becomes jet kinetic energy."
        />
        <span className="perf-value">{pct(p.eta_thermal)}</span>
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Overall efficiency"
          formula="eta_o = eta_p·eta_th — the fraction of the fuel's heat that ends up as useful thrust work. It's zero at take-off (no flight speed, so no useful work yet)."
        />
        <span className="perf-value">{pct(p.eta_overall)}</span>
      </div>
    </div>
  );
}
