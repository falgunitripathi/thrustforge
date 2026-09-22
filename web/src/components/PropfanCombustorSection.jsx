import { useState } from "react";
import NumberField from "./NumberField.jsx";

/**
 * Combustor configuration — same fuel-air-ratio energy balance as the
 * turbojet's/turbofan's (aeropropsim/combustor.py), reused directly; the
 * field is named T05 because that's this engine's own station numbering
 * (combustor exit / HPT inlet — reference/propfan.md §2.1), not a
 * different formula. The f=(1-b)*(...) prefactor (bleed) is applied in
 * the physics layer, not exposed as a separate combustor field here.
 */
export default function PropfanCombustorSection({ config, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <fieldset className="config-section">
      <legend>
        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} Combustor
        </button>
      </legend>
      {open && (
        <NumberField
          label="Combustor exit temperature (TIT)"
          value={config.T05}
          onChange={(v) => onChange({ T05: v })}
          min={1000}
          max={2000}
          step={10}
          hint="K — the fixed design target, T05 in this engine's own station numbering (§2.1), i.e. the HPT inlet. Same combustor energy balance as the turbojet's."
        />
      )}
    </fieldset>
  );
}
