import RamjetPerformanceSummary from "./RamjetPerformanceSummary.jsx";
import EngineIntro from "./EngineIntro.jsx";
import AtmosphereReadout from "./AtmosphereReadout.jsx";
import RamjetEngineDiagram from "./RamjetEngineDiagram.jsx";
import RamjetMachSweep from "./RamjetMachSweep.jsx";
import StationTable from "./StationTable.jsx";
import Glossary from "./Glossary.jsx";
import ExpandableSection from "./ExpandableSection.jsx";
import FuelComparison from "./FuelComparison.jsx";

// Turbojet numbering with the compressor (3) and turbine (5) stations
// simply absent — there's nothing at them in a ramjet.
const RAMJET_STATION_ORDER = ["a", "2", "4", "9"];
const RAMJET_STATION_LABELS = {
  a: "a — freestream",
  "2": "2 — diffuser exit / combustor inlet",
  "4": "4 — combustor exit / nozzle inlet",
  "9": "9 — nozzle exit",
};

const STATION_TERMS = [
  { symbol: "T0", meaning: "Stagnation (total) temperature — what a thermometer would read if the flow were brought to rest here." },
  { symbol: "p0", meaning: "Stagnation (total) pressure — same idea, for pressure." },
  { symbol: "T", meaning: "Static temperature — the actual temperature of the moving air." },
  { symbol: "p", meaning: "Static pressure — the actual pressure of the moving air." },
  { symbol: "M", meaning: "Mach number — flow speed divided by the local speed of sound. Stations 2 and 4 are treated as slow-moving (the combustor needs low-speed air), so static and stagnation values match there." },
  { symbol: "V", meaning: "Flow velocity." },
  { symbol: "ρ", meaning: "Density." },
  { symbol: "h", meaning: "Static specific enthalpy." },
  { symbol: "h0", meaning: "Stagnation specific enthalpy." },
];

/**
 * The full results view for one solved ramjet — same shape as the
 * scramjet's, plus a flight-Mach sweep (the ramjet's defining
 * behaviour). No T-s / p-v charts: those hard-code the turbojet's six
 * stations (a, 2, 3, 4, 5, 9), and a ramjet has no 3 or 5.
 */
export default function RamjetResultsPanel({ result, config }) {
  const { performance, intake, nozzle, stations } = result;

  return (
    <div className="results-panel">
      <EngineIntro engineType="ramjet" />
      <RamjetEngineDiagram config={config} result={result} />
      <section>
        <h2>Overall performance</h2>
        <RamjetPerformanceSummary performance={performance} intake={intake} nozzle={nozzle} />
        <h3>Atmosphere at this altitude</h3>
        <p className="section-note">
          ISA troposphere values at the configured altitude and flight Mach number — the free air the intake
          swallows (station a).
        </p>
        <AtmosphereReadout config={config} result={result} />
      </section>

      <RamjetMachSweep config={config} />

      <ExpandableSection
        title="Station analysis"
        summary="Stagnation and static properties (T0, p0, T, p, M, V, ρ, h, h0) at the ramjet's four stations (a, 2, 4, 9). There are no stations 3 or 5, because there's no compressor or turbine. Expand to view."
      >
        <StationTable stations={stations} stationOrder={RAMJET_STATION_ORDER} stationLabels={RAMJET_STATION_LABELS} />
        <p className="section-note">
          From a to 2 the stagnation temperature doesn&rsquo;t change (the intake adds no energy, it only
          slows the air), while the stagnation pressure drops a little through shock and friction losses
          (recovery r<sub>d</sub> = {intake.r_d.toFixed(3)}). All of the temperature rise from 2 to 4 is
          the fuel burning.
        </p>
        <Glossary terms={STATION_TERMS} />
      </ExpandableSection>

      <FuelComparison engineType="ramjet" config={config} />
    </div>
  );
}
