import { useEffect, useMemo, useState } from "react";
import { defaultEngineConfig, solveEngine } from "./physics/engine.js";
import { buildShareUrl, configFromSearchParams } from "./utils/shareLink.js";
import ConfigForm from "./components/ConfigForm.jsx";
import ResultsPanel from "./components/ResultsPanel.jsx";
import "./App.css";

const SAVED_CONFIGS_KEY = "thrustforge:savedConfigs";

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
  const [config, setConfig] = useState(initialConfig);
  const [savedConfigs, setSavedConfigs] = useState(loadSavedConfigs);
  // The whole left configuration sidebar can be tucked away to free up
  // width for the results column — separate from each section's own
  // individual disclosure toggle inside ConfigForm.
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const patchConfig = (patch) => setConfig((prev) => ({ ...prev, ...patch }));
  const resetConfig = () => setConfig(defaultEngineConfig());

  // Keep the address bar itself as a live, shareable link to the current
  // configuration — replaceState (not pushState) so tweaking a slider
  // doesn't spam the browser's back-button history.
  useEffect(() => {
    window.history.replaceState(null, "", buildShareUrl(config));
  }, [config]);

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
      return { result: solveEngine(config), error: null };
    } catch (err) {
      return { result: null, error: err.message || String(err) };
    }
  }, [config]);

  // Phase 2 — save & compare: each snapshot freezes the config AND its
  // already-solved result at save time, so later tweaks to the live
  // config never retroactively change a saved comparison row.
  const saveConfig = (name) => {
    if (!result) return;
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
      </header>

      <main className={`app-main${sidebarOpen ? "" : " app-main-sidebar-collapsed"}`}>
        {sidebarOpen ? (
          <ConfigForm
            config={config}
            onChange={patchConfig}
            onReset={resetConfig}
            onCollapse={() => setSidebarOpen(false)}
          />
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
