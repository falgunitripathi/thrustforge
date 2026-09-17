import PerformanceSummary from "./PerformanceSummary.jsx";
import AtmosphereReadout from "./AtmosphereReadout.jsx";
import StationTable from "./StationTable.jsx";
import Glossary from "./Glossary.jsx";
import ExpandableSection from "./ExpandableSection.jsx";

const RAMJET_STATION_ORDER = ["a", "2", "4", "9"];
const RAMJET_STATION_LABELS = {
  a: "a — freestream",
  "2": "2 — diffuser exit (= combustor inlet, no compressor between them)",
  "4": "4 — combustor exit (nozzle inlet, no turbine between them)",
  "9": "9 — nozzle exit",
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
 * The full results view for one solved ramjet RamjetResult — same overall
 * shape as the turbojet's ResultsPanel, minus everything that only makes
 * sense with a compressor/turbine (stage tables, engine cutaway diagram,
 * shaft/matching readouts). `performance` and `nozzle` are structurally
 * identical to the turbojet's (see aeropropsim/ramjet.py), so
 * PerformanceSummary is reused as-is; `stations` only ever has a/2/4/9
 * (see StationTable's stationOrder/stationLabels props).
 */
export default function RamjetResultsPanel({ result, config }) {
  const { performance, nozzle, stations } = result;

  return (
    <div className="results-panel">
      <section>
        <h2>Overall performance</h2>
        <PerformanceSummary performance={performance} nozzle={nozzle} ambientPressure={stations.a.p} />
        {nozzle.choked && (
          <p className="section-note">
            This model only implements a convergent nozzle (same as the
            turbojet's v1 scope) — at supersonic flight Mach, that caps
            exit velocity at the local speed of sound regardless of how
            much hotter the combustor runs, so most of the available
            pressure energy shows up as pressure thrust rather than
            velocity, and efficiency comes out lower than a real ramjet
            with a properly expanded convergent-divergent nozzle would
            achieve at this flight condition. Click the Nozzle card above
            for the actual numbers behind this configuration's choked
            state.
          </p>
        )}
        <h3>Atmosphere at this altitude</h3>
        <p className="section-note">
          ISA troposphere values at the configured altitude and flight
          Mach number — computed once here, then reused throughout (intake,
          nozzle).
        </p>
        <AtmosphereReadout config={config} result={result} />
      </section>

      <ExpandableSection
        title="Station analysis"
        summary="Stagnation and static properties (T0, p0, T, p, M, V, ρ, h, h0) at every station from intake to nozzle exit. A ramjet has no compressor or turbine, so there's nothing at stations 3 or 5 — only a, 2, 4, 9 exist here. Expand to view."
      >
        <StationTable stations={stations} stationOrder={RAMJET_STATION_ORDER} stationLabels={RAMJET_STATION_LABELS} />
        <Glossary terms={STATION_TERMS} />
      </ExpandableSection>
    </div>
  );
}
