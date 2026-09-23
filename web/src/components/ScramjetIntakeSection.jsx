import { useState } from "react";
import NumberField from "./NumberField.jsx";

/**
 * Scramjet intake — the long ramp/converging duct that does ALL of this
 * engine's compression (there's no compressor). Unlike a ramjet's
 * intake, it only partly slows the air down: M2 stays supersonic.
 * Ref: reference/scramjet.md §2.1 (NPTEL p.277-278).
 *
 * NOT IN SOURCE numerically (reference/scramjet.md §3): the source gives
 * no numeric M2 or eta_I anywhere — both defaults are provisional
 * choices, flagged in their hints the same way the propfan flags its own.
 */
export default function ScramjetIntakeSection({ config, onChange }) {
  const [open, setOpen] = useState(true);
  return (
    <fieldset className="config-section">
      <legend>
        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} Intake
        </button>
      </legend>
      {open && (
        <>
          <NumberField
            label="Combustor-entrance Mach M2"
            value={config.mach_combustor_inlet}
            onChange={(v) => onChange({ mach_combustor_inlet: v })}
            min={1.05}
            max={6.0}
            step={0.05}
            hint="M2 = Mach number at the combustor entrance (station 2), i.e. how fast the air is still moving after the intake has slowed it down. It must stay above 1 (supersonic) — that's what makes this a SCRAMjet (supersonic-combustion ramjet); below 1 it would be an ordinary ramjet. It must also be below the flight Mach M1. Sets T2 = T1·(1+(γ_c−1)/2·M1²)/(1+(γ_c−1)/2·M2²) (§2.1, NPTEL p.278). A higher M2 lets the combustor take more fuel before it thermally chokes. 2.5 is a typical starting value."
          />
          <NumberField
            label="Intake isentropic efficiency η_I"
            value={config.eta_I}
            onChange={(v) => onChange({ eta_I: v })}
            min={0.5}
            max={1.0}
            step={0.01}
            hint="η_I = intake isentropic efficiency — how close the intake's compression comes to an ideal, loss-free one (1.0 = perfect). η_I = (Tx − T1)/(T2 − T1), used as p2 = p1·(1 + η_I·(T2/T1 − 1))^(γ_c/(γ_c−1)) (§2.1, NPTEL p.277-278). This is the path the solver uses; the MIL-E-5007D recovery shown in the results is reference-only (judgment call #4). 0.90 is a typical starting value."
          />
        </>
      )}
    </fieldset>
  );
}
