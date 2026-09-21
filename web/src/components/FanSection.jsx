import { useState } from "react";
import NumberField from "./NumberField.jsx";

/**
 * Fan / bypass configuration — the turbofan's defining difference from
 * the turbojet already in this codebase. Ref: reference/turbofan.md §2-3.
 *
 * NOT IN SOURCE numerically (reference/turbofan.md §9): bypass ratio,
 * fan pressure ratio, and fan efficiency have no numeric values anywhere
 * in the extracted transcript — every default here is a general
 * gas-turbine-literature value (a medium-bypass turbofan, e.g.
 * CFM56-class), not this project's primary reference.
 */
export default function FanSection({ config, onChange }) {
  const [open, setOpen] = useState(true);
  return (
    <fieldset className="config-section">
      <legend>
        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} Fan / bypass
        </button>
      </legend>
      {open && (
        <>
          <NumberField
            label="Bypass ratio β"
            value={config.beta}
            onChange={(v) => onChange({ beta: v })}
            min={0.5}
            max={15}
            step={0.5}
            hint="mdot_cold/mdot_hot (§2) — how much air goes around the core vs. through it. NOT IN SOURCE numerically; ~5 is typical for a medium-bypass turbofan."
          />
          <NumberField
            label="Fan pressure ratio π_f"
            value={config.pi_f}
            onChange={(v) => onChange({ pi_f: v })}
            min={1.1}
            max={3.0}
            step={0.05}
            hint="p010 = p02·π_f (§3). NOT IN SOURCE numerically; high-bypass fans typically run 1.4–1.8."
          />
          <NumberField
            label="Fan efficiency η_f"
            value={config.eta_f}
            onChange={(v) => onChange({ eta_f: v })}
            min={0.7}
            max={0.98}
            step={0.01}
            hint="T010/T02 = 1 + (π_f^((γ−1)/γ)−1)/η_f (§3). NOT IN SOURCE numerically."
          />
        </>
      )}
    </fieldset>
  );
}
