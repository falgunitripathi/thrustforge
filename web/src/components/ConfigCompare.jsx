import { useState } from "react";
import { fmt, tsfcPerHour } from "../utils/format.js";
import { downloadCsv } from "../utils/csv.js";

/** Name + "Save" — snapshots the config/result the parent currently holds. */
function SaveConfigForm({ onSave }) {
  const [name, setName] = useState("");
  return (
    <form
      className="save-config-form"
      onSubmit={(e) => {
        e.preventDefault();
        // No name typed: save anyway under a time-stamped default rather
        // than silently doing nothing.
        const trimmed = name.trim() || `Configuration saved ${new Date().toLocaleTimeString()}`;
        onSave(trimmed);
        setName("");
      }}
    >
      <input
        type="text"
        className="save-config-input"
        placeholder="Name this configuration…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        aria-label="Configuration name"
      />
      <button type="submit" className="reset-button">Save current configuration</button>
    </form>
  );
}

function describeCompressor(cfg) {
  return cfg.compressor_type === "axial"
    ? `axial, π=${fmt(cfg.pi_c, 1)}`
    : `centrifugal, U2=${fmt(cfg.centrifugal_U2, 0)}`;
}

/**
 * Phase 2 — save the current configuration as a named snapshot (config +
 * its already-solved result, frozen at save time) and compare saved
 * snapshots side by side in one table, with a CSV export of that table.
 * `savedConfigs` is `[{ id, name, config, result }]`, owned by the parent
 * (App) so it survives the user tweaking the live config afterwards.
 */
export default function ConfigCompare({ savedConfigs, onSave, onRemove }) {
  const exportComparison = () => {
    const rows = savedConfigs.map((s) => ({
      Name: s.name,
      "Altitude (m)": s.config.altitude_m,
      "Mach": s.config.mach_flight,
      "Compressor type": s.config.compressor_type,
      "Pressure ratio / U2": s.config.compressor_type === "axial" ? s.config.pi_c : s.config.centrifugal_U2,
      "Turbine type": s.config.turbine_type,
      "T04 (K)": s.config.T04,
      "Afterburner": s.config.afterburner_on ? `on, T06 ${s.config.T06_ab} K` : "off",
      "Thrust (N)": s.result.performance.thrust,
      "TSFC (kg/(N·h))": tsfcPerHour(s.result.performance.tsfc),
      "Overall efficiency": s.result.performance.eta_overall,
    }));
    downloadCsv("thrustforge-comparison.csv", rows);
  };

  return (
    <div className="compare-wrap">
      <SaveConfigForm onSave={onSave} />
      {savedConfigs.length === 0 ? (
        <p className="section-note">
          No saved configurations yet — save the current one above, tweak
          the settings on the left, then save again to build a comparison.
        </p>
      ) : (
        <>
          <div className="table-scroll compare-table-scroll">
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Altitude</th>
                  <th>Mach</th>
                  <th>Compressor</th>
                  <th>Turbine</th>
                  <th>T04 (K)</th>
                  <th>Afterburner</th>
                  <th>Thrust (N)</th>
                  <th>TSFC (kg/(N·h))</th>
                  <th>Overall η</th>
                  <th aria-hidden="true"></th>
                </tr>
              </thead>
              <tbody>
                {savedConfigs.map((s) => (
                  <tr key={s.id}>
                    <td className="compare-name">{s.name}</td>
                    <td>{fmt(s.config.altitude_m, 0)} m</td>
                    <td>{fmt(s.config.mach_flight, 2)}</td>
                    <td>{describeCompressor(s.config)}</td>
                    <td>{s.config.turbine_type}</td>
                    <td>{fmt(s.config.T04, 0)}</td>
                    <td>{s.config.afterburner_on ? `on, ${fmt(s.config.T06_ab, 0)} K` : "off"}</td>
                    <td>{fmt(s.result.performance.thrust, 1)}</td>
                    <td>{fmt(tsfcPerHour(s.result.performance.tsfc), 3)}</td>
                    <td>
                      {s.result.performance.eta_overall !== null
                        ? `${fmt(s.result.performance.eta_overall * 100, 1)}%`
                        : "—"}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="compare-remove-button"
                        onClick={() => onRemove(s.id)}
                        aria-label={`Remove ${s.name}`}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="reset-button" onClick={exportComparison}>
            Export comparison CSV
          </button>
        </>
      )}
    </div>
  );
}

