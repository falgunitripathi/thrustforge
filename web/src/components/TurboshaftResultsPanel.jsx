import TurboshaftPerformanceSummary from "./TurboshaftPerformanceSummary.jsx";
import AtmosphereReadout from "./AtmosphereReadout.jsx";
import TurboshaftEngineDiagram from "./TurboshaftEngineDiagram.jsx";
import StationTable from "./StationTable.jsx";
import StageTable from "./StageTable.jsx";
import TsDiagram from "./TsDiagram.jsx";
import PvDiagram from "./PvDiagram.jsx";
import Glossary from "./Glossary.jsx";
import ExpandableSection from "./ExpandableSection.jsx";
import FuelComparison from "./FuelComparison.jsx";
import { fmt } from "../utils/format.js";

const TURBOSHAFT_STATION_ORDER = ["a", "2", "3", "4", "5"];
const TURBOSHAFT_STATION_LABELS = {
  a: "a — freestream",
  "2": "2 — compressor inlet",
  "3": "3 — compressor exit",
  "4": "4 — combustor exit (TIT)",
  "5": "5 — turbine exit (= exhaust)",
};

const STATION_TERMS = [
  { symbol: "T0", meaning: "Stagnation (total) temperature — what a thermometer would read if the flow were brought to rest here." },
  { symbol: "p0", meaning: "Stagnation (total) pressure — same idea, for pressure." },
  { symbol: "T", meaning: "Static temperature — the actual temperature of the moving air." },
  { symbol: "p", meaning: "Static pressure — the actual pressure of the moving air." },
  { symbol: "M", meaning: "Mach number — flow speed divided by the local speed of sound." },
  { symbol: "V", meaning: "Flow velocity." },
  { symbol: "ρ", meaning: "Density." },
  { symbol: "h", meaning: "Static specific enthalpy." },
  { symbol: "h0", meaning: "Stagnation specific enthalpy." },
];

const STAGE_TERMS = [
  { symbol: "T0 in / T0 out", meaning: "Stagnation temperature entering / leaving this one stage." },
  { symbol: "ΔT0", meaning: "The temperature rise (compressor) or drop (turbine) this stage adds." },
  { symbol: "Stage π", meaning: "This stage's own pressure ratio (compressor)." },
  { symbol: "Expansion ratio", meaning: "This stage's own pressure ratio (turbine), quoted ≥ 1." },
  { symbol: "p0 in/out (rel.)", meaning: "Stagnation pressure relative to the very first stage inlet — a running check on cumulative loss." },
];

/**
 * The full results view for one solved turboshaft TurboshaftResult —
 * same shape/section order as the turbojet's/turboprop's ResultsPanel,
 * reusing every shared component unmodified except the performance
 * summary and engine diagram, which are turboshaft-specific (no thrust,
 * no nozzle, no station 9 — see aeropropsim/turboshaft.py).
 */
export default function TurboshaftResultsPanel({ result, config }) {
  const { performance, shaft, compressor, turbine, stations } = result;

  return (
    <div className="results-panel">
      <section>
        <h2>Overall performance</h2>
        <TurboshaftPerformanceSummary shaft={shaft} performance={performance} />
        <h3>Atmosphere at this altitude</h3>
        <p className="section-note">
          ISA troposphere values at the configured altitude and flight
          Mach number — computed once here, then reused for the intake.
          Zero flight Mach (hover/ground) is a perfectly ordinary input
          for a turboshaft, unlike the turboprop.
        </p>
        <AtmosphereReadout config={config} result={result} />
      </section>

      <TurboshaftEngineDiagram config={config} result={result} />

      <ExpandableSection
        title="Station analysis"
        summary="Stagnation and static properties (T0, p0, T, p, M, V, ρ, h, h0) at every station from intake to turbine exit — five stations (a, 2, 3, 4, 5), one fewer than the turbojet's six, since there's no nozzle/station 9 here. Expand to view."
      >
        <StationTable stations={stations} stationOrder={TURBOSHAFT_STATION_ORDER} stationLabels={TURBOSHAFT_STATION_LABELS} />
        <Glossary terms={STATION_TERMS} />
      </ExpandableSection>

      <ExpandableSection
        title={`Compressor & turbine stages (${compressor.type} / ${turbine.type})`}
        summary="Per-stage temperature rise/drop, pressure ratio, and cumulative loss for the compressor and turbine. Expand to view."
      >
        <div className="stage-tables-row">
          <section>
            <h2>Compressor stages ({compressor.type})</h2>
            <StageTable stages={compressor.stages} kind="compressor" />
            <p className="section-note">
              Overall π_c achieved: {fmt(compressor.pi_actual, 3)}
            </p>
            <Glossary terms={STAGE_TERMS} />
          </section>

          <section>
            <h2>Turbine stages ({turbine.type})</h2>
            <StageTable stages={turbine.stages} kind="turbine" />
            <p className="section-note">
              Overall expansion ratio achieved: {fmt(1.0 / turbine.pr_actual, 3)}
              {" "}(the turbine always expands fully to ambient pressure in
              this model — see the Turbine section's own note).
            </p>
            {turbine.type === "radial" && (
              <p className="section-note">
                In calculation form: spouting velocity V0 ={" "}
                {fmt(turbine.V0_spouting, 1)} m/s (from the cycle's own T04 and
                T05), then blade tip speed U2 = 0.707 × V0 ={" "}
                {fmt(turbine.U2_sized, 1)} m/s.
              </p>
            )}
          </section>
        </div>
      </ExpandableSection>

      <ExpandableSection
        title="Cycle diagrams"
        summary="T-s (temperature-entropy) and P-v (pressure-specific volume) process diagrams across stations a→2→3→4→5 — one fewer point than the turbojet's, since there's no station 9 here. Expand to view."
      >
        <div className="stage-tables-row">
          <div>
            <h3>T-s diagram</h3>
            <TsDiagram stations={stations} />
            <p className="section-note">
              Approximate — see <code>TsDiagram.jsx</code> for the
              entropy-datum caveat across the combustor.
            </p>
          </div>
          <div>
            <h3>P-v diagram</h3>
            <PvDiagram stations={stations} />
            <p className="section-note">
              Static pressure vs. specific volume (v = 1/ρ) at each station.
            </p>
          </div>
        </div>
      </ExpandableSection>

      <FuelComparison engineType="turboshaft" config={config} />
    </div>
  );
}
