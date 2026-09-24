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
 * Headline scramjet performance numbers — Ref: reference/scramjet.md
 * §2.4. Efficiencies use the source's own f<<1 forms
 * (judgment call #5); Isp is on fuel flow (judgment call #2). The
 * MIL-E-5007D recovery is shown ONLY as a clearly labelled reference
 * value — the solver never uses it (judgment call #4).
 */
export default function ScramjetPerformanceSummary({ performance, combustor, intake }) {
  const pct = (v) => (v !== null && v !== undefined ? fmtPct(v, 1) : "—");
  const noThrust = !(performance.specific_thrust > 0);
  return (
    <>
    {noThrust && (
      <p className="section-note fuel-card-warn">
        No useful thrust at these settings: the exhaust leaves no faster than the air came in, so the
        engine&rsquo;s drag wins. Burn more fuel (raise f), or improve the nozzle or intake efficiency.
      </p>
    )}
    <div className="performance-summary">
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Thrust"
          formula="T = mdot_a·[(1+f)·V4 − V1] (§2.4) — the exhaust's momentum (air plus burned fuel, leaving at V4) minus the momentum of the air swallowed at flight speed V1. The nozzle is fully expanded to ambient, so there's no pressure-thrust term."
        />
        <Stat value={performance.thrust} digits={1} unit="N" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Specific thrust"
          formula="T/mdot_a = (1+f)·V4 − V1 (§2.4) — thrust per kg/s of air, independent of engine size. Small for a scramjet: V4 is only a bit above the (already enormous) flight speed V1."
        />
        <Stat value={performance.specific_thrust} digits={1} unit="N·s/kg" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="TSFC"
          formula="TSFC = Thrust-Specific Fuel Consumption — kg of fuel burned per second for every newton of thrust (lower is better). TSFC = mdot_f/T = f/(T/mdot_a) (§2.4)."
        />
        <Stat value={performance.tsfc} digits={6} unit="kg/(N·s)" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Fuel-air ratio f"
          formula="f = mdot_f/mdot_a (§2.2) — kg of fuel per kg of air. For the scramjet this is an INPUT you set in the Combustor section (the source's derivation is f-driven), not solved from a target combustor temperature like the other engines."
        />
        <Stat value={performance.f} digits={4} />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Specific impulse Isp"
          formula="Isp = T/(mdot_f·g) (§2.4) — Isp = specific impulse: seconds of one newton of thrust per newton (weight) of fuel burned, the standard yardstick for comparing air-breathing engines with rockets (higher is better). The source leaves mdot unsubscripted; taken as FUEL flow mdot_f, following the same lecturer's own definition elsewhere in the course (reference/scramjet.md §4, judgment call #2). g = 9.80665 m/s²."
        />
        <Stat value={performance.isp_s} digits={0} unit="s" />
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Combustor exit Mach M3"
          formula="T03/T02 = (M3²/M2²)·[(1+gamma_c·M2²)/(1+gamma_h·M3²)]²·(1+(gamma_h−1)/2·M3²)/(1+(gamma_c−1)/2·M2²) (§2.2) — M3 = Mach number at the combustor exit, solved from this relation on the supersonic (M3 > 1) branch. Heat addition slows the flow, but in a scramjet it STAYS supersonic — the defining feature of the engine."
        />
        <span className="perf-value">
          {fmt(combustor.M3, 3)} <small>{combustor.M3 > 1 ? "supersonic" : "subsonic"}</small>
        </span>
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Propulsive efficiency"
          formula="eta_P = 2·V1/(V1 + V4) (§2.4) — how much of the jet's added kinetic energy becomes useful thrust work. The source's own f<<1 form is used: its full form leaves out the fuel's own onboard kinetic energy and gives eta_P > 1 at typical scramjet conditions (reference/scramjet.md §4, judgment call #5)."
        />
        <span className="perf-value">{pct(performance.eta_propulsive)}</span>
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Thermal efficiency"
          formula="eta_th = (V4² − V1²)/(2·f·eta_b·Q_R) (§2.4) — how much of the fuel's released heat becomes jet kinetic energy. The source's own f<<1 form (judgment call #5)."
        />
        <span className="perf-value">{pct(performance.eta_thermal)}</span>
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="Overall efficiency"
          formula="eta_o = eta_P·eta_th (§2.4) — the fraction of the fuel's heat that ends up as useful thrust work."
        />
        <span className="perf-value">{pct(performance.eta_overall)}</span>
      </div>
      <div className="perf-card">
        <FormulaLabel
          className="perf-label"
          label="MIL-E-5007D recovery (reference only)"
          formula="p02/p01 = 800/(M1^4 + 935) for M1 > 5; 1 − 0.075·(M1 − 1)^1.35 for 1 < M1 < 5 (§2.1) — a US military-specification estimate of how much total pressure a supersonic intake keeps. REFERENCE ONLY: the solver does NOT use this number — p2 comes from the intake efficiency eta_I instead, exactly as the source's own derivation chain does (reference/scramjet.md §4, judgment call #4)."
        />
        <span className="perf-value">{fmt(intake.recovery_mil_e_5007d, 3)} <small>not used</small></span>
      </div>
    </div>
    </>
);
}
