import { useState } from "react";
import NumberField from "./NumberField.jsx";

/**
 * Flight condition inputs — Ref §1 (Atmosphere & Flight State).
 *
 * Each engine passes its own realistic flight-Mach range (machMin/
 * machMax): beyond it the cycle stops working anyway (e.g. the turbine
 * can no longer drive the compressor once ram heating is large).
 *
 * Altitude is constrained to the ISA troposphere (0-11000 m): the ported
 * `isaTroposphere` deliberately throws outside that band rather than
 * silently extrapolating (see atmosphere.js docstring) — the stratosphere
 * needs reference constants this project's source doesn't supply.
 *
 * Collapsed by default, like every other config section — click the
 * legend to open it. Keeps the sidebar short instead of always showing
 * every field for every section at once.
 */
export default function FlightConditionsSection({ config, onChange, machMin = 0, machMax = 3.0, machNote }) {
  const [open, setOpen] = useState(false);
  return (
    <fieldset className="config-section">
      <legend>
        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} Flight condition
        </button>
      </legend>
      {open && (
        <>
          <NumberField
            label="Altitude"
            value={config.altitude_m}
            onChange={(v) => onChange({ altitude_m: v })}
            min={0}
            max={11000}
            step={100}
            hint="m — T_a = 288 − 0.0065·z, ISA troposphere curve-fit (§1). Above 11 km isn't modeled (no sourced stratosphere constants)."
          />
          <NumberField
            label="Flight Mach number"
            value={config.mach_flight}
            onChange={(v) => onChange({ mach_flight: v })}
            min={machMin}
            max={machMax}
            step={0.05}
            hint={`M∞ — sets freestream stagnation state T0a = T_a·[1+(γ_c−1)/2·M²], p0a = p_a·[…]^(γ_c/(γ_c−1)) (§1)${machNote ? `. ${machNote}` : ""}`}
          />
        </>
      )}
    </fieldset>
  );
}
