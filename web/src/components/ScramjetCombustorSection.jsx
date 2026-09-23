import { useState } from "react";
import NumberField from "./NumberField.jsx";
import { fmt } from "../utils/format.js";

/**
 * Scramjet combustor — driven by the fuel-air ratio f directly, NOT by a
 * target turbine-inlet temperature like every other engine here (there's
 * no turbine to protect, and the source's own derivation is f-driven,
 * reference/scramjet.md §2.2, NPTEL p.278-279). The combustor-exit Mach
 * M3 is then solved on the supersonic branch; too much fuel for the
 * given M2 thermally chokes the combustor and the solver throws.
 *
 * `result` may be null (App.jsx passes null whenever the solve failed,
 * e.g. thermal choking) — the live M3 readout below is guarded so the
 * form always renders and stays usable to fix the input.
 */
export default function ScramjetCombustorSection({ config, result, onChange }) {
  const [open, setOpen] = useState(true);
  const M3 = result?.combustor?.M3;
  return (
    <fieldset className="config-section">
      <legend>
        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} Combustor
        </button>
      </legend>
      {open && (
        <>
          <NumberField
            label="Fuel-air ratio f"
            value={config.f}
            onChange={(v) => onChange({ f: v })}
            min={0.001}
            max={0.08}
            step={0.001}
            hint="f = fuel-air ratio — kilograms of fuel burned per kilogram of air (ṁ_f/ṁ_a). The scramjet is set by how much fuel you burn, not by a target combustor temperature like the other engines: T03 = (f·η_b·Q_R + Cp_c·T02)/(Cp_h·(1+f)) (§2.2, NPTEL p.278-279). Adding heat to a supersonic flow slows it down toward Mach 1 — too much fuel for the given M2 would need the flow to drop below Mach 1 inside the combustor ('thermal choking'), which isn't possible here, so the engine won't solve. Lower f or raise M2 if that happens."
          />
          <p className="section-note">
            {Number.isFinite(M3)
              ? <>Combustor-exit Mach M3 right now: <strong>{fmt(M3, 3)}</strong> — still supersonic.</>
              : <>No valid combustor-exit Mach at these settings — see the message on the right.</>}
          </p>
        </>
      )}
    </fieldset>
  );
}
