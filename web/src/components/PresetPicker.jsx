import { useState } from "react";
import { METRICS } from "../utils/presets.js";
import { fmt } from "../utils/format.js";

/**
 * "Load a real engine" menu plus, once one is loaded, a live
 * published-vs-model card. The model column re-solves as settings change,
 * so students can see which inputs close (or open) the gap.
 *
 * Optional by design: the site is for building your own engine, so this
 * sits collapsed and defaults to "My own design".
 */
export default function PresetPicker({ presets, active, result, onLoad, onClear }) {
  const [open, setOpen] = useState(false);
  if (!presets?.length) return null;
  const preset = presets.find((p) => p.id === active);
  const expanded = open || !!preset;

  return (
    <fieldset className="config-section preset-picker">
      <legend>
        <button type="button" className="disclosure" aria-expanded={expanded} onClick={() => setOpen(!expanded)}>
          {expanded ? "▾" : "▸"} Start from a real engine <span className="preset-optional">(optional)</span>
        </button>
      </legend>
      {expanded && (
      <>
      <p className="section-note">
        You&rsquo;re building your own engine — every setting below is yours to change. If you like, load a
        real engine&rsquo;s settings as a starting point instead and see how close the model gets to it.
      </p>
      <label className="field">
        <span className="field-label">Starting point</span>
        <select
          value={preset ? preset.id : ""}
          onChange={(e) => {
            const next = presets.find((p) => p.id === e.target.value);
            if (next) onLoad(next);
            else onClear();
          }}
        >
          <option value="">My own design</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      {preset && (
        <div className="preset-card">
          <div className="preset-card-head">
            <div>
              <strong>{preset.name}</strong>
              <span className="preset-card-aircraft">{preset.aircraft}</span>
            </div>
            <button type="button" className="preset-card-close" onClick={onClear} aria-label="Close real-engine comparison">
              ×
            </button>
          </div>
          <p>{preset.blurb}</p>
          <table className="preset-table">
            <thead>
              <tr>
                <th scope="col"></th>
                <th scope="col">Published</th>
                <th scope="col">This model</th>
              </tr>
            </thead>
            <tbody>
              {preset.published.map((row) => {
                const m = row.metric && METRICS[row.metric];
                if (!m) {
                  return (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      <td colSpan={2}>{row.text}</td>
                    </tr>
                  );
                }
                let model = null;
                try {
                  model = result ? m.get(result) : null;
                } catch {
                  model = null;
                }
                const ok = Number.isFinite(model);
                const diff = ok ? (model - row.value) / row.value : null;
                return (
                  <tr key={row.metric}>
                    <th scope="row">
                      {m.label}
                      {m.unit && <span className="preset-unit"> {m.unit}</span>}
                    </th>
                    <td>{row.text ?? fmt(row.value, m.digits)}</td>
                    <td>
                      {ok ? fmt(model, m.digits) : "—"}
                      {ok && (
                        <span className={`preset-diff${Math.abs(diff) <= 0.1 ? " preset-diff-close" : ""}`}>
                          {Math.round(diff * 100) === 0 ? "" : diff > 0 ? "+" : "−"}
                          {fmt(Math.abs(diff) * 100, 0)}%
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="preset-note">{preset.note}</p>
          <p className="preset-note">
            Published figures are rough public values (type sheets, as listed on Wikipedia). A textbook cycle
            model won&rsquo;t match exactly — real engines add cooled turbines, variable geometry and bleed air —
            but within 10-20% is a good result. Change any setting and the model column updates.
          </p>
        </div>
      )}
      </>
      )}
    </fieldset>
  );
}
