import { useState } from "react";
import NumberField from "./NumberField.jsx";

/**
 * Load-drive configuration — the turboshaft's defining difference from
 * the turbojet/turboprop already in this codebase: the turbine expands
 * fully to ambient and every bit of that work goes to an output shaft
 * driving an external load (a helicopter rotor, generator, marine
 * propulsor, ...) instead of any residual jet thrust. Ref:
 * reference/turboshaft.md §2.1.
 */
export default function LoadSection({ config, onChange }) {
  const [open, setOpen] = useState(true);
  return (
    <fieldset className="config-section">
      <legend>
        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} Load
        </button>
      </legend>
      {open && (
        <NumberField
          label="Load-drive mechanical efficiency η_m"
          value={config.eta_m}
          onChange={(v) => onChange({ eta_m: v })}
          min={0.85}
          max={1.0}
          step={0.005}
          hint="Wload = η_m·Wshaft (§2.1) — mechanical losses between the shaft and the actual load, e.g. rotor friction for a helicopter. NOT IN SOURCE numerically — carried over from this project's general η_m default."
        />
      )}
    </fieldset>
  );
}
