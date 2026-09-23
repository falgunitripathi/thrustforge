import { useState } from "react";
import NumberField from "./NumberField.jsx";

/**
 * Flight condition inputs for the scramjet — its own section rather than
 * the shared FlightConditionsSection, because that one caps flight Mach
 * at 5.0 (right where a scramjet only just starts to work). Same
 * altitude band as every other engine: the ISA troposphere only
 * (0-11000 m) — isaTroposphere throws outside it, since the stratosphere
 * isn't sourced (atmosphere.js). Real scramjets fly higher; that's a
 * documented limitation of this project, not of the scramjet model.
 *
 * Ref: reference/scramjet.md §1, §3 (NPTEL p.276-277).
 */
export default function ScramjetFlightSection({ config, onChange }) {
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
            hint="m — T_a = 288 − 0.0065·z, ISA troposphere curve-fit (§1). Above 11 km isn't modeled (no sourced stratosphere constants), even though real scramjets usually fly higher than that."
          />
          <NumberField
            label="Flight Mach number M1"
            value={config.mach_flight}
            onChange={(v) => onChange({ mach_flight: v })}
            min={3.0}
            max={12.0}
            step={0.1}
            hint="M1 = the flight Mach number, i.e. how many times the speed of sound the vehicle is flying (station 1 = the free air right at the intake's lip). A scramjet has no compressor, so it relies entirely on its own speed to squeeze the air — it needs roughly Mach 5 or more before it can work at all, and must be boosted there by a rocket or another engine first (NPTEL p.276-277). M1 must stay above M2, the combustor-entrance Mach set in the Intake section."
          />
        </>
      )}
    </fieldset>
  );
}
