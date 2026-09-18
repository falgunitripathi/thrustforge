import { useState } from "react";
import NumberField from "./NumberField.jsx";
import SelectField from "./SelectField.jsx";

/**
 * Turbine configuration — Ref §6 (Turbine).
 *
 * The turbine's thermodynamic station values (T05, p05) always come from
 * something decided BEFORE this choice — the §7 shaft power balance for
 * a turbojet, or the configured power split for a turboprop (see
 * aeropropsim/turboprop.py) — not from the turbine architecture itself.
 * Axial vs. radial only changes how many stages are used to reach that
 * already-fixed expansion (see engine.js/turboprop.js module docstrings).
 * Radial turbines are single-stage only, per the source's own design
 * guidance (§6.2). This is intentional, not a bug: switching this
 * dropdown redraws the per-stage table below without moving any number
 * on the results panel.
 *
 * Collapsed by default — click the legend to open it.
 */
export default function TurbineSection({ config, onChange }) {
  const [open, setOpen] = useState(false);
  const isAxial = config.turbine_type === "axial";
  return (
    <fieldset className="config-section">
      <legend>
        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} Turbine
        </button>
      </legend>
      {open && (
        <>
          <SelectField
            label="Type"
            value={config.turbine_type}
            onChange={(v) => onChange({
              turbine_type: v,
              ...(v === "radial" ? { n_turbine_stages: 1 } : {}),
            })}
            options={[
              { value: "axial", label: "Axial (stage-stacked)" },
              { value: "radial", label: "Radial-inflow" },
            ]}
            hint="architecture choice only — it changes how the turbine's already-fixed expansion is staged/sized for the diagram and stage table below, not thrust or any other overall-performance number"
          />
          <NumberField
            label="Number of stages"
            value={config.n_turbine_stages}
            onChange={(v) => onChange({ n_turbine_stages: Math.max(1, Math.round(v)) })}
            min={1}
            max={10}
            step={1}
            disabled={!isAxial}
            hint={
              !isAxial
                ? "radial turbines are single-stage only (§6.2)"
                : "splits the same overall expansion into more/fewer stages for the per-stage table below — it doesn't change thrust, TSFC, or any other overall-performance number"
            }
          />
        </>
      )}
    </fieldset>
  );
}
