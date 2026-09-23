import { useState } from "react";
import NumberField from "./NumberField.jsx";

/**
 * Propeller / power-split configuration — the turboprop's defining
 * difference from the turbojet already in this codebase. Ref:
 * reference/turboprop.md §2.2.
 *
 * `alpha` is a genuine free design choice (how much of the turbine's
 * available enthalpy drop goes to the shaft/propeller vs. the residual
 * jet) — same status as the turbojet's pi_c or T04, not something the
 * physics derives on its own. The solved result's `alpha_opt` (shown in
 * the results panel) is the mathematically optimal split for THIS
 * flight condition, for comparison — this solver never auto-selects it.
 */
export default function PropellerSection({ config, onChange }) {
  const [open, setOpen] = useState(true);
  return (
    <fieldset className="config-section">
      <legend>
        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} Propeller
        </button>
      </legend>
      {open && (
        <>
          <NumberField
            label="Power split α"
            value={config.alpha}
            onChange={(v) => onChange({ alpha: v })}
            min={0.5}
            max={0.98}
            step={0.01}
            hint="fraction of the turbine's available enthalpy drop sent to the shaft/propeller — the rest goes to the residual jet (§2.2). Typical 0.80–0.90 (§3); compare against this configuration's mathematically optimal split shown in the results below."
          />
          <NumberField
            label="Propeller efficiency η_Pr"
            value={config.eta_Pr}
            onChange={(v) => onChange({ eta_Pr: v })}
            min={0.5}
            max={0.95}
            step={0.01}
            hint="fraction of shaft power the propeller converts to thrust power. Typical ~80% (§3)"
          />
          <NumberField
            label="Gearbox efficiency η_g"
            value={config.eta_g}
            onChange={(v) => onChange({ eta_g: v })}
            min={0.9}
            max={1.0}
            step={0.005}
            hint="reduction-gearbox mechanical efficiency between the turbine shaft and the (much slower-turning) propeller. Typical value"
          />
        </>
      )}
    </fieldset>
  );
}
