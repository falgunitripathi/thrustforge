import { useState } from "react";
import NumberField from "./NumberField.jsx";

/**
 * Core-spool compressors — LPC (booster) and HPC. Each is a single
 * overall pressure-ratio/efficiency step here, not stage-stacked like
 * the turbojet's compressor.py (reference/turbofan.md §3 gives each as
 * a one-shot T_out/T_in relation). NOT IN SOURCE numerically — see
 * FanSection's own note; defaults are chosen so π_f·π_LPC·π_HPC lands
 * near a modern turbofan's ~30:1 overall pressure ratio.
 */
export default function CoreCompressorsSection({ config, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <fieldset className="config-section">
      <legend>
        <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} LPC &amp; HPC
        </button>
      </legend>
      {open && (
        <>
          <NumberField
            label="LPC (booster) pressure ratio π_LPC"
            value={config.pi_LPC}
            onChange={(v) => onChange({ pi_LPC: v })}
            min={1.0}
            max={3.0}
            step={0.05}
            hint="LPC = Low-Pressure Compressor, a.k.a. the 'booster' — the compression stage right after the fan, on the same (slower) shaft as the fan. p03 = p010·π_LPC (§3)."
          />
          <NumberField
            label="LPC efficiency η_LPC"
            value={config.eta_LPC}
            onChange={(v) => onChange({ eta_LPC: v })}
            min={0.7}
            max={0.98}
            step={0.01}
            hint="LPC = Low-Pressure Compressor (booster) — see the pressure-ratio field above for what it is. How much of the ideal compression this stage actually achieves."
          />
          <NumberField
            label="HPC pressure ratio π_HPC"
            value={config.pi_HPC}
            onChange={(v) => onChange({ pi_HPC: v })}
            min={2}
            max={25}
            step={0.5}
            hint="HPC = High-Pressure Compressor — the final, highest-pressure compression stage, right before the combustor. p04 = p03·π_HPC (§3). Chosen with π_f/π_LPC to reach a realistic overall pressure ratio."
          />
          <NumberField
            label="HPC efficiency η_HPC"
            value={config.eta_HPC}
            onChange={(v) => onChange({ eta_HPC: v })}
            min={0.7}
            max={0.98}
            step={0.01}
            hint="HPC = High-Pressure Compressor — see the pressure-ratio field above for what it is. How much of the ideal compression this stage actually achieves."
          />
        </>
      )}
    </fieldset>
  );
}
