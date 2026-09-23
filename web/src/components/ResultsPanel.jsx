import { lazy, Suspense } from "react";
import PerformanceSummary from "./PerformanceSummary.jsx";
import AtmosphereReadout from "./AtmosphereReadout.jsx";
import StationTable from "./StationTable.jsx";
import StageTable from "./StageTable.jsx";
import TsDiagram from "./TsDiagram.jsx";
import PvDiagram from "./PvDiagram.jsx";
import Glossary from "./Glossary.jsx";
import ConfigCompare from "./ConfigCompare.jsx";
import ExpandableSection from "./ExpandableSection.jsx";
import FuelComparison from "./FuelComparison.jsx";
import SectionSkeleton from "./SectionSkeleton.jsx";
import { fmt } from "../utils/format.js";

// These six sit behind a click-to-open panel already (either their own
// internal expand/modal, like EngineDiagram, or a self-wrapped
// <ExpandableSection>, like the rest) and together make up most of the JS
// bundle. React.lazy defers fetching each one's code until the results page
// actually renders it — which is always, just not on the very first paint —
// so the initial bundle only pays for the six small <Suspense> fallbacks
// below, not the charts/tables/SVGs inside.
const EngineDiagram = lazy(() => import("./EngineDiagram.jsx"));
const ParameterSweep = lazy(() => import("./ParameterSweep.jsx"));
const SensitivityOptimizer = lazy(() => import("./SensitivityOptimizer.jsx"));
const EngineSizing = lazy(() => import("./EngineSizing.jsx"));
const MissionAnalysis = lazy(() => import("./MissionAnalysis.jsx"));
const AssumptionsPanel = lazy(() => import("./AssumptionsPanel.jsx"));

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
 * The full results view for one solved EngineResult: overall performance
 * summary, the live engine diagram, the station-analysis table, per-stage
 * compressor/turbine tables, and a T-s process diagram. `config` is passed
 * through only so the engine diagram and the compressor note can read the
 * architecture choices (axial/centrifugal, blade tip speed) alongside the
 * solved numbers.
 */
export default function ResultsPanel({ result, config, savedConfigs, onSaveConfig, onRemoveConfig }) {
  const { performance, nozzle, compressor, turbine, stations } = result;

  return (
    <div className="results-panel">
      <section>
        <h2>Overall performance</h2>
        <PerformanceSummary performance={performance} nozzle={nozzle} ambientPressure={stations.a.p} />
        <h3>Atmosphere at this altitude</h3>
        <p className="section-note">
          ISA troposphere values at the configured altitude and flight
          Mach number — computed once here, then reused throughout (intake,
          nozzle, all sweeps below).
        </p>
        <AtmosphereReadout config={config} result={result} />
      </section>

      <Suspense fallback={<SectionSkeleton title="Live engine cutaway" />}>
        <EngineDiagram config={config} result={result} />
      </Suspense>

      <ExpandableSection
        title="Station analysis"
        summary="Stagnation and static properties (T0, p0, T, p, M, V, ρ, h, h0) at every station from intake to nozzle exit, numbered 1-6 in flow order (station keys a, 2, 3, 4, 5, 9 follow the textbook convention, which skips 6-8). Expand to view."
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
            {compressor.type === "centrifugal" && (
              <p className="section-note">
                In calculation form: you set blade tip speed U2 ={" "}
                {fmt(config.centrifugal_U2, 0)} m/s, and π_c is derived from it
                via π_c = [1 + η_c·(γ_c−1)·(U2/a01)²]^(γ_c/(γ_c−1)) — the
                pressure ratio is a result here, not something you dial in
                directly (§4.3).
              </p>
            )}
            <Glossary terms={STAGE_TERMS} />
          </section>

          <section>
            <h2>Turbine stages ({turbine.type})</h2>
            <StageTable stages={turbine.stages} kind="turbine" />
            <p className="section-note">
              Overall expansion ratio achieved: {fmt(1.0 / turbine.pr_actual, 3)}
            </p>
            <p className="section-note">
              Unlike the compressor above, this expansion ratio itself is
              fixed by the shaft power balance (from TIT and the
              compressor's power demand) before this table is built —
              turbine stage count only changes how that already-fixed
              expansion is broken up for display, not the thrust/TSFC
              you see elsewhere on this page (see README, "Known
              simplifications" item 8, for the quantified gap this leaves
              vs. a true stage-by-stage calculation).
            </p>
            {turbine.type === "radial" && (
              <p className="section-note">
                In calculation form: spouting velocity V0 ={" "}
                {fmt(turbine.V0_spouting, 1)} m/s (from the cycle's own T04 and
                T05), then blade tip speed U2 = 0.707 × V0 ={" "}
                {fmt(turbine.U2_sized, 1)} m/s. Both are calculated outputs
                here — you don't set them directly (§6.2).
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

      <Suspense fallback={<SectionSkeleton title="Parameter sweep" />}>
        <ParameterSweep config={config} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="Sensitivity & optimization" />}>
        <SensitivityOptimizer config={config} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="Engine sizing" />}>
        <EngineSizing config={config} result={result} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="Mission analysis" />}>
        <MissionAnalysis config={config} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="Assumptions" />}>
        <AssumptionsPanel config={config} />
      </Suspense>

      <ExpandableSection
        title="Saved configurations"
        summary="Snapshot the current configuration and its results, then compare several side by side. Saved here in your browser, so they're still here next time you open ThrustForge."
      >
        <ConfigCompare savedConfigs={savedConfigs} onSave={onSaveConfig} onRemove={onRemoveConfig} />
      </ExpandableSection>

      <FuelComparison engineType="turbojet" config={config} />
    </div>
  );
}

