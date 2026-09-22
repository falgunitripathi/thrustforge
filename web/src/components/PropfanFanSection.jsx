import { useState } from "react";
import NumberField from "./NumberField.jsx";

/**
 * Unducted fan (UDF) configuration — the propfan's defining difference
 * from every other engine in this codebase: the fan sits directly in
 * the freestream (no intake diffuser ahead of it), modelled as its own
 * compressor stage with its own pressure ratio/efficiency, not folded
 * into a single "propeller efficiency" like the turboprop's `eta_Pr`.
 * Ref: reference/propfan.md §2.2, §5 (judgment call #5).
 *
 * NOT IN SOURCE numerically (reference/propfan.md §3): the source gives
 * no numeric pi_UDF/eta_UDF anywhere in the extracted transcript, only
 * qualitative context (supersonic tip speed, effective bypass ~25) —
 * every default here is chosen in the same provisional spirit as
 * turbofan.py's own fan defaults, not this project's primary reference.
 */
export default function PropfanFanSection({ config, onChange }) {
  const [open, setOpen] = useState(true);
  return (
    <fieldset className="config-section">
      <legend>
        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} Unducted fan (UDF)
        </button>
      </legend>
      {open && (
        <>
          <NumberField
            label="Fan pressure ratio π_UDF"
            value={config.pi_UDF}
            onChange={(v) => onChange({ pi_UDF: v })}
            min={1.02}
            max={2.0}
            step={0.01}
            hint="UDF = Unducted Fan, this engine's open-rotor fan (see this section's title). p011 = p010·π_UDF (§2.2). NOT IN SOURCE numerically; kept modest since the fan is unducted and sized directly off the freestream, not the ducted core."
          />
          <NumberField
            label="Fan efficiency η_UDF"
            value={config.eta_UDF}
            onChange={(v) => onChange({ eta_UDF: v })}
            min={0.5}
            max={0.98}
            step={0.01}
            hint="UDF = Unducted Fan (see this section's title). T011/T010 = 1 + (π_UDF^((γ−1)/γ)−1)/η_UDF (§2.2). NOT IN SOURCE numerically."
          />
        </>
      )}
    </fieldset>
  );
}
