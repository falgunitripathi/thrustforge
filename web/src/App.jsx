import { useEffect, useMemo, useState } from "react";
import { defaultEngineConfig, solveEngine } from "./physics/engine.js";
import { defaultTurbopropConfig, solveTurboprop } from "./physics/turboprop.js";
import { defaultTurboshaftConfig, solveTurboshaft } from "./physics/turboshaft.js";
import { defaultTurbofanConfig, solveTurbofan } from "./physics/turbofan.js";
import { buildShareUrl, configFromSearchParams } from "./utils/shareLink.js";
import ConfigForm from "./components/ConfigForm.jsx";
import ResultsPanel from "./components/ResultsPanel.jsx";
import TurbopropConfigForm from "./components/TurbopropConfigForm.jsx";
import TurbopropResultsPanel from "./components/TurbopropResultsPanel.jsx";
import TurboshaftConfigForm from "./components/TurboshaftConfigForm.jsx";
import TurboshaftResultsPanel from "./components/TurboshaftResultsPanel.jsx";
import TurbofanConfigForm from "./components/TurbofanConfigForm.jsx";
import TurbofanResultsPanel from "./components/TurbofanResultsPanel.jsx";
import "./App.css";

const SAVED_CONFIGS_KEY = "thrustforge:savedConfigs";

const ENGINE_TYPES = [
  { value: "turbojet", label: "Turbojet" },
  { value: "turboprop", label: "Turboprop" },
  { value: "turboshaft", label: "Turboshaft" },
  { value: "turbofan", label: "Turbofan" },
];

// A link opens the app at exactly the configuration it was built from:
// any recognized query param overrides that one field of the default
// config, so a link missing a field (or an older link, from before some
// field existed) still falls back sanely instead of breaking.
function initialConfig() {
  const patch = configFromSearchParams(new URLSearchParams(window.location.search));
  return { ...defaultEngineConfig(), ...patch };
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
  const [savedConfigs, setSavedConfigs] = useState(loadSavedConfigs);
  // The whole left configuration sidebar can be tucked away to free up
  // width for the results column — separate from each section's own
  // individual disclosure toggle inside ConfigForm.
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const patchConfig = (patch) => setConfig((prev) => ({ ...prev, ...patch }));
  const resetConfig = () => setConfig(defaultEngineConfig());
  const patchTurbopropConfig = (patch) => setTurbopropConfig((prev) => ({ ...prev, ...patch }));
  const resetTurbopropConfig = () => setTurbopropConfig(defaultTurbopropConfig());
  const patchTurboshaftConfig = (patch) => setTurboshaftConfig((prev) => ({ ...prev, ...patch }));
  const resetTurboshaftConfig = () => setTurboshaftConfig(defaultTurboshaftConfig());
  const patchTurbofanConfig = (patch) => setTurbofanConfig((prev) => ({ ...prev, ...patch }));
  const resetTurbofanConfig = () => setTurbofanConfig(defaultTurbofanConfig());

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
        : solveEngine(config);
      return { result: solved, error: null };
    } catch (err) {
      return { result: null, error: err.message || String(err) };
    }
  }, [engineType, config, turbopropConfig, turboshaftConfig, turbofanConfig]);

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
              aria-selected={engineType === t.value}
              className={`engine-type-tab${engineType === t.value ? " engine-type-tab-active" : ""}`}
              onClick={() => setEngineType(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className={`app-main${sidebarOpen ? "" : " app-main-sidebar-collapsed"}`}>
        {sidebarOpen ? (
          engineType === "turboprop" ? (
            <TurbopropConfigForm
              config={turbopropConfig}
              onChange={patchTurbopropConfig}
              onReset={resetTurbopropConfig}
              onCollapse={() => setSidebarOpen(false)}
            />
          ) : engineType === "turboshaft" ? (
            <TurboshaftConfigForm
              config={turboshaftConfig}
              onChange={patchTurboshaftConfig}
              onReset={resetTurboshaftConfig}
              onCollapse={() => setSidebarOpen(false)}
            />
          ) : engineType === "turbofan" ? (
            <TurbofanConfigForm
              config={turbofanConfig}
              onChange={patchTurbofanConfig}
              onReset={resetTurbofanConfig}
              onCollapse={() => setSidebarOpen(false)}
            />
          ) : (
            <ConfigForm
              config={config}
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
              </div>
            </div>
          ) : engineType === "turboprop" ? (
            <TurbopropResultsPanel result={result} config={turbopropConfig} />
          ) : engineType === "turboshaft" ? (
            <TurboshaftResultsPanel result={result} config={turboshaftConfig} />
          ) : engineType === "turbofan" ? (
            <TurbofanResultsPanel result={result} config={turbofanConfig} />
          ) : (
            <ResultsPanel
              result={result}
              config={config}
              savedConfigs={savedConfigs}
              onSaveConfig={saveConfig}
              onRemoveConfig={removeConfig}
            />
          )}
        </div>
      </main>

      <footer className="app-footer">
        <p>
          Formulas cited section-by-section (Ref: §N) back to the project&rsquo;s
          compiled formula reference. See the repository README for
          validation status, known simplifications, and the two
          documented judgment calls (intake convention, choked-nozzle
          exit-temperature convention).
        </p>
      </footer>
    </div>
  );
}

export default App;
