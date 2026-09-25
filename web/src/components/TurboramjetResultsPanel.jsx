import TurboramjetPerformanceSummary from "./TurboramjetPerformanceSummary.jsx";
import EngineIntro from "./EngineIntro.jsx";
import AtmosphereReadout from "./AtmosphereReadout.jsx";
import TurboramjetEngineDiagram from "./TurboramjetEngineDiagram.jsx";
import TurboramjetMachSweep from "./TurboramjetMachSweep.jsx";
import StationTable from "./StationTable.jsx";
import Glossary from "./Glossary.jsx";
import ExpandableSection from "./ExpandableSection.jsx";
import FuelComparison from "./FuelComparison.jsx";

const STATION_LABELS = {
  a: "a — freestream",
  "2": "2 — intake exit (turbojet)",
  "3": "3 — compressor exit",
  "4": "4 — combustor exit / turbine inlet",
  "5": "5 — turbine exit",
  "6": "6 — afterburner exit",
  "7": "7 — turbojet nozzle exit",
  "8": "8 — intake exit (ramjet)",
  "9": "9 — ramjet combustor exit",
  "10": "10 — ramjet nozzle exit",
};
const ALL_ORDER = ["a", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

const STATION_TERMS = [
  { symbol: "T0", meaning: "Stagnation (total) temperature — what a thermometer would read if the flow were brought to rest here." },
  { symbol: "p0", meaning: "Stagnation (total) pressure — same idea, for pressure." },
  { symbol: "T", meaning: "Static temperature — the actual temperature of the moving air." },
  { symbol: "p", meaning: "Static pressure — the actual pressure of the moving air." },
  { symbol: "M", meaning: "Mach number — flow speed divided by the local speed of sound. Inside the engine (stations 2-6, 8, 9) the flow is treated as slow-moving, so static and stagnation values match there." },
  { symbol: "V", meaning: "Flow velocity." },
  { symbol: "ρ", meaning: "Density." },
  { symbol: "h", meaning: "Static specific enthalpy." },
  { symbol: "h0", meaning: "Stagnation specific enthalpy." },
];

/**
 * Results for one solved turboramjet. Only the running leg's stations
 * exist (both in "Both" mode). No T-s / p-v charts: those hard-code the
 * turbojet page's station set and can't show two parallel legs.
 */
export default function TurboramjetResultsPanel({ result, config, onToggleAfterburner }) {
  const order = ALL_ORDER.filter((k) => result.stations[k]);
  return (
    <div className="results-panel">
      <EngineIntro engineType="turboramjet" />
      <section>
        <h2>Overall performance</h2>
        <TurboramjetPerformanceSummary result={result} />
      </section>
      <TurboramjetEngineDiagram config={config} result={result} onToggleAfterburner={onToggleAfterburner} />
      <section>
        <h3>Atmosphere at this altitude</h3>
        <p className="section-note">
          ISA troposphere values at the configured altitude and flight Mach number — the free air the shared
          intake swallows (station a).
        </p>
        <AtmosphereReadout config={config} result={result} />
      </section>

      <TurboramjetMachSweep config={config} />

      <ExpandableSection
        title="Station analysis"
        summary="Stagnation and static properties (T0, p0, T, p, M, V, ρ, h, h0) at each station of the leg that's running — turbojet a, 2-7 and ramjet 8-10. Expand to view."
      >
        <StationTable stations={result.stations} stationOrder={order} stationLabels={STATION_LABELS} />
        <Glossary terms={STATION_TERMS} />
      </ExpandableSection>

      <FuelComparison engineType="turboramjet" config={config} />
    </div>
  );
}
