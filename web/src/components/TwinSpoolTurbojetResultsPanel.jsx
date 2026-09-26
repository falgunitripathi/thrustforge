import StandstillNote from "./StandstillNote.jsx";
import EngineIntro from "./EngineIntro.jsx";
import TwinSpoolTurbojetPerformanceSummary from "./TwinSpoolTurbojetPerformanceSummary.jsx";
import TwinSpoolTurbojetEngineDiagram from "./TwinSpoolTurbojetEngineDiagram.jsx";
import AtmosphereReadout from "./AtmosphereReadout.jsx";
import StationTable from "./StationTable.jsx";
import TsDiagram from "./TsDiagram.jsx";
import PvDiagram from "./PvDiagram.jsx";
import Glossary from "./Glossary.jsx";
import ExpandableSection from "./ExpandableSection.jsx";
import FuelComparison from "./FuelComparison.jsx";

const ORDER = ["a", "2", "3", "4", "5", "6", "7", "8", "9"];  // 8 only with the afterburner lit
const LABELS = {
  a: "a — freestream",
  "2": "2 — intake exit / LPC inlet",
  "3": "3 — LPC exit",
  "4": "4 — HPC exit",
  "5": "5 — combustor exit (TIT)",
  "6": "6 — HPT exit",
  "7": "7 — LPT exit",
  "8": "8 — afterburner exit",
  "9": "9 — nozzle exit",
};
const TERMS = [
  { symbol: "T0", meaning: "Stagnation (total) temperature — what a thermometer would read if the flow were brought to rest here." },
  { symbol: "p0", meaning: "Stagnation (total) pressure — same idea, for pressure." },
  { symbol: "T", meaning: "Static temperature — the actual temperature of the moving gas." },
  { symbol: "p", meaning: "Static pressure — the actual pressure of the moving gas." },
  { symbol: "M", meaning: "Mach number — flow speed divided by the local speed of sound." },
  { symbol: "V", meaning: "Flow velocity." },
  { symbol: "ρ", meaning: "Density." },
];

/** Results for one solved two-spool turbojet. */
export default function TwinSpoolTurbojetResultsPanel({ result, config, onToggleAfterburner }) {
  const { stations } = result;
  return (
    <div className="results-panel">
      <EngineIntro engineType="turbojet2" />
      <section>
        <h2>Overall performance</h2>
        <TwinSpoolTurbojetPerformanceSummary result={result} />
        <StandstillNote config={config} />
      </section>
      <TwinSpoolTurbojetEngineDiagram config={config} result={result} onToggleAfterburner={onToggleAfterburner} />
      <section>
        <h3>Atmosphere at this altitude</h3>
        <p className="section-note">
          ISA troposphere values at the configured altitude and flight Mach number — the free air the intake
          swallows (station a).
        </p>
        <AtmosphereReadout config={config} result={result} />
      </section>

      <ExpandableSection
        title="Station analysis"
        summary="Stagnation and static properties (T0, p0, T, p, M, V, ρ, h, h0) at every station, from the freestream through both spools to the nozzle exit. Expand to view."
      >
        <StationTable stations={stations} stationOrder={ORDER} stationLabels={LABELS} />
        <Glossary terms={TERMS} />
      </ExpandableSection>

      <ExpandableSection
        title="Cycle diagrams"
        summary="T-s (temperature-entropy) and P-v (pressure-specific volume) process diagrams through all the stations, both spools included. Expand to view."
      >
        <div className="stage-tables-row">
          <div>
            <h3>T-s diagram</h3>
            <TsDiagram stations={stations} order={ORDER} />
          </div>
          <div>
            <h3>P-v diagram</h3>
            <PvDiagram stations={stations} order={ORDER} />
          </div>
        </div>
      </ExpandableSection>

      <FuelComparison engineType="turbojet2" config={config} />
    </div>
  );
}
