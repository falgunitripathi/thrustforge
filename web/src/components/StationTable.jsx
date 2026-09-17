import { useState } from "react";
import { fmt, fmtKPa } from "../utils/format.js";

const DEFAULT_STATION_ORDER = ["a", "2", "3", "4", "5", "9"];
const DEFAULT_STATION_LABELS = {
  a: "a — freestream",
  "2": "2 — compressor inlet",
  "3": "3 — compressor exit",
  "4": "4 — combustor exit (TIT)",
  "5": "5 — turbine exit",
  "9": "9 — nozzle exit",
};

const COLUMNS = [
  { key: "T0", label: "T0 (K)", formula: "Stagnation temperature — carried directly from the upstream component's own cycle/stage equation (e.g. the compressor or turbine energy balance, §4/§6), not re-derived here." },
  { key: "p0", label: "p0 (kPa)", formula: "Stagnation pressure — carried directly from the upstream component's own pressure relation (isentropic stage relation, or a stated loss such as the combustor's Δp or the nozzle's real total-pressure drop)." },
  { key: "T", label: "T (K)", formula: "Static temperature: T = T0 − V²/(2·Cp) (Ref §2.1 step 2), from this station's T0 and its local through-flow velocity V." },
  { key: "p", label: "p (kPa)", formula: "Static pressure: p = p0 / [1 + ((γ−1)/2)·M²]^(γ/(γ−1)) (Ref §2.1 step 4)." },
  { key: "M", label: "M", formula: "Mach number: M = V / sqrt(γ·R·T) (Ref §2, §2.1 step 3), from this station's local velocity and static temperature." },
  { key: "V", label: "V (m/s)", formula: "Local through-flow velocity — an input to the station-state recipe (axial Vz held through a stage, a velocity-triangle resultant, or a continuity value), not itself derived from T0/p0." },
  { key: "rho", label: "ρ (kg/m³)", formula: "Density: ρ = p / (R·T) (Ref §2.1 step 5), ideal gas law on this station's static state." },
  { key: "h", label: "h (kJ/kg)", formula: "Static enthalpy: h = Cp·T (Ref §2.1 step 6)." },
  { key: "h0", label: "h0 (kJ/kg)", formula: "Stagnation enthalpy: h0 = Cp·T0 (Ref §2.1 step 6)." },
];

/**
 * Station Analysis table — every key station's full (T0, p0, T, p, M, V,
 * rho, h, h0) row, from `EngineResult.stations` (Ref §2.1 station-state
 * recipe, §11 solve order for which stations are tabulated).
 *
 * Station 9's p0 will read lower than station 5's p0 — that's the
 * nozzle's real total-pressure loss made visible (see
 * `Station.fromStatic`'s docstring in gasstate.js); its T0 should equal
 * station 5's T0 (adiabatic nozzle) as a running self-consistency check.
 *
 * The leading "Step" column numbers these 1-6 in simple flow order, since
 * the traditional station numbers themselves (a, 2, 3, 4, 5, 9) jump from
 * 5 to 9 — that's the standard gas-turbine convention (stations 6-8 are
 * reserved for an afterburner/reheat section this model doesn't include),
 * not a typo, but it reads oddly without a plain sequence alongside it.
 *
 * Every property column header is clickable (not just hoverable — a
 * `title` tooltip never fires on a touchscreen): tap/click a column name
 * to open its formula in a full-width row right below the header, tap
 * again (or a different column) to change it.
 *
 * `stationOrder`/`stationLabels` default to the turbojet's six stations
 * (a,2,3,4,5,9) but are overridable — e.g. the ramjet has no compressor
 * or turbine, so it only ever has stations a,2,4,9 (see RamjetResultsPanel).
 */
export default function StationTable({
  stations, stationOrder = DEFAULT_STATION_ORDER, stationLabels = DEFAULT_STATION_LABELS,
}) {
  const [activeCol, setActiveCol] = useState(null);
  const active = COLUMNS.find((c) => c.key === activeCol);
  return (
    <div className="table-scroll">
      <table className="station-table">
        <thead>
          <tr>
            <th>Step</th>
            <th>Station</th>
            {COLUMNS.map((col) => (
              <th key={col.key}>
                <button
                  type="button"
                  className="th-formula-trigger"
                  aria-expanded={activeCol === col.key}
                  onClick={() => setActiveCol(activeCol === col.key ? null : col.key)}
                >
                  {col.label}
                </button>
              </th>
            ))}
          </tr>
          {active && (
            <tr className="formula-readout-row">
              <th colSpan={COLUMNS.length + 2} className="formula-readout-cell">
                <strong>{active.label}:</strong> {active.formula}
              </th>
            </tr>
          )}
        </thead>
        <tbody>
          {stationOrder.map((key, i) => {
            const st = stations[key];
            if (!st) return null;
            return (
              <tr key={key}>
                <td>{i + 1}</td>
                <td className="station-name">{stationLabels[key] || key}</td>
                <td>{fmt(st.T0, 1)}</td>
                <td>{fmtKPa(st.p0, 1)}</td>
                <td>{fmt(st.T, 1)}</td>
                <td>{fmtKPa(st.p, 1)}</td>
                <td>{fmt(st.M, 3)}</td>
                <td>{fmt(st.V, 1)}</td>
                <td>{fmt(st.rho, 3)}</td>
                <td>{fmt(st.h / 1000.0, 1)}</td>
                <td>{fmt(st.h0 / 1000.0, 1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
