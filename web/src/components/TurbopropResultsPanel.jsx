import TurbopropPerformanceSummary from "./TurbopropPerformanceSummary.jsx";
import AtmosphereReadout from "./AtmosphereReadout.jsx";
import TurbopropEngineDiagram from "./TurbopropEngineDiagram.jsx";
import StationTable from "./StationTable.jsx";
import StageTable from "./StageTable.jsx";
import TsDiagram from "./TsDiagram.jsx";
import PvDiagram from "./PvDiagram.jsx";
import Glossary from "./Glossary.jsx";
import ExpandableSection from "./ExpandableSection.jsx";
import { fmt } from "../utils/format.js";

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
 * The full results view for one solved turboprop TurbopropResult — same
 * shape and section order as the turbojet's ResultsPanel, reusing every
 * shared component unmodified (AtmosphereReadout, StationTable,
 * StageTable, TsDiagram, PvDiagram, Glossary, ExpandableSection all take
 * the exact same props a turbojet result already provides, since intake/
 * compressor/combustor/turbine-station-derivation are identical — see
 * aeropropsim/turboprop.py's module docstring). Only the performance
 * summary and the engine diagram are turboprop-specific.
 */
export default function TurbopropResultsPanel({ result, config }) {
  const { performance, propeller, compressor, turbine, stations } = result;

  return (
    <div className="results-panel">
      <section>
        <h2>Overall performance</h2>
        <TurbopropPerformanceSummary performance={performance} propeller={propeller} />
        <h3>Atmosphere at this altitude</h3>
        <p className="section-note">
          ISA troposphere values at the configured altitude and flight
          Mach number — computed once here, then reused throughout (intake,
          nozzle).
        </p>
        <AtmosphereReadout config={config} result={result} />
      </section>

      <TurbopropEngineDiagram config={config} result={result} />

      <ExpandableSection
        title="Station analysis"
        summary="Stagnation and static properties (T0, p0, T, p, M, V, ρ, h, h0) at every station from intake to nozzle exit — the same six stations (a, 2, 3, 4, 5, 9) as the turbojet. Expand to view."
      >
        <StationTable stations={stations} />
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
            </p>
            <p className="section-note">
              Unlike the turbojet, this turbine's overall expansion isn't
              sized to balance the compressor alone — it comes from the
              configured power split α (Propeller section), which sends
              most of the available enthalpy drop here and the rest to the
              residual jet. Turbine stage count only changes how that
              already-fixed expansion is broken up for display.
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
        summary="T-s (temperature-entropy) and P-v (pressure-specific volume) process diagrams across stations a→2→3→4→5→9. Expand to view."
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
    </div>
  );
}
