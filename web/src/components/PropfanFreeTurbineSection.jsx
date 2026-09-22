import { useState } from "react";
import NumberField from "./NumberField.jsx";

/**
 * Free (power) turbine configuration — Ref: reference/propfan.md
 * §2.3-2.4. This turbine sits downstream of the gas generator (HPT/IPT)
 * and alpha-splits its ideal expansion-to-ambient between shaft/fan
 * power and the residual hot-nozzle jet, the same alpha-split pattern
 * as the turboprop's own free turbine.
 *
 * `alpha` is a fixed DESIGN input here, not solved for — unlike the
 * turboprop's `alpha_opt`, the source gives no propfan-specific
 * "maximum thrust" alpha derivation (reference/propfan.md §4, judgment
 * call #4), only the alpha-split formula itself. The default (0.85) is
 * borrowed from the turboprop's own typical range (0.80-0.90) by
 * analogy, since no propfan-specific number exists in the source — an
 * inference, not a sourced default.
 */
export default function PropfanFreeTurbineSection({ config, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <fieldset className="config-section">
      <legend>
        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} Free (power) turbine
        </button>
      </legend>
      {open && (
        <>
          <NumberField
            label="Free-turbine efficiency η_ft"
            value={config.eta_ft}
            onChange={(v) => onChange({ eta_ft: v })}
            min={0.5}
            max={1.0}
            step={0.01}
            hint="T07-T08 = η_ft·α·(T07-T9s) (§2.3)."
          />
          <NumberField
            label="Power split α"
            value={config.alpha}
            onChange={(v) => onChange({ alpha: v })}
            min={0.5}
            max={1.0}
            step={0.01}
            hint="Fraction of the ideal expansion-to-ambient (from station 7) sent to shaft/fan power rather than the residual hot-nozzle jet (§2.3). Fixed design input here, NOT solved for an optimum — unlike the turboprop's alpha_opt. Default (0.85) is inferred by analogy to the turboprop's typical range; no propfan-specific source value exists (reference/propfan.md §4)."
          />
        </>
      )}
    </fieldset>
  );
}
