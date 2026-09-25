import { solveEngine } from "../physics/engine.js";
import { solveTurboprop } from "../physics/turboprop.js";
import { solveTurboshaft } from "../physics/turboshaft.js";
import { solveTurbofan } from "../physics/turbofan.js";
import { solvePropfan } from "../physics/propfan.js";
import { solveScramjet } from "../physics/scramjet.js";
import { solveRamjet } from "../physics/ramjet.js";
import { solveTurboramjet } from "../physics/turboramjet.js";
import { solveTwinSpoolTurbojet } from "../physics/twinSpoolTurbojet.js";
import { fuelsForEngine, selectedFuel } from "../utils/fuels.js";
import { fmt, tsfcPerHour } from "../utils/format.js";
import ExpandableSection from "./ExpandableSection.jsx";
import { explainError } from "../utils/errorText.js";

const SOLVERS = {
  turbojet: solveEngine, turboprop: solveTurboprop, turboshaft: solveTurboshaft,
  turbofan: solveTurbofan, propfan: solvePropfan, ramjet: solveRamjet, turboramjet: solveTurboramjet, turbojet2: solveTwinSpoolTurbojet, scramjet: solveScramjet,
};

const THRUST = { label: "Thrust (N)", get: (p) => fmt(p.thrust, 1) };
const TSFC = { label: "TSFC (kg/(N·h))", get: (p) => fmt(tsfcPerHour(p.tsfc), 4) };
const METRICS = {
  turbojet: [THRUST, TSFC],
  turboprop: [THRUST, TSFC],
  turbofan: [THRUST, TSFC],
  propfan: [THRUST, TSFC],
  ramjet: [THRUST, TSFC],
  turboramjet: [THRUST, TSFC],
  turbojet2: [THRUST, TSFC],
  turboshaft: [
    { label: "Load power (kW)", get: (p) => fmt(p.Pload_W / 1000, 1) },
    { label: "SFC (kg/kWh)", get: (p) => fmt(p.SFC_kg_per_kWh, 3) },
  ],
  scramjet: [THRUST, { label: "Isp (s)", get: (p) => fmt(p.isp_s, 0) }],
};

/**
 * Re-solves the current engine configuration once per fuel (changing
 * only Q_R) and tabulates what changes. For the gas turbines the
 * turbine-inlet temperature is fixed, so a more energetic fuel just needs
 * less of it (lower f and TSFC). The scramjet is fuel-air-ratio driven
 * instead, so the same f of a more energetic fuel releases more heat —
 * enough, for hydrogen, to thermally choke the combustor.
 */
export default function FuelComparison({ engineType, config }) {
  const solve = SOLVERS[engineType];
  const metrics = METRICS[engineType];
  const currentId = selectedFuel(engineType, config)?.id;
  const rows = fuelsForEngine(engineType).map((fuel) => {
    const current = fuel.id === currentId;
    try {
      const r = solve({ ...config, Q_R: fuel.Q_R });
      return { fuel, perf: r.performance, current };
    } catch (err) {
      return { fuel, error: explainError(err.message) || "This engine can't run on this fuel at these settings.", current };
    }
  });
  const fixedF = engineType === "scramjet";

  return (
    <ExpandableSection
      title="Compare fuels"
      summary="The same engine, re-solved with every fuel suited to it — only the fuel's heating value changes. Expand to view."
    >
      <p className="section-note">
        {fixedF
          ? "The scramjet's fuel-air ratio f is something you set, so every fuel here burns the same mass of fuel per kg of air — a more energetic fuel releases more heat and produces more thrust, until the combustor can't absorb it and thermally chokes."
          : engineType === "ramjet"
            ? "The ramjet's combustor exit temperature T04 is fixed by your design, so the combustor always adds the same heat — a more energetic fuel just needs less of it. Watch the fuel-air ratio f and the TSFC fall for the denser-energy fuels while thrust barely moves."
          : "This engine's turbine-inlet temperature is fixed by your design, so the combustor always adds the same heat — a more energetic fuel just needs less of it. Watch the fuel-air ratio f and the TSFC fall for hydrogen while thrust barely moves (slightly less fuel mass leaves through the nozzle)."}
      </p>
      <div className="table-scroll">
        <table className="station-table">
          <thead>
            <tr>
              <th>Fuel</th>
              <th>Q<sub>R</sub> (MJ/kg)</th>
              <th>Fuel-air ratio f</th>
              <th>φ = f/f<sub>stoich</sub></th>
              {metrics.map((m) => <th key={m.label}>{m.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ fuel, perf, error, current }) => (
              <tr key={fuel.id} className={current ? "fuel-row-current" : undefined}>
                <td className="station-name">{fuel.name}{current ? " (selected)" : ""}</td>
                <td>{fmt(fuel.Q_R / 1e6, 2)}</td>
                {error ? (
                  <td colSpan={2 + metrics.length} className="fuel-row-error">Not possible: {error}</td>
                ) : (
                  <>
                    <td>{fmt(perf.f, 4)}</td>
                    <td>{fmt(perf.f / fuel.f_stoich, 2)}</td>
                    {metrics.map((m) => <td key={m.label}>{m.get(perf)}</td>)}
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="section-note">
        Heating values are published lower (net) heating values — not in this project&rsquo;s textbooks. Military grades (JP-4/5/7/8) use their
        specification minimum. Hot-gas γ and Cp are kept at the standard values for every fuel, since changing them per fuel needs combustion
        chemistry the source doesn&rsquo;t cover.
      </p>
    </ExpandableSection>
  );
}
