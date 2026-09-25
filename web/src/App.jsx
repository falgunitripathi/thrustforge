import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { defaultEngineConfig, solveEngine } from "./physics/engine.js";
import { defaultTurbopropConfig, solveTurboprop } from "./physics/turboprop.js";
import { defaultTurboshaftConfig, solveTurboshaft } from "./physics/turboshaft.js";
import { defaultTurbofanConfig, solveTurbofan } from "./physics/turbofan.js";
import { defaultPropfanConfig, solvePropfan } from "./physics/propfan.js";
import { defaultScramjetConfig, solveScramjet } from "./physics/scramjet.js";
import { defaultRamjetConfig, solveRamjet } from "./physics/ramjet.js";
import { defaultTurboramjetConfig, solveTurboramjet } from "./physics/turboramjet.js";
import { defaultTwinSpoolTurbojetConfig, solveTwinSpoolTurbojet } from "./physics/twinSpoolTurbojet.js";
import { buildShareUrl, configFromSearchParams } from "./utils/shareLink.js";
import ConfigForm from "./components/ConfigForm.jsx";
import ResultsPanel from "./components/ResultsPanel.jsx";
import TurbopropConfigForm from "./components/TurbopropConfigForm.jsx";
import TurboshaftConfigForm from "./components/TurboshaftConfigForm.jsx";
import TurbofanConfigForm from "./components/TurbofanConfigForm.jsx";
import PropfanConfigForm from "./components/PropfanConfigForm.jsx";
import ScramjetConfigForm from "./components/ScramjetConfigForm.jsx";
import RamjetConfigForm from "./components/RamjetConfigForm.jsx";
import TurboramjetConfigForm from "./components/TurboramjetConfigForm.jsx";
import TwinSpoolTurbojetConfigForm from "./components/TwinSpoolTurbojetConfigForm.jsx";
import SectionSkeleton from "./components/SectionSkeleton.jsx";
import ResultsErrorBoundary from "./components/ResultsErrorBoundary.jsx";
import { explainError } from "./utils/errorText.js";
import { ENGINE_INFO } from "./utils/engineInfo.js";
import "./App.css";

// Every engine except the default turbojet loads its results panel on
// first use, so the initial bundle only carries the turbojet's.
const TurbopropResultsPanel = lazy(() => import("./components/TurbopropResultsPanel.jsx"));
const TurboshaftResultsPanel = lazy(() => import("./components/TurboshaftResultsPanel.jsx"));
const TurbofanResultsPanel = lazy(() => import("./components/TurbofanResultsPanel.jsx"));
const PropfanResultsPanel = lazy(() => import("./components/PropfanResultsPanel.jsx"));
const ScramjetResultsPanel = lazy(() => import("./components/ScramjetResultsPanel.jsx"));
const RamjetResultsPanel = lazy(() => import("./components/RamjetResultsPanel.jsx"));
const TurboramjetResultsPanel = lazy(() => import("./components/TurboramjetResultsPanel.jsx"));
const TwinSpoolTurbojetResultsPanel = lazy(() => import("./components/TwinSpoolTurbojetResultsPanel.jsx"));


const SAVED_CONFIGS_KEY = "thrustforge:savedConfigs";

const ENGINE_TYPES = [
  { value: "turbojet", label: "Turbojet" },
  { value: "turboprop", label: "Turboprop" },
  { value: "turboshaft", label: "Turboshaft" },
  { value: "turbofan", label: "Turbofan" },
  { value: "propfan", label: "Propfan" },
  { value: "turboramjet", label: "Turboramjet" },
  { value: "ramjet", label: "Ramjet" },
  { value: "scramjet", label: "Scramjet" },
];

// Variants sit under their engine's tab: the turbojet's are separate
// engine types (own solver), the turbofan's are layouts of one config.
const TURBOJET_VARIANTS = [
  { id: "turbojet", label: "Single-spool" },
  { id: "turbojet2", label: "Two-spool" },
];
const TURBOFAN_LAYOUTS = [
  { id: "unmixed", label: "Unmixed" },
  { id: "mixed", label: "Mixed-flow" },
  { id: "geared", label: "Geared" },
  { id: "three_spool", label: "Three-spool" },
];
// Starting values when switching turbofan layout (general-literature
// figures for each type; the mixed-flow bypass ratio is solved).
// Each is checked to solve across the envelope (sea-level take-off to
// 11 km cruise); the geared one cruises ~5% leaner than the unmixed one.
const TURBOFAN_LAYOUT_DEFAULTS = {
  unmixed: { beta: 5.0, pi_f: 1.65, pi_LPC: 1.5, pi_HPC: 12.0, T05: 1500.0 },
  mixed: { pi_f: 3.0, pi_LPC: 1.0, pi_HPC: 12.0, T05: 1500.0 },
  geared: { beta: 11.0, pi_f: 1.45, pi_LPC: 1.6, pi_HPC: 15.0, T05: 1700.0, afterburner_on: false },
  three_spool: { beta: 8.0, pi_f: 1.5, pi_LPC: 5.0, pi_HPC: 5.0, T05: 1650.0, afterburner_on: false },
};
function tabGroup(engineType) {
  return engineType === "turbojet2" ? "turbojet" : engineType;
}

// A link opens the app at exactly the configuration it was built from:
// any recognized query param overrides that one field of the default
// config, so a link missing a field (or an older link, from before some
// field existed) still falls back sanely instead of breaking.
function initialConfig() {
  const params = new URLSearchParams(window.location.search);
  const patch = configFromSearchParams(params);
  // A shared link encodes its changes relative to the physics defaults,
  // so it must be rebuilt on those; a plain visit opens at cruise instead.
  // Only real config keys count: unrelated params (?utm_…, cache-busters)
  // must not turn a plain visit into a static ground run.
  const base = Object.keys(patch).length ? defaultEngineConfig() : startingTurbojetConfig();
  return { ...base, ...patch };
}

// What a first-time visitor sees: a realistic cruise point (10 km,
// Mach 0.8) with an 8-stage compressor, rather than the physics default's
// static ground run, whose propulsive/overall efficiency is 0% (no flight
// speed, no useful work) and reads as a bug on first sight.
function startingTurbojetConfig() {
  return { ...defaultEngineConfig(), altitude_m: 10000, mach_flight: 0.8, n_compressor_stages: 8 };
}

// localStorage can throw (Safari private mode, disabled storage, quota),
// and a previous version's JSON could in principle be malformed — either
// way this is a nice-to-have, never something that should crash the app.
function loadSavedConfigs() {
  try {
    const raw = localStorage.getItem(SAVED_CONFIGS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * ThrustForge — a single-spool turbojet performance simulator.
 *
 * All physics runs client-side, ported module-by-module from the
 * validated Python engineering core (see src/physics/*.js and the
 * top-level README) — this is a static site with no backend by design,
 * so it always works when someone clicks the link. (The Python package
 * underneath is still called `aeropropsim` — that's internal plumbing,
 * not the project's name.)
 */
function App() {
  // Which engine's cycle is being configured — each engine type keeps its
  // own independent config, so switching back and forth never loses what
  // was dialed in on the other one.
  const [engineType, setEngineType] = useState("turbojet");
  const [config, setConfig] = useState(initialConfig);
  const [turbopropConfig, setTurbopropConfig] = useState(defaultTurbopropConfig);
  const [turboshaftConfig, setTurboshaftConfig] = useState(defaultTurboshaftConfig);
  const [turbofanConfig, setTurbofanConfig] = useState(defaultTurbofanConfig);
  const [propfanConfig, setPropfanConfig] = useState(defaultPropfanConfig);
  const [scramjetConfig, setScramjetConfig] = useState(defaultScramjetConfig);
  const [ramjetConfig, setRamjetConfig] = useState(defaultRamjetConfig);
  const [turboramjetConfig, setTurboramjetConfig] = useState(defaultTurboramjetConfig);
  const [twinSpoolConfig, setTwinSpoolConfig] = useState(defaultTwinSpoolTurbojetConfig);
  const [turbojetVariant, setTurbojetVariant] = useState("turbojet");
  const [savedConfigs, setSavedConfigs] = useState(loadSavedConfigs);
  // The whole left configuration sidebar can be tucked away to free up
  // width for the results column — separate from each section's own
  // individual disclosure toggle inside ConfigForm.
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const patchConfig = (patch) => setConfig((prev) => ({ ...prev, ...patch }));
  const resetConfig = () => setConfig(startingTurbojetConfig());
  const patchTurbopropConfig = (patch) => setTurbopropConfig((prev) => ({ ...prev, ...patch }));
  const resetTurbopropConfig = () => setTurbopropConfig(defaultTurbopropConfig());
  const patchTurboshaftConfig = (patch) => setTurboshaftConfig((prev) => ({ ...prev, ...patch }));
  const resetTurboshaftConfig = () => setTurboshaftConfig(defaultTurboshaftConfig());
  const patchTurbofanConfig = (patch) => setTurbofanConfig((prev) => ({ ...prev, ...patch }));
  const resetTurbofanConfig = () => setTurbofanConfig((prev) => ({
    ...defaultTurbofanConfig(), ...TURBOFAN_LAYOUT_DEFAULTS[prev.layout], layout: prev.layout,
  }));
  const patchPropfanConfig = (patch) => setPropfanConfig((prev) => ({ ...prev, ...patch }));
  const resetPropfanConfig = () => setPropfanConfig(defaultPropfanConfig());
  const patchScramjetConfig = (patch) => setScramjetConfig((prev) => ({ ...prev, ...patch }));
  const resetScramjetConfig = () => setScramjetConfig(defaultScramjetConfig());
  const patchRamjetConfig = (patch) => setRamjetConfig((prev) => ({ ...prev, ...patch }));
  const resetRamjetConfig = () => setRamjetConfig(defaultRamjetConfig());
  const patchTurboramjetConfig = (patch) => setTurboramjetConfig((prev) => ({ ...prev, ...patch }));
  const resetTurboramjetConfig = () => setTurboramjetConfig(defaultTurboramjetConfig());
  const patchTwinSpoolConfig = (patch) => setTwinSpoolConfig((prev) => ({ ...prev, ...patch }));
  const resetTwinSpoolConfig = () => setTwinSpoolConfig(defaultTwinSpoolTurbojetConfig());
  const setTurbofanLayout = (layout) => setTurbofanConfig((prev) => ({
    ...prev, ...TURBOFAN_LAYOUT_DEFAULTS[layout], layout,
  }));

  // Keep the address bar itself as a live, shareable link to the current
  // turbojet configuration — replaceState (not pushState) so tweaking a
  // slider doesn't spam the browser's back-button history. Shareable
  // links aren't wired up for the turboprop config yet (Phase 3's
  // shareLink util is keyed to EngineConfig's own field set) — the
  // turboprop form has no "Copy shareable link" button, so nothing
  // implies it works.
  useEffect(() => {
    if (engineType !== "turbojet") return;
    window.history.replaceState(null, "", buildShareUrl(config));
  }, [config, engineType]);

  // Persist saved configurations across reloads. Every save/remove writes
  // straight through, so a refresh (or a link opened later) sees exactly
  // what was there before.
  useEffect(() => {
    try {
      localStorage.setItem(SAVED_CONFIGS_KEY, JSON.stringify(savedConfigs));
    } catch {
      // Storage full or unavailable — saved configs just stay in-memory
      // for this session, same as before this feature existed.
    }
  }, [savedConfigs]);

  const { result, error } = useMemo(() => {
    try {
      const solved =
        engineType === "turboprop" ? solveTurboprop(turbopropConfig)
        : engineType === "turboshaft" ? solveTurboshaft(turboshaftConfig)
        : engineType === "turbofan" ? solveTurbofan(turbofanConfig)
        : engineType === "propfan" ? solvePropfan(propfanConfig)
        : engineType === "scramjet" ? solveScramjet(scramjetConfig)
        : engineType === "ramjet" ? solveRamjet(ramjetConfig)
        : engineType === "turboramjet" ? solveTurboramjet(turboramjetConfig)
        : engineType === "turbojet2" ? solveTwinSpoolTurbojet(twinSpoolConfig)
        : solveEngine(config);
      return { result: solved, error: null };
    } catch (err) {
      return { result: null, error: err.message || String(err) };
    }
  }, [engineType, config, turbopropConfig, turboshaftConfig, turbofanConfig, propfanConfig, scramjetConfig, ramjetConfig, turboramjetConfig, twinSpoolConfig]);

  // Phase 2 — save & compare: each snapshot freezes the config AND its
  // already-solved result at save time, so later tweaks to the live
  // config never retroactively change a saved comparison row. Turbojet
  // only for now — ConfigCompare's columns are built around EngineConfig's
  // own fields, which don't apply to a turboprop.
  const saveConfig = (name) => {
    if (!result || engineType !== "turbojet") return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setSavedConfigs((prev) => [...prev, { id, name, config, result }]);
  };
  const removeConfig = (id) => {
    setSavedConfigs((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>ThrustForge</h1>
        <p className="app-subtitle">
          Build a jet engine, one number at a time. Change anything on the
          left — altitude, pressure ratio, turbine type — and watch the
          whole engine cycle re-solve instantly, right here in your browser.
        </p>
        <div className="engine-type-tabs" role="tablist" aria-label="Engine type">
          {ENGINE_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tabGroup(engineType) === t.value}
              className={`engine-type-tab${tabGroup(engineType) === t.value ? " engine-type-tab-active" : ""}`}
              onClick={() => setEngineType(t.value === "turbojet" ? turbojetVariant : t.value)}
              title={ENGINE_INFO[t.value]?.tagline}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tabGroup(engineType) === "turbojet" && (
          <div className="variant-tabs" role="group" aria-label="Turbojet variant">
            <span className="variant-label">Variant</span>
            {TURBOJET_VARIANTS.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={engineType === v.id}
                className={`variant-tab${engineType === v.id ? " variant-tab-active" : ""}`}
                title={ENGINE_INFO[v.id]?.tagline}
                onClick={() => { setEngineType(v.id); setTurbojetVariant(v.id); }}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
        {engineType === "turbofan" && (
          <div className="variant-tabs" role="group" aria-label="Turbofan layout">
            <span className="variant-label">Layout</span>
            {TURBOFAN_LAYOUTS.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={turbofanConfig.layout === v.id}
                className={`variant-tab${turbofanConfig.layout === v.id ? " variant-tab-active" : ""}`}
                title={ENGINE_INFO[v.id === "unmixed" ? "turbofan" : `turbofan_${v.id}`]?.tagline}
                onClick={() => setTurbofanLayout(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className={`app-main${sidebarOpen ? "" : " app-main-sidebar-collapsed"}`}>
        {sidebarOpen ? (
          engineType === "turboprop" ? (
            <TurbopropConfigForm
              config={turbopropConfig}
              result={result}
              onChange={patchTurbopropConfig}
              onReset={resetTurbopropConfig}
              onCollapse={() => setSidebarOpen(false)}
            />
          ) : engineType === "turboshaft" ? (
            <TurboshaftConfigForm
              config={turboshaftConfig}
              result={result}
              onChange={patchTurboshaftConfig}
              onReset={resetTurboshaftConfig}
              onCollapse={() => setSidebarOpen(false)}
            />
          ) : engineType === "turbofan" ? (
            <TurbofanConfigForm
              config={turbofanConfig}
              result={result}
              onChange={patchTurbofanConfig}
              onReset={resetTurbofanConfig}
              onCollapse={() => setSidebarOpen(false)}
            />
          ) : engineType === "propfan" ? (
            <PropfanConfigForm
              config={propfanConfig}
              result={result}
              onChange={patchPropfanConfig}
              onReset={resetPropfanConfig}
              onCollapse={() => setSidebarOpen(false)}
            />
          ) : engineType === "scramjet" ? (
            <ScramjetConfigForm
              config={scramjetConfig}
              result={result}
              onChange={patchScramjetConfig}
              onReset={resetScramjetConfig}
              onCollapse={() => setSidebarOpen(false)}
            />
          ) : engineType === "turbojet2" ? (
            <TwinSpoolTurbojetConfigForm
              config={twinSpoolConfig}
              result={result}
              onChange={patchTwinSpoolConfig}
              onReset={resetTwinSpoolConfig}
              onCollapse={() => setSidebarOpen(false)}
            />
          ) : engineType === "turboramjet" ? (
            <TurboramjetConfigForm
              config={turboramjetConfig}
              result={result}
              onChange={patchTurboramjetConfig}
              onReset={resetTurboramjetConfig}
              onCollapse={() => setSidebarOpen(false)}
            />
          ) : engineType === "ramjet" ? (
            <RamjetConfigForm
              config={ramjetConfig}
              result={result}
              onChange={patchRamjetConfig}
              onReset={resetRamjetConfig}
              onCollapse={() => setSidebarOpen(false)}
            />
          ) : (
            <ConfigForm
              config={config}
              result={result}
              onChange={patchConfig}
              onReset={resetConfig}
              onCollapse={() => setSidebarOpen(false)}
            />
          )
        ) : (
          <button
            type="button"
            className="sidebar-reopen-button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Show engine configuration panel"
            title="Show engine configuration panel"
          >
            <span aria-hidden="true">☰</span>
            <span className="sidebar-reopen-label">Configuration</span>
          </button>
        )}

        <div className="results-area">
          <ResultsErrorBoundary resetKey={engineType + JSON.stringify(result?.config ?? error)}>
          <Suspense fallback={<SectionSkeleton title="Loading results" />}>
          {error ? (
            <div className="error-banner">
              <span className="error-icon" aria-hidden="true">
                🚫
              </span>
              <div>
                <strong>Not possible</strong>
                <p>
                  This combination doesn&rsquo;t work as a real engine. Try
                  adjusting one of the numbers on the left — a small change
                  is usually all it takes.
                </p>
                {/* The solvers' own checks name the fix; deeper physics
                    errors are mapped to a plain explanation (errorText.js). */}
                {explainError(error) && <p>{explainError(error)}</p>}
              </div>
            </div>
          ) : engineType === "turboprop" ? (
            <TurbopropResultsPanel result={result} config={turbopropConfig} />
          ) : engineType === "turboshaft" ? (
            <TurboshaftResultsPanel result={result} config={turboshaftConfig} />
          ) : engineType === "turbofan" ? (
            <TurbofanResultsPanel result={result} config={turbofanConfig} onToggleAfterburner={(on) => patchTurbofanConfig({ afterburner_on: on })} />
          ) : engineType === "propfan" ? (
            <PropfanResultsPanel result={result} config={propfanConfig} />
          ) : engineType === "scramjet" ? (
            <ScramjetResultsPanel result={result} config={scramjetConfig} />
          ) : engineType === "turbojet2" ? (
            <TwinSpoolTurbojetResultsPanel result={result} config={twinSpoolConfig} onToggleAfterburner={(on) => patchTwinSpoolConfig({ afterburner_on: on })} />
          ) : engineType === "turboramjet" ? (
            <TurboramjetResultsPanel result={result} config={turboramjetConfig} onToggleAfterburner={(on) => patchTurboramjetConfig({ afterburner_on: on })} />
          ) : engineType === "ramjet" ? (
            <RamjetResultsPanel result={result} config={ramjetConfig} />
          ) : (
            <ResultsPanel
              result={result}
              config={config}
              savedConfigs={savedConfigs}
              onSaveConfig={saveConfig}
              onRemoveConfig={removeConfig}
              onToggleAfterburner={(on) => patchConfig({ afterburner_on: on })}
            />
          )}
          </Suspense>
          </ResultsErrorBoundary>
        </div>
      </main>

      <footer className="app-footer">
        <p>
          ThrustForge — an educational jet-engine simulator. Every number is
          worked out live in your browser from textbook propulsion equations;
          use &ldquo;Download formulas&rdquo; in the left panel to see every
          equation an engine uses.
        </p>
      </footer>
    </div>
  );
}

export default App;
