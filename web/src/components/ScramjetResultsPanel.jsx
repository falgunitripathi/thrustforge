import ScramjetPerformanceSummary from "./ScramjetPerformanceSummary.jsx";
import EngineIntro from "./EngineIntro.jsx";
import AtmosphereReadout from "./AtmosphereReadout.jsx";
import ScramjetEngineDiagram from "./ScramjetEngineDiagram.jsx";
import StationTable from "./StationTable.jsx";
import Glossary from "./Glossary.jsx";
import ExpandableSection from "./ExpandableSection.jsx";
import FuelComparison from "./FuelComparison.jsx";

// The source's own station numbering (reference/scramjet.md §2) — no
// "a" station: station 1 IS the freestream at the intake lip.
const SCRAMJET_STATION_ORDER = ["1", "2", "3", "4"];
const SCRAMJET_STATION_LABELS = {
  "1": "1 — freestream / intake inlet",
  "2": "2 — combustor entrance (supersonic)",
  "3": "3 — combustor exit / nozzle entrance (supersonic)",
  "4": "4 — nozzle exit (fully expanded)",
};

const STATION_TERMS = [
  { symbol: "T0", meaning: "Stagnation (total) temperature — what a thermometer would read if the flow were brought to rest here." },
  { symbol: "p0", meaning: "Stagnation (total) pressure — same idea, for pressure." },
  { symbol: "T", meaning: "Static temperature — the actual temperature of the moving air." },
  { symbol: "p", meaning: "Static pressure — the actual pressure of the moving air." },
  { symbol: "M", meaning: "Mach number — flow speed divided by the local speed of sound. Above 1 = supersonic; in a scramjet it stays above 1 at EVERY station, including through the combustor." },
  { symbol: "V", meaning: "Flow velocity." },
  { symbol: "ρ", meaning: "Density." },
  { symbol: "h", meaning: "Static specific enthalpy." },
  { symbol: "h0", meaning: "Stagnation specific enthalpy." },
];

/**
 * The full results view for one solved scramjet result — same shape as
 * the other engines' ResultsPanels, minus the stage tables (no
 * compressor/turbine at all) and minus the cycle diagrams.
 *
 * Cycle-diagrams decision (documented per the task brief): TsDiagram and
 * PvDiagram hard-code the station keys a, 2, 3, 4, 5, 9. This engine's
 * stations are 1, 2, 3, 4 only — there's no "a", "5", or "9" — so those
 * charts would either crash on the missing keys or plot a partial,
 * misleading path. The section is deliberately left out rather than
 * shipping a broken chart. (The expanded engine diagram still shows
 * T0/p0/Mach trends across all four stations.)
 */
export default function ScramjetResultsPanel({ result, config }) {
  const { performance, combustor, intake, stations } = result;

  return (
    <div className="results-panel">
      <EngineIntro engineType="scramjet" />
      <ScramjetEngineDiagram config={config} result={result} />
      <section>
        <h2>Overall performance</h2>
        <ScramjetPerformanceSummary performance={performance} combustor={combustor} intake={intake} />
        <h3>Atmosphere at this altitude</h3>
        <p className="section-note">
          ISA troposphere values at the configured altitude and flight
          Mach number — this is station 1, the free air right at the
          intake lip, reused by the intake and as the nozzle&rsquo;s
          exit pressure (fully expanded to ambient).
        </p>
        <AtmosphereReadout config={config} result={result} />
      </section>

      <ExpandableSection
        title="Station analysis"
        summary="Stagnation and static properties (T0, p0, T, p, M, V, ρ, h, h0) at the scramjet's four stations (1, 2, 3, 4) — note the Mach number column: it stays above 1 (supersonic) at every station, including both ends of the combustor. Expand to view."
      >
        <StationTable stations={stations} stationOrder={SCRAMJET_STATION_ORDER} stationLabels={SCRAMJET_STATION_LABELS} />
        <p className="section-note">
          Stations 2 and 3 — the combustor&rsquo;s entrance and exit — are
          both supersonic (M2 = {stations["2"].M.toFixed(2)}, M3 ={" "}
          {stations["3"].M.toFixed(2)}). That&rsquo;s the whole point of a
          scramjet: the fuel burns in air that is still moving faster than
          sound.
        </p>
        <Glossary terms={STATION_TERMS} />
      </ExpandableSection>

      <FuelComparison engineType="scramjet" config={config} />
    </div>
  );
}
