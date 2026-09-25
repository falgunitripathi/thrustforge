import PropfanPerformanceSummary from "./PropfanPerformanceSummary.jsx";
import EngineIntro from "./EngineIntro.jsx";
import AtmosphereReadout from "./AtmosphereReadout.jsx";
import PropfanEngineDiagram from "./PropfanEngineDiagram.jsx";
import StationTable from "./StationTable.jsx";
import TsDiagram from "./TsDiagram.jsx";
import PvDiagram from "./PvDiagram.jsx";
import Glossary from "./Glossary.jsx";
import ExpandableSection from "./ExpandableSection.jsx";
import FuelComparison from "./FuelComparison.jsx";

// Ordered by physical/flow position (same convention the diagram uses,
// and the same convention the turbofan's own StationTable order follows
// — see that file's own station order for precedent): the fan's three
// stations (10, 11, 12) sit right after the freestream since the fan is
// physically at the very front, ahead of the core's own intake.
const PROPFAN_STATION_ORDER = ["a", "10", "11", "12", "2", "3", "4", "5", "6", "7", "8", "9"];
const PROPFAN_STATION_LABELS = {
  a: "a — freestream",
  "10": "10 — fan inlet",
  "11": "11 — fan exit",
  "12": "12 — fan exhaust (fully expanded)",
  "2": "2 — intake exit / IPC inlet",
  "3": "3 — IPC exit",
  "4": "4 — HPC exit",
  "5": "5 — combustor exit (TIT)",
  "6": "6 — HPT exit",
  "7": "7 — IPT exit",
  "8": "8 — free turbine exit",
  "9": "9 — hot nozzle exit",
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
 * The full results view for one solved propfan PropfanResult — same
 * shape/section order as the other engines' ResultsPanels. No stage
 * tables here: the IPC/HPC/HPT/IPT/fan are each a single overall step
 * in this model (reference/propfan.md §2.1-2.2), not stage-stacked like
 * the turbojet's compressor/turbine, so there's no per-stage breakdown
 * to show.
 *
 * Cycle-diagrams decision (documented per the task brief, since this
 * needed a judgment call): TsDiagram/PvDiagram hard-code exactly six
 * station keys (a, 2, 3, 4, 5, 9). For this engine those keys still
 * carry a coherent, real meaning of their own — a: freestream, 2:
 * intake exit/IPC inlet, 3: IPC exit, 4: HPC exit, 5: combustor exit
 * (T05), 9: hot nozzle exit — i.e. exactly the gas-generator-to-hot-
 * nozzle spine of the three-spool core, just with the IPT/HPT/free-
 * turbine expansion (stations 6, 7, 8) and the entire unducted-fan path
 * (10, 11, 12) omitted. That's the same level of simplification the
 * turbofan's own Cycle Diagrams section already accepts (it also skips
 * stations 6, 7), so the charts are kept here (not omitted), with a
 * caveat paragraph spelling out exactly what they leave out — rather
 * than force-feeding them a station set they were never built for.
 */
export default function PropfanResultsPanel({ result, config }) {
  const { performance, hot_nozzle, stations } = result;

  return (
    <div className="results-panel">
      <EngineIntro engineType="propfan" />
      <section>
        <h2>Overall performance</h2>
        <PropfanPerformanceSummary performance={performance} hotNozzle={hot_nozzle} />
      </section>
      <PropfanEngineDiagram config={config} result={result} />
      <section>
        <h3>Atmosphere at this altitude</h3>
        <p className="section-note">
          ISA troposphere values at the configured altitude and flight
          Mach number — computed once here, then reused throughout
          (intake, fan, hot nozzle).
        </p>
        <AtmosphereReadout config={config} result={result} />
      </section>

      <ExpandableSection
        title="Station analysis"
        summary="Stagnation and static properties (T0, p0, T, p, M, V, ρ, h, h0) at every station — twelve stations here (a, 10, 11, 12, 2, 3, 4, 5, 6, 7, 8, 9), the most of any engine in this project, reflecting the three-spool gas generator plus its own separate unducted-fan path. Expand to view."
      >
        <StationTable stations={stations} stationOrder={PROPFAN_STATION_ORDER} stationLabels={PROPFAN_STATION_LABELS} />
        <Glossary terms={STATION_TERMS} />
      </ExpandableSection>

      <ExpandableSection
        title="Cycle diagrams (gas-generator / hot-nozzle path only)"
        summary="T-s (temperature-entropy) and P-v (pressure-specific volume) process diagrams across the gas generator's a→2→3→4→5→9 points. Expand to view."
      >
        <p className="section-note">
          These two charts are shared with every other engine's view,
          which only know about six station keys (a, 2, 3, 4, 5, 9) —
          for the propfan those happen to line up with freestream,
          intake exit/IPC inlet, IPC exit, HPC exit, combustor exit, and
          hot nozzle exit, so the gas generator's compression/combustion
          progression and its residual jet's expansion still plot
          correctly. The HPT/IPT/free-turbine points (6, 7, 8) and the
          entire unducted-fan path (10, 11, 12) — genuinely the biggest
          part of this engine's thrust — aren&rsquo;t part of these
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

      <FuelComparison engineType="propfan" config={config} />
    </div>
  );
}
