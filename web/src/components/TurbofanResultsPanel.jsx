import TurbofanPerformanceSummary from "./TurbofanPerformanceSummary.jsx";
import EngineIntro from "./EngineIntro.jsx";
import AtmosphereReadout from "./AtmosphereReadout.jsx";
import TurbofanEngineDiagram from "./TurbofanEngineDiagram.jsx";
import StationTable from "./StationTable.jsx";
import TsDiagram from "./TsDiagram.jsx";
import PvDiagram from "./PvDiagram.jsx";
import Glossary from "./Glossary.jsx";
import ExpandableSection from "./ExpandableSection.jsx";
import FuelComparison from "./FuelComparison.jsx";

const TURBOFAN_STATION_ORDER = ["a", "2", "10", "3", "4", "5", "6", "7", "8", "9", "11"];  // 8 only with the afterburner lit
const TURBOFAN_STATION_LABELS = {
  a: "a — freestream",
  "2": "2 — fan/LPC inlet",
  "10": "10 — fan exit (cold stream)",
  "3": "3 — LPC exit",
  "4": "4 — HPC exit",
  "5": "5 — combustor exit (TIT)",
  "6": "6 — HPT exit",
  "7": "7 — LPT exit",
  "8": "8 — afterburner exit",
  "9": "9 — hot nozzle exit",
  "11": "11 — cold nozzle exit",
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

/**
 * The full results view for one solved turbofan TurbofanResult — same
 * shape/section order as the other engines' ResultsPanels. No stage
 * tables here: the fan/LPC/HPC/HPT/LPT are each a single overall step
 * in this model (reference/turbofan.md §3), not stage-stacked like the
 * turbojet's compressor/turbine, so there's no per-stage breakdown to
 * show.
 */
export default function TurbofanResultsPanel({ result, config, onToggleAfterburner }) {
  const { performance, hot_nozzle, cold_nozzle, stations } = result;

  return (
    <div className="results-panel">
      <EngineIntro engineType="turbofan" />
      <TurbofanEngineDiagram config={config} result={result} onToggleAfterburner={onToggleAfterburner} />
      <section>
        <h2>Overall performance</h2>
        <TurbofanPerformanceSummary performance={performance} hotNozzle={hot_nozzle} coldNozzle={cold_nozzle} />
        <h3>Atmosphere at this altitude</h3>
        <p className="section-note">
          ISA troposphere values at the configured altitude and flight
          Mach number — computed once here, then reused throughout
          (intake, both nozzles).
        </p>
        <AtmosphereReadout config={config} result={result} />
      </section>

      <ExpandableSection
        title="Station analysis"
        summary="Stagnation and static properties (T0, p0, T, p, M, V, ρ, h, h0) at every station — ten stations here (a, 2, 10, 3, 4, 5, 6, 7, 9, 11), the source's own numbering for this engine, a genuinely different set from the turbojet's a,2,3,4,5,9. Expand to view."
      >
        <StationTable stations={stations} stationOrder={TURBOFAN_STATION_ORDER} stationLabels={TURBOFAN_STATION_LABELS} />
        <Glossary terms={STATION_TERMS} />
      </ExpandableSection>

      <ExpandableSection
        title="Cycle diagrams (core stream only)"
        summary="T-s (temperature-entropy) and P-v (pressure-specific volume) process diagrams across the core stream's a→2→3→4→5→9 points. Expand to view."
      >
        <p className="section-note">
          These two charts are shared with the turbojet/turboprop/
          turboshaft views, which only know about six station keys
          (a, 2, 3, 4, 5, 9) — for the turbofan those happen to line up
          with freestream, fan/LPC inlet, LPC exit, HPC exit, combustor
          exit, and hot nozzle exit, so the core stream's progression
          still plots correctly. The fan-exit (10), HPT/LPT (6, 7), and
          cold-nozzle-exit (11) points aren&rsquo;t part of these
          particular charts.
        </p>
        <div className="stage-tables-row">
          <div>
            <h3>T-s diagram</h3>
            <TsDiagram stations={stations} />
          </div>
          <div>
            <h3>P-v diagram</h3>
            <PvDiagram stations={stations} />
          </div>
        </div>
      </ExpandableSection>

      <FuelComparison engineType="turbofan" config={config} />
    </div>
  );
}
